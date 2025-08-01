import { Notice, Plugin, PluginSettingTab, Setting, TFile, Command, App, Modal } from "obsidian";

interface CustomReplacement {
    searchText: string;
    replaceText: string;
    onlyAtStart: boolean;
    enabled: boolean;
}

interface PluginSettings {
    excludedFolders: string[];
    charCount: number;
    checkInterval: number;
    charReplacements: {
        slash: string;
        colon: string;
        pipe: string;
        hash: string;
        leftBracket: string;
        rightBracket: string;
        caret: string;
        dot: string;
    };
    charReplacementEnabled: {
        slash: boolean;
        colon: boolean;
        pipe: boolean;
        hash: boolean;
        leftBracket: boolean;
        rightBracket: boolean;
        caret: boolean;
        dot: boolean;
    };
    customReplacements: CustomReplacement[];
    omitHtmlTags: boolean;
    enableIllegalCharReplacements: boolean;
    enableCustomReplacements: boolean;
    renameOnFocus: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
    excludedFolders: [],
    charCount: 100,
    checkInterval: 500,
    charReplacements: {
        slash: ' ∕ ',
        colon: '։',
        pipe: '❘',
        hash: '＃',
        leftBracket: '〚',
        rightBracket: '〛',
        caret: 'ˆ',
        dot: '․'
    },
    charReplacementEnabled: {
        slash: true,
        colon: true,
        pipe: true,
        hash: true,
        leftBracket: true,
        rightBracket: true,
        caret: true,
        dot: false
    },
    customReplacements: [
        { searchText: '.', replaceText: '․', onlyAtStart: false, enabled: true },
        { searchText: '- [ ] ', replaceText: '✔️', onlyAtStart: true, enabled: true },
        { searchText: '- [x] ', replaceText: '✅', onlyAtStart: true, enabled: true }
    ],
    omitHtmlTags: true,
    enableIllegalCharReplacements: false,
    enableCustomReplacements: false,
    renameOnFocus: true
};

let renamedFileCount: number = 0;
let tempNewPaths: string[] = [];

let onTimeout: boolean = true;
let timeout: NodeJS.Timeout;
let previousFile: string;
let previousContent: Map<string, string> = new Map();

function inExcludedFolder(file: TFile, settings: PluginSettings): boolean {
    if (settings.excludedFolders.length === 0) return false;
    if (settings.excludedFolders.includes(file.parent?.path as string))
        return true;
    return false;
}

