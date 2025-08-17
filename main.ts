import { Notice, Plugin, PluginSettingTab, Setting, TFile, Command, App, Modal, setIcon } from "obsidian";

// CSS styles for the plugin
const PLUGIN_STYLES = `
.flit-modal-heading {
    text-align: center;
}

.flit-modal-button-container {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
}

.flit-char-header-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.flit-char-header {
    margin: 0;
}

.flit-char-settings-container {
    display: block;
}

.flit-char-settings-container.hidden {
    display: none;
}

.flit-char-replacement-section-header {
    margin-bottom: 10px;
}

.flit-char-replacement-section-header.windows-android {
    margin-top: 20px;
    margin-bottom: 10px;
    padding-top: 15px;
    border-top: 2px solid var(--background-modifier-border);
    display: flex;
    align-items: center;
    gap: 10px;
}

.flit-section-title {
    margin: 0;
    font-size: 1.1em;
    font-weight: bold;
}

.flit-char-replacement-setting {
    display: flex;
    align-items: flex-start;
    padding: 8px 0;
    border-bottom: 1px solid var(--background-modifier-border);
}

.flit-char-replacement-setting.disabled {
    opacity: 0.5;
    pointer-events: none;
}

.flit-char-name-label {
    margin-left: 8px;
    min-width: 120px;
    flex-grow: 1;
}

.flit-char-text-input {
    width: 200px;
    min-width: 200px;
    max-width: 200px;
    flex-shrink: 0;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
}

.flit-custom-header-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.flit-custom-header {
    margin: 0;
}

.flit-table-container {
    overflow-x: auto;
    overflow-y: hidden;
    width: 100%;
    margin-bottom: 10px;
}

.flit-table-wrapper {
    width: fit-content;
    min-width: 100%;
    padding-right: 20px;
}

.flit-custom-replacement-header, .flit-safeword-header {
    display: flex;
    align-items: center;
    padding: 8px 0;
    border-bottom: 2px solid var(--background-modifier-border);
    font-weight: bold;
    font-size: 0.9em;
    gap: 8px;
    width: fit-content;
    min-width: 750px;
}

.flit-custom-replacement-header .flit-toggle-column:first-of-type,
.flit-safeword-header .flit-toggle-column:first-of-type {
    margin-right: -5px;
}

.flit-custom-replacement-header .flit-toggle-column:last-of-type,
.flit-safeword-header .flit-toggle-column:last-of-type {
    margin-right: -5px;
}

.flit-custom-replacement-header.hidden, .flit-safeword-header.hidden {
    display: none;
}

.flit-custom-replacement-setting, .flit-safeword-setting {
    display: flex;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--background-modifier-border);
    gap: 8px;
    width: fit-content;
    min-width: 750px;
}

.flit-custom-replacement-setting .flit-toggle-column:first-of-type,
.flit-safeword-setting .flit-toggle-column:first-of-type {
    margin-right: -5px;
}

.flit-custom-replacement-setting .flit-toggle-column:last-of-type,
.flit-safeword-setting .flit-toggle-column:last-of-type {
    margin-right: -5px;
}

.flit-custom-replacement-setting:last-of-type, .flit-safeword-setting:last-of-type {
    border-bottom: none;
}

.flit-custom-replacement-setting.hidden, .flit-safeword-setting.hidden {
    display: none;
}

.flit-enable-column {
    width: 60px;
    min-width: 60px;
    max-width: 60px;
    flex-shrink: 0;
    text-align: left;
}

.flit-text-column {
    width: 200px;
    min-width: 200px;
    max-width: 200px;
    flex-shrink: 0;
    text-align: left;
    overflow: hidden;
}

.flit-text-column.flit-safeword-input {
    width: 408px;
    min-width: 408px;
    max-width: 408px;
}

.flit-text-column input {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    text-overflow: ellipsis;
}

.flit-toggle-column {
    width: 85px;
    min-width: 85px;
    max-width: 85px;
    flex-shrink: 0;
    text-align: left;
    line-height: 1.2;
}

.flit-toggle-column.center {
    display: flex;
    justify-content: left;
}

.flit-actions-column {
    width: 80px;
    min-width: 80px;
    max-width: 80px;
    flex-shrink: 0;
}

.flit-button-container {
    display: flex;
    gap: 4px;
    align-items: center;
}

.flit-nav-button {
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
}

.flit-nav-button.disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.flit-delete-button {
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-error);
}

.flit-desc-disabled {
    opacity: 0.5;
}

.flit-restore-defaults-button.hidden {
    display: none;
}

.flit-add-replacement-button.hidden, .flit-add-safeword-button.hidden {
    display: none;
}
`;

interface CustomReplacement {
    searchText: string;
    replaceText: string;
    onlyAtStart: boolean;
    onlyWholeLine: boolean;
    enabled: boolean;
}

interface Safeword {
    text: string;
    onlyAtStart: boolean;
    onlyWholeLine: boolean;
    enabled: boolean;
}

type OSPreset = 'macOS' | 'Windows' | 'Linux';
type NotificationMode = 'Always' | 'On title change' | 'Never';

