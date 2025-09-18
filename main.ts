import { Notice, Plugin, TFile, TFolder } from "obsidian";
import { PluginSettings } from './src/types';
import { DEFAULT_SETTINGS, UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS, OS_FORBIDDEN_CHARS } from './src/constants';
import {
    verboseLog,
    detectOS,
    isFileExcluded,
    hasDisableProperty,
    isExcalidrawFile,
    containsSafeword,
    extractTitle
} from './src/utils';
import { RenameAllFilesModal, RenameFolderModal } from './src/modals';
import { FirstLineIsTitleSettings } from './src/settings';

// Global variables (keeping them in main for now to avoid major refactoring)
let renamedFileCount: number = 0;
let tempNewPaths: string[] = [];
let onTimeout: boolean = true;
let timeout: NodeJS.Timeout;
let previousFile: string;
let previousContent: Map<string, string> = new Map();

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

        verboseLog(this, 'Cache cleanup completed');
    }

    async putFirstLineInTitleForFolder(folder: TFolder): Promise<void> {
        const files = this.app.vault.getAllLoadedFiles()
            .filter((file): file is TFile => file instanceof TFile && file.extension === 'md')
            .filter(file => {
                // Check if file is in the target folder or its subfolders
                return file.path.startsWith(folder.path + "/") || file.parent?.path === folder.path;
            });

        if (files.length === 0) {
            new Notice("No markdown files found in this folder.");
            return;
        }

        new Notice(`Processing ${files.length} files in "${folder.path}"...`);

        let processedCount = 0;
        let errorCount = 0;

        for (const file of files) {
            try {
                // Use the existing renameFile method with ignoreExclusions = true to force processing
                await this.renameFile(file, true, true);
                processedCount++;
            } catch (error) {
                verboseLog(this, `Error processing file ${file.path}:`, error);
                errorCount++;
            }
        }

        if (errorCount > 0) {
            new Notice(`Processed ${processedCount} files with ${errorCount} errors.`);
        } else {
            new Notice(`Successfully processed ${processedCount} files.`);
        }
    }

    async toggleFolderExclusion(folderPath: string): Promise<void> {
        const isExcluded = this.settings.excludedFolders.includes(folderPath);

        if (isExcluded) {
            // Remove from excluded folders
            this.settings.excludedFolders = this.settings.excludedFolders.filter(path => path !== folderPath);
            new Notice(`Renaming enabled for folder: ${folderPath}`);
        } else {
            // Add to excluded folders
            this.settings.excludedFolders.push(folderPath);
            new Notice(`Renaming disabled for folder: ${folderPath}`);
        }

        await this.saveSettings();
        verboseLog(this, `Folder exclusion toggled for: ${folderPath}`, { isNowExcluded: !isExcluded });
    }

    async renameFile(file: TFile, noDelay = false, ignoreExclusions = false): Promise<void> {
        verboseLog(this, `Processing file: ${file.path}`, { noDelay, ignoreExclusions });

        if (!ignoreExclusions && isFileExcluded(file, this.settings, this.app)) {
            verboseLog(this, `Skipping excluded file: ${file.path}`);
            return;
        }
        if (file.extension !== 'md') {
            verboseLog(this, `Skipping non-markdown file: ${file.path}`);
            return;
        }

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
                verboseLog(this, `Scheduled rename for ${file.path} in ${this.settings.checkInterval}ms`);
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
            if (this.settings.useDirectFileRead) {
                content = await this.app.vault.read(file);
                verboseLog(this, `Direct read content from ${file.path}`, { contentLength: content.length });
            } else {
                content = await this.app.vault.cachedRead(file);
                verboseLog(this, `Cached read content from ${file.path}`, { contentLength: content.length });
            }
        } catch (error) {
            console.error(`Failed to read file ${file.path}:`, error);
            throw new Error(`Failed to read file: ${error.message}`);
        }

        // Check if this file has the disable property and skip if enabled (always respect disable property)
        if (hasDisableProperty(content, this.settings)) {
            verboseLog(this, `Skipping file with disable property: ${file.path}`);
            return;
        }

        // Check if this is an Excalidraw file and skip if enabled (always respect Excalidraw protection)
        if (isExcalidrawFile(content, this.settings)) {
            verboseLog(this, `Skipping Excalidraw file: ${file.path}`);
            return;
        }

        // Check if filename contains any safewords and skip if enabled (always respect safewords)
        if (containsSafeword(file.name, this.settings)) {
            verboseLog(this, `Skipping file with safeword: ${file.path}`);
            return;
        }

        if (content.startsWith("---")) {
            // Find the end of frontmatter - must be on its own line
            const lines = content.split('\n');
            let foundEnd = false;
            let endLineIndex = -1;

            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === "---") {
                    foundEnd = true;
                    endLineIndex = i;
                    break;
                }
            }

            if (foundEnd && endLineIndex > 0) {
                // Join the lines after the frontmatter (preserve leading whitespace)
                content = lines.slice(endLineIndex + 1).join('\n');
                verboseLog(this, `Stripped frontmatter from ${file.path}`);
            }
        }

        const currentName = file.basename;
        let firstLine = content.split('\n')[0];

        // Check for card links if enabled - extract title but continue to normal processing
        if (this.settings.grabTitleFromCardLink) {
            // Handle ```embed card links (Link Embed plugin)
            // Note: The backticks may already be stripped by Obsidian/other plugins
            let embedMatch = content.match(/^embed\s*\n[\s\S]*?title:\s*"([^"]+)"/);
            if (!embedMatch) {
                // Try with backticks if they're still present
                embedMatch = content.match(/^```embed[^\n]*\n[\s\S]*?title:\s*"([^"]+)"/);
            }
            if (!embedMatch) {
                // Try without quotes (YAML style)
                embedMatch = content.match(/^embed\s*\n[\s\S]*?title:\s*(.+?)(?:\n|$)/);
            }
            if (embedMatch) {
                // Extract title and continue with normal processing
                firstLine = embedMatch[1];
                verboseLog(this, `Found embed card link in ${file.path}`, { title: firstLine });
            } else {
                // Handle ```cardlink card links
                // Note: The backticks may already be stripped by Obsidian/other plugins
                let cardlinkMatch = content.match(/^cardlink\s*\n[\s\S]*?title:\s*"([^"]+)"/);
                if (!cardlinkMatch) {
                    // Try with backticks if they're still present
                    cardlinkMatch = content.match(/^```cardlink[^\n]*\n[\s\S]*?title:\s*"([^"]+)"/);
                }
                if (cardlinkMatch) {
                    // Extract title and continue with normal processing
                    firstLine = cardlinkMatch[1];
                    verboseLog(this, `Found cardlink in ${file.path}`, { title: firstLine });
                }
            }
        }

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
                verboseLog(this, `Renamed empty file ${file.path} to ${newPath}`);
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
            verboseLog(this, `No first line found in ${file.path}`);
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
            verboseLog(this, `Skipping self-referencing file: ${file.path}`);
            return;
        }

        // First apply custom replacements to the original line (before forbidden char processing)
        let processedTitle = firstLine;

        // Apply custom replacements first
        if (this.settings.enableCustomReplacements) {
            for (const replacement of this.settings.customReplacements) {
                if (replacement.searchText === '' || !replacement.enabled) continue;

                let tempLine = processedTitle;

                if (replacement.onlyWholeLine) {
                    // Only replace if the entire line matches
                    if (processedTitle.trim() === replacement.searchText.trim()) {
                        tempLine = replacement.replaceText;
                    }
                } else if (replacement.onlyAtStart) {
                    if (tempLine.startsWith(replacement.searchText)) {
                        tempLine = replacement.replaceText + tempLine.slice(replacement.searchText.length);
                    }
                } else {
                    tempLine = tempLine.replaceAll(replacement.searchText, replacement.replaceText);
                }

                // If the replacement results in empty string or whitespace only, and original search matched whole line, use "Untitled"
                if (tempLine.trim() === '' && processedTitle.trim() === replacement.searchText.trim()) {
                    processedTitle = "Untitled";
                } else {
                    processedTitle = tempLine;
                }
            }
        }

        // Now extract title from the processed line (after custom replacements but excluding custom replacement logic)
        const extractedTitle = extractTitle(processedTitle, { ...this.settings, enableCustomReplacements: false });
        verboseLog(this, `Extracted title from ${file.path}`, { original: firstLine, afterCustomReplacements: processedTitle, extracted: extractedTitle });

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

        for (let i: number = 0; i < extractedTitle.length; i++) {
            if (newFileName.length >= this.settings.charCount - 1) {
                newFileName = newFileName.trimEnd();
                newFileName += "…";
                break;
            }
            let char = extractedTitle[i];

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

                    if (canReplace && settingKey) {
                        shouldReplace = true;
                        replacement = charMap[char] || '';

                        // Check for whitespace trimming
                        if (replacement !== '') {
                            // Trim whitespace to the left
                            if (this.settings.charReplacementTrimLeft[settingKey]) {
                                // Remove trailing whitespace from newFileName
                                newFileName = newFileName.trimEnd();
                            }

                            // Check if we should trim whitespace to the right
                            if (this.settings.charReplacementTrimRight[settingKey]) {
                                // Skip upcoming whitespace characters
                                while (i + 1 < extractedTitle.length && /\s/.test(extractedTitle[i + 1])) {
                                    i++;
                                }
                            }
                        }
                    }
                }

                if (shouldReplace && replacement !== '') {
                    newFileName += replacement;
                    verboseLog(this, `Replaced forbidden char '${char}' with '${replacement}' in ${file.path}`);
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
        if (isForbiddenName) {
            newFileName = "Untitled";
            verboseLog(this, `Using fallback name 'Untitled' for ${file.path}`);
        }

        const parentPath =
            file.parent?.path === "/" ? "" : file.parent?.path + "/";

        let newPath: string = `${parentPath}${newFileName}.md`;

        let counter: number = 0;
        let fileExists: boolean =
            this.app.vault.getAbstractFileByPath(newPath) != null;
        while (fileExists || tempNewPaths.includes(newPath)) {
            if (file.path == newPath) {
                verboseLog(this, `No rename needed for ${file.path} - already has correct name`);
                return;
            }
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
            verboseLog(this, `Successfully renamed ${file.path} to ${newPath}`);
        } catch (error) {
            console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
            throw new Error(`Failed to rename file: ${error.message}`);
        }
    }

    async onload(): Promise<void> {
        await this.loadSettings();
        verboseLog(this, 'Plugin loaded', this.settings);

        // Auto-detect OS every time plugin loads
        this.settings.osPreset = detectOS();
        await this.saveSettings();
        verboseLog(this, `Detected OS: ${this.settings.osPreset}`);

        // Load styles from external CSS file
        this.app.vault.adapter.read(`${this.manifest.dir}/styles.css`).then(css => {
            const styleEl = document.createElement('style');
            styleEl.textContent = css;
            document.head.appendChild(styleEl);
        }).catch(() => {
            // Fallback: styles.css not found, silently continue
        });

        this.addSettingTab(new FirstLineIsTitleSettings(this.app, this));

        this.addCommand({
            id: 'rename-current-file-unless-excluded',
            name: 'Put first line in title (unless excluded)',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    verboseLog(this, `Manual rename command triggered for ${activeFile.path} (unless excluded)`);
                    await this.renameFile(activeFile, true, false);
                }
            }
        });

        this.addCommand({
            id: 'rename-current-file',
            name: 'Put first line in title (even if excluded)',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && activeFile.extension === 'md') {
                    verboseLog(this, `Manual rename command triggered for ${activeFile.path} (ignoring exclusions)`);
                    await this.renameFile(activeFile, true, true);
                }
            }
        });

        this.addCommand({
            id: 'rename-all-files',
            name: 'Put first line in title in all notes',
            callback: () => {
                verboseLog(this, 'Bulk rename command triggered');
                new RenameAllFilesModal(this.app, this).open();
            }
        });

        // Add context menu handlers
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFolder) {
                    // Add "Put first line in title" command for folder
                    if (this.settings.commandVisibility.folderPutFirstLineInTitle) {
                        menu.addItem((item) => {
                            item
                                .setTitle("Put first line in title")
                                .setIcon("folder-pen")
                                .onClick(() => {
                                    new RenameFolderModal(this.app, this, file).open();
                                });
                        });
                    }

                    // Add folder exclusion commands
                    const isExcluded = this.settings.excludedFolders.includes(file.path);

                    if (!isExcluded && this.settings.commandVisibility.folderExclude) {
                        menu.addItem((item) => {
                            item
                                .setTitle("Disable renaming in folder")
                                .setIcon("folder-x")
                                .onClick(async () => {
                                    await this.toggleFolderExclusion(file.path);
                                });
                        });
                    }

                    if (isExcluded && this.settings.commandVisibility.folderStopExcluding) {
                        menu.addItem((item) => {
                            item
                                .setTitle("Enable renaming in folder")
                                .setIcon("folder-check")
                                .onClick(async () => {
                                    await this.toggleFolderExclusion(file.path);
                                });
                        });
                    }
                } else if (file instanceof TFile && file.extension === 'md') {
                    // Add "Put first line in title" command for files
                    if (this.settings.commandVisibility.filePutFirstLineInTitle) {
                        menu.addItem((item) => {
                            item
                                .setTitle("Put first line in title")
                                .setIcon("file-pen")
                                .onClick(async () => {
                                    // Run the "even if excluded" version
                                    await this.renameFile(file, true, true);
                                });
                        });
                    }
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("modify", (abstractFile) => {
                if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
                    const noDelay = this.settings.checkInterval === 0;
                    verboseLog(this, `File modified: ${abstractFile.path}`);
                    this.renameFile(abstractFile, noDelay);
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (leaf) => {
                if (this.settings.renameOnFocus && leaf && leaf.view && leaf.view.file && leaf.view.file instanceof TFile && leaf.view.file.extension === 'md') {
                    verboseLog(this, `File focused: ${leaf.view.file.path}`);
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
                    verboseLog(this, `File deleted, cleaned up cache: ${abstractFile.path}`);
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
                    verboseLog(this, `File renamed, updated cache: ${oldPath} -> ${abstractFile.path}`);
                }
            })
        );
    }

    onunload() {
        verboseLog(this, 'Plugin unloaded');
    }

    async loadSettings(): Promise<void> {
        const loadedData = await this.loadData() || {};
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            loadedData
        );

        // Ensure all safewords have required properties (for backwards compatibility)
        if (this.settings.safewords) {
            this.settings.safewords = this.settings.safewords.map(safeword => ({
                text: safeword.text || '',
                onlyAtStart: safeword.onlyAtStart || false,
                onlyWholeLine: safeword.onlyWholeLine || false,
                enabled: safeword.enabled !== undefined ? safeword.enabled : true,
                caseSensitive: safeword.caseSensitive !== undefined ? safeword.caseSensitive : false
            }));
        }

        // Ensure there's always at least one entry for folders and tags (even if empty)
        if (this.settings.excludedFolders.length === 0) {
            this.settings.excludedFolders.push("");
        }
        if (this.settings.excludedTags.length === 0) {
            this.settings.excludedTags.push("");
        }
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}

// Export globals for modals to use
declare global {
    var renamedFileCount: number;
    var tempNewPaths: string[];
}

(globalThis as any).renamedFileCount = renamedFileCount;
(globalThis as any).tempNewPaths = tempNewPaths;