function extractTitle(line: string, settings: PluginSettings): string {
    const originalLine = line;
    line = line.trim();

    // Remove template placeholder
    line = line.replace(/<%\s*tp\.file\.cursor\(\)\s*%>/, '').trim();

    if (line === "<%*") {
        return "Untitled";
    }

    // Check if original line (after trim) starts with valid heading - before any processing
    const isValidHeading = /^#{1,6}\s/.test(line);

    // Handle escaped characters - replace them with unique placeholders
    const escapeMap = new Map<string, string>();
    let escapeCounter = 0;
    
    line = line.replace(/\\(.)/g, (match, char) => {
        const placeholder = `__ESCAPED_${escapeCounter++}__`;
        escapeMap.set(placeholder, char);
        return placeholder;
    });

    // Remove comment syntax %% %% (only matching pairs)
    line = line.replace(/%%.*?%%/g, (match) => {
        return match.slice(2, -2);
    });

    // Remove HTML tags (all tags with opening and closing pairs) - handle nested tags
    if (settings.omitHtmlTags) {
        let previousLine = '';
        while (line !== previousLine) {
            previousLine = line;
            line = line.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>(.*?)<\/\1>/g, '$2');
        }
    }

    // Handle embedded image links (remove ! before [[]])
    const embedLinkRegex = /!\[\[(.*?)\]\]/g;
    line = line.replace(embedLinkRegex, '[[$1]]');

    // Handle regular embedded image links
    const regularEmbedRegex = /!\[(.*?)\]\((.*?)\)/g;
    line = line.replace(regularEmbedRegex, (match, caption) => caption);

    // Handle headers - only if the original line was a valid heading
    if (isValidHeading) {
        const headerArr: string[] = [
            "# ", "## ", "### ", "#### ", "##### ", "###### ",
        ];
        for (let i = 0; i < headerArr.length; i++) {
            if (line.startsWith(headerArr[i])) {
                line = line.slice(headerArr[i].length).trim();
                break;
            }
        }
    }

    // Apply custom replacements
    if (settings.enableCustomReplacements) {
        for (const replacement of settings.customReplacements) {
            if (replacement.searchText === '' || !replacement.enabled) continue;
            
            // Check if this replacement would make the whole line match
            let tempLine = line;
            if (replacement.onlyAtStart) {
                if (tempLine.startsWith(replacement.searchText)) {
                    tempLine = replacement.replaceText + tempLine.slice(replacement.searchText.length);
                }
            } else {
                tempLine = tempLine.replaceAll(replacement.searchText, replacement.replaceText);
            }
            
            // If the replacement results in empty string or whitespace only, and original search matched whole line, return "Untitled"
            if (tempLine.trim() === '' && line.trim() === replacement.searchText.trim()) {
                return "Untitled";
            }
            
            line = tempLine;
        }
    }

    // Handle wikilinks
    while (line.includes("[[") && line.includes("]]")) {
        const openBracket = line.indexOf("[[");
        const closeBracket = line.indexOf("]]", openBracket);

        if (openBracket === -1 || closeBracket === -1) break;

        const linkText = line.slice(openBracket + 2, closeBracket);
        const beforeLink = line.slice(0, openBracket);
        const afterLink = line.slice(closeBracket + 2);

        // Handle aliased wikilinks
        const pipeIndex = linkText.indexOf("|");
        const resolvedText = pipeIndex !== -1 ? linkText.slice(pipeIndex + 1) : linkText;

        line = (beforeLink + resolvedText + afterLink).trim();
    }

    // Handle Markdown links
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    line = line.replace(markdownLinkRegex, (_, title) => title);

    // Restore escaped characters (remove escape, keep character)
    for (const [placeholder, char] of escapeMap) {
        line = line.replace(placeholder, char);
    }

    return line;
}

class RenameAllFilesModal extends Modal {
    plugin: FirstLineIsTitle;

