import { Menu, Notice, Plugin, TFile, TFolder } from "obsidian";
import { PluginSettings } from './src/types';
import { DEFAULT_SETTINGS, UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS, OS_FORBIDDEN_CHARS } from './src/constants';
import {
    verboseLog,
    detectOS,
    isFileExcluded,
    hasDisableProperty,
    isExcalidrawFile,
    containsSafeword,
    extractTitle,
    insertAliasIntoContent
} from './src/utils';
import { RenameAllFilesModal, RenameFolderModal, ClearSettingsModal, ProcessTagModal } from './src/modals';
import { FirstLineIsTitleSettings } from './src/settings';

// Global variables (keeping them in main for now to avoid major refactoring)
let renamedFileCount: number = 0;
let tempNewPaths: string[] = [];
let onTimeout: boolean = true;
let timeout: NodeJS.Timeout;
let previousFile: string;
let previousContent: Map<string, string> = new Map();
let aliasUpdateTimers: Map<string, NodeJS.Timeout> = new Map();

export default class FirstLineIsTitle extends Plugin {
    settings: PluginSettings;
    notificationObserver: MutationObserver | null = null;
    notificationStyleElement: HTMLStyleElement | null = null;

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

    async putFirstLineInTitleForTag(tagName: string): Promise<void> {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const files = this.app.vault.getMarkdownFiles();
        const matchingFiles: TFile[] = [];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            let hasTag = false;

            // Check YAML frontmatter tags
            if (cache?.frontmatter?.tags) {
                const frontmatterTags = Array.isArray(cache.frontmatter.tags)
                    ? cache.frontmatter.tags
                    : [cache.frontmatter.tags];

                hasTag = frontmatterTags.some((tag: string) =>
                    tag === tagName || tag === tagToFind
                );
            }

            // Check metadata cache tags (includes both frontmatter and body tags)
            if (!hasTag && cache?.tags) {
                hasTag = cache.tags.some(tagCache =>
                    tagCache.tag === tagToFind || tagCache.tag === `#${tagName}`
                );
            }

            if (hasTag) {
                matchingFiles.push(file);
            }
        }

        if (matchingFiles.length === 0) {
            new Notice(`No files found with tag ${tagToFind}.`);
            return;
        }

        new Notice(`Processing ${matchingFiles.length} files with tag ${tagToFind}...`);

        let processedCount = 0;
        let errorCount = 0;