interface PluginSettings {
    excludedFolders: string[];
    charCount: number;
    checkInterval: number;
    disableRenamingKey: string;
    disableRenamingValue: string;
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
        backslash: string;
        dot: string;
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
        backslash: boolean;
        dot: boolean;
    };
    customReplacements: CustomReplacement[];
    safewords: Safeword[];
    omitHtmlTags: boolean;
    enableForbiddenCharReplacements: boolean;
    enableCustomReplacements: boolean;
    enableSafewords: boolean;
    renameOnFocus: boolean;
    renameAutomatically: boolean;
    manualNotificationMode: NotificationMode;
    windowsAndroidEnabled: boolean;
    hasEnabledForbiddenChars: boolean;
    hasEnabledWindowsAndroid: boolean;
    hasEnabledSafewords: boolean;
    skipExcalidrawFiles: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
    excludedFolders: [],
    charCount: 100,
    checkInterval: 500,
    disableRenamingKey: 'rename',
    disableRenamingValue: 'off',
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
        caret: 'ˆ',
        backslash: '⧵',
        dot: '․'
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
        caret: false,
        backslash: false,
        dot: false
    },
    customReplacements: [
        { searchText: '- [ ] ', replaceText: '✔️ ', onlyAtStart: true, onlyWholeLine: false, enabled: true },
        { searchText: '- [x] ', replaceText: '✅ ', onlyAtStart: true, onlyWholeLine: false, enabled: true }
    ],
    safewords: [
        { text: 'Title', onlyAtStart: false, onlyWholeLine: false, enabled: false }
    ],
    omitHtmlTags: false,
    enableForbiddenCharReplacements: false,
    enableCustomReplacements: false,
    enableSafewords: false,
    renameOnFocus: false,
    renameAutomatically: true,
    manualNotificationMode: 'On title change',
    windowsAndroidEnabled: false,
    hasEnabledForbiddenChars: false,
    hasEnabledWindowsAndroid: false,
    hasEnabledSafewords: false,
    skipExcalidrawFiles: false
};

// OS-specific forbidden characters
const UNIVERSAL_FORBIDDEN_CHARS = ['/', ':', '|', String.fromCharCode(92), '#', '[', ']', '^'];
const WINDOWS_ANDROID_CHARS = ['*', '?', '<', '>', '"'];

const OS_FORBIDDEN_CHARS: Record<OSPreset, string[]> = {
    'macOS': UNIVERSAL_FORBIDDEN_CHARS,
    'Windows': [...UNIVERSAL_FORBIDDEN_CHARS, ...WINDOWS_ANDROID_CHARS],
    'Linux': UNIVERSAL_FORBIDDEN_CHARS
};

let renamedFileCount: number = 0;
let tempNewPaths: string[] = [];

let onTimeout: boolean = true;
let timeout: NodeJS.Timeout;
let previousFile: string;
let previousContent: Map<string, string> = new Map();

// OS detection function
function detectOS(): OSPreset {
    // Check if we're on mobile (Android/iOS)
    if (typeof process === 'undefined' || !process.platform) {
        // On mobile, use user agent detection
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('android')) {
            return 'Linux'; // Android uses Linux-like paths but needs same char restrictions as macOS
        } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
            return 'macOS'; // iOS uses macOS-like paths
        }
        // Default for unknown mobile
        return 'Linux';
    }
    
    // Desktop detection using process.platform
    switch (process.platform) {
        case 'darwin': return 'macOS';
        case 'win32': return 'Windows';
        default: return 'Linux';
    }
}

function inExcludedFolder(file: TFile, settings: PluginSettings): boolean {
    if (settings.excludedFolders.length === 0) return false;
    if (settings.excludedFolders.includes(file.parent?.path as string))
        return true;
    return false;
}

function hasDisableProperty(content: string, settings: PluginSettings): boolean {
    // Check if the setting is configured
    if (!settings.disableRenamingKey || !settings.disableRenamingValue) return false;
    
    // Check if content starts with frontmatter
    if (!content.startsWith("---")) return false;
    
    // Find the end of the first frontmatter block
    const frontmatterEnd = content.indexOf("---", 3);
    if (frontmatterEnd === -1) return false;
    
    // Extract frontmatter content
    const frontmatter = content.slice(3, frontmatterEnd);
    
    // Create case-insensitive regex for key:value pair
    const escapedKey = settings.disableRenamingKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedValue = settings.disableRenamingValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const disableRegex = new RegExp(`^\\s*${escapedKey}\\s*:\\s*${escapedValue}\\s*$`, 'im');
    return disableRegex.test(frontmatter);
}

function isExcalidrawFile(content: string, settings: PluginSettings): boolean {
    if (!settings.skipExcalidrawFiles) return false;
    
    // Check if content starts with frontmatter
    if (!content.startsWith("---")) return false;
    
    // Find the end of the first frontmatter block
    const frontmatterEnd = content.indexOf("---", 3);
    if (frontmatterEnd === -1) return false;
    
    // Extract frontmatter content
    const frontmatter = content.slice(3, frontmatterEnd);
    
    // Check for excalidraw-plugin: parsed
    const excalidrawRegex = /^\s*excalidraw-plugin\s*:\s*parsed\s*$/m;
    return excalidrawRegex.test(frontmatter);
}