    constructor(app: App, plugin: FirstLineIsTitle) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const heading = contentEl.createEl("h2", { text: "Warning" });
        heading.style.textAlign = "center";
        contentEl.createEl("p", { 
            text: "This will edit all of your files except those in excluded folders, and may introduce errors. Make sure you have backed up your files." 
        });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";
        buttonContainer.style.marginTop = "20px";

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: "Rename all files" });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            this.close();
            await this.renameAllFiles();
        };
    }

    async renameAllFiles() {
        let filesToRename: TFile[] = [];
        this.app.vault.getMarkdownFiles().forEach((file) => {
            if (!inExcludedFolder(file, this.plugin.settings)) {
                filesToRename.push(file);
            }
        });

        renamedFileCount = 0;
        tempNewPaths = [];
        const pleaseWaitNotice = new Notice(`Renaming files, please wait...`, 0);
        
        try {
            await Promise.all(
                filesToRename.map((file: TFile) =>
                    this.plugin.renameFile(file, true)
                )
            );
        } finally {
            pleaseWaitNotice.hide();
            new Notice(
                `Renamed ${renamedFileCount}/${filesToRename.length} files.`,
                0
            );
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export default class FirstLineIsTitle extends Plugin {
    settings: PluginSettings;

    cleanupStaleCache(): void {
        // Clean up tempNewPaths - remove paths that don't exist anymore
        tempNewPaths = tempNewPaths.filter(path => {
            return this.app.vault.getAbstractFileByPath(path) !== null;
        });
        
        // Clean up previousContent - remove entries for files that don't exist anymore
        for (const [path, content] of previousContent) {
            if (!this.app.vault.getAbstractFileByPath(path)) {
                previousContent.delete(path);
            }
        }
    }

    async renameFile(file: TFile, noDelay = false): Promise<void> {
        if (inExcludedFolder(file, this.settings)) return;
        if (file.extension !== 'md') return;

        if (noDelay === false) {
            if (onTimeout) {
                if (previousFile == file.path) {
                    clearTimeout(timeout);
                }
                previousFile = file.path;
                timeout = setTimeout(() => {
                    onTimeout = false;
                    this.renameFile(file);
                }, this.settings.checkInterval);
                return;
            }
            onTimeout = true;
        } else {
            // Clear tempNewPaths for individual file operations (not bulk)
            if (!tempNewPaths.length || tempNewPaths.length < 10) {
                tempNewPaths = [];
            }
        }

        // Clean up stale cache before processing
        this.cleanupStaleCache();

        let content: string = await this.app.vault.cachedRead(file);

        if (content.startsWith("---")) {
            let index = content.indexOf("---", 3);
            if (index != -1) content = content.slice(index + 3).trimStart();
        }

        const currentName = file.basename;
        let firstLine = content.split('\n')[0];

        // Check if content became empty when it wasn't before
        const previousFileContent = previousContent.get(file.path);
        if (content.trim() === '' && previousFileContent && previousFileContent.trim() !== '') {
            // Content became empty, rename to Untitled
            const parentPath = file.parent?.path === "/" ? "" : file.parent?.path + "/";
            let newPath: string = `${parentPath}Untitled.md`;
            
            let counter: number = 0;
            let fileExists: boolean = this.app.vault.getAbstractFileByPath(newPath) != null;
            while (fileExists || tempNewPaths.includes(newPath)) {
                if (file.path == newPath) {
                    previousContent.set(file.path, content);
                    return;
                }
                counter += 1;
                newPath = `${parentPath}Untitled ${counter}.md`;
                fileExists = this.app.vault.getAbstractFileByPath(newPath) != null;
            }

            if (noDelay) {
                tempNewPaths.push(newPath);
            }

            await this.app.fileManager.renameFile(file, newPath);
            renamedFileCount += 1;
            previousContent.set(file.path, content);
            return;
        }

        // Store current content for next check
        previousContent.set(file.path, content);

        if (firstLine === '') {
            return;
        }

        // Check for self-reference before any processing
        const escapedName = currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wikiLinkRegex = new RegExp(`\\[\\[${escapedName}(\\|.*?)?\\]\\]`);
        const internalMarkdownLinkRegex = new RegExp(`\\(\\#${escapedName}\\)`, 'i');
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

        let isSelfReferencing = false;

        // Check for self-referencing wikilink
        if (wikiLinkRegex.test(firstLine)) {
            isSelfReferencing = true;
        }

        // Check for self-referencing Markdown link by parsing the actual URL (ignoring link text)
        let match;
        while ((match = markdownLinkRegex.exec(firstLine)) !== null) {
            const url = match[2];
            if (url.startsWith("#") && url.includes(currentName)) {
                isSelfReferencing = true;
                break;
            }
        }

        if (isSelfReferencing) {
            new Notice("File not renamed - first line references current filename", 0);
            return;
        }

        content = extractTitle(firstLine, this.settings);

        const charMap: { [key: string]: string } = {
            '/': this.settings.charReplacements.slash,
            ':': this.settings.charReplacements.colon,
            '|': this.settings.charReplacements.pipe,
            '#': this.settings.charReplacements.hash,
            '[': this.settings.charReplacements.leftBracket,
            ']': this.settings.charReplacements.rightBracket,
            '^': this.settings.charReplacements.caret,
            '.': this.settings.charReplacements.dot
        };

        const illegalChars = Object.keys(charMap).join('');
        const illegalNames: string[] = [
            "CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "COM0",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9", "LPT0",
        ];
        let newFileName: string = "";

        for (let i: number = 0; i < content.length; i++) {
            if (newFileName.length >= this.settings.charCount - 1) {
                newFileName = newFileName.trimEnd();
                newFileName += "…";
                break;
            }
            let char = content[i];

            if (illegalChars.includes(char)) {
                let shouldReplace = false;
                let replacement = '';
                
                // Check if master toggle is on AND individual toggle is on
                if (this.settings.enableIllegalCharReplacements) {
                    switch (char) {
                        case '/': shouldReplace = this.settings.charReplacementEnabled.slash; replacement = this.settings.charReplacements.slash; break;
                        case ':': shouldReplace = this.settings.charReplacementEnabled.colon; replacement = this.settings.charReplacements.colon; break;
                        case '|': shouldReplace = this.settings.charReplacementEnabled.pipe; replacement = this.settings.charReplacements.pipe; break;
                        case '#': shouldReplace = this.settings.charReplacementEnabled.hash; replacement = this.settings.charReplacements.hash; break;
                        case '[': shouldReplace = this.settings.charReplacementEnabled.leftBracket; replacement = this.settings.charReplacements.leftBracket; break;
                        case ']': shouldReplace = this.settings.charReplacementEnabled.rightBracket; replacement = this.settings.charReplacements.rightBracket; break;
                        case '^': shouldReplace = this.settings.charReplacementEnabled.caret; replacement = this.settings.charReplacements.caret; break;
                        case '.': shouldReplace = this.settings.charReplacementEnabled.dot; replacement = this.settings.charReplacements.dot; break;
                    }
                }
                
                if (shouldReplace && replacement !== '') {
                    newFileName += replacement;
                }
                // If master toggle is off, individual toggle is off, or replacement is empty, omit the character
            } else {
                newFileName += char;
            }
        }

        newFileName = newFileName
            .trim()
            .replace(/\s+/g, " ");

        while (newFileName[0] == ".") {
            newFileName = newFileName.slice(1);
        }

        const isIllegalName =
            newFileName === "" ||
            illegalNames.includes(newFileName.toUpperCase());
        if (isIllegalName) newFileName = "Untitled";

        const parentPath =
            file.parent?.path === "/" ? "" : file.parent?.path + "/";

        let newPath: string = `${parentPath}${newFileName}.md`;

        let counter: number = 0;
        let fileExists: boolean =
            this.app.vault.getAbstractFileByPath(newPath) != null;
        while (fileExists || tempNewPaths.includes(newPath)) {
            if (file.path == newPath) return;
            counter += 1;
            newPath = `${parentPath}${newFileName} ${counter}.md`;
            fileExists = this.app.vault.getAbstractFileByPath(newPath) != null;
        }

        if (noDelay) {
            tempNewPaths.push(newPath);
        }

        await this.app.fileManager.renameFile(file, newPath);
        renamedFileCount += 1;
    }

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new FirstLineIsTitleSettings(this.app, this));

        this.addCommand({
            id: 'rename-current-file',
            name: 'Rename current file',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    await this.renameFile(activeFile, true);
                }
            }
        });

        this.addCommand({
            id: 'rename-all-files',
            name: 'Rename all files',
            callback: () => {
                new RenameAllFilesModal(this.app, this).open();
            }
        });

        this.registerEvent(
            this.app.vault.on("modify", (abstractFile) => {
                if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
                    const noDelay = this.settings.checkInterval === 0;
                    this.renameFile(abstractFile, noDelay);
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (leaf) => {
                if (this.settings.renameOnFocus && leaf && leaf.view && leaf.view.file && leaf.view.file instanceof TFile && leaf.view.file.extension === 'md') {
                    this.renameFile(leaf.view.file, true);
                }
            })
        );

        // Listen for file deletion events to clean up cache
        this.registerEvent(
            this.app.vault.on("delete", (abstractFile) => {
                if (abstractFile instanceof TFile) {
                    // Remove from tempNewPaths
                    const index = tempNewPaths.indexOf(abstractFile.path);
                    if (index > -1) {
                        tempNewPaths.splice(index, 1);
                    }
                    
                    // Remove from previousContent
                    previousContent.delete(abstractFile.path);
                }
            })
        );

        // Listen for file rename events to update cache
        this.registerEvent(
            this.app.vault.on("rename", (abstractFile, oldPath) => {
                if (abstractFile instanceof TFile) {
                    // Update tempNewPaths
                    const index = tempNewPaths.indexOf(oldPath);
                    if (index > -1) {
                        tempNewPaths[index] = abstractFile.path;
                    }
                    
                    // Update previousContent
                    const oldContent = previousContent.get(oldPath);
                    if (oldContent !== undefined) {
                        previousContent.delete(oldPath);
                        previousContent.set(abstractFile.path, oldContent);
                    }
                }
            })
        );
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}