        for (const file of matchingFiles) {
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
            new Notice(`Successfully processed ${processedCount} files with tag ${tagToFind}.`);
        }
    }

    async toggleTagExclusion(tagName: string): Promise<void> {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const isExcluded = this.settings.excludedTags.includes(tagToFind);

        if (isExcluded) {
            // Remove from excluded tags
            this.settings.excludedTags = this.settings.excludedTags.filter(tag => tag !== tagToFind);
            new Notice(`Renaming enabled for tag: ${tagToFind}`);
        } else {
            // Add to excluded tags
            this.settings.excludedTags.push(tagToFind);
            new Notice(`Renaming disabled for tag: ${tagToFind}`);
        }

        await this.saveSettings();
        verboseLog(this, `Tag exclusion toggled for: ${tagToFind}`, { isNowExcluded: !isExcluded });
    }

    addTagMenuItems(menu: Menu, tagName: string): void {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const isExcluded = this.settings.excludedTags.includes(tagToFind);

        // Add "Put first line in title" command for tag
        if (this.settings.commandVisibility.tagPutFirstLineInTitle) {
            menu.addItem((item) => {
                item
                    .setTitle("Put first line in title")
                    .setIcon("tag")
                    .onClick(() => {
                        new ProcessTagModal(this.app, this, tagName).open();
                    });
            });
        }

        // Add tag exclusion commands
        if (!isExcluded && this.settings.commandVisibility.tagExclude) {
            menu.addItem((item) => {
                item
                    .setTitle("Disable renaming for tag")
                    .setIcon("tag-x")
                    .onClick(async () => {
                        await this.toggleTagExclusion(tagName);
                    });
            });
        }

        if (isExcluded && this.settings.commandVisibility.tagStopExcluding) {
            menu.addItem((item) => {
                item
                    .setTitle("Enable renaming for tag")
                    .setIcon("tag-check")
                    .onClick(async () => {
                        await this.toggleTagExclusion(tagName);
                    });
            });
        }
    }

    async renameFile(file: TFile, noDelay = false, ignoreExclusions = false): Promise<void> {
        verboseLog(this, `Processing file: ${file.path}`, { noDelay, ignoreExclusions });

        // Log full file content at start of processing and use it for exclusion check
        let initialContent: string | undefined;
        try {
            initialContent = await this.app.vault.read(file);
            console.log(`🔍 FLIT PROCESSING START - ${file.path}:`);
            console.log(`📄 FULL FILE CONTENT:\n${initialContent}`);
            console.log(`📄 END CONTENT\n`);
        } catch (error) {
            console.log(`🔍 FLIT PROCESSING START - ${file.path}: Failed to read initial content`);
        }

        if (!ignoreExclusions && isFileExcluded(file, this.settings, this.app, initialContent)) {
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

        // Find first non-empty line after frontmatter
        const lines = content.split('\n');
        let firstLine = '';
        for (const line of lines) {
            if (line.trim() !== '') {
                firstLine = line;
                break;
            }
        }


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

        // First apply custom replacements to the original line (before forbidden char processing)
        let processedTitle = firstLine;

        // Apply custom replacements first
        verboseLog(this, `Custom replacements enabled: ${this.settings.enableCustomReplacements}, count: ${this.settings.customReplacements?.length || 0}`);
        if (this.settings.enableCustomReplacements) {
            for (const replacement of this.settings.customReplacements) {
                if (replacement.searchText === '' || !replacement.enabled) continue;

                verboseLog(this, `Checking custom replacement:`, {
                    searchText: replacement.searchText,
                    replaceText: replacement.replaceText,
                    onlyWholeLine: replacement.onlyWholeLine,
                    onlyAtStart: replacement.onlyAtStart,
                    enabled: replacement.enabled,
                    currentLine: processedTitle
                });

                let tempLine = processedTitle;

                if (replacement.onlyWholeLine) {
                    // Only replace if the entire line matches
                    if (processedTitle.trim() === replacement.searchText.trim()) {
                        tempLine = replacement.replaceText;
                        verboseLog(this, `Applied whole line replacement:`, { from: processedTitle, to: tempLine });
                    }
                } else if (replacement.onlyAtStart) {
                    if (tempLine.startsWith(replacement.searchText)) {
                        tempLine = replacement.replaceText + tempLine.slice(replacement.searchText.length);
                        verboseLog(this, `Applied start replacement:`, { from: processedTitle, to: tempLine });
                    }
                } else {
                    const beforeReplace = tempLine;
                    tempLine = tempLine.replaceAll(replacement.searchText, replacement.replaceText);
                    if (beforeReplace !== tempLine) {
                        verboseLog(this, `Applied general replacement:`, { from: beforeReplace, to: tempLine });
                    }
                }

                processedTitle = tempLine;
            }
        }

        // If custom replacements resulted in empty string or whitespace only, use "Untitled"
        if (processedTitle.trim() === '') {
            processedTitle = "Untitled";
        }

        // Check for self-reference AFTER custom replacements are applied
        verboseLog(this, `Checking self-reference for ${file.path}`, { processedTitle, currentName });
        const escapedName = currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wikiLinkRegex = new RegExp(`\\[\\[${escapedName}(\\|.*?)?\\]\\]`);
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

        let isSelfReferencing = false;

        // Check for self-referencing wikilink in processed title
        if (wikiLinkRegex.test(processedTitle)) {
            isSelfReferencing = true;
            verboseLog(this, `Found self-referencing wikilink in ${file.path} after custom replacements`);
        }

        // Check for self-referencing Markdown link by parsing the actual URL (ignoring link text)
        let match;
        while ((match = markdownLinkRegex.exec(processedTitle)) !== null) {
            const url = match[2];
            if (url.startsWith("#") && url.includes(currentName)) {
                isSelfReferencing = true;
                verboseLog(this, `Found self-referencing markdown link in ${file.path} after custom replacements`);
                break;
            }
        }

        if (isSelfReferencing) {
            new Notice("File not renamed due to self-referential link in first line");
            verboseLog(this, `Skipping self-referencing file: ${file.path}`);
            return;
        }

        verboseLog(this, `No self-reference found in ${file.path} after custom replacements`);

        // Now extract title from the processed line (custom replacements already applied above)
        const extractedTitle = extractTitle(processedTitle, this.settings);
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
                    verboseLog(this, `Replaced forbidden char \`${char}\` with \`${replacement}\` in ${file.path}`);
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
            verboseLog(this, `Using fallback name \`Untitled\` for ${file.path}`);
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
                // Still process alias even if no rename is needed
                if (this.settings.enableAliases) {
                    await this.addAliasToFile(file, firstLine, newFileName);
                }
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

            // Add alias if enabled
            if (this.settings.enableAliases) {
                await this.addAliasToFile(file, firstLine, newFileName);
            }
        } catch (error) {
            console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
            throw new Error(`Failed to rename file: ${error.message}`);
        }
    }

    async addAliasToFile(file: TFile, originalFirstLine: string, newFileName: string): Promise<void> {
        try {
            // Step 1: Parse first line (original, unprocessed)
            const firstLine = originalFirstLine;

            // Step 2: Process first line to get what becomes the filename
            // This should match exactly what the rename logic does
            const processedFirstLine = extractTitle(firstLine, this.settings);

            // Step 3: Compare processed first line with current filename
            const currentFileNameWithoutExt = file.basename;
            const processedLineMatchesFilename = (processedFirstLine === currentFileNameWithoutExt);

            // Step 4: Check if we need to add an alias based on user setting
            const shouldAddAlias = !this.settings.addAliasOnlyIfFirstLineDiffers || !processedLineMatchesFilename;

            if (!shouldAddAlias) {
                verboseLog(this, `Removing plugin aliases and skipping add - processed first line matches filename: \`${processedFirstLine}\``);
                await this.removePluginAliasesFromFile(file);
                return;
            }

            // Step 5: Check if the alias we would add already exists to prevent infinite loops
            const content = await this.app.vault.read(file);

            // Determine what alias to add (use original first line, not processed)
            let aliasToAdd = firstLine;

            // Apply truncation to alias if enabled
            if (this.settings.truncateAlias) {
                aliasToAdd = extractTitle(aliasToAdd, this.settings);
                if (aliasToAdd.length > this.settings.charCount - 1) {
                    aliasToAdd = aliasToAdd.slice(0, this.settings.charCount - 1).trimEnd() + "…";
                }
            }

            // Check if this exact alias (with ZWSP markers) already exists
            const markedAlias = '\u200B' + aliasToAdd + '\u200B';

            if (content.includes(`"${markedAlias}"`)) {
                verboseLog(this, `Alias \`${aliasToAdd}\` already exists in ${file.path}, skipping update`);
                return;
            }

            // Step 6: Clean up existing plugin aliases first
            verboseLog(this, `Cleaning up existing plugin aliases from ${file.path}`);
            await this.removePluginAliasesFromFile(file);

            // Step 7: Read updated file content and add the alias
            const updatedContent = await this.app.vault.read(file);

            // Insert/update alias
            const newContent = insertAliasIntoContent(updatedContent, aliasToAdd, this.settings);

            // Only write if content changed - test improved notification suppression
            if (newContent !== updatedContent) {
                // Immediate update to test notification suppression
                await this.app.vault.process(file, (data: string) => {
                    return insertAliasIntoContent(data, aliasToAdd, this.settings);
                });
                verboseLog(this, `Updated alias \`${aliasToAdd}\` in ${file.path}`);
            }

        } catch (error) {
            console.error(`Failed to add alias to file ${file.path}:`, error);
            // Don't throw - alias addition failure shouldn't prevent the rename
        }
    }

    async removePluginAliasesFromFile(file: TFile): Promise<void> {
        try {
            const content = await this.app.vault.read(file);
            verboseLog(this, `Reading file content for alias cleanup: ${file.path}`);
            verboseLog(this, `BEFORE cleanup - Full content: ${JSON.stringify(content)}`);

            // Parse frontmatter
            const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
            const frontmatterMatch = content.match(frontmatterRegex);

            if (!frontmatterMatch) {
                verboseLog(this, `No frontmatter found in ${file.path}`);
                return; // No frontmatter
            }

            const frontmatterContent = frontmatterMatch[1];
            verboseLog(this, `Frontmatter content: ${JSON.stringify(frontmatterContent)}`);
            const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';

            // Find the aliases property and capture both inline and multi-line formats
            // Split frontmatter into lines and find the aliases line specifically
            const frontmatterLines = frontmatterContent.split('\n');
            const aliasLine = frontmatterLines.find(line => line.trim().startsWith(`${aliasPropertyKey}:`));

            if (!aliasLine) {
                verboseLog(this, `No aliases property found in ${file.path}`);
                return; // No aliases property
            }

            // Extract everything after the colon on the aliases line only
            const colonIndex = aliasLine.indexOf(':');
            const firstLineValue = aliasLine.substring(colonIndex + 1).trim();
            verboseLog(this, `Alias line: "${aliasLine}"`);
            verboseLog(this, `First line value after aliases:: "${firstLineValue}"`);
            let aliasesToCheck = [];

            if (firstLineValue.startsWith('[') && firstLineValue.endsWith(']')) {
                // Format 5: [hi, bye] or Format 6: ["hi", "bye"]
                verboseLog(this, `Found inline array aliases: ${firstLineValue}`);
                aliasesToCheck = firstLineValue.slice(1, -1).split(',').map(a => a.trim().replace(/^["']|["']$/g, ''));
            } else if (firstLineValue === '') {
                // Format 1: multi-line unquoted or Format 2: multi-line quoted
                const aliasStartIndex = frontmatterLines.findIndex(line => line.trim().startsWith(`${aliasPropertyKey}:`));

                if (aliasStartIndex !== -1) {
                    // Collect all lines that are part of the aliases array
                    const aliasLines = [];
                    for (let i = aliasStartIndex + 1; i < frontmatterLines.length; i++) {
                        const line = frontmatterLines[i];
                        if (line.trim().startsWith('-')) {
                            aliasLines.push(line);
                        } else if (line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('\t')) {
                            // Stop when we hit a non-indented, non-empty line (next property)
                            break;
                        }
                    }

                    verboseLog(this, `Found multi-line array aliases: ${JSON.stringify(aliasLines)}`);
                    aliasesToCheck = aliasLines.map(line => {
                        const trimmed = line.trim();
                        // Remove the leading '-' and any whitespace after it
                        const withoutDash = trimmed.startsWith('-') ? trimmed.substring(1).trim() : trimmed;
                        // Remove surrounding quotes
                        return withoutDash.replace(/^["']|["']$/g, '');
                    });
                }
            } else {
                // Format 3: hi or Format 4: "hi"
                verboseLog(this, `Found single alias: ${firstLineValue}`);
                aliasesToCheck = [firstLineValue.replace(/^["']|["']$/g, '')];
            }

            verboseLog(this, `Parsed aliases: ${JSON.stringify(aliasesToCheck)}`);

            const filteredAliases = aliasesToCheck.filter(alias => !(alias.startsWith('\u200B') && alias.endsWith('\u200B'))); // Filter out ZWSP-wrapped aliases
            verboseLog(this, `Aliases after ZWSP filtering: ${JSON.stringify(filteredAliases)}`);

            // Only proceed if we actually filtered out some aliases
            if (filteredAliases.length < aliasesToCheck.length) {
                verboseLog(this, `Removing ${aliasesToCheck.length - filteredAliases.length} plugin alias(es) from ${file.path}`);

                // Rebuild the frontmatter properly by removing/updating the aliases section
                const newFrontmatterLines = [];
                const lines = frontmatterContent.split('\n');
                let i = 0;

                while (i < lines.length) {
                    const line = lines[i];
                    if (line.trim().startsWith(`${aliasPropertyKey}:`)) {
                        // Found aliases property - skip this line and all following indented lines
                        i++; // Skip the "aliases:" line

                        // Skip only lines that are clearly part of the aliases array (start with dash and are indented)
                        while (i < lines.length) {
                            const nextLine = lines[i];
                            if (nextLine.trim() === '') {
                                i++; // Skip empty lines
                                continue;
                            }
                            if ((nextLine.startsWith('  ') || nextLine.startsWith('\t')) && nextLine.trim().startsWith('-')) {
                                i++; // Skip indented alias items (- "value")
                                continue;
                            }
                            // If we hit a non-indented line or indented line that doesn't start with -, stop
                            break;
                        }

                        // Add back the aliases if there are any remaining
                        if (filteredAliases.length > 0) {
                            newFrontmatterLines.push(`${aliasPropertyKey}:`);
                            filteredAliases.forEach(alias => {
                                newFrontmatterLines.push(`  - "${alias}"`);
                            });
                        }
                        // Continue processing from current line (don't increment i again)
                    } else {
                        // Regular line - keep it
                        newFrontmatterLines.push(line);
                        i++;
                    }
                }

                const updatedFrontmatter = newFrontmatterLines.join('\n').trim();

                if (updatedFrontmatter) {
                    const newContent = content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
                    verboseLog(this, `AFTER cleanup - Full content: ${JSON.stringify(newContent)}`);
                    console.log(`🔧 FLIT YAML MODIFICATION - ${file.path}:`);
                    console.log(`📄 FULL FILE CONTENT AFTER ALIAS CLEANUP:\n${newContent}`);
                    console.log(`📄 END CONTENT\n`);
                    await this.app.vault.modify(file, newContent);
                    verboseLog(this, `Removed plugin aliases from ${file.path}`);
                } else {
                    // Remove entire frontmatter if empty
                    const newContent = content.replace(frontmatterRegex, '').replace(/^\n+/, '');
                    verboseLog(this, `AFTER cleanup - Full content: ${JSON.stringify(newContent)}`);
                    console.log(`🔧 FLIT YAML MODIFICATION - ${file.path}:`);
                    console.log(`📄 FULL FILE CONTENT AFTER REMOVING FRONTMATTER:\n${newContent}`);
                    console.log(`📄 END CONTENT\n`);
                    await this.app.vault.modify(file, newContent);
                    verboseLog(this, `Removed entire frontmatter from ${file.path}`);
                }
            } else {
                verboseLog(this, `No plugin aliases found to remove from ${file.path}`);
            }
        } catch (error) {
            console.error(`Failed to remove plugin aliases from ${file.path}:`, error);
        }
    }

    async removeAliasFromFile(file: TFile, aliasToRemove: string): Promise<void> {
        try {
            const content = await this.app.vault.read(file);
            const trimmedAlias = aliasToRemove.trim();

            if (!trimmedAlias) {
                return;
            }

            // Parse frontmatter using the same logic as addAliasToFile
            const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
            const frontmatterMatch = content.match(frontmatterRegex);

            if (!frontmatterMatch) {
                // No frontmatter, nothing to remove
                return;
            }

            const frontmatterContent = frontmatterMatch[1];
            const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';
            const aliasRegex = new RegExp(`^${aliasPropertyKey}:\\s*(.*)$`, 'm');
            const aliasMatch = frontmatterContent.match(aliasRegex);

            if (!aliasMatch) {
                // No aliases property, nothing to remove
                return;
            }

            const aliasValue = aliasMatch[1].trim();
            let updatedAliasValue = '';

            if (aliasValue.startsWith('[') && aliasValue.endsWith(']')) {
                // Array format - parse and remove the alias
                const aliasArray = aliasValue.slice(1, -1).split(',').map(a => a.trim().replace(/^["']|["']$/g, ''));
                const filteredAliases = aliasArray.filter(alias => alias !== trimmedAlias);

                if (filteredAliases.length === 0) {
                    // Remove the entire aliases property if no aliases left
                    const updatedFrontmatter = frontmatterContent.replace(new RegExp(`^${aliasPropertyKey}:.*$`, 'm'), '').replace(/\n\n+/g, '\n').trim();

                    if (updatedFrontmatter) {
                        const newContent = content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
                        await this.app.vault.modify(file, newContent);
                        verboseLog(this, `Removed alias property from ${file.path}`);
                    } else {
                        // Remove entire frontmatter if empty
                        const newContent = content.replace(frontmatterRegex, '').replace(/^\n+/, '');
                        await this.app.vault.modify(file, newContent);
                        verboseLog(this, `Removed entire frontmatter from ${file.path}`);
                    }
                } else {
                    // Update with remaining aliases
                    updatedAliasValue = `[${filteredAliases.map(a => `"${a}"`).join(', ')}]`;
                    const updatedFrontmatter = frontmatterContent.replace(aliasRegex, `${aliasPropertyKey}: ${updatedAliasValue}`);
                    const newContent = content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
                    await this.app.vault.modify(file, newContent);
                    verboseLog(this, `Removed alias "${trimmedAlias}" from ${file.path}`);
                }
            } else if (aliasValue === `"${trimmedAlias}"` || aliasValue === trimmedAlias) {
                // Single alias format - remove the entire property
                const updatedFrontmatter = frontmatterContent.replace(new RegExp(`^${aliasPropertyKey}:.*$`, 'm'), '').replace(/\n\n+/g, '\n').trim();

                if (updatedFrontmatter) {
                    const newContent = content.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
                    await this.app.vault.modify(file, newContent);
                    verboseLog(this, `Removed alias property from ${file.path}`);
                } else {
                    // Remove entire frontmatter if empty
                    const newContent = content.replace(frontmatterRegex, '').replace(/^\n+/, '');
                    await this.app.vault.modify(file, newContent);
                    verboseLog(this, `Removed entire frontmatter from ${file.path}`);
                }
            }
        } catch (error) {
            console.error(`Failed to remove alias from ${file.path}:`, error);
        }
    }

    debouncedAliasUpdate(file: TFile, aliasToAdd: string): void {
        // Clear any existing timeout for this file
        const existingTimer = aliasUpdateTimers.get(file.path);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set a new timeout - small delay to let user finish current keystroke
        aliasUpdateTimers.set(file.path, setTimeout(async () => {
            try {
                // Use app.vault.process() with debouncing for safer updates
                await this.app.vault.process(file, (data: string) => {
                    return insertAliasIntoContent(data, aliasToAdd, this.settings);
                });

                verboseLog(this, `Updated alias \`${aliasToAdd}\` in ${file.path}`);

                // Clean up timer
                aliasUpdateTimers.delete(file.path);

            } catch (error) {
                console.error(`Failed to update alias for ${file.path}:`, error);
                aliasUpdateTimers.delete(file.path);
            }
        }, 500)); // 500ms delay - enough time for user to finish typing
    }

    setupNotificationSuppression(): void {
        // Clean up any existing suppression first
        this.cleanupNotificationSuppression();

        console.log(`Notification suppression setup: enabled=${this.settings.suppressExternalModificationNotifications}`);

        // Check if suppression is enabled before setting up
        if (!this.settings.suppressExternalModificationNotifications) {
            return;
        }

        console.log(`Manual notification suppression check: enabled=${this.settings.suppressExternalModificationNotifications}`);

        // Watch for new notification containers and hide ones about external modifications
        this.notificationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {

                        // Target both notice containers and individual notice elements
                        if (node.classList.contains('notice-container') || node.classList.contains('notice')) {

                            const noticeText = node.textContent || '';

                            // Check if this notification was already processed
                            if (node.hasAttribute('data-flit-processed')) {
                                return;
                            }

                            // Mark as processed to prevent double-processing
                            node.setAttribute('data-flit-processed', 'true');

                            // Check if this is ONLY an external modification notification (no other notifications mixed in)
                            // Just match the exact text we see in the logs
                            const conditions = {
                                hasExternal: noticeText.includes('has been modified externally, merging changes automatically'),
                                hasMd: noticeText.includes('.md'),
                                noUpdated: !noticeText.includes('Updated'),
                                startsQuote: noticeText.trim().charCodeAt(0) === 8220,
                                shortEnough: noticeText.length < 200
                            };
                            const isExternalModification = conditions.hasExternal && conditions.hasMd && conditions.noUpdated && conditions.startsQuote && conditions.shortEnough;


                            if (isExternalModification) {
                                node.style.display = 'none';
                                if (this.settings.verboseLogging) {
                                    console.log(`SUPPRESSED: External modification notification: ${noticeText.trim()}`);
                                }
                            }
                        }
                    }
                });
            });
        });

        // Start observing for new notice containers
        this.notificationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        verboseLog(this, 'Notification suppression setup completed');
    }

    cleanupNotificationSuppression(): void {
        // Disconnect observer
        if (this.notificationObserver) {
            this.notificationObserver.disconnect();
            this.notificationObserver = null;
        }

        // Remove injected CSS
        if (this.notificationStyleElement && this.notificationStyleElement.parentNode) {
            this.notificationStyleElement.parentNode.removeChild(this.notificationStyleElement);
            this.notificationStyleElement = null;
        }

        // Check for any remaining hidden notifications and restore them
        const hiddenNotifications = document.querySelectorAll('.notice-container[style*="display: none"]');
        hiddenNotifications.forEach((notification) => {
            (notification as HTMLElement).style.display = '';
            (notification as HTMLElement).removeAttribute('data-flit-processed');
        });

        verboseLog(this, 'Notification suppression cleanup completed');
    }

    async onload(): Promise<void> {
        await this.loadSettings();
        verboseLog(this, 'Plugin loaded', this.settings);

        // Auto-detect OS every time plugin loads
        this.settings.osPreset = detectOS();
        await this.saveSettings();
        verboseLog(this, `Detected OS: \`${this.settings.osPreset}\``);

        // Setup notification suppression for external modification notices (if enabled)
        if (this.settings.suppressExternalModificationNotifications) {
            this.setupNotificationSuppression();
        }

        // Load styles from external CSS file
        this.app.vault.adapter.read(`${this.manifest.dir}/styles.css`).then(css => {
            const styleEl = document.createElement('style');
            styleEl.textContent = css;
            document.head.appendChild(styleEl);
        }).catch(() => {
            // Fallback: styles.css not found, silently continue
        });

        this.addSettingTab(new FirstLineIsTitleSettings(this.app, this));

        // Register command palette commands conditionally based on master toggle and individual settings
        if (this.settings.enableCommandPalette) {
            if (this.settings.commandPaletteVisibility.renameCurrentFileUnlessExcluded) {
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
            }

            if (this.settings.commandPaletteVisibility.renameCurrentFile) {
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
            }

            if (this.settings.commandPaletteVisibility.renameAllFiles) {
                this.addCommand({
                    id: 'rename-all-files',
                    name: 'Put first line in title in all notes',
                    callback: () => {
                        verboseLog(this, 'Bulk rename command triggered');
                        new RenameAllFilesModal(this.app, this).open();
                    }
                });
            }
        }

        // Add context menu handlers
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                // Only show context menu commands if master toggle is enabled
                if (!this.settings.enableContextMenus) return;

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

        // Add tag context menu handlers
        // Handle editor hashtags
        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu, editor, view) => {
                // Only show tag context menu commands if master toggle is enabled
                if (!this.settings.enableContextMenus) return;

                const cursor = editor.getCursor();
                const line = editor.getLine(cursor.line);
                const ch = cursor.ch;

                // Check if cursor is on a hashtag
                const hashtagRegex = /#[\w\/\-]+/g;
                let match;
                let tagName = '';

                while ((match = hashtagRegex.exec(line)) !== null) {
                    if (ch >= match.index && ch <= match.index + match[0].length) {
                        tagName = match[0].slice(1); // Remove the #
                        break;
                    }
                }

                if (tagName) {
                    this.addTagMenuItems(menu, tagName);
                }
            })
        );

        // Handle tag pane context menus using DOM events
        this.registerDomEvent(document, 'contextmenu', (evt) => {
            // Only show tag context menu commands if master toggle is enabled
            if (!this.settings.enableContextMenus) return;

            const target = evt.target as HTMLElement;
            const tagElement = target.closest('.tag-pane-tag');

            if (tagElement) {
                // Extract tag name from tag pane
                let tagName = '';
                const tagText = tagElement.textContent?.trim();
                if (tagText) {
                    tagName = tagText.startsWith('#') ? tagText.slice(1) : tagText;
                }

                if (tagName) {
                    // Wait for the native context menu to be created
                    setTimeout(() => {
                        const menuEl = document.querySelector('.menu');
                        if (menuEl) {
                            // Create Obsidian menu instance from the existing DOM element
                            const menu = new Menu();
                            this.addTagMenuItems(menu, tagName);

                            // Replace the existing menu
                            menuEl.remove();
                            menu.showAtMouseEvent(evt);
                        }
                    }, 0);
                }
            }
        }, true);

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
        // Clean up any pending alias update timers
        aliasUpdateTimers.forEach((timer) => clearTimeout(timer));
        aliasUpdateTimers.clear();

        // Clean up notification suppression
        this.cleanupNotificationSuppression();

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
    var aliasUpdateTimers: Map<string, NodeJS.Timeout>;
}

(globalThis as any).renamedFileCount = renamedFileCount;
(globalThis as any).tempNewPaths = tempNewPaths;
(globalThis as any).aliasUpdateTimers = aliasUpdateTimers;