function containsSafeword(filename: string, settings: PluginSettings): boolean {
    if (!settings.enableSafewords) return false;
    
    for (const safeword of settings.safewords) {
        if (!safeword.enabled || !safeword.text) continue;
        
        if (safeword.onlyWholeLine) {
            // Only match if the entire filename matches
            if (filename.trim() === safeword.text.trim()) {
                return true;
            }
        } else if (safeword.onlyAtStart) {
            if (filename.startsWith(safeword.text)) {
                return true;
            }
        } else {
            if (filename.includes(safeword.text)) {
                return true;
            }
        }
    }
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

    // Handle escaped characters based on backslash replacement setting
    const escapeMap = new Map<string, string>();
    let escapeCounter = 0;
    
    const backslashReplacementEnabled = settings.enableForbiddenCharReplacements && settings.charReplacementEnabled.backslash;
    
    if (!backslashReplacementEnabled) {
        // Backslash disabled: use as escape character, omit from output
        line = line.replace(/\\(.)/g, (match, char) => {
            const placeholder = `__ESCAPED_${escapeCounter++}__`;
            escapeMap.set(placeholder, char);
            return placeholder;
        });
    }
    // If backslash replacement enabled: treat \ as regular character, no escaping

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

    // Restore escaped characters (remove escape, keep character) - only if escaping was used
    if (!backslashReplacementEnabled) {
        for (const [placeholder, char] of escapeMap) {
            line = line.replace(placeholder, char);
        }
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

        const heading = contentEl.createEl("h2", { text: "Warning", cls: "flit-modal-heading" });
        contentEl.createEl("p", { 
            text: "This will edit all of your files except those in excluded folders, and may introduce errors. Make sure you have backed up your files." 
        });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

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
                `Renamed ${renamedFileCount}/${filesToRename.length} files.`,
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

    async renameFile(file: TFile, noDelay = false, ignoreExclusions = false): Promise<void> {
        if (!ignoreExclusions && inExcludedFolder(file, this.settings)) return;
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

        let content: string;
        try {
            content = await this.app.vault.cachedRead(file);
        } catch (error) {
            console.error(`Failed to read file ${file.path}:`, error);
            throw new Error(`Failed to read file: ${error.message}`);
        }

        // Check if this file has the disable property and skip if enabled
        if (!ignoreExclusions && hasDisableProperty(content, this.settings)) {
            return;
        }

        // Check if this is an Excalidraw file and skip if enabled
        if (!ignoreExclusions && isExcalidrawFile(content, this.settings)) {
            return;
        }

        // Check if filename contains any safewords and skip if enabled
        if (!ignoreExclusions && containsSafeword(file.name, this.settings)) {
            return;
        }

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

            try {
                await this.app.fileManager.renameFile(file, newPath);
                renamedFileCount += 1;
            } catch (error) {
                console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
                throw new Error(`Failed to rename file: ${error.message}`);
            }
            
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
            '*': this.settings.charReplacements.asterisk,
            '?': this.settings.charReplacements.question,
            '<': this.settings.charReplacements.lessThan,
            '>': this.settings.charReplacements.greaterThan,
            '"': this.settings.charReplacements.quote,
            [String.fromCharCode(92)]: this.settings.charReplacements.backslash,
            '.': this.settings.charReplacements.dot
        };

        // Get forbidden chars - universal chars are always forbidden
        const universalForbiddenChars = UNIVERSAL_FORBIDDEN_CHARS;
        const windowsAndroidChars = WINDOWS_ANDROID_CHARS;
        const allForbiddenChars = [...universalForbiddenChars];
        if (this.settings.windowsAndroidEnabled) {
            allForbiddenChars.push(...windowsAndroidChars);
        }
        const forbiddenChars = [...new Set(allForbiddenChars)].join('');
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

            if (forbiddenChars.includes(char)) {
                let shouldReplace = false;
                let replacement = '';
                
                // Check if master toggle is on AND individual toggle is on
                if (this.settings.enableForbiddenCharReplacements) {
                    // Map character to setting key
                    let settingKey: keyof typeof this.settings.charReplacementEnabled | null = null;
                    switch (char) {
                        case '/': settingKey = 'slash'; break;
                        case String.fromCharCode(92): settingKey = 'backslash'; break;
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
                        case '.': settingKey = 'dot'; break;
                    }
                    
                    // For Windows/Android chars, also check if that toggle is enabled
                    const isWindowsAndroidChar = ['*', '?', '<', '>', '"'].includes(char);
                    const canReplace = isWindowsAndroidChar ? 
                        (this.settings.windowsAndroidEnabled && settingKey && this.settings.charReplacementEnabled[settingKey]) :
                        (settingKey && this.settings.charReplacementEnabled[settingKey]);
                    
                    if (canReplace) {
                        shouldReplace = true;
                        replacement = charMap[char] || '';
                    }
                }
                
                if (shouldReplace && replacement !== '') {
                    newFileName += replacement;
                }
                // If master toggle is off, individual toggle is off, or replacement is empty, omit the character (continue to next char)
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
        while (fileExists || tempNewPaths.includes(newPath)) {
            if (file.path == newPath) return;
            counter += 1;
            newPath = `${parentPath}${newFileName} ${counter}.md`;
            fileExists = this.app.vault.getAbstractFileByPath(newPath) != null;
        }

        if (noDelay) {
            tempNewPaths.push(newPath);
        }

        try {
            await this.app.fileManager.renameFile(file, newPath);
            renamedFileCount += 1;
        } catch (error) {
            console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
            throw new Error(`Failed to rename file: ${error.message}`);
        }
    }

    async onload(): Promise<void> {
        await this.loadSettings();
        
        // Auto-detect OS every time plugin loads
        this.settings.osPreset = detectOS();
        await this.saveSettings();
        
        // Add plugin styles
        const styleEl = document.createElement('style');
        styleEl.textContent = PLUGIN_STYLES;
        document.head.appendChild(styleEl);
        
        this.addSettingTab(new FirstLineIsTitleSettings(this.app, this));

        this.addCommand({
            id: 'rename-current-file-unless-excluded',
            name: 'Rename current file unless excluded',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    await this.renameFile(activeFile, true, false);
                }
            }
        });

        this.addCommand({
            id: 'rename-current-file',
            name: 'Rename current file',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    await this.renameFile(activeFile, true, true);
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
    
    onunload() {
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
            .setName("Rename automatically")
            .setDesc("Renames files automatically when the first line changes. If disabled, files will only be renamed when invoking a command manually.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameAutomatically)
                    .onChange(async (value) => {
                        this.plugin.settings.renameAutomatically = value;
                        await this.plugin.saveSettings();
                    })
            );

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

        const propertyDisableSetting = new Setting(this.containerEl)
            .setName("Property to disable renaming")
            .setDesc("Define the key:property pair that will disable renaming for files that contain it. Case insensitive.");
        
        const propertyContainer = propertyDisableSetting.controlEl.createDiv({ cls: "flit-property-disable-container" });
        propertyContainer.style.display = "flex";
        propertyContainer.style.gap = "10px";
        
        const keyInput = propertyContainer.createEl("input", { type: "text" });
        keyInput.placeholder = "key";
        keyInput.style.width = "120px";
        keyInput.value = this.plugin.settings.disableRenamingKey;
        keyInput.addEventListener('input', async (e) => {
            this.plugin.settings.disableRenamingKey = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
        });
        
        const valueInput = propertyContainer.createEl("input", { type: "text" });
        valueInput.placeholder = "value";
        valueInput.style.width = "120px";
        valueInput.value = this.plugin.settings.disableRenamingValue;
        valueInput.addEventListener('input', async (e) => {
            this.plugin.settings.disableRenamingValue = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
        });

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
            .setName("Don't rename Excalidraw files")
            .setDesc("Files that have the property `excalidraw-plugin: parsed` won't be renamed.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.skipExcalidrawFiles)
                    .onChange(async (value) => {
                        this.plugin.settings.skipExcalidrawFiles = value;
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
            .setName("Show notification when renaming manually")
            .setDesc("Controls when to show notifications for the 'Rename current file' command.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('Always', 'Always')
                    .addOption('On title change', 'On title change')
                    .addOption('Never', 'Never')
                    .setValue(this.plugin.settings.manualNotificationMode)
                    .onChange(async (value: NotificationMode) => {
                        this.plugin.settings.manualNotificationMode = value;
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
        const charHeaderContainer = this.containerEl.createEl("div", { cls: "setting-item flit-char-header-container" });
        
        const charHeader = charHeaderContainer.createEl("h3", { text: "Forbidden character replacements", cls: "flit-char-header" });
        
        // Create toggle for the header
        const headerToggleSetting = new Setting(document.createElement('div'));
        headerToggleSetting.addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.enableForbiddenCharReplacements)
                .onChange(async (value) => {
                    this.plugin.settings.enableForbiddenCharReplacements = value;
                    
                    // On first enable, turn on all All OSes options
                    if (value && !this.plugin.settings.hasEnabledForbiddenChars) {
                        const allOSesKeys = ['leftBracket', 'rightBracket', 'hash', 'caret', 'pipe', 'backslash', 'slash', 'colon', 'dot'];
                        allOSesKeys.forEach(key => {
                            this.plugin.settings.charReplacementEnabled[key as keyof typeof this.plugin.settings.charReplacementEnabled] = true;
                        });
                        this.plugin.settings.hasEnabledForbiddenChars = true;
                        
                        // If OS is Windows or Android, also enable Windows/Android section
                        const currentOS = detectOS();
                        if ((currentOS === 'Windows' || currentOS === 'Linux') && !this.plugin.settings.hasEnabledWindowsAndroid) {
                            this.plugin.settings.windowsAndroidEnabled = true;
                            const windowsAndroidKeys = ['asterisk', 'quote', 'lessThan', 'greaterThan', 'question'];
                            windowsAndroidKeys.forEach(key => {
                                this.plugin.settings.charReplacementEnabled[key as keyof typeof this.plugin.settings.charReplacementEnabled] = true;
                            });
                            this.plugin.settings.hasEnabledWindowsAndroid = true;
                        }
                    }
                    
                    await this.plugin.saveSettings();
                    updateCharacterSettings(); // Rebuild to show new toggle states
                    updateCharacterReplacementUI();
                });
            charHeaderContainer.appendChild(toggle.toggleEl);
        });

        const charDescEl = this.containerEl.createEl("div", { cls: "setting-item-description" });
        
        const updateCharDescriptionContent = () => {
            const isEnabled = this.plugin.settings.enableForbiddenCharReplacements;
            if (isEnabled) {
                charDescEl.setText("Define replacements for forbidden filename characters. Characters are omitted entirely if disabled.");
            } else {
                charDescEl.setText("Define replacements for forbidden filename characters. Characters are omitted entirely if disabled.");
            }
        };
        
        updateCharDescriptionContent();
        this.containerEl.createEl("br");

        const charSettingsContainer = this.containerEl.createDiv({ cls: "flit-char-settings-container" });

        const updateCharacterReplacementUI = () => {
            const isEnabled = this.plugin.settings.enableForbiddenCharReplacements;
            
            if (isEnabled) {
                charDescEl.classList.remove('flit-desc-disabled');
            } else {
                charDescEl.classList.add('flit-desc-disabled');
            }
            
            // Update description content
            updateCharDescriptionContent();
            
            // Hide/show the entire character settings container
            if (isEnabled) {
                charSettingsContainer.classList.remove('hidden');
            } else {
                charSettingsContainer.classList.add('hidden');
            }
            
            // Hide/show restore defaults button
            const restoreButton = this.containerEl.querySelector('.flit-restore-defaults-button');
            if (restoreButton) {
                if (isEnabled) {
                    restoreButton.classList.remove('hidden');
                } else {
                    restoreButton.classList.add('hidden');
                }
            }
        };

        const updateCharacterSettings = () => {
            charSettingsContainer.empty();
            
            // Define character arrays first
            const primaryCharSettings: Array<{key: keyof typeof this.plugin.settings.charReplacements, name: string, char: string, description?: string}> = [
                { key: 'leftBracket', name: 'Left bracket [', char: '[' },
                { key: 'rightBracket', name: 'Right bracket ]', char: ']' },
                { key: 'hash', name: 'Hash #', char: '#' },
                { key: 'caret', name: 'Caret ^', char: '^' },
                { key: 'pipe', name: 'Pipe |', char: '|' },
                { key: 'backslash', name: 'Backslash \\', char: String.fromCharCode(92), description: 'Note: replacing the backslash disables its use as an escape character for overriding the omission of markdown syntax and HTML tags (if enabled).' },
                { key: 'slash', name: 'Forward slash /', char: '/' },
                { key: 'colon', name: 'Colon :', char: ':' },
                { key: 'dot', name: 'Dot .', char: '.', description: 'Note: the dot is only forbidden at filename start.' }
            ];
            
            const windowsAndroidChars: Array<{key: keyof typeof this.plugin.settings.charReplacements, name: string, char: string}> = [
                { key: 'asterisk', name: 'Asterisk *', char: '*' },
                { key: 'quote', name: 'Quote "', char: '"' },
                { key: 'lessThan', name: 'Less than <', char: '<' },
                { key: 'greaterThan', name: 'Greater than >', char: '>' },
                { key: 'question', name: 'Question mark ?', char: '?' }
            ];
            
            // Add All OSes subsection
            const allOSesHeader = charSettingsContainer.createEl('div', { cls: 'flit-char-replacement-section-header' });
            
            const allOSesTitle = allOSesHeader.createEl('h3', { text: 'All OSes', cls: 'flit-section-title' });
            
            const allOSesDescContainer = charSettingsContainer.createEl('div');
            const allOSesDesc = allOSesDescContainer.createEl('div', { 
                text: 'The following characters are forbidden in Obsidian filenames on all OSes. Whitespace preserved.',
                cls: 'setting-item-description'
            });
            allOSesDesc.style.marginBottom = "10px";
            
            // Build char settings in order: []#^|\/:.  
            
            primaryCharSettings.forEach((setting, index) => {
                const rowEl = charSettingsContainer.createEl('div', { cls: 'flit-char-replacement-setting' });
                
                // Remove border from last item in All OSes
                if (index === primaryCharSettings.length - 1) {
                    rowEl.style.borderBottom = 'none';
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
                
                // Create name and description container
                const nameContainer = rowEl.createEl("div", { cls: "flit-char-name-label" });
                nameContainer.createEl("div", { text: setting.name, cls: "setting-item-name" });
                if (setting.description) {
                    nameContainer.createEl("div", { text: setting.description, cls: "setting-item-description" });
                }
                
                const textInput = rowEl.createEl("input", { type: "text", cls: "flit-char-text-input" });
                textInput.placeholder = "Replace with";
                textInput.value = this.plugin.settings.charReplacements[setting.key];
                textInput.setAttribute('data-setting-key', setting.key);
                textInput.addEventListener('input', async (e) => {
                    this.plugin.settings.charReplacements[setting.key] = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });
            });
            
            // Add Windows/Android subsection
            const windowsAndroidHeader = charSettingsContainer.createEl('div', { cls: 'flit-char-replacement-section-header windows-android' });
            
            const sectionTitle = windowsAndroidHeader.createEl('h3', { text: 'Windows/Android', cls: 'flit-section-title' });
            
            // Add toggle for Windows/Android
            const windowsAndroidToggleSetting = new Setting(document.createElement('div'));
            windowsAndroidToggleSetting.addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.windowsAndroidEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.windowsAndroidEnabled = value;
                        
                        // On first enable, turn on all Windows/Android options
                        if (value && !this.plugin.settings.hasEnabledWindowsAndroid) {
                            windowsAndroidChars.forEach(setting => {
                                this.plugin.settings.charReplacementEnabled[setting.key] = true;
                            });
                            this.plugin.settings.hasEnabledWindowsAndroid = true;
                        }
                        
                        await this.plugin.saveSettings();
                        updateCharacterSettings();
                    });
                toggle.toggleEl.style.margin = "0";
                windowsAndroidHeader.appendChild(toggle.toggleEl);
            });
            
            const sectionDescContainer = charSettingsContainer.createEl('div');
            const sectionDesc = sectionDescContainer.createEl('div', { 
                text: 'The following characters are forbidden in Obsidian filenames on Windows and Android only. Whitespace preserved.',
                cls: 'setting-item-description'
            });
            sectionDesc.style.marginBottom = "10px";
            
            windowsAndroidChars.forEach((setting, index) => {
                const rowEl = charSettingsContainer.createEl('div', { cls: 'flit-char-replacement-setting' });
                
                // Apply disabled state based on Windows/Android toggle
                const isDisabled = !this.plugin.settings.windowsAndroidEnabled;
                if (isDisabled) {
                    rowEl.classList.add('disabled');
                }
                
                const toggleSetting = new Setting(document.createElement('div'));
                toggleSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.charReplacementEnabled[setting.key])
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementEnabled[setting.key] = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    if (isDisabled) {
                        toggle.setDisabled(true);
                    }
                    rowEl.appendChild(toggle.toggleEl);
                });
                
                const nameLabel = rowEl.createEl("span", { text: setting.name, cls: "flit-char-name-label" });
                
                const textInput = rowEl.createEl("input", { type: "text", cls: "flit-char-text-input" });
                textInput.placeholder = "Replace with";
                textInput.value = this.plugin.settings.charReplacements[setting.key];
                textInput.setAttribute('data-setting-key', setting.key);
                textInput.disabled = isDisabled;
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
        restoreDefaultsSetting.settingEl.addClass('flit-restore-defaults-button');

        this.containerEl.createEl("br");

        // Custom replacements section
        const customHeaderContainer = this.containerEl.createEl("div", { cls: "setting-item flit-custom-header-container" });
        
        const customHeader = customHeaderContainer.createEl("h3", { text: "Custom replacements", cls: "flit-custom-header" });
        
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
            customDescEl.empty();
            
            if (isEnabled) {
                customDescEl.createEl('span', { text: 'Define custom text replacements.' });
                customDescEl.createEl('br');
                customDescEl.createEl('br');
                
                const ul = customDescEl.createEl('ul');
                ul.style.margin = '0';
                ul.style.paddingLeft = '20px';
                
                ul.createEl('li', { text: 'Rules are applied sequentially from top to bottom.' });
                ul.createEl('li', { text: 'Whitespace preserved.' });
                
                const li3 = ul.createEl('li');
                li3.appendText('Leave ');
                li3.createEl('em', { text: 'Replace with' });
                li3.appendText(' blank to omit text entirely.');
                
                const li4 = ul.createEl('li');
                li4.appendText('If ');
                li4.createEl('em', { text: 'Replace with' });
                li4.appendText(' is blank and ');
                li4.createEl('em', { text: 'Text to replace' });
                li4.appendText(' matches whole line, the filename becomes ');
                li4.createEl('em', { text: 'Untitled' });
                li4.appendText('.');
            } else {
                customDescEl.createEl('span', { text: 'Define custom text replacements.' });
            }
        };
        
        updateCustomDescriptionContent();
        this.containerEl.createEl("br");

        const updateCustomReplacementUI = () => {
            const isEnabled = this.plugin.settings.enableCustomReplacements;
            
            if (isEnabled) {
                customDescEl.classList.remove('flit-desc-disabled');
            } else {
                customDescEl.classList.add('flit-desc-disabled');
            }
            
            // Update description content
            updateCustomDescriptionContent();
            
            // Hide/show all custom replacement elements
            const customSettingsEls = this.containerEl.querySelectorAll('.flit-custom-replacement-setting, .flit-custom-replacement-header, .flit-add-replacement-button');
            customSettingsEls.forEach(el => {
                if (isEnabled) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            });
        };

        const renderCustomReplacements = () => {
            // Clear existing custom replacement settings and containers
            const existingCustomSettings = this.containerEl.querySelectorAll('.flit-custom-replacement-setting, .flit-custom-replacement-header, .flit-custom-table-container');
            existingCustomSettings.forEach(el => el.remove());
            
            // Clear existing add button
            const existingAddButton = this.containerEl.querySelector('.flit-add-replacement-button');
            if (existingAddButton) existingAddButton.remove();

            // Create table container
            const tableContainer = this.containerEl.createEl('div', { cls: 'flit-table-container flit-custom-table-container' });
            const tableWrapper = tableContainer.createEl('div', { cls: 'flit-table-wrapper' });

            // Create header row with column titles
            const headerRow = tableWrapper.createEl('div', { cls: 'flit-custom-replacement-header' });
            
            // Header for toggle
            const enableHeader = headerRow.createDiv({ cls: "flit-enable-column" });
            enableHeader.textContent = "Enable";
            
            // Headers for input fields
            const textToReplaceHeader = headerRow.createDiv({ cls: "flit-text-column" });
            textToReplaceHeader.textContent = "Text to replace";
            
            const replaceWithHeader = headerRow.createDiv({ cls: "flit-text-column" });
            replaceWithHeader.textContent = "Replace with";
            
            // Headers for toggle switches
            const startOnlyHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const startLine1 = startOnlyHeader.createDiv();
            startLine1.textContent = "Match at";
            const startLine2 = startOnlyHeader.createDiv();
            startLine2.textContent = "line start";
            const startLine3 = startOnlyHeader.createDiv();
            startLine3.textContent = "only";
            
            const wholeLineHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const wholeLine1 = wholeLineHeader.createDiv();
            wholeLine1.textContent = "Match";
            const wholeLine2 = wholeLineHeader.createDiv();
            wholeLine2.textContent = "whole line";
            const wholeLine3 = wholeLineHeader.createDiv();
            wholeLine3.textContent = "only";
            
            // Empty header for action buttons
            const actionsHeader = headerRow.createDiv({ cls: "flit-actions-column" });
            actionsHeader.textContent = "";

            this.plugin.settings.customReplacements.forEach((replacement, index) => {
                const rowEl = tableWrapper.createEl('div', { cls: 'flit-custom-replacement-setting' });

                // Create toggle container with fixed width
                const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });
                
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

                // Create text input 1 container and input
                const input1Container = rowEl.createDiv({ cls: "flit-text-column" });
                const input1 = input1Container.createEl("input", { type: "text" });
                input1.placeholder = "Text to replace";
                input1.value = replacement.searchText;
                input1.addEventListener('input', async (e) => {
                    this.plugin.settings.customReplacements[index].searchText = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });

                // Create text input 2 container and input
                const input2Container = rowEl.createDiv({ cls: "flit-text-column" });
                const input2 = input2Container.createEl("input", { type: "text" });
                input2.placeholder = "Replace with";
                input2.value = replacement.replaceText;
                input2.addEventListener('input', async (e) => {
                    this.plugin.settings.customReplacements[index].replaceText = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });

                // Create toggle for "Match at line start only"
                const startToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
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
                const wholeToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
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
                const buttonContainer = rowEl.createDiv({ cls: "flit-actions-column flit-button-container" });

                // Create up arrow button
                const upButton = buttonContainer.createEl("button", { 
                    cls: "clickable-icon flit-nav-button",
                    attr: { "aria-label": "Move up" }
                });
                if (index === 0) {
                    upButton.classList.add('disabled');
                }
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
                    cls: "clickable-icon flit-nav-button",
                    attr: { "aria-label": "Move down" }
                });
                if (index === this.plugin.settings.customReplacements.length - 1) {
                    downButton.classList.add('disabled');
                }
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
                    cls: "clickable-icon flit-delete-button",
                    attr: { "aria-label": "Delete" }
                });
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
            addButtonSetting.settingEl.addClass('flit-add-replacement-button');
            
            // Update UI state after rendering
            updateCustomReplacementUI();
        };

        renderCustomReplacements();

        this.containerEl.createEl("br");

        // Safewords section
        const safewordsHeaderContainer = this.containerEl.createEl("div", { cls: "setting-item flit-custom-header-container" });
        
        const safewordsHeader = safewordsHeaderContainer.createEl("h3", { text: "Safewords", cls: "flit-custom-header" });
        
        // Create toggle for the header
        const safewordsHeaderToggleSetting = new Setting(document.createElement('div'));
        safewordsHeaderToggleSetting.addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.enableSafewords)
                .onChange(async (value) => {
                    this.plugin.settings.enableSafewords = value;
                    
                    // On first enable, add default "Title" safeword (disabled)
                    if (value && !this.plugin.settings.hasEnabledSafewords) {
                        if (this.plugin.settings.safewords.length === 0) {
                            this.plugin.settings.safewords.push({
                                text: 'Title',
                                onlyAtStart: false,
                                onlyWholeLine: false,
                                enabled: false
                            });
                        }
                        this.plugin.settings.hasEnabledSafewords = true;
                    }
                    
                    await this.plugin.saveSettings();
                    updateSafewordsUI();
                });
            safewordsHeaderContainer.appendChild(toggle.toggleEl);
        });
        
        const safewordsDescEl = this.containerEl.createEl("div", { cls: "setting-item-description" });
        
        const updateSafewordsDescriptionContent = () => {
            const isEnabled = this.plugin.settings.enableSafewords;
            safewordsDescEl.empty();
            
            if (isEnabled) {
                safewordsDescEl.createEl('span', { text: 'Filenames that contain the entries below won\'t be renamed.' });
            } else {
                safewordsDescEl.createEl('span', { text: 'Filenames that contain the entries below won\'t be renamed.' });
            }
        };
        
        updateSafewordsDescriptionContent();
        this.containerEl.createEl("br");

        const updateSafewordsUI = () => {
            const isEnabled = this.plugin.settings.enableSafewords;
            
            if (isEnabled) {
                safewordsDescEl.classList.remove('flit-desc-disabled');
            } else {
                safewordsDescEl.classList.add('flit-desc-disabled');
            }
            
            // Update description content
            updateSafewordsDescriptionContent();
            
            // Hide/show all safeword elements
            const safewordSettingsEls = this.containerEl.querySelectorAll('.flit-safeword-setting, .flit-safeword-header, .flit-add-safeword-button');
            safewordSettingsEls.forEach(el => {
                if (isEnabled) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            });
        };

        const renderSafewords = () => {
            // Clear existing safeword settings and containers
            const existingSafewordSettings = this.containerEl.querySelectorAll('.flit-safeword-setting, .flit-safeword-header, .flit-safeword-table-container');
            existingSafewordSettings.forEach(el => el.remove());
            
            // Clear existing add button
            const existingAddButton = this.containerEl.querySelector('.flit-add-safeword-button');
            if (existingAddButton) existingAddButton.remove();

            // Create table container
            const tableContainer = this.containerEl.createEl('div', { cls: 'flit-table-container flit-safeword-table-container' });
            const tableWrapper = tableContainer.createEl('div', { cls: 'flit-table-wrapper' });

            // Create header row with column titles
            const headerRow = tableWrapper.createEl('div', { cls: 'flit-safeword-header' });
            
            // Header for toggle
            const enableHeader = headerRow.createDiv({ cls: "flit-enable-column" });
            enableHeader.textContent = "Enable";
            
            // Header for input field
            const safewordHeader = headerRow.createDiv({ cls: "flit-text-column flit-safeword-input" });
            safewordHeader.textContent = "Safeword";
            
            // Headers for toggle switches
            const startOnlyHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const startLine1 = startOnlyHeader.createDiv();
            startLine1.textContent = "Match at";
            const startLine2 = startOnlyHeader.createDiv();
            startLine2.textContent = "line start";
            const startLine3 = startOnlyHeader.createDiv();
            startLine3.textContent = "only";
            
            const wholeLineHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const wholeLine1 = wholeLineHeader.createDiv();
            wholeLine1.textContent = "Match";
            const wholeLine2 = wholeLineHeader.createDiv();
            wholeLine2.textContent = "whole line";
            const wholeLine3 = wholeLineHeader.createDiv();
            wholeLine3.textContent = "only";
            
            // Empty header for action buttons
            const actionsHeader = headerRow.createDiv({ cls: "flit-actions-column" });
            actionsHeader.textContent = "";

            this.plugin.settings.safewords.forEach((safeword, index) => {
                const rowEl = tableWrapper.createEl('div', { cls: 'flit-safeword-setting' });

                // Create toggle container with fixed width
                const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });
                
                // Create individual toggle
                const individualToggleSetting = new Setting(document.createElement('div'));
                individualToggleSetting.addToggle((toggle) => {
                    toggle.setValue(safeword.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.safewords[index].enabled = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

                // Create text input container and input
                const inputContainer = rowEl.createDiv({ cls: "flit-text-column flit-safeword-input" });
                const input = inputContainer.createEl("input", { type: "text" });
                input.placeholder = "Safeword";
                input.value = safeword.text;
                input.addEventListener('input', async (e) => {
                    const inputEl = e.target as HTMLInputElement;
                    let value = inputEl.value;
                    
                    // Define forbidden characters
                    const universalForbidden = ['/', ':', '|', String.fromCharCode(92), '#', '[', ']', '^'];
                    const windowsAndroidForbidden = ['*', '?', '<', '>', '"'];
                    
                    let forbiddenChars = [...universalForbidden];
                    if (this.plugin.settings.osPreset === 'Windows' || this.plugin.settings.osPreset === 'Linux') {
                        forbiddenChars.push(...windowsAndroidForbidden);
                    }
                    
                    // Filter out forbidden characters
                    let filteredValue = '';
                    for (let i = 0; i < value.length; i++) {
                        const char = value[i];
                        
                        // Special case for dot: forbidden only at start
                        if (char === '.' && i === 0) {
                            continue; // Skip dot at start
                        }
                        
                        // Skip other forbidden characters
                        if (forbiddenChars.includes(char)) {
                            continue;
                        }
                        
                        filteredValue += char;
                    }
                    
                    // Update input if value changed
                    if (filteredValue !== value) {
                        inputEl.value = filteredValue;
                        // Restore cursor position
                        const cursorPos = Math.min(inputEl.selectionStart || 0, filteredValue.length);
                        inputEl.setSelectionRange(cursorPos, cursorPos);
                    }
                    
                    this.plugin.settings.safewords[index].text = filteredValue;
                    await this.plugin.saveSettings();
                });

                // Create toggle for "Match at line start only"
                const startToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const startToggleSetting = new Setting(document.createElement('div'));
                startToggleSetting.addToggle((toggle) => {
                    toggle.setValue(safeword.onlyAtStart)
                        .onChange(async (value) => {
                            this.plugin.settings.safewords[index].onlyAtStart = value;
                            if (value) {
                                this.plugin.settings.safewords[index].onlyWholeLine = false;
                            }
                            await this.plugin.saveSettings();
                            renderSafewords();
                        });
                    toggle.toggleEl.style.margin = "0";
                    // Disable if whole line is checked
                    if (safeword.onlyWholeLine) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.style.opacity = "0.5";
                        toggle.toggleEl.style.pointerEvents = "none";
                    }
                    startToggleContainer.appendChild(toggle.toggleEl);
                });
                
                // Create toggle for "Match whole line only"
                const wholeToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const wholeToggleSetting = new Setting(document.createElement('div'));
                wholeToggleSetting.addToggle((toggle) => {
                    toggle.setValue(safeword.onlyWholeLine)
                        .onChange(async (value) => {
                            this.plugin.settings.safewords[index].onlyWholeLine = value;
                            if (value) {
                                this.plugin.settings.safewords[index].onlyAtStart = false;
                            }
                            await this.plugin.saveSettings();
                            renderSafewords();
                        });
                    toggle.toggleEl.style.margin = "0";
                    // Disable if start only is checked
                    if (safeword.onlyAtStart) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.style.opacity = "0.5";
                        toggle.toggleEl.style.pointerEvents = "none";
                    }
                    wholeToggleContainer.appendChild(toggle.toggleEl);
                });

                // Create button container for action buttons
                const buttonContainer = rowEl.createDiv({ cls: "flit-actions-column flit-button-container" });

                // Create up arrow button
                const upButton = buttonContainer.createEl("button", { 
                    cls: "clickable-icon flit-nav-button",
                    attr: { "aria-label": "Move up" }
                });
                if (index === 0) {
                    upButton.classList.add('disabled');
                }
                setIcon(upButton, "chevron-up");
                
                if (index > 0) {
                    upButton.addEventListener('click', async () => {
                        const temp = this.plugin.settings.safewords[index];
                        this.plugin.settings.safewords[index] = this.plugin.settings.safewords[index - 1];
                        this.plugin.settings.safewords[index - 1] = temp;
                        await this.plugin.saveSettings();
                        renderSafewords();
                    });
                }

                // Create down arrow button
                const downButton = buttonContainer.createEl("button", { 
                    cls: "clickable-icon flit-nav-button",
                    attr: { "aria-label": "Move down" }
                });
                if (index === this.plugin.settings.safewords.length - 1) {
                    downButton.classList.add('disabled');
                }
                setIcon(downButton, "chevron-down");
                
                if (index < this.plugin.settings.safewords.length - 1) {
                    downButton.addEventListener('click', async () => {
                        const temp = this.plugin.settings.safewords[index];
                        this.plugin.settings.safewords[index] = this.plugin.settings.safewords[index + 1];
                        this.plugin.settings.safewords[index + 1] = temp;
                        await this.plugin.saveSettings();
                        renderSafewords();
                    });
                }

                // Create delete button with trash icon
                const deleteButton = buttonContainer.createEl("button", { 
                    cls: "clickable-icon flit-delete-button",
                    attr: { "aria-label": "Delete" }
                });
                setIcon(deleteButton, "trash-2");
                
                deleteButton.addEventListener('click', async () => {
                    this.plugin.settings.safewords.splice(index, 1);
                    await this.plugin.saveSettings();
                    renderSafewords();
                });
            });

            // Always add the "Add safeword" button at the end
            const addButtonSetting = new Setting(this.containerEl)
                .addButton((button) =>
                    button.setButtonText("Add safeword").onClick(async () => {
                        this.plugin.settings.safewords.push({
                            text: "",
                            onlyAtStart: false,
                            onlyWholeLine: false,
                            enabled: true
                        });
                        await this.plugin.saveSettings();
                        renderSafewords();
                    })
                );
            addButtonSetting.settingEl.addClass('flit-add-safeword-button');
            
            // Update UI state after rendering
            updateSafewordsUI();
        };

        renderSafewords();
    }
}
