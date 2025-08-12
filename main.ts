import { Notice, Plugin, PluginSettingTab, Setting, TFile, Command, App, Modal, setIcon } from "obsidian";

interface CustomReplacement {
    searchText: string;
    replaceText: string;
    onlyAtStart: boolean;
    onlyWholeLine: boolean;
    enabled: boolean;
}

type OSPreset = 'macOS' | 'Windows' | 'Linux';

interface PluginSettings {
    excludedFolders: string[];
    charCount: number;
    osPreset: OSPreset;
    charReplacements: {
        slash: string;
        colon: string;
        asterisk: string;
        question: string;
        lessThan: string;
        greaterThan: string;
        quote: string;
        pipe: string;
        hash: string;
        leftBracket: string;
        rightBracket: string;
        caret: string;
    };
    charReplacementEnabled: {
        slash: boolean;
        colon: boolean;
        asterisk: boolean;
        question: boolean;
        lessThan: boolean;
        greaterThan: boolean;
        quote: boolean;
        pipe: boolean;
        hash: boolean;
        leftBracket: boolean;
        rightBracket: boolean;
        caret: boolean;
    };
    customReplacements: CustomReplacement[];
    omitHtmlTags: boolean;
    enableForbiddenCharReplacements: boolean;
    enableCustomReplacements: boolean;
    renameOnFocus: boolean;
    renameOnSave: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
    excludedFolders: [],
    charCount: 100,
    osPreset: 'macOS',
    charReplacements: {
        slash: ' ∕ ',
        colon: '։',
        asterisk: '∗',
        question: '﹖',
        lessThan: '‹',
        greaterThan: '›',
        quote: '＂',
        pipe: '❘',
        hash: '＃',
        leftBracket: '〚',
        rightBracket: '〛',
        caret: 'ˆ'
    },
    charReplacementEnabled: {
        slash: false,
        colon: false,
        asterisk: false,
        question: false,
        lessThan: false,
        greaterThan: false,
        quote: false,
        pipe: false,
        hash: false,
        leftBracket: false,
        rightBracket: false,
        caret: false
    },
    customReplacements: [
        { searchText: '.', replaceText: '․', onlyAtStart: false, onlyWholeLine: false, enabled: true },
        { searchText: '- [ ] ', replaceText: '✔️ ', onlyAtStart: true, onlyWholeLine: false, enabled: true },
        { searchText: '- [x] ', replaceText: '✅ ', onlyAtStart: true, onlyWholeLine: false, enabled: true }
    ],
    omitHtmlTags: true,
    enableForbiddenCharReplacements: false,
    enableCustomReplacements: false,
    renameOnFocus: true,
    renameOnSave: false
};

// OS-specific forbidden characters
const OS_FORBIDDEN_CHARS: Record<OSPreset, string[]> = {
    'macOS': ['/', ':', '|', '#', '[', ']', '^'],
    'Windows': ['/', ':', '|', '#', '[', ']', '^', '*', '?', '<', '>', '"', '\\'],
    'Linux': ['/', '#']
};