class FirstLineIsTitleSettings extends PluginSettingTab {
    plugin: FirstLineIsTitle;

    constructor(app: App, plugin: FirstLineIsTitle) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.containerEl.empty();

        new Setting(this.containerEl)
            .setName("Exclude folders")
            .setDesc(
                "Folder paths to exclude from auto-renaming. Includes all subfolders. Separate by newline. Case-sensitive."
            )
            .addTextArea((text) => {
                text.setPlaceholder("/\nfolder\nfolder/subfolder")
                    .setValue(this.plugin.settings.excludedFolders.join("\n"))
                    .onChange(async (value) => {
                        this.plugin.settings.excludedFolders = value.split("\n");
                        await this.plugin.saveSettings();
                    });
                text.inputEl.cols = 28;
                text.inputEl.rows = 4;
            });

        new Setting(this.containerEl)
            .setName("Character count")
            .setDesc("The maximum number of characters to put in title. Enter a value from 10 to 200. Default: 100.")
            .addText((text) =>
                text
                    .setPlaceholder("100")
                    .setValue(String(this.plugin.settings.charCount))
                    .onChange(async (value) => {
                        if (value === '') {
                            this.plugin.settings.charCount = DEFAULT_SETTINGS.charCount;
                            // Don't update the field value immediately
                        } else {
                            const numVal = Number(value);
                            if (numVal >= 10 && numVal <= 200) {
                                this.plugin.settings.charCount = numVal;
                            }
                        }
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.containerEl)
            .setName("Check interval")
            .setDesc("Interval in milliseconds of how often to rename files while editing. Increase if there's performance issues. Default: 500.")
            .addText((text) =>
                text
                    .setPlaceholder("500")
                    .setValue(String(this.plugin.settings.checkInterval))
                    .onChange(async (value) => {
                        if (value === '') {
                            this.plugin.settings.checkInterval = DEFAULT_SETTINGS.checkInterval;
                            // Don't update the field value immediately
                        } else if (!isNaN(Number(value))) {
                            this.plugin.settings.checkInterval = Number(value);
                        }
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.containerEl)
            .setName("Omit HTML tags")
            .setDesc("Don't put HTML tags like <u> in title.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.omitHtmlTags)
                    .onChange(async (value) => {
                        this.plugin.settings.omitHtmlTags = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.containerEl)
            .setName("Rename on focus")
            .setDesc("Automatically rename files when they become focused/active.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameOnFocus)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnFocus = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.containerEl)
            .setName("Rename all files")
            .setDesc("Rename all files except those in excluded folders. Can also be run from the Command palette.")
            .addButton((button) =>
                button.setButtonText("Rename").onClick(() => {
                    new RenameAllFilesModal(this.app, this.plugin).open();
                })
            );

        this.containerEl.createEl("br");

        // Character replacement settings
        const charHeaderContainer = this.containerEl.createEl("div", { cls: "setting-item" });
        charHeaderContainer.style.display = "flex";
        charHeaderContainer.style.justifyContent = "space-between";
        charHeaderContainer.style.alignItems = "center";
        charHeaderContainer.style.marginBottom = "10px";
        
        const charHeader = charHeaderContainer.createEl("h3", { text: "Illegal character replacements" });
        charHeader.style.margin = "0";
        
        // Create toggle for the header
        const headerToggleSetting = new Setting(document.createElement('div'));
        headerToggleSetting.addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.enableIllegalCharReplacements)
                .onChange(async (value) => {
                    this.plugin.settings.enableIllegalCharReplacements = value;
                    await this.plugin.saveSettings();
                    updateCharacterReplacementUI();
                });
            charHeaderContainer.appendChild(toggle.toggleEl);
        });

        const charDescEl = this.containerEl.createEl("div", { 
            text: "Define replacements for illegal filename characters. Whitespace preserved.",
            cls: "setting-item-description"
        });
        this.containerEl.createEl("br");

        const charSettings = [
            { key: 'slash', name: 'Slash /', char: '/' },
            { key: 'colon', name: 'Colon :', char: ':' },
            { key: 'pipe', name: 'Pipe |', char: '|' },
            { key: 'hash', name: 'Hash #', char: '#' },
            { key: 'leftBracket', name: 'Left bracket [', char: '[' },
            { key: 'rightBracket', name: 'Right bracket ]', char: ']' },
            { key: 'caret', name: 'Caret ^', char: '^' }
        ];

        const updateCharacterReplacementUI = () => {
            const isEnabled = this.plugin.settings.enableIllegalCharReplacements;
            charDescEl.style.opacity = isEnabled ? '1' : '0.5';
            
            // Update all character replacement settings
            const charSettingsEls = this.containerEl.querySelectorAll('.char-replacement-setting');
            charSettingsEls.forEach(el => {
                (el as HTMLElement).style.opacity = isEnabled ? '1' : '0.5';
                (el as HTMLElement).style.pointerEvents = isEnabled ? 'auto' : 'none';
                const inputs = el.querySelectorAll('input[type="text"]');
                const toggles = el.querySelectorAll('.checkbox-container, input[type="checkbox"], .clickable-icon');
                inputs.forEach(input => (input as HTMLInputElement).disabled = !isEnabled);
                toggles.forEach(toggle => {
                    (toggle as HTMLElement).style.pointerEvents = isEnabled ? 'auto' : 'none';
                    if (toggle instanceof HTMLInputElement) {
                        toggle.disabled = !isEnabled;
                    }
                });
            });
        };

        charSettings.forEach((setting, index) => {
            // Create a more manual layout to avoid Setting component spacing
            const rowEl = this.containerEl.createEl('div', { cls: 'char-replacement-setting' });
            rowEl.style.display = "flex";
            rowEl.style.alignItems = "center";
            rowEl.style.padding = "8px 0";
            
            // Only add border bottom if not the last item (caret)
            if (index < charSettings.length - 1) {
                rowEl.style.borderBottom = "1px solid var(--background-modifier-border)";
            }
            
            // Add toggle
            const toggleSetting = new Setting(document.createElement('div'));
            toggleSetting.addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.charReplacementEnabled[setting.key as keyof typeof this.plugin.settings.charReplacementEnabled])
                    .onChange(async (value) => {
                        this.plugin.settings.charReplacementEnabled[setting.key as keyof typeof this.plugin.settings.charReplacementEnabled] = value;
                        await this.plugin.saveSettings();
                    });
                toggle.toggleEl.style.margin = "0";
                rowEl.appendChild(toggle.toggleEl);
            });
            
            // Add name label
            const nameLabel = rowEl.createEl("span", { text: setting.name });
            nameLabel.style.marginLeft = "8px";
            nameLabel.style.minWidth = "120px";
            nameLabel.style.flexGrow = "1";
            
            // Add text input
            const textInput = rowEl.createEl("input", { type: "text" });
            textInput.placeholder = "Replace with";
            textInput.value = this.plugin.settings.charReplacements[setting.key as keyof typeof this.plugin.settings.charReplacements];
            textInput.style.width = "200px";
            textInput.setAttribute('data-setting-key', setting.key);
            textInput.addEventListener('input', async (e) => {
                this.plugin.settings.charReplacements[setting.key as keyof typeof this.plugin.settings.charReplacements] = (e.target as HTMLInputElement).value;
                await this.plugin.saveSettings();
            });
        });

        // Set up initial UI state
        updateCharacterReplacementUI();

        // Add restore defaults button
        const restoreDefaultsSetting = new Setting(this.containerEl)
            .addButton((button) =>
                button.setButtonText("Restore defaults").onClick(async () => {
                    // Reset only character replacement values, not toggle states
                    this.plugin.settings.charReplacements = { ...DEFAULT_SETTINGS.charReplacements };
                    await this.plugin.saveSettings();
                    
                    // Update the UI with new values instantly
                    charSettings.forEach((setting) => {
                        const textInput = this.containerEl.querySelector(`input[data-setting-key="${setting.key}"]`) as HTMLInputElement;
                        if (textInput) {
                            textInput.value = this.plugin.settings.charReplacements[setting.key as keyof typeof this.plugin.settings.charReplacements];
                        }
                    });
                })
            );
        restoreDefaultsSetting.settingEl.addClass('restore-defaults-button');
        restoreDefaultsSetting.settingEl.style.opacity = this.plugin.settings.enableIllegalCharReplacements ? '1' : '0.5';
        restoreDefaultsSetting.settingEl.style.pointerEvents = this.plugin.settings.enableIllegalCharReplacements ? 'auto' : 'none';

        this.containerEl.createEl("br");

        // Custom replacements section
        const customHeaderContainer = this.containerEl.createEl("div", { cls: "setting-item" });
        customHeaderContainer.style.display = "flex";
        customHeaderContainer.style.justifyContent = "space-between";
        customHeaderContainer.style.alignItems = "center";
        customHeaderContainer.style.marginBottom = "10px";
        
        const customHeader = customHeaderContainer.createEl("h3", { text: "Custom replacements" });
        customHeader.style.margin = "0";
        
        // Create toggle for the header
        const customHeaderToggleSetting = new Setting(document.createElement('div'));
        customHeaderToggleSetting.addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.enableCustomReplacements)
                .onChange(async (value) => {
                    this.plugin.settings.enableCustomReplacements = value;
                    await this.plugin.saveSettings();
                    updateCustomReplacementUI();
                });
            customHeaderContainer.appendChild(toggle.toggleEl);
        });
        
        const customDescEl = this.containerEl.createEl("div", { cls: "setting-item-description" });
        customDescEl.innerHTML = "Define custom text replacements. Whitespace preserved.<br><br>Leave <em>Replace with</em> blank to omit text entirely. If <em>Replace with</em> is blank and <em>Text to replace</em> matches whole line, put <em>Untitled</em> in title.";
        this.containerEl.createEl("br");

        const updateCustomReplacementUI = () => {
            const isEnabled = this.plugin.settings.enableCustomReplacements;
            customDescEl.style.opacity = isEnabled ? '1' : '0.5';
            
            // Update all custom replacement settings
            const customSettingsEls = this.containerEl.querySelectorAll('.custom-replacement-setting');
            customSettingsEls.forEach(el => {
                (el as HTMLElement).style.opacity = isEnabled ? '1' : '0.5';
                (el as HTMLElement).style.pointerEvents = isEnabled ? 'auto' : 'none';
                const inputs = el.querySelectorAll('input[type="text"]');
                const toggles = el.querySelectorAll('.checkbox-container, input[type="checkbox"], .clickable-icon');
                const buttons = el.querySelectorAll('button');
                inputs.forEach(input => (input as HTMLInputElement).disabled = !isEnabled);
                toggles.forEach(toggle => {
                    (toggle as HTMLElement).style.pointerEvents = isEnabled ? 'auto' : 'none';
                    if (toggle instanceof HTMLInputElement) {
                        toggle.disabled = !isEnabled;
                    }
                });
                buttons.forEach(button => (button as HTMLButtonElement).disabled = !isEnabled);
            });
            
            // Update add button
            const addButton = this.containerEl.querySelector('.add-replacement-button button') as HTMLButtonElement;
            if (addButton) {
                addButton.disabled = !isEnabled;
                (addButton.parentElement as HTMLElement).style.opacity = isEnabled ? '1' : '0.5';
            }
        };

        const renderCustomReplacements = () => {
            // Clear existing custom replacement settings
            const existingCustomSettings = this.containerEl.querySelectorAll('.custom-replacement-setting');
            existingCustomSettings.forEach(el => el.remove());
            
            // Clear existing add button
            const existingAddButton = this.containerEl.querySelector('.add-replacement-button');
            if (existingAddButton) existingAddButton.remove();

            this.plugin.settings.customReplacements.forEach((replacement, index) => {
                // Create a more manual layout to avoid Setting component spacing
                const rowEl = this.containerEl.createEl('div', { cls: 'custom-replacement-setting' });
                rowEl.style.display = "flex";
                rowEl.style.alignItems = "center";
                rowEl.style.padding = "8px 0";
                rowEl.style.borderBottom = "1px solid var(--background-modifier-border)";

                // Create individual toggle
                const individualToggleSetting = new Setting(document.createElement('div'));
                individualToggleSetting.addToggle((toggle) => {
                    toggle.setValue(replacement.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.customReplacements[index].enabled = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    rowEl.appendChild(toggle.toggleEl);
                });

                // Create text input 1
                const input1 = rowEl.createEl("input", { type: "text" });
                input1.placeholder = "Text to replace";
                input1.value = replacement.searchText;
                input1.style.width = "30%";
                input1.style.marginLeft = "8px";
                input1.addEventListener('input', async (e) => {
                    this.plugin.settings.customReplacements[index].searchText = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });

                // Create text input 2
                const input2 = rowEl.createEl("input", { type: "text" });
                input2.placeholder = "Replace with";
                input2.value = replacement.replaceText;
                input2.style.width = "30%";
                input2.style.marginLeft = "8px";
                input2.addEventListener('input', async (e) => {
                    this.plugin.settings.customReplacements[index].replaceText = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });

                // Create toggle using Obsidian's Toggle component
                const toggleSetting = new Setting(document.createElement('div'));
                toggleSetting.addToggle((toggle) => {
                    toggle.setValue(replacement.onlyAtStart)
                        .onChange(async (value) => {
                            this.plugin.settings.customReplacements[index].onlyAtStart = value;
                            await this.plugin.saveSettings();
                        });
                    
                    // Extract the toggle element and add it to our control
                    const toggleEl = toggle.toggleEl;
                    toggleEl.style.margin = "0";
                    toggleEl.style.marginLeft = "8px";
                    rowEl.appendChild(toggleEl);
                });

                const toggleLabel = rowEl.createEl("span", { text: "Match at line start only" });
                toggleLabel.style.fontSize = "0.9em";
                toggleLabel.style.whiteSpace = "nowrap";
                toggleLabel.style.marginLeft = "8px";

                // Create remove button - positioned at the end
                const removeButton = rowEl.createEl("button", { text: "Remove" });
                removeButton.addClass("mod-warning");
                removeButton.style.marginLeft = "16px";
                removeButton.addEventListener('click', async () => {
                    this.plugin.settings.customReplacements.splice(index, 1);
                    await this.plugin.saveSettings();
                    renderCustomReplacements();
                });
            });

            // Always add the "Add replacement" button at the end
            const addButtonSetting = new Setting(this.containerEl)
                .addButton((button) =>
                    button.setButtonText("Add replacement").onClick(async () => {
                        this.plugin.settings.customReplacements.push({
                            searchText: "",
                            replaceText: "",
                            onlyAtStart: false,
                            enabled: true
                        });
                        await this.plugin.saveSettings();
                        renderCustomReplacements();
                    })
                );
            addButtonSetting.settingEl.addClass('add-replacement-button');
            
            // Update UI state after rendering
            updateCustomReplacementUI();
        };

        renderCustomReplacements();
    }
}