// Maximum number of entries to keep in cache
const MAX_CACHE_SIZE = 1000;
const MAX_TEMP_PATHS = 500;

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
            
            if (replacement.onlyWholeLine) {
                // Only replace if the entire line matches
                if (line.trim() === replacement.searchText.trim()) {
                    tempLine = replacement.replaceText;
                }
            } else if (replacement.onlyAtStart) {
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

        this.plugin.renamedFileCount = 0;
        this.plugin.tempNewPaths = [];
        const pleaseWaitNotice = new Notice(`Renaming files, please wait...`, 0);
        
        try {
            const errors: string[] = [];
            
            for (const file of filesToRename) {
                try {
                    await this.plugin.renameFile(file, true);
                } catch (error) {
                    errors.push(`Failed to rename ${file.path}: ${error}`);
                }
            }
            
            if (errors.length > 0) {
                new Notice(`Completed with ${errors.length} errors. Check console for details.`, 5000);
                console.error('Rename errors:', errors);
            }
        } finally {
            pleaseWaitNotice.hide();
            new Notice(
                `Renamed ${this.plugin.renamedFileCount}/${filesToRename.length} files.`,
                5000
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
    
    // Instance variables instead of global
    private renamedFileCount: number = 0;
    private tempNewPaths: string[] = [];
    private previousContent: Map<string, string> = new Map();
    private cacheCleanupInterval: NodeJS.Timeout | null = null;

    cleanupStaleCache(): void {
        // Clean up tempNewPaths - remove paths that don't exist anymore
        this.tempNewPaths = this.tempNewPaths.filter(path => {
            return this.app.vault.getAbstractFileByPath(path) !== null;
        });
        
        // Limit tempNewPaths size
        if (this.tempNewPaths.length > MAX_TEMP_PATHS) {
            this.tempNewPaths = this.tempNewPaths.slice(-MAX_TEMP_PATHS);
        }
        
        // Clean up previousContent - remove entries for files that don't exist anymore
        const entriesToDelete: string[] = [];
        for (const [path, content] of this.previousContent) {
            if (!this.app.vault.getAbstractFileByPath(path)) {
                entriesToDelete.push(path);
            }
        }
        
        for (const path of entriesToDelete) {
            this.previousContent.delete(path);
        }
        
        // Limit cache size - remove oldest entries if exceeding maximum
        if (this.previousContent.size > MAX_CACHE_SIZE) {
            const entriesToKeep = Array.from(this.previousContent.entries())
                .slice(-MAX_CACHE_SIZE);
            this.previousContent = new Map(entriesToKeep);
        }
    }

    async renameFile(file: TFile, noDelay = false): Promise<void> {
        if (inExcludedFolder(file, this.settings)) return;
        if (file.extension !== 'md') return;

        if (!noDelay) {
            // Clear tempNewPaths for individual file operations (not bulk)
            if (!this.tempNewPaths.length || this.tempNewPaths.length < 10) {
                this.tempNewPaths = [];
            }
        }

        // Clean up stale cache before processing
        this.cleanupStaleCache();

        let content: string;
        try {
            content = await this.app.vault.cachedRead(file);
        } catch (error) {
            console.error(`Failed to read file ${file.path}:`, error);
            throw new Error(`Failed to read file: ${error.message}`);
        }

        if (content.startsWith("---")) {
            let index = content.indexOf("---", 3);
            if (index != -1) content = content.slice(index + 3).trimStart();
        }

        const currentName = file.basename;
        let firstLine = content.split('\n')[0];

        // Check if content became empty when it wasn't before
        const previousFileContent = this.previousContent.get(file.path);
        if (content.trim() === '' && previousFileContent && previousFileContent.trim() !== '') {
            // Content became empty, rename to Untitled
            const parentPath = file.parent?.path === "/" ? "" : file.parent?.path + "/";
            let newPath: string = `${parentPath}Untitled.md`;
            
            let counter: number = 0;
            let fileExists: boolean = this.app.vault.getAbstractFileByPath(newPath) != null;
            while (fileExists || this.tempNewPaths.includes(newPath)) {
                if (file.path == newPath) {
                    this.previousContent.set(file.path, content);
                    return;
                }
                counter += 1;
                newPath = `${parentPath}Untitled ${counter}.md`;
                fileExists = this.app.vault.getAbstractFileByPath(newPath) != null;
            }

            if (noDelay) {
                this.tempNewPaths.push(newPath);
            }

            try {
                await this.app.fileManager.renameFile(file, newPath);
                this.renamedFileCount += 1;
            } catch (error) {
                console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
                throw new Error(`Failed to rename file: ${error.message}`);
            }
            
            this.previousContent.set(file.path, content);
            return;
        }

        // Store current content for next check
        this.previousContent.set(file.path, content);

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
            new Notice("File not renamed - first line references current filename", 3000);
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
            '*': this.settings.charReplacements.asterisk,
            '?': this.settings.charReplacements.question,
            '<': this.settings.charReplacements.lessThan,
            '>': this.settings.charReplacements.greaterThan,
            '"': this.settings.charReplacements.quote,
            '\\': this.settings.charReplacements.slash // Use slash replacement for backslash
        };

        // Get forbidden chars based on OS preset
        const forbiddenChars = OS_FORBIDDEN_CHARS[this.settings.osPreset].join('');
        const forbiddenNames: string[] = [
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

            if (forbiddenChars.includes(char) || char === '\\') {
                let shouldReplace = false;
                let replacement = '';
                
                // Check if master toggle is on AND individual toggle is on
                if (this.settings.enableForbiddenCharReplacements) {
                    // Map character to setting key
                    let settingKey: keyof typeof this.settings.charReplacementEnabled | null = null;
                    switch (char) {
                        case '/': settingKey = 'slash'; break;
                        case '\\': settingKey = 'slash'; break; // Treat backslash as slash
                        case ':': settingKey = 'colon'; break;
                        case '|': settingKey = 'pipe'; break;
                        case '#': settingKey = 'hash'; break;
                        case '[': settingKey = 'leftBracket'; break;
                        case ']': settingKey = 'rightBracket'; break;
                        case '^': settingKey = 'caret'; break;
                        case '*': settingKey = 'asterisk'; break;
                        case '?': settingKey = 'question'; break;
                        case '<': settingKey = 'lessThan'; break;
                        case '>': settingKey = 'greaterThan'; break;
                        case '"': settingKey = 'quote'; break;
                    }
                    
                    if (settingKey && this.settings.charReplacementEnabled[settingKey]) {
                        shouldReplace = true;
                        replacement = charMap[char] || '';
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

        const isForbiddenName =
            newFileName === "" ||
            forbiddenNames.includes(newFileName.toUpperCase());
        if (isForbiddenName) newFileName = "Untitled";

        const parentPath =
            file.parent?.path === "/" ? "" : file.parent?.path + "/";

        let newPath: string = `${parentPath}${newFileName}.md`;

        let counter: number = 0;
        let fileExists: boolean =
            this.app.vault.getAbstractFileByPath(newPath) != null;
        while (fileExists || this.tempNewPaths.includes(newPath)) {
            if (file.path == newPath) return;
            counter += 1;
            newPath = `${parentPath}${newFileName} ${counter}.md`;
            fileExists = this.app.vault.getAbstractFileByPath(newPath) != null;
        }

        if (noDelay) {
            this.tempNewPaths.push(newPath);
        }

        try {
            await this.app.fileManager.renameFile(file, newPath);
            this.renamedFileCount += 1;
        } catch (error) {
            console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
            throw new Error(`Failed to rename file: ${error.message}`);
        }
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
                    try {
                        await this.renameFile(activeFile, true);
                        new Notice(`Renamed ${activeFile.basename}`, 3000);
                    } catch (error) {
                        new Notice(`Failed to rename: ${error.message}`, 5000);
                    }
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
                    console.log(`First Line is Title: modify event for ${abstractFile.path}`);
                    this.renameFile(abstractFile).catch(error => {
                        console.error(`Error during auto-rename of ${abstractFile.path}:`, error);
                    });
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (leaf) => {
                if (this.settings.renameOnFocus && leaf && leaf.view && leaf.view.file && leaf.view.file instanceof TFile && leaf.view.file.extension === 'md') {
                    this.renameFile(leaf.view.file, true).catch(error => {
                        console.error(`Error during focus rename of ${leaf.view.file?.path}:`, error);
                    });
                }
            })
        );

        // Fixed save event handler using proper Obsidian save command hook
        const saveCommandDefinition = this.app.commands?.commands?.['editor:save-file'];
        if (saveCommandDefinition?.checkCallback) {
            const originalSaveCallback = saveCommandDefinition.checkCallback;
            saveCommandDefinition.checkCallback = (checking: boolean) => {
                if (checking) {
                    return originalSaveCallback(checking);
                } else {
                    originalSaveCallback(checking);
                    if (this.settings.renameOnSave) {
                        const activeFile = this.app.workspace.getActiveFile();
                        if (activeFile && activeFile.extension === 'md' && !inExcludedFolder(activeFile, this.settings)) {
                            this.renameFile(activeFile, true).catch(error => {
                                console.error(`Error during save rename of ${activeFile.path}:`, error);
                            });
                        }
                    }
                }
            };
        }

        // Listen for file deletion events to clean up cache
        this.registerEvent(
            this.app.vault.on("delete", (abstractFile) => {
                if (abstractFile instanceof TFile) {
                    // Remove from tempNewPaths
                    const index = this.tempNewPaths.indexOf(abstractFile.path);
                    if (index > -1) {
                        this.tempNewPaths.splice(index, 1);
                    }
                    
                    // Remove from previousContent
                    this.previousContent.delete(abstractFile.path);
                }
            })
        );

        // Listen for file rename events to update cache
        this.registerEvent(
            this.app.vault.on("rename", (abstractFile, oldPath) => {
                if (abstractFile instanceof TFile) {
                    // Update tempNewPaths
                    const index = this.tempNewPaths.indexOf(oldPath);
                    if (index > -1) {
                        this.tempNewPaths[index] = abstractFile.path;
                    }
                    
                    // Update previousContent
                    const oldContent = this.previousContent.get(oldPath);
                    if (oldContent !== undefined) {
                        this.previousContent.delete(oldPath);
                        this.previousContent.set(abstractFile.path, oldContent);
                    }
                }
            })
        );
        
        // Set up periodic cache cleanup
        this.cacheCleanupInterval = setInterval(() => {
            this.cleanupStaleCache();
        }, 60000); // Clean up every minute
    }
    
    onunload() {
        // Clean up intervals
        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
        }
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
            .setDesc("The maximum number of characters to put in title. Enter a value from 10 to 255. Default: 100.")
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
                            if (numVal >= 10 && numVal <= 255) {
                                this.plugin.settings.charCount = numVal;
                            }
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
            .setName("Rename on save")
            .setDesc("Automatically rename files when saving (Ctrl/Cmd+S).")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameOnSave)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnSave = value;
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
        
        const charHeader = charHeaderContainer.createEl("h3", { text: "Forbidden character replacements" });
        charHeader.style.margin = "0";
        
        // Create toggle for the header
        const headerToggleSetting = new Setting(document.createElement('div'));
        headerToggleSetting.addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.enableForbiddenCharReplacements)
                .onChange(async (value) => {
                    this.plugin.settings.enableForbiddenCharReplacements = value;
                    await this.plugin.saveSettings();
                    updateCharacterReplacementUI();
                });
            charHeaderContainer.appendChild(toggle.toggleEl);
        });

        const charDescEl = this.containerEl.createEl("div", { cls: "setting-item-description" });
        
        const updateCharDescriptionContent = () => {
            const isEnabled = this.plugin.settings.enableForbiddenCharReplacements;
            if (isEnabled) {
                charDescEl.setText("Define replacements for forbidden filename characters. Whitespace preserved.");
            } else {
                charDescEl.setText("Define replacements for forbidden filename characters.");
            }
        };
        
        updateCharDescriptionContent();
        this.containerEl.createEl("br");

        const charSettingsContainer = this.containerEl.createDiv();

        const updateCharacterReplacementUI = () => {
            const isEnabled = this.plugin.settings.enableForbiddenCharReplacements;
            charDescEl.style.opacity = isEnabled ? '1' : '0.5';
            
            // Update description content
            updateCharDescriptionContent();
            
            // Hide/show the entire character settings container
            charSettingsContainer.style.display = isEnabled ? 'block' : 'none';
            
            // Hide/show restore defaults button
            const restoreButton = this.containerEl.querySelector('.restore-defaults-button');
            if (restoreButton) {
                (restoreButton as HTMLElement).style.display = isEnabled ? 'block' : 'none';
            }
        };

        const updateCharacterSettings = () => {
            charSettingsContainer.empty();
            
            // Define character arrays first
            const primaryCharSettings: Array<{key: keyof typeof this.plugin.settings.charReplacements, name: string, char: string}> = [
                { key: 'leftBracket', name: 'Left bracket [', char: '[' },
                { key: 'rightBracket', name: 'Right bracket ]', char: ']' },
                { key: 'hash', name: 'Hash #', char: '#' },
                { key: 'caret', name: 'Caret ^', char: '^' },
                { key: 'pipe', name: 'Pipe |', char: '|' },
                { key: 'slash', name: 'Slash /', char: '/' },
                { key: 'colon', name: 'Colon :', char: ':' }
            ];
            
            const windowsAndroidChars: Array<{key: keyof typeof this.plugin.settings.charReplacements, name: string, char: string}> = [
                { key: 'asterisk', name: 'Asterisk *', char: '*' },
                { key: 'quote', name: 'Quote "', char: '"' },
                { key: 'lessThan', name: 'Less than <', char: '<' },
                { key: 'greaterThan', name: 'Greater than >', char: '>' },
                { key: 'question', name: 'Question mark ?', char: '?' }
            ];
            
            // Add All OSes subsection
            const allOSesHeader = charSettingsContainer.createEl('div', { cls: 'char-replacement-section-header' });
            allOSesHeader.style.marginBottom = "10px";
            
            const allOSesTitle = allOSesHeader.createEl('h4', { text: 'All OSes' });
            allOSesTitle.style.margin = "0";
            allOSesTitle.style.fontSize = "1.1em";
            allOSesTitle.style.fontWeight = "bold";
            
            const allOSesDescContainer = charSettingsContainer.createEl('div');
            const allOSesDesc = allOSesDescContainer.createEl('div', { 
                text: 'The following characters are forbidden in filenames on all OSes.',
                cls: 'setting-item-description'
            });
            allOSesDesc.style.marginBottom = "10px";
            
            // Build char settings in order: []#^|/:
            
            primaryCharSettings.forEach((setting, index) => {
                const rowEl = charSettingsContainer.createEl('div', { cls: 'char-replacement-setting' });
                rowEl.style.display = "flex";
                rowEl.style.alignItems = "center";
                rowEl.style.padding = "8px 0";
                
                if (index < primaryCharSettings.length - 1) {
                    rowEl.style.borderBottom = "1px solid var(--background-modifier-border)";
                }
                
                const toggleSetting = new Setting(document.createElement('div'));
                toggleSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.charReplacementEnabled[setting.key])
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementEnabled[setting.key] = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    rowEl.appendChild(toggle.toggleEl);
                });
                
                const nameLabel = rowEl.createEl("span", { text: setting.name });
                nameLabel.style.marginLeft = "8px";
                nameLabel.style.minWidth = "120px";
                nameLabel.style.flexGrow = "1";
                
                const textInput = rowEl.createEl("input", { type: "text" });
                textInput.placeholder = "Replace with";
                textInput.value = this.plugin.settings.charReplacements[setting.key];
                textInput.style.width = "200px";
                textInput.setAttribute('data-setting-key', setting.key);
                textInput.addEventListener('input', async (e) => {
                    this.plugin.settings.charReplacements[setting.key] = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });
            });
            
            // Add Windows/Android subsection
            const windowsAndroidHeader = charSettingsContainer.createEl('div', { cls: 'char-replacement-section-header' });
            windowsAndroidHeader.style.marginTop = "20px";
            windowsAndroidHeader.style.marginBottom = "10px";
            windowsAndroidHeader.style.paddingTop = "15px";
            windowsAndroidHeader.style.borderTop = "2px solid var(--background-modifier-border)";
            windowsAndroidHeader.style.display = "flex";
            windowsAndroidHeader.style.alignItems = "center";
            windowsAndroidHeader.style.gap = "10px";
            
            const sectionTitle = windowsAndroidHeader.createEl('h4', { text: 'Windows/Android' });
            sectionTitle.style.margin = "0";
            sectionTitle.style.fontSize = "1.1em";
            sectionTitle.style.fontWeight = "bold";
            
            // Add toggle for Windows/Android
            const windowsAndroidToggleSetting = new Setting(document.createElement('div'));
            windowsAndroidToggleSetting.addToggle((toggle) => {
                const windowsAndroidEnabled = windowsAndroidChars.every(setting => 
                    this.plugin.settings.charReplacementEnabled[setting.key]
                );
                toggle.setValue(windowsAndroidEnabled)
                    .onChange(async (value) => {
                        windowsAndroidChars.forEach(setting => {
                            this.plugin.settings.charReplacementEnabled[setting.key] = value;
                        });
                        await this.plugin.saveSettings();
                        updateCharacterSettings();
                    });
                toggle.toggleEl.style.margin = "0";
                windowsAndroidHeader.appendChild(toggle.toggleEl);
            });
            
            const sectionDescContainer = charSettingsContainer.createEl('div');
            const sectionDesc = sectionDescContainer.createEl('div', { 
                text: 'The following characters are forbidden in filenames on Windows and Android only.',
                cls: 'setting-item-description'
            });
            sectionDesc.style.marginBottom = "10px";
            
            windowsAndroidChars.forEach((setting, index) => {
                const rowEl = charSettingsContainer.createEl('div', { cls: 'char-replacement-setting' });
                rowEl.style.display = "flex";
                rowEl.style.alignItems = "center";
                rowEl.style.padding = "8px 0";
                
                if (index < windowsAndroidChars.length - 1) {
                    rowEl.style.borderBottom = "1px solid var(--background-modifier-border)";
                }
                
                const toggleSetting = new Setting(document.createElement('div'));
                toggleSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.charReplacementEnabled[setting.key])
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementEnabled[setting.key] = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    rowEl.appendChild(toggle.toggleEl);
                });
                
                const nameLabel = rowEl.createEl("span", { text: setting.name });
                nameLabel.style.marginLeft = "8px";
                nameLabel.style.minWidth = "120px";
                nameLabel.style.flexGrow = "1";
                
                const textInput = rowEl.createEl("input", { type: "text" });
                textInput.placeholder = "Replace with";
                textInput.value = this.plugin.settings.charReplacements[setting.key];
                textInput.style.width = "200px";
                textInput.setAttribute('data-setting-key', setting.key);
                textInput.addEventListener('input', async (e) => {
                    this.plugin.settings.charReplacements[setting.key] = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });
            });
            
            updateCharacterReplacementUI();
        };

        // Initialize character settings
        updateCharacterSettings();

        // Add restore defaults button
        const restoreDefaultsSetting = new Setting(this.containerEl)
            .addButton((button) =>
                button.setButtonText("Restore defaults").onClick(async () => {
                    this.plugin.settings.charReplacements = { ...DEFAULT_SETTINGS.charReplacements };
                    await this.plugin.saveSettings();
                    updateCharacterSettings();
                })
            );
        restoreDefaultsSetting.settingEl.addClass('restore-defaults-button');

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
        
        const updateCustomDescriptionContent = () => {
            const isEnabled = this.plugin.settings.enableCustomReplacements;
            if (isEnabled) {
                customDescEl.innerHTML = `
                    Define custom text replacements.<br><br>
                    <ul style="margin: 0; padding-left: 20px;">
                        <li>Rules are applied sequentially from top to bottom.</li>
                        <li>Whitespace preserved.</li>
                        <li>Leave <em>Replace with</em> blank to omit text entirely.</li>
                        <li>If <em>Replace with</em> is blank and <em>Text to replace</em> matches whole line, the filename becomes <em>Untitled</em>.</li>
                    </ul>
                `;
            } else {
                customDescEl.innerHTML = 'Define custom text replacements.';
            }
        };
        
        updateCustomDescriptionContent();
        this.containerEl.createEl("br");

        const updateCustomReplacementUI = () => {
            const isEnabled = this.plugin.settings.enableCustomReplacements;
            customDescEl.style.opacity = isEnabled ? '1' : '0.5';
            
            // Update description content
            updateCustomDescriptionContent();
            
            // Hide/show all custom replacement elements
            const customSettingsEls = this.containerEl.querySelectorAll('.custom-replacement-setting, .custom-replacement-header, .add-replacement-button');
            customSettingsEls.forEach(el => {
                (el as HTMLElement).style.display = isEnabled ? 'flex' : 'none';
            });
        };

        const renderCustomReplacements = () => {
            // Clear existing custom replacement settings
            const existingCustomSettings = this.containerEl.querySelectorAll('.custom-replacement-setting, .custom-replacement-header');
            existingCustomSettings.forEach(el => el.remove());
            
            // Clear existing add button
            const existingAddButton = this.containerEl.querySelector('.add-replacement-button');
            if (existingAddButton) existingAddButton.remove();

            // Create header row with column titles
            const headerRow = this.containerEl.createEl('div', { cls: 'custom-replacement-header' });
            headerRow.style.display = "flex";
            headerRow.style.alignItems = "center";
            headerRow.style.padding = "8px 0";
            headerRow.style.borderBottom = "2px solid var(--background-modifier-border)";
            headerRow.style.fontWeight = "bold";
            headerRow.style.fontSize = "0.9em";
            headerRow.style.gap = "8px";
            
            // Header for toggle
            const enableHeader = headerRow.createDiv();
            enableHeader.textContent = "Enable";
            enableHeader.style.width = "60px";
            enableHeader.style.minWidth = "60px";
            enableHeader.style.textAlign = "left";
            
            // Headers for input fields
            const textToReplaceHeader = headerRow.createDiv();
            textToReplaceHeader.textContent = "Text to replace";
            textToReplaceHeader.style.flex = "1";
            textToReplaceHeader.style.textAlign = "left";
            
            const replaceWithHeader = headerRow.createDiv();
            replaceWithHeader.textContent = "Replace with";
            replaceWithHeader.style.flex = "1";
            replaceWithHeader.style.textAlign = "left";
            
            // Headers for toggle switches
            const startOnlyHeader = headerRow.createDiv();
            startOnlyHeader.style.width = "85px";
            startOnlyHeader.style.minWidth = "85px";
            startOnlyHeader.style.textAlign = "left";
            startOnlyHeader.style.lineHeight = "1.2";
            const startLine1 = startOnlyHeader.createDiv();
            startLine1.textContent = "Match at line";
            const startLine2 = startOnlyHeader.createDiv();
            startLine2.textContent = "start only";
            
            const wholeLineHeader = headerRow.createDiv();
            wholeLineHeader.style.width = "85px";
            wholeLineHeader.style.minWidth = "85px";
            wholeLineHeader.style.textAlign = "left";
            wholeLineHeader.style.lineHeight = "1.2";
            const wholeLine1 = wholeLineHeader.createDiv();
            wholeLine1.textContent = "Match whole";
            const wholeLine2 = wholeLineHeader.createDiv();
            wholeLine2.textContent = "line only";
            
            // Empty header for action buttons
            const actionsHeader = headerRow.createDiv();
            actionsHeader.textContent = "";
            actionsHeader.style.width = "80px";
            actionsHeader.style.minWidth = "80px";

            this.plugin.settings.customReplacements.forEach((replacement, index) => {
                const rowEl = this.containerEl.createEl('div', { cls: 'custom-replacement-setting' });
                rowEl.style.display = "flex";
                rowEl.style.alignItems = "center";
                rowEl.style.padding = "8px 0";
                rowEl.style.borderBottom = "1px solid var(--background-modifier-border)";
                rowEl.style.gap = "8px";

                // Create toggle container with fixed width
                const toggleContainer = rowEl.createDiv();
                toggleContainer.style.width = "60px";
                toggleContainer.style.minWidth = "60px";
                
                // Create individual toggle
                const individualToggleSetting = new Setting(document.createElement('div'));
                individualToggleSetting.addToggle((toggle) => {
                    toggle.setValue(replacement.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.customReplacements[index].enabled = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

                // Create text input 1
                const input1 = rowEl.createEl("input", { type: "text" });
                input1.placeholder = "Text to replace";
                input1.value = replacement.searchText;
                input1.style.flex = "1";
                input1.addEventListener('input', async (e) => {
                    this.plugin.settings.customReplacements[index].searchText = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });

                // Create text input 2
                const input2 = rowEl.createEl("input", { type: "text" });
                input2.placeholder = "Replace with";
                input2.value = replacement.replaceText;
                input2.style.flex = "1";
                input2.addEventListener('input', async (e) => {
                    this.plugin.settings.customReplacements[index].replaceText = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });

                // Create toggle for "Match at line start only"
                const startToggleContainer = rowEl.createDiv();
                startToggleContainer.style.width = "85px";
                startToggleContainer.style.minWidth = "85px";
                startToggleContainer.style.display = "flex";
                startToggleContainer.style.justifyContent = "left";
                const startToggleSetting = new Setting(document.createElement('div'));
                startToggleSetting.addToggle((toggle) => {
                    toggle.setValue(replacement.onlyAtStart)
                        .onChange(async (value) => {
                            this.plugin.settings.customReplacements[index].onlyAtStart = value;
                            if (value) {
                                this.plugin.settings.customReplacements[index].onlyWholeLine = false;
                            }
                            await this.plugin.saveSettings();
                            renderCustomReplacements();
                        });
                    toggle.toggleEl.style.margin = "0";
                    // Disable if whole line is checked
                    if (replacement.onlyWholeLine) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.style.opacity = "0.5";
                        toggle.toggleEl.style.pointerEvents = "none";
                    }
                    startToggleContainer.appendChild(toggle.toggleEl);
                });
                
                // Create toggle for "Match whole line only"
                const wholeToggleContainer = rowEl.createDiv();
                wholeToggleContainer.style.width = "85px";
                wholeToggleContainer.style.minWidth = "85px";
                wholeToggleContainer.style.display = "flex";
                wholeToggleContainer.style.justifyContent = "left";
                const wholeToggleSetting = new Setting(document.createElement('div'));
                wholeToggleSetting.addToggle((toggle) => {
                    toggle.setValue(replacement.onlyWholeLine)
                        .onChange(async (value) => {
                            this.plugin.settings.customReplacements[index].onlyWholeLine = value;
                            if (value) {
                                this.plugin.settings.customReplacements[index].onlyAtStart = false;
                            }
                            await this.plugin.saveSettings();
                            renderCustomReplacements();
                        });
                    toggle.toggleEl.style.margin = "0";
                    // Disable if start only is checked
                    if (replacement.onlyAtStart) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.style.opacity = "0.5";
                        toggle.toggleEl.style.pointerEvents = "none";
                    }
                    wholeToggleContainer.appendChild(toggle.toggleEl);
                });

                // Create button container for action buttons
                const buttonContainer = rowEl.createDiv();
                buttonContainer.style.width = "80px";
                buttonContainer.style.minWidth = "80px";
                buttonContainer.style.display = "flex";
                buttonContainer.style.gap = "4px";
                buttonContainer.style.alignItems = "center";

                // Create up arrow button
                const upButton = buttonContainer.createEl("button", { 
                    cls: "clickable-icon",
                    attr: { "aria-label": "Move up" }
                });
                upButton.style.padding = "4px";
                upButton.style.background = "transparent";
                upButton.style.border = "none";
                upButton.style.cursor = index === 0 ? "not-allowed" : "pointer";
                upButton.style.opacity = index === 0 ? "0.5" : "1";
                setIcon(upButton, "chevron-up");
                
                if (index > 0) {
                    upButton.addEventListener('click', async () => {
                        const temp = this.plugin.settings.customReplacements[index];
                        this.plugin.settings.customReplacements[index] = this.plugin.settings.customReplacements[index - 1];
                        this.plugin.settings.customReplacements[index - 1] = temp;
                        await this.plugin.saveSettings();
                        renderCustomReplacements();
                    });
                }

                // Create down arrow button
                const downButton = buttonContainer.createEl("button", { 
                    cls: "clickable-icon",
                    attr: { "aria-label": "Move down" }
                });
                downButton.style.padding = "4px";
                downButton.style.background = "transparent";
                downButton.style.border = "none";
                downButton.style.cursor = index === this.plugin.settings.customReplacements.length - 1 ? "not-allowed" : "pointer";
                downButton.style.opacity = index === this.plugin.settings.customReplacements.length - 1 ? "0.5" : "1";
                setIcon(downButton, "chevron-down");
                
                if (index < this.plugin.settings.customReplacements.length - 1) {
                    downButton.addEventListener('click', async () => {
                        const temp = this.plugin.settings.customReplacements[index];
                        this.plugin.settings.customReplacements[index] = this.plugin.settings.customReplacements[index + 1];
                        this.plugin.settings.customReplacements[index + 1] = temp;
                        await this.plugin.saveSettings();
                        renderCustomReplacements();
                    });
                }

                // Create delete button with trash icon
                const deleteButton = buttonContainer.createEl("button", { 
                    cls: "clickable-icon",
                    attr: { "aria-label": "Delete" }
                });
                deleteButton.style.padding = "4px";
                deleteButton.style.background = "transparent";
                deleteButton.style.border = "none";
                deleteButton.style.cursor = "pointer";
                deleteButton.style.color = "var(--text-error)";
                setIcon(deleteButton, "trash-2");
                
                deleteButton.addEventListener('click', async () => {
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
                            onlyWholeLine: false,
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
