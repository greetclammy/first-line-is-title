import { Menu, Notice, Plugin, TFile, TFolder, setIcon, MarkdownView } from "obsidian";
import { PluginSettings } from './src/types';
import { DEFAULT_SETTINGS, UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS, OS_FORBIDDEN_CHARS } from './src/constants';
import {
    verboseLog,
    detectOS,
    isFileExcluded,
    shouldProcessFile,
    hasDisableProperty,
    hasDisablePropertyInFile,
    isExcalidrawFile,
    containsSafeword,
    extractTitle,
    isValidHeading
} from './src/utils';
import { RenameAllFilesModal, RenameFolderModal, ClearSettingsModal, ProcessTagModal } from './src/modals';
import { FirstLineIsTitleSettings } from './src/settings';
import { around } from "monkey-around";

/*
 * ⚠️  IMPORTANT DEBUGGING REQUIREMENTS FOR AI AGENTS ⚠️
 *
 * This plugin implements comprehensive debug logging with the following requirements:
 *
 * 1. DEBUG LOGGING: All plugin settings changes MUST be logged to console when Debug mode is ON
 *    - Every onChange handler in settings.ts must call this.plugin.debugLog(settingName, value)
 *    - This includes toggles, dropdowns, text inputs, and array modifications
 *    - The debugLog helper function is implemented in this file (main.ts)
 *
 * 2. DEBUG STATE RESET: Debug mode MUST reset to OFF on every plugin reload
 *    - verboseLogging setting must be set to false in onload() method
 *    - The ON state must NEVER persist between plugin reloads
 *    - This prevents accidental debug spam in production
 *
 * 3. CONSOLE LOG FORMATTING: Console log messages must NOT contain plugin name
 *    - Do NOT use "First Line Is Title" or "FLIT" in any console.log messages
 *    - Keep messages clean and generic (e.g., "Setting changed: settingName = value")
 *    - This applies to all debug logs, notices, and error messages
 *
 * If you need to modify settings or debug logging, ensure ALL of these requirements are maintained.
 */

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
    commandPaletteObserver: MutationObserver | null = null;

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
            // Ensure there's always at least one entry (even if empty)
            if (this.settings.excludedFolders.length === 0) {
                this.settings.excludedFolders.push("");
            }
            new Notice(`Renaming enabled for folder: ${folderPath}`);
        } else {
            // If there's only an empty entry, replace it; otherwise add
            if (this.settings.excludedFolders.length === 1 && this.settings.excludedFolders[0] === "") {
                this.settings.excludedFolders[0] = folderPath;
            } else {
                this.settings.excludedFolders.push(folderPath);
            }
            new Notice(`Renaming disabled for folder: ${folderPath}`);
        }

        this.debugLog('excludedFolders', this.settings.excludedFolders);
        await this.saveSettings();
        verboseLog(this, `Folder exclusion toggled for: ${folderPath}`, { isNowExcluded: !isExcluded });
    }

    async putFirstLineInTitleForTag(tagName: string, omitBodyTags: boolean = false, omitNestedTags: boolean = false): Promise<void> {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const files = this.app.vault.getMarkdownFiles();
        const matchingFiles: TFile[] = [];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            let hasTag = false;
            let tagFoundInBody = false;

            // Check YAML frontmatter tags
            if (cache?.frontmatter?.tags) {
                const frontmatterTags = Array.isArray(cache.frontmatter.tags)
                    ? cache.frontmatter.tags
                    : [cache.frontmatter.tags];

                hasTag = frontmatterTags.some((tag: string) => {
                    if (omitNestedTags) {
                        // Exact match only
                        return tag === tagName || tag === tagToFind;
                    } else {
                        // Include nested tags
                        return tag === tagName || tag === tagToFind ||
                               tag.startsWith(tagName + '/') || tag.startsWith(tagToFind + '/');
                    }
                });
            }

            // Check metadata cache tags (includes both frontmatter and body tags)
            if (!hasTag && cache?.tags) {
                cache.tags.forEach(tagCache => {
                    const cacheTag = tagCache.tag;
                    let tagMatches = false;

                    if (omitNestedTags) {
                        // Exact match only
                        tagMatches = cacheTag === tagToFind || cacheTag === `#${tagName}`;
                    } else {
                        // Include nested tags
                        tagMatches = cacheTag === tagToFind || cacheTag === `#${tagName}` ||
                                   cacheTag.startsWith(tagToFind + '/') || cacheTag.startsWith(`#${tagName}/`);
                    }

                    if (tagMatches) {
                        hasTag = true;
                        // Check if this tag appears in the body (not frontmatter)
                        if (tagCache.position.start.line > 0) {
                            // If the tag is found after line 0, it's likely in the body
                            // We need to check if there's frontmatter to be more precise
                            if (cache.frontmatterPosition) {
                                // If tag is after frontmatter, it's in body
                                if (tagCache.position.start.line > cache.frontmatterPosition.end.line) {
                                    tagFoundInBody = true;
                                }
                            } else {
                                // No frontmatter, so any tag after line 0 is in body
                                tagFoundInBody = true;
                            }
                        }
                    }
                });
            }

            // Apply omitBodyTags filter
            if (hasTag && omitBodyTags && tagFoundInBody) {
                // Skip this file because it has the tag in the body and we want to omit such files
                continue;
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
            // Ensure there's always at least one entry (even if empty)
            if (this.settings.excludedTags.length === 0) {
                this.settings.excludedTags.push("");
            }
            new Notice(`Renaming enabled for ${tagToFind}`);
        } else {
            // If there's only an empty entry, replace it; otherwise add
            if (this.settings.excludedTags.length === 1 && this.settings.excludedTags[0] === "") {
                this.settings.excludedTags[0] = tagToFind;
            } else {
                this.settings.excludedTags.push(tagToFind);
            }
            new Notice(`Renaming disabled for ${tagToFind}`);
        }

        this.debugLog('excludedTags', this.settings.excludedTags);
        await this.saveSettings();
        verboseLog(this, `Tag exclusion toggled for: ${tagToFind}`, { isNowExcluded: !isExcluded });
    }

    // Debug logging helper for setting changes
    debugLog(settingName: string, value: any): void {
        if (this.settings.verboseLogging) {
            console.log(`Setting changed: ${settingName} = ${JSON.stringify(value)}`);
        }
    }

    menuForEvent(evt: MouseEvent): Menu {
        // Use Tag Wrangler's menuForEvent pattern
        let menu = (evt as any).obsidian_contextmenu;
        if (!menu) {
            menu = (evt as any).obsidian_contextmenu = new Menu();
            setTimeout(() => menu.showAtPosition({x: evt.pageX, y: evt.pageY}), 0);
        }
        return menu;
    }

    // Helper functions for dynamic context menu logic based on scope strategy
    shouldShowDisableMenuForFolder(folderPath: string): boolean {
        const isInList = this.settings.excludedFolders.includes(folderPath);

        let result: boolean;
        if (this.settings.scopeStrategy === 'Enable in all notes except below') {
            // Enable strategy: list contains DISABLED folders
            // folder in list (disabled) → show "enable" → return false
            // folder not in list (enabled) → show "disable" → return true
            result = !isInList;
        } else {
            // Disable strategy: list contains ENABLED folders
            // folder in list (enabled) → show "disable" → return true
            // folder not in list (disabled) → show "enable" → return false
            result = isInList;
        }

        verboseLog(this, `shouldShowDisableMenuForFolder(${folderPath})`, {
            scopeStrategy: this.settings.scopeStrategy,
            isInList,
            result,
            willShow: result ? 'DISABLE menu' : 'ENABLE menu'
        });

        return result;
    }

    shouldShowDisableMenuForTag(tagName: string): boolean {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const isInList = this.settings.excludedTags.includes(tagToFind);

        let result: boolean;
        if (this.settings.scopeStrategy === 'Enable in all notes except below') {
            // Enable strategy: list contains DISABLED tags
            // tag in list (disabled) → show "enable" → return false
            // tag not in list (enabled) → show "disable" → return true
            result = !isInList;
        } else {
            // Disable strategy: list contains ENABLED tags
            // tag in list (enabled) → show "disable" → return true
            // tag not in list (disabled) → show "enable" → return false
            result = isInList;
        }

        verboseLog(this, `shouldShowDisableMenuForTag(${tagName})`, {
            scopeStrategy: this.settings.scopeStrategy,
            tagToFind,
            isInList,
            result,
            willShow: result ? 'DISABLE menu' : 'ENABLE menu'
        });

        return result;
    }

    getFolderMenuText(folderPath: string): { disable: string, enable: string } {
        if (this.settings.scopeStrategy === 'Enable in all notes except below') {
            // Enable strategy: list contains DISABLED folders
            return {
                disable: "Disable renaming in folder",
                enable: "Enable renaming in folder"
            };
        } else {
            // Disable strategy: list contains ENABLED folders
            return {
                disable: "Disable renaming in folder",
                enable: "Enable renaming in folder"
            };
        }
    }

    getTagMenuText(tagName: string): { disable: string, enable: string } {
        if (this.settings.scopeStrategy === 'Enable in all notes except below') {
            // Enable strategy: list contains DISABLED tags
            return {
                disable: "Disable renaming for tag",
                enable: "Enable renaming for tag"
            };
        } else {
            // Disable strategy: list contains ENABLED tags
            return {
                disable: "Disable renaming for tag",
                enable: "Enable renaming for tag"
            };
        }
    }

    addTagMenuItems(menu: Menu, tagName: string): void {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const shouldShowDisable = this.shouldShowDisableMenuForTag(tagName);
        const menuText = this.getTagMenuText(tagName);

        // Count visible items to determine if we need a separator
        let visibleItemCount = 0;
        if (this.settings.commandVisibility.tagPutFirstLineInTitle) visibleItemCount++;
        if (shouldShowDisable && this.settings.commandVisibility.tagExclude) visibleItemCount++;
        if (!shouldShowDisable && this.settings.commandVisibility.tagStopExcluding) visibleItemCount++;

        // Add separator if we have any items to show
        if (visibleItemCount > 0) {
            menu.addSeparator();
        }

        // Add "Put first line in title" command for tag
        if (this.settings.commandVisibility.tagPutFirstLineInTitle) {
            menu.addItem((item) => {
                item
                    .setTitle("Put first line in title")
                    .setIcon("file-pen")
                    .setSection("tag")
                    .onClick(() => {
                        new ProcessTagModal(this.app, this, tagName).open();
                    });
            });
        }

        // Add tag exclusion commands with dynamic text
        if (shouldShowDisable && this.settings.commandVisibility.tagExclude) {
            menu.addItem((item) => {
                item
                    .setTitle(menuText.disable)
                    .setIcon("square-x")
                    .setSection("tag")
                    .onClick(async () => {
                        await this.toggleTagExclusion(tagName);
                    });
            });
        }

        if (!shouldShowDisable && this.settings.commandVisibility.tagStopExcluding) {
            menu.addItem((item) => {
                item
                    .setTitle(menuText.enable)
                    .setIcon("square-check")
                    .setSection("tag")
                    .onClick(async () => {
                        await this.toggleTagExclusion(tagName);
                    });
            });
        }
    }

    addTagMenuItemsToDOM(menuEl: HTMLElement, tagName: string): void {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const shouldShowDisable = this.shouldShowDisableMenuForTag(tagName);
        const menuText = this.getTagMenuText(tagName);

        // Add "Put first line in title" command for tag
        if (this.settings.commandVisibility.tagPutFirstLineInTitle) {
            const menuItem = menuEl.createEl('div', { cls: 'menu-item' });
            const iconEl = menuItem.createEl('div', { cls: 'menu-item-icon' });
            setIcon(iconEl, 'file-pen');
            menuItem.createEl('div', { cls: 'menu-item-title', text: 'Put first line in title' });

            menuItem.addEventListener('click', () => {
                new ProcessTagModal(this.app, this, tagName).open();
                menuEl.remove();
            });
        }

        // Add tag exclusion commands with dynamic text
        if (shouldShowDisable && this.settings.commandVisibility.tagExclude) {
            const menuItem = menuEl.createEl('div', { cls: 'menu-item' });
            const iconEl = menuItem.createEl('div', { cls: 'menu-item-icon' });
            setIcon(iconEl, 'square-x');
            menuItem.createEl('div', { cls: 'menu-item-title', text: menuText.disable });

            menuItem.addEventListener('click', async () => {
                await this.toggleTagExclusion(tagName);
                menuEl.remove();
            });
        }

        if (!shouldShowDisable && this.settings.commandVisibility.tagStopExcluding) {
            const menuItem = menuEl.createEl('div', { cls: 'menu-item' });
            const iconEl = menuItem.createEl('div', { cls: 'menu-item-icon' });
            setIcon(iconEl, 'square-check');
            menuItem.createEl('div', { cls: 'menu-item-title', text: menuText.enable });

            menuItem.addEventListener('click', async () => {
                await this.toggleTagExclusion(tagName);
                menuEl.remove();
            });
        }
    }


    async renameFile(file: TFile, noDelay = false, ignoreExclusions = false, suppressNotices = false): Promise<{ success: boolean, reason?: string }> {
        verboseLog(this, `Processing file: ${file.path}`, { noDelay, ignoreExclusions });

        // Log full file content at start of processing and use it for exclusion check
        let initialContent: string | undefined;
        try {
            initialContent = await this.app.vault.read(file);
        } catch (error) {
            // Silently continue if unable to read initial content
        }

        if (!ignoreExclusions && !shouldProcessFile(file, this.settings, this.app, initialContent)) {
            verboseLog(this, `Skipping file based on include/exclude strategy: ${file.path}`);
            return { success: false, reason: 'excluded' };
        }
        if (file.extension !== 'md') {
            verboseLog(this, `Skipping non-markdown file: ${file.path}`);
            return { success: false, reason: 'not-markdown' };
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
                return { success: true, reason: 'scheduled' };
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
                verboseLog(this, `Direct read content from ${file.path} (${content.length} chars)`);
            } else {
                content = await this.app.vault.cachedRead(file);
                verboseLog(this, `Cached read content from ${file.path} (${content.length} chars)`);
            }
        } catch (error) {
            console.error(`Failed to read file ${file.path}:`, error);
            throw new Error(`Failed to read file: ${error.message}`);
        }

        // Check if this file has the disable property and skip if enabled (always respect disable property)
        if (hasDisableProperty(content, this.settings)) {
            verboseLog(this, `Skipping file with disable property: ${file.path}`);
            return { success: false, reason: 'property-disabled' };
        }

        // Check if this is an Excalidraw file and skip if enabled (always respect Excalidraw protection)
        if (isExcalidrawFile(content, this.settings)) {
            verboseLog(this, `Skipping Excalidraw file: ${file.path}`);
            return { success: false, reason: 'excalidraw' };
        }

        // Check if filename contains any safewords and skip if enabled (always respect safewords)
        if (containsSafeword(file.name, this.settings)) {
            verboseLog(this, `Skipping file with safeword: ${file.path}`);
            return { success: false, reason: 'safeword' };
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
                const beforeStrip = content;
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



        // Check if only headings should be processed
        if (this.settings.whatToPutInTitle === "headings_only") {
            if (!isValidHeading(firstLine)) {
                verboseLog(this, `Skipping file - first line is not a valid heading: ${file.path}`);
                return { success: false, reason: 'not-heading' };
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
                    return { success: false, reason: 'no-change' };
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

            // Remove any plugin aliases since there's no content to alias
            if (this.settings.enableAliases) {
                verboseLog(this, `Removing plugin aliases - file became empty`);
                await this.removePluginAliasesFromFile(file, false); // Respect keepEmptyAliasProperty setting
            }

            previousContent.set(file.path, content);
            return { success: false, reason: 'empty-content' };
        }

        // Store current content for next check
        previousContent.set(file.path, content);

        if (firstLine === '') {
            verboseLog(this, `No first line found in ${file.path}`);
            // Remove any plugin aliases since there's no content to alias
            if (this.settings.enableAliases) {
                verboseLog(this, `Removing plugin aliases - no non-empty content found`);
                await this.removePluginAliasesFromFile(file, false); // Respect keepEmptyAliasProperty setting
            }
            return { success: false, reason: 'no-content' };
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

        // Store self-reference check for later (after we know the new filename)
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

        verboseLog(this, isSelfReferencing ? `Self-reference found in ${file.path}` : `No self-reference found in ${file.path}`);

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

        // Check if filename would change - if not, no need to check self-reference or show notice
        if (file.path == newPath) {
            verboseLog(this, `No rename needed for ${file.path} - already has correct name`);
            // Still process alias even if no rename is needed
            if (this.settings.enableAliases) {
                await this.addAliasToFile(file, firstLine, newFileName);
            }
            return { success: false, reason: 'no-rename-needed' };
        }

        let counter: number = 0;
        let fileExists: boolean =
            this.app.vault.getAbstractFileByPath(newPath) != null;
        while (fileExists || tempNewPaths.includes(newPath)) {
            // Check if we're about to create a path that matches current file (with counter)
            if (file.path == newPath) {
                verboseLog(this, `No rename needed for ${file.path} - already has correct name with counter`);
                // Still process alias even if no rename is needed
                if (this.settings.enableAliases) {
                    await this.addAliasToFile(file, firstLine, newFileName);
                }
                return { success: false, reason: 'no-rename-needed' };
            }
            counter += 1;
            newPath = `${parentPath}${newFileName} ${counter}.md`;
            fileExists = this.app.vault.getAbstractFileByPath(newPath) != null;
        }

        // Only check for self-reference if filename would actually change (after handling counter)
        if (isSelfReferencing) {
            if (!suppressNotices) {
                new Notice(`File not renamed due to self-referential link in first line: ${file.name}`, 0);
            }
            verboseLog(this, `Skipping self-referencing file: ${file.path}`);
            return { success: false, reason: 'self-referential' };
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

            // Show notification for manual renames (unless suppressed)
            if (!suppressNotices && noDelay) {
                const titleChanged = currentName !== newFileName;
                const shouldShowNotice =
                    this.settings.manualNotificationMode === 'Always' ||
                    (this.settings.manualNotificationMode === 'On title change' && titleChanged);

                if (shouldShowNotice) {
                    new Notice(`Updated title: ${currentName} → ${newFileName}`);
                }
            }

            return { success: true };
        } catch (error) {
            console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
            return { success: false, reason: 'error' };
        }
    }

    getSelectedFolders(): TFolder[] {
        const selectedFolders: TFolder[] = [];

        // Try multiple selection patterns that Obsidian might use
        const selectors = [
            '.nav-folder.is-selected',
            '.nav-folder.is-active',
            '.nav-folder-title.is-selected',
            '.nav-folder-title.is-active',
            '.tree-item.is-selected .nav-folder-title',
            '.tree-item.is-active .nav-folder-title'
        ];

        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                // Try to get folder path from various attributes/parents
                let folderPath = element.getAttribute('data-path');

                if (!folderPath) {
                    // Check parent elements
                    const parent = element.closest('.nav-folder, .tree-item');
                    if (parent) {
                        folderPath = parent.getAttribute('data-path');
                    }
                }

                if (folderPath) {
                    const folder = this.app.vault.getAbstractFileByPath(folderPath);
                    if (folder instanceof TFolder && !selectedFolders.includes(folder)) {
                        selectedFolders.push(folder);
                    }
                }
            });
        });

        return selectedFolders;
    }

    addMultiFolderMenuItems(menu: Menu, folders: TFolder[]): void {
        // Count total markdown files across all folders
        let totalFiles = 0;
        folders.forEach(folder => {
            const files = this.getAllMarkdownFilesInFolder(folder);
            totalFiles += files.length;
        });

        if (totalFiles === 0) return;

        // Add separator before our items
        menu.addSeparator();

        // Add "Put first line in title" command for multiple folders
        if (this.settings.commandVisibility.folderPutFirstLineInTitle) {
            menu.addItem((item) => {
                item
                    .setTitle(`Put first line in title (${totalFiles} files in ${folders.length} folders)`)
                    .setIcon("folder-pen")
                    .setSection("folder")
                    .onClick(async () => {
                        await this.processMultipleFolders(folders, 'rename');
                    });
            });
        }

        // Add "Disable renaming" command for multiple folders
        if (this.settings.commandVisibility.folderExclude) {
            menu.addItem((item) => {
                item
                    .setTitle(`Disable renaming (${folders.length} folders)`)
                    .setIcon("square-x")
                    .setSection("folder")
                    .onClick(async () => {
                        await this.processMultipleFolders(folders, 'disable');
                    });
            });
        }

        // Add "Enable renaming" command for multiple folders
        if (this.settings.commandVisibility.folderStopExcluding) {
            menu.addItem((item) => {
                item
                    .setTitle(`Enable renaming (${folders.length} folders)`)
                    .setIcon("square-check")
                    .setSection("folder")
                    .onClick(async () => {
                        await this.processMultipleFolders(folders, 'enable');
                    });
            });
        }
    }

    getAllMarkdownFilesInFolder(folder: TFolder): TFile[] {
        const files: TFile[] = [];

        const processFolder = (currentFolder: TFolder) => {
            currentFolder.children.forEach(child => {
                if (child instanceof TFile && child.extension === 'md') {
                    files.push(child);
                } else if (child instanceof TFolder && this.settings.includeSubfolders) {
                    processFolder(child);
                }
            });
        };

        processFolder(folder);
        return files;
    }

    async processMultipleFolders(folders: TFolder[], action: 'rename' | 'disable' | 'enable'): Promise<void> {
        if (folders.length === 0) return;

        let processed = 0;
        let skipped = 0;
        let errors = 0;

        // Collect all files from all folders
        const allFiles: TFile[] = [];
        folders.forEach(folder => {
            const folderFiles = this.getAllMarkdownFilesInFolder(folder);
            allFiles.push(...folderFiles);
        });

        if (allFiles.length === 0) {
            new Notice("No markdown files found in selected folders.");
            return;
        }

        if (action === 'rename') {
            new Notice(`Processing ${allFiles.length} files from ${folders.length} folders...`);

            // Use the existing file processing logic
            await this.processMultipleFiles(allFiles, 'rename');
        } else {
            // For folder exclusion, we work with folder paths directly
            new Notice(`Processing ${folders.length} folders...`);

            for (const folder of folders) {
                try {
                    const isCurrentlyExcluded = this.settings.excludedFolders.includes(folder.path);

                    if (action === 'disable' && !isCurrentlyExcluded) {
                        // Only toggle if not already excluded
                        await this.toggleFolderExclusion(folder.path);
                        processed++;
                    } else if (action === 'enable' && isCurrentlyExcluded) {
                        // Only toggle if currently excluded
                        await this.toggleFolderExclusion(folder.path);
                        processed++;
                    } else {
                        // Already in desired state
                        skipped++;
                    }
                } catch (error) {
                    console.error(`Error processing folder ${folder.path}:`, error);
                    errors++;
                }
            }

            // Show completion notice
            const actionText = action === 'disable' ? 'disabled renaming for' : 'enabled renaming for';
            if (errors > 0) {
                new Notice(`${actionText} ${processed} folders. ${skipped} already in desired state. ${errors} errors occurred.`);
            } else if (skipped > 0) {
                new Notice(`${actionText} ${processed} folders. ${skipped} already in desired state.`);
            } else {
                new Notice(`Successfully ${actionText} ${processed} folders.`);
            }
        }
    }

    async processMultipleFiles(files: TFile[], action: 'rename' | 'disable' | 'enable'): Promise<void> {
        if (files.length === 0) return;

        let processed = 0;
        let skipped = 0;
        let errors = 0;

        new Notice(`Processing ${files.length} files...`);

        for (const file of files) {
            try {
                if (action === 'rename') {
                    // Check if note has disable property before processing
                    if (await hasDisablePropertyInFile(file, this.app, this.settings)) {
                        new Notice(`Note has a property configured to disable renaming: ${file.name}`);
                        skipped++;
                        continue;
                    }
                    // Run the "even if excluded" version
                    const result = await this.renameFile(file, true, true);
                    if (result.success) {
                        processed++;
                    } else {
                        skipped++;
                    }
                } else if (action === 'disable') {
                    // Add disable property to file
                    await this.addDisablePropertyToFile(file);
                    processed++;
                } else if (action === 'enable') {
                    // Remove disable property from file
                    await this.removeDisablePropertyFromFile(file);
                    processed++;
                }
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
                errors++;
            }
        }

        // Show completion notice
        if (action === 'rename') {
            if (errors > 0) {
                new Notice(`Completed: ${processed} renamed, ${skipped} skipped, ${errors} errors`);
            } else {
                new Notice(`Successfully processed ${processed} files. ${skipped} skipped.`);
            }
        } else {
            const actionText = action === 'disable' ? 'disabled renaming for' : 'enabled renaming for';
            if (errors > 0) {
                new Notice(`${actionText} ${processed} files. ${errors} errors occurred.`);
            } else {
                new Notice(`Successfully ${actionText} ${processed} files.`);
            }
        }
    }

    async addDisablePropertyToFile(file: TFile): Promise<void> {
        if (!this.settings.disableRenamingKey || !this.settings.disableRenamingValue) {
            new Notice("Disable renaming key/value not configured in settings");
            return;
        }

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter[this.settings.disableRenamingKey] = this.settings.disableRenamingValue;
        });
    }

    async removeDisablePropertyFromFile(file: TFile): Promise<void> {
        if (!this.settings.disableRenamingKey) {
            new Notice("Disable renaming key not configured in settings");
            return;
        }

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            if (frontmatter.hasOwnProperty(this.settings.disableRenamingKey)) {
                delete frontmatter[this.settings.disableRenamingKey];
            }
        });
    }

    async addAliasToFile(file: TFile, originalFirstLine: string, newFileName: string): Promise<void> {
        try {
            // Step 1: Parse first line (original, unprocessed)
            const firstLine = originalFirstLine;

            // Step 2: Process first line to get what becomes the filename
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

            // Step 5: Process the alias through the same pipeline as filename generation
            // but with forbidden character replacements disabled
            const originalCharReplacementSetting = this.settings.enableForbiddenCharReplacements;
            this.settings.enableForbiddenCharReplacements = false;

            let aliasToAdd = extractTitle(firstLine, this.settings);

            // Restore original setting
            this.settings.enableForbiddenCharReplacements = originalCharReplacementSetting;

            // Apply truncation to alias if enabled
            if (this.settings.truncateAlias) {
                if (aliasToAdd.length > this.settings.charCount - 1) {
                    aliasToAdd = aliasToAdd.slice(0, this.settings.charCount - 1).trimEnd() + "…";
                }
            }

            // Mark alias with ZWSP for identification
            const markedAlias = '\u200B' + aliasToAdd + '\u200B';

            // Step 6: Save any unsaved changes before modifying frontmatter
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
                await activeView.save();
            }

            // Step 8: Use processFrontMatter to update aliases
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';

                // Check if property is 'aliases' - if yes, use current behavior
                if (aliasPropertyKey === 'aliases') {
                    // Current behavior: add value on its own line as the last line
                    let existingAliases: string[] = [];
                    if (frontmatter[aliasPropertyKey]) {
                        if (Array.isArray(frontmatter[aliasPropertyKey])) {
                            existingAliases = [...frontmatter[aliasPropertyKey]];
                        } else {
                            existingAliases = [frontmatter[aliasPropertyKey]];
                        }
                    }

                    // Remove any existing plugin aliases (marked with ZWSP)
                    existingAliases = existingAliases.filter(alias =>
                        !(typeof alias === 'string' && alias.startsWith('\u200B') && alias.endsWith('\u200B'))
                    );

                    // Check if this exact alias already exists (unmarked)
                    if (!existingAliases.includes(aliasToAdd)) {
                        // Add the new marked alias
                        existingAliases.push(markedAlias);
                        frontmatter[aliasPropertyKey] = existingAliases;
                    } else {
                        // If only non-plugin aliases remain, update with them
                        if (existingAliases.length === 0) {
                            if (this.settings.keepEmptyAliasProperty) {
                                // Keep empty property - use null if aliases property, empty string otherwise
                                if (aliasPropertyKey === 'aliases') {
                                    frontmatter[aliasPropertyKey] = null;
                                } else {
                                    frontmatter[aliasPropertyKey] = "";
                                }
                            } else {
                                // Delete empty property (original behavior)
                                delete frontmatter[aliasPropertyKey];
                            }
                        } else {
                            frontmatter[aliasPropertyKey] = existingAliases;
                        }
                    }
                } else {
                    // New behavior for non-aliases properties
                    const propertyExists = frontmatter.hasOwnProperty(aliasPropertyKey);

                    if (!propertyExists || frontmatter[aliasPropertyKey] === null || frontmatter[aliasPropertyKey] === undefined) {
                        // Property doesn't exist or has no value - insert inline
                        frontmatter[aliasPropertyKey] = markedAlias;
                    } else {
                        // Property has existing values - check if they're FLIT-added or user-added
                        let existingValues: string[] = [];
                        if (Array.isArray(frontmatter[aliasPropertyKey])) {
                            existingValues = [...frontmatter[aliasPropertyKey]];
                        } else {
                            existingValues = [frontmatter[aliasPropertyKey]];
                        }

                        // Remove any existing plugin values (marked with ZWSP)
                        const userValues = existingValues.filter(value =>
                            !(typeof value === 'string' && value.startsWith('\u200B') && value.endsWith('\u200B'))
                        );

                        // Check if this exact value already exists (unmarked)
                        if (!userValues.includes(aliasToAdd)) {
                            if (userValues.length === 0) {
                                // No user values, just our value - insert inline
                                frontmatter[aliasPropertyKey] = markedAlias;
                            } else {
                                // Has user values - add as new line in array
                                userValues.push(markedAlias);
                                frontmatter[aliasPropertyKey] = userValues;
                            }
                        } else {
                            // Value already exists, just restore user values
                            if (userValues.length === 0) {
                                if (this.settings.keepEmptyAliasProperty) {
                                    // Keep empty property - use null if aliases property, empty string otherwise
                                    if (aliasPropertyKey === 'aliases') {
                                        frontmatter[aliasPropertyKey] = null;
                                    } else {
                                        frontmatter[aliasPropertyKey] = "";
                                    }
                                } else {
                                    // Delete empty property (original behavior)
                                    delete frontmatter[aliasPropertyKey];
                                }
                            } else if (userValues.length === 1) {
                                frontmatter[aliasPropertyKey] = userValues[0];
                            } else {
                                frontmatter[aliasPropertyKey] = userValues;
                            }
                        }
                    }
                }
            });

            verboseLog(this, `Updated alias \`${aliasToAdd}\` in ${file.path}`);

        } catch (error) {
            console.error(`Failed to add alias to file ${file.path}:`, error);
            // Don't throw - alias addition failure shouldn't prevent the rename
        }
    }

    async removePluginAliasesFromFile(file: TFile, forceCompleteRemoval: boolean = false): Promise<void> {
        try {
            // Save any unsaved changes before modifying frontmatter
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
                await activeView.save();
            }

            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';

                if (frontmatter[aliasPropertyKey]) {
                    let existingValues: string[] = [];

                    // Normalize to array
                    if (Array.isArray(frontmatter[aliasPropertyKey])) {
                        existingValues = [...frontmatter[aliasPropertyKey]];
                    } else {
                        existingValues = [frontmatter[aliasPropertyKey]];
                    }

                    // Filter out plugin values (marked with ZWSP)
                    const filteredValues = existingValues.filter(value =>
                        !(typeof value === 'string' && value.startsWith('\u200B') && value.endsWith('\u200B'))
                    );

                    // Update or remove the property based on remaining values
                    if (filteredValues.length === 0) {
                        if (forceCompleteRemoval || !this.settings.keepEmptyAliasProperty) {
                            // Delete empty property completely
                            delete frontmatter[aliasPropertyKey];
                        } else {
                            // Keep empty property - use null if aliases property, empty string otherwise
                            if (aliasPropertyKey === 'aliases') {
                                frontmatter[aliasPropertyKey] = null;
                            } else {
                                frontmatter[aliasPropertyKey] = "";
                            }
                        }
                    } else if (filteredValues.length === 1 && aliasPropertyKey !== 'aliases') {
                        // For non-aliases properties, convert back to single value if only one remains
                        frontmatter[aliasPropertyKey] = filteredValues[0];
                    } else {
                        // Keep as array for aliases or multiple values
                        frontmatter[aliasPropertyKey] = filteredValues;
                    }
                }
            });

            verboseLog(this, `Removed plugin aliases from ${file.path}`);
        } catch (error) {
            console.error(`Failed to remove plugin aliases from ${file.path}:`, error);
        }
    }

    async removeAliasFromFile(file: TFile, aliasToRemove: string): Promise<void> {
        try {
            const trimmedAlias = aliasToRemove.trim();

            if (!trimmedAlias) {
                return;
            }

            // Save any unsaved changes before modifying frontmatter
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
                await activeView.save();
            }

            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';

                if (frontmatter[aliasPropertyKey]) {
                    let existingAliases: string[] = [];

                    // Normalize to array
                    if (Array.isArray(frontmatter[aliasPropertyKey])) {
                        existingAliases = [...frontmatter[aliasPropertyKey]];
                    } else {
                        existingAliases = [frontmatter[aliasPropertyKey]];
                    }

                    // Remove the specified alias
                    const filteredAliases = existingAliases.filter(alias => alias !== trimmedAlias);

                    // Update or remove the property
                    if (filteredAliases.length === 0) {
                        if (this.settings.keepEmptyAliasProperty) {
                            // Keep empty property - use null if aliases property, empty string otherwise
                            if (aliasPropertyKey === 'aliases') {
                                frontmatter[aliasPropertyKey] = null;
                            } else {
                                frontmatter[aliasPropertyKey] = "";
                            }
                        } else {
                            // Delete empty property (original behavior)
                            delete frontmatter[aliasPropertyKey];
                        }
                    } else {
                        frontmatter[aliasPropertyKey] = filteredAliases;
                    }
                }
            });

            verboseLog(this, `Removed alias "${trimmedAlias}" from ${file.path}`);
        } catch (error) {
            console.error(`Failed to remove alias from ${file.path}:`, error);
        }
    }



    setupCommandPaletteIcons(): void {
        // Create a map of command names to their icons
        const commandIcons = new Map([
            ['Put first line in title', 'file-pen'],
            ['Put first line in title (unless excluded)', 'file-pen'],
            ['Put first line in title in all notes', 'files'],
            ['Disable renaming for note', 'square-x'],
            ['Enable renaming for note', 'square-check']
        ]);

        // Observer to watch for command palette suggestions
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        // Look for suggestion items in the command palette
                        const suggestionItems = node.querySelectorAll('.suggestion-item, [class*="suggestion"]');

                        suggestionItems.forEach((item) => {
                            if (item instanceof HTMLElement) {
                                const titleElement = item.querySelector('.suggestion-title, [class*="title"]');
                                if (titleElement) {
                                    const commandName = titleElement.textContent?.trim();
                                    if (commandName && commandIcons.has(commandName)) {
                                        // Check if icon already exists
                                        if (!item.querySelector('.flit-command-icon')) {
                                            const iconName = commandIcons.get(commandName);

                                            // Create icon element
                                            const iconElement = document.createElement('div');
                                            iconElement.classList.add('flit-command-icon');
                                            iconElement.style.cssText = `
                                                display: inline-flex;
                                                align-items: center;
                                                justify-content: center;
                                                width: 16px;
                                                height: 16px;
                                                margin-right: 8px;
                                                color: var(--text-muted);
                                                flex-shrink: 0;
                                            `;

                                            // Use Obsidian's setIcon function to add the icon
                                            setIcon(iconElement, iconName);

                                            // Insert icon at the beginning of the suggestion item
                                            item.insertBefore(iconElement, item.firstChild);
                                        }
                                    }
                                }
                            }
                        });
                    }
                });
            });
        });

        // Start observing the document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Store the observer for cleanup
        this.commandPaletteObserver = observer;
    }

    registerRibbonIcons(): void {
        // Register ribbon icons in order according to settings
        // This method is called with a delay to ensure icons are placed last

        // Create array of ribbon actions to add in settings order
        const ribbonActions: Array<{
            condition: boolean;
            icon: string;
            title: string;
            callback: () => void | Promise<void>;
        }> = [
            {
                condition: this.settings.ribbonVisibility.renameCurrentFile,
                icon: 'file-pen',
                title: 'Put first line in title',
                callback: async () => {
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile && activeFile.extension === 'md') {
                        // Check if note has disable property before processing
                        if (await hasDisablePropertyInFile(activeFile, this.app, this.settings)) {
                            new Notice("Note has a property configured to disable renaming");
                            return;
                        }
                        verboseLog(this, `Manual rename command triggered for ${activeFile.path} (ignoring exclusions)`);
                        await this.renameFile(activeFile, true, true);
                    }
                }
            },
            {
                condition: this.settings.ribbonVisibility.renameAllNotes,
                icon: 'files',
                title: 'Put first line in title in all notes',
                callback: () => {
                    verboseLog(this, 'Bulk rename command triggered');
                    new RenameAllFilesModal(this.app, this).open();
                }
            }
        ];

        // Add ribbon icons in order, only if enabled
        ribbonActions.forEach(action => {
            if (action.condition) {
                this.addRibbonIcon(action.icon, action.title, action.callback);
            }
        });
    }

    async registerDynamicCommands(): Promise<void> {
        if (!this.settings.enableCommandPalette) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') return;

        // Check if the disable property exists in the current file
        const hasDisableProperty = await hasDisablePropertyInFile(activeFile, this.app, this.settings);

        // Remove existing dynamic commands
        const commandsToRemove = ['disable-renaming-for-note', 'enable-renaming-for-note'];
        commandsToRemove.forEach(id => {
            // @ts-ignore - accessing private property
            if (this.app.commands.commands[id]) {
                // @ts-ignore - accessing private method
                this.app.commands.removeCommand(id);
            }
        });

        if (hasDisableProperty) {
            // Show enable command when property exists
            if (this.settings.commandPaletteVisibility.enableRenaming) {
                this.addCommand({
                    id: 'enable-renaming-for-note',
                    name: 'Enable renaming for note',
                    icon: 'square-check',
                    callback: async () => {
                        await this.enableRenamingForNote();
                    }
                });
            }
        } else {
            // Show disable command when property doesn't exist
            if (this.settings.commandPaletteVisibility.disableRenaming) {
                this.addCommand({
                    id: 'disable-renaming-for-note',
                    name: 'Disable renaming for note',
                    icon: 'square-x',
                    callback: async () => {
                        await this.disableRenamingForNote();
                    }
                });
            }
        }
    }

    async disableRenamingForNote(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice("No active markdown file");
            return;
        }

        // Check if settings are configured
        if (!this.settings.disableRenamingKey || !this.settings.disableRenamingValue) {
            new Notice("Disable renaming property not configured in settings");
            return;
        }

        // Check if property already exists
        const hasProperty = await hasDisablePropertyInFile(activeFile, this.app, this.settings);

        try {
            if (!hasProperty) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    frontmatter[this.settings.disableRenamingKey] = this.settings.disableRenamingValue;
                });
                // Re-register commands to reflect new state
                await this.registerDynamicCommands();
            }

            new Notice(`Disabled renaming for ${activeFile.name}`);
        } catch (error) {
            new Notice(`Failed to disable renaming: ${error.message}`);
        }
    }

    async enableRenamingForNote(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice("No active markdown file");
            return;
        }

        // Check if settings are configured
        if (!this.settings.disableRenamingKey || !this.settings.disableRenamingValue) {
            new Notice("Disable renaming property not configured in settings");
            return;
        }

        // Check if property exists
        const hasProperty = await hasDisablePropertyInFile(activeFile, this.app, this.settings);

        try {
            if (hasProperty) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    delete frontmatter[this.settings.disableRenamingKey];
                });
                // Re-register commands to reflect new state
                await this.registerDynamicCommands();
            }

            new Notice(`Enabled renaming for ${activeFile.name}`);
        } catch (error) {
            new Notice(`Failed to enable renaming: ${error.message}`);
        }
    }

    private propertyObserver?: MutationObserver;

    private setupEmptyPropertyHiding(propertyKey: string): void {
        // Clean up existing observer
        this.cleanupPropertyObserver();

        // Create new observer to watch for property changes
        this.propertyObserver = new MutationObserver((mutations) => {
            mutations.forEach(() => {
                this.hideEmptyProperties(propertyKey);
            });
        });

        // Start observing
        this.propertyObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-property-key']
        });

        // Initial hide
        this.hideEmptyProperties(propertyKey);
    }

    private hideEmptyProperties(propertyKey: string): void {
        // Find all property elements with the target key
        const properties = document.querySelectorAll(`[data-property-key="${propertyKey}"]`);

        properties.forEach((property) => {
            // Skip if in source view (check for CodeMirror editor context)
            const isInSourceView = property.closest('.cm-editor') &&
                                   !property.closest('.metadata-container');
            if (isInSourceView) {
                return;
            }

            // Check if property is empty
            const valueContainer = property.querySelector('.metadata-property-value');
            const isEmpty = !valueContainer ||
                           valueContainer.textContent?.trim() === '' ||
                           valueContainer.children.length === 0;

            // Hide/show the entire property row
            if (isEmpty) {
                (property as HTMLElement).style.display = 'none';
            } else {
                (property as HTMLElement).style.display = '';
            }
        });
    }

    private cleanupPropertyObserver(): void {
        if (this.propertyObserver) {
            this.propertyObserver.disconnect();
            this.propertyObserver = undefined;
        }

        // Remove any hiding styles applied by the observer
        const hiddenProperties = document.querySelectorAll('[data-property-key][style*="display: none"]');
        hiddenProperties.forEach((property) => {
            (property as HTMLElement).style.display = '';
        });
    }

    updatePropertyVisibility(): void {
        // Remove any existing property hiding styles
        document.head.querySelector('#flit-hide-property-style')?.remove();

        // Clean up any existing observer
        this.cleanupPropertyObserver();

        if (this.settings.hideAliasProperty === 'never') {
            return; // No hiding needed
        }

        const propertyKey = this.settings.aliasPropertyKey || 'aliases';
        let css = '';

        if (this.settings.hideAliasProperty === 'always') {
            // Always hide in reading view and live preview (but never source view)
            css = `
                /* Reading view */
                .markdown-preview-view .metadata-property[data-property-key="${propertyKey}"],
                .markdown-rendered .metadata-property[data-property-key="${propertyKey}"] {
                    display: none !important;
                }
                /* Live preview mode - properties panel */
                .workspace-leaf-content[data-type="markdown"] .view-header + .view-content .metadata-container .metadata-property[data-property-key="${propertyKey}"] {
                    display: none !important;
                }
                /* Live preview frontmatter rendering */
                .markdown-source-view.mod-cm6 .metadata-container .metadata-property[data-property-key="${propertyKey}"] {
                    display: none !important;
                }
            `;
        } else if (this.settings.hideAliasProperty === 'when_empty') {
            // For "when empty", we use DOM observation to detect empty properties
            this.setupEmptyPropertyHiding(propertyKey);
            return;
        }

        if (css) {
            const style = document.createElement('style');
            style.id = 'flit-hide-property-style';
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    async onload(): Promise<void> {
        await this.loadSettings();

        // Always disable debug mode on plugin load (don't preserve ON state)
        this.settings.verboseLogging = false;

        // Auto-detect OS every time plugin loads
        this.settings.osPreset = detectOS();
        await this.saveSettings();

        verboseLog(this, 'Plugin loaded', this.settings);
        verboseLog(this, `Detected OS: \`${this.settings.osPreset}\``);

        // Initialize first-enable logic for sections (for fresh installs or existing configs)
        let settingsChanged = false;

        // Custom replacements first-enable logic
        if (this.settings.enableCustomReplacements && !this.settings.hasEnabledCustomReplacements) {
            this.settings.customReplacements.forEach(replacement => {
                replacement.enabled = true;
            });
            this.settings.hasEnabledCustomReplacements = true;
            settingsChanged = true;
            verboseLog(this, 'Initialized custom replacements on first enable');
        }

        // Safewords first-enable logic
        if (this.settings.enableSafewords && !this.settings.hasEnabledSafewords) {
            this.settings.safewords.forEach(safeword => {
                safeword.enabled = true;
            });
            this.settings.hasEnabledSafewords = true;
            settingsChanged = true;
            verboseLog(this, 'Initialized safewords on first enable');
        }

        // Forbidden chars first-enable logic (already exists in settings, but add for completeness)
        if (this.settings.enableForbiddenCharReplacements && !this.settings.hasEnabledForbiddenChars) {
            const allOSesKeys = ['leftBracket', 'rightBracket', 'hash', 'caret', 'pipe', 'backslash', 'slash', 'colon', 'dot'];
            allOSesKeys.forEach(key => {
                this.settings.charReplacementEnabled[key as keyof typeof this.settings.charReplacementEnabled] = true;
            });
            this.settings.hasEnabledForbiddenChars = true;
            settingsChanged = true;
            verboseLog(this, 'Initialized forbidden char replacements on first enable');
        }

        if (settingsChanged) {
            await this.saveSettings();
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
            if (this.settings.commandPaletteVisibility.renameCurrentFile) {
                this.addCommand({
                    id: 'rename-current-file',
                    name: 'Put first line in title',
                    icon: 'file-pen',
                    callback: async () => {
                        const activeFile = this.app.workspace.getActiveFile();
                        if (activeFile && activeFile.extension === 'md') {
                            // Check if note has disable property before processing
                            if (await hasDisablePropertyInFile(activeFile, this.app, this.settings)) {
                                new Notice("Note has a property configured to disable renaming");
                                return;
                            }
                            verboseLog(this, `Manual rename command triggered for ${activeFile.path} (ignoring exclusions)`);
                            await this.renameFile(activeFile, true, true);
                        }
                    }
                });
            }

            if (this.settings.commandPaletteVisibility.renameCurrentFileUnlessExcluded) {
                this.addCommand({
                    id: 'rename-current-file-unless-excluded',
                    name: 'Put first line in title (unless excluded)',
                    icon: 'file-pen',
                    callback: async () => {
                        const activeFile = this.app.workspace.getActiveFile();
                        if (activeFile && activeFile.extension === 'md') {
                            // Check if note has disable property before processing
                            if (await hasDisablePropertyInFile(activeFile, this.app, this.settings)) {
                                new Notice("Note has a property configured to disable renaming");
                                return;
                            }
                            verboseLog(this, `Manual rename command triggered for ${activeFile.path} (unless excluded)`);
                            await this.renameFile(activeFile, true, false);
                        }
                    }
                });
            }

            if (this.settings.commandPaletteVisibility.renameAllFiles) {
                this.addCommand({
                    id: 'rename-all-files',
                    name: 'Put first line in title in all notes',
                    icon: 'file-pen',
                    callback: () => {
                        verboseLog(this, 'Bulk rename command triggered');
                        new RenameAllFilesModal(this.app, this).open();
                    }
                });
            }

            // Dynamic commands that depend on current file state - will be registered separately
            this.registerDynamicCommands();
        }

        // Defer ribbon icon registration to ensure they're placed last
        if (this.settings.enableRibbon) {
            this.app.workspace.onLayoutReady(() => {
                // Use setTimeout to ensure this runs after all other plugins have loaded
                setTimeout(() => {
                    this.registerRibbonIcons();
                }, 0);
            });
        }

        // Add context menu handlers
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                // Only show context menu commands if master toggle is enabled
                if (!this.settings.enableContextMenus) return;

                // Count visible items to determine if we need a separator
                let hasVisibleItems = false;

                if (file instanceof TFile && file.extension === 'md') {
                    // FILE SECTION
                    if (this.settings.commandVisibility.filePutFirstLineInTitle) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle("Put first line in title")
                                .setIcon("file-pen")
                                .setSection("file")
                                .onClick(async () => {
                                    // Check if note has disable property before processing
                                    if (await hasDisablePropertyInFile(file, this.app, this.settings)) {
                                        new Notice("Note has a property configured to disable renaming");
                                        return;
                                    }
                                    // Run the "even if excluded" version
                                    await this.renameFile(file, true, true);
                                });
                        });
                    }

                    // Add file exclusion commands using frontmatter properties
                    // Use synchronous check with cached metadata instead of async file read
                    const fileCache = this.app.metadataCache.getFileCache(file);
                    let hasDisableProperty = false;

                    if (fileCache && fileCache.frontmatter && this.settings.disableRenamingKey && this.settings.disableRenamingValue) {
                        const frontmatter = fileCache.frontmatter;
                        const value = frontmatter[this.settings.disableRenamingKey];
                        if (value !== undefined) {
                            // Handle different value formats (string, number, boolean)
                            const valueStr = String(value).toLowerCase();
                            const expectedStr = this.settings.disableRenamingValue.toLowerCase();
                            hasDisableProperty = valueStr === expectedStr;
                        }
                    }

                    if (!hasDisableProperty && this.settings.commandVisibility.fileExclude) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle("Disable renaming for note")
                                .setIcon("square-x")
                                .setSection("file")
                                .onClick(async () => {
                                    if (!this.settings.disableRenamingKey || !this.settings.disableRenamingValue) {
                                        new Notice("Disable renaming property not configured in settings");
                                        return;
                                    }

                                    try {
                                        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                            frontmatter[this.settings.disableRenamingKey] = this.settings.disableRenamingValue;
                                        });
                                        new Notice(`Disabled renaming for ${file.name}`);
                                    } catch (error) {
                                        new Notice(`Failed to disable renaming: ${error.message}`);
                                    }
                                });
                        });
                    } else if (hasDisableProperty && this.settings.commandVisibility.fileStopExcluding) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle("Enable renaming for note")
                                .setIcon("square-check")
                                .setSection("file")
                                .onClick(async () => {
                                    if (!this.settings.disableRenamingKey || !this.settings.disableRenamingValue) {
                                        new Notice("Disable renaming property not configured in settings");
                                        return;
                                    }

                                    try {
                                        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                            delete frontmatter[this.settings.disableRenamingKey];
                                        });
                                        new Notice(`Enabled renaming for ${file.name}`);
                                    } catch (error) {
                                        new Notice(`Failed to enable renaming: ${error.message}`);
                                    }
                                });
                        });
                    }
                } else if (file instanceof TFolder) {
                    // FOLDER SECTION
                    if (this.settings.commandVisibility.folderPutFirstLineInTitle) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle("Put first line in title")
                                .setIcon("folder-pen")
                                .setSection("folder")
                                .onClick(() => {
                                    new RenameFolderModal(this.app, this, file).open();
                                });
                        });
                    }

                    // Add folder exclusion commands with dynamic text
                    const shouldShowDisable = this.shouldShowDisableMenuForFolder(file.path);
                    const menuText = this.getFolderMenuText(file.path);

                    if (shouldShowDisable && this.settings.commandVisibility.folderExclude) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle(menuText.disable)
                                .setIcon("square-x")
                                .setSection("folder")
                                .onClick(async () => {
                                    await this.toggleFolderExclusion(file.path);
                                });
                        });
                    }

                    if (!shouldShowDisable && this.settings.commandVisibility.folderStopExcluding) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle(menuText.enable)
                                .setIcon("square-check")
                                .setSection("folder")
                                .onClick(async () => {
                                    await this.toggleFolderExclusion(file.path);
                                });
                        });
                    }
                }
            })
        );

        // Add multi-file context menu handlers
        this.registerEvent(
            this.app.workspace.on("files-menu", (menu, files) => {
                // Only show context menu commands if master toggle is enabled
                if (!this.settings.enableContextMenus) return;

                // Filter for markdown files
                const markdownFiles = files.filter(file => file instanceof TFile && file.extension === 'md') as TFile[];

                if (markdownFiles.length === 0) return;

                let hasVisibleItems = false;

                // Add "Put first line in title" command for multiple files
                if (this.settings.commandVisibility.filePutFirstLineInTitle) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(`Put first line in title (${markdownFiles.length} files)`)
                            .setIcon("file-pen")
                            .setSection("file")
                            .onClick(async () => {
                                await this.processMultipleFiles(markdownFiles, 'rename');
                            });
                    });
                }

                // Add "Disable renaming" command for multiple files
                if (this.settings.commandVisibility.fileExclude) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(`Disable renaming (${markdownFiles.length} files)`)
                            .setIcon("square-x")
                            .setSection("file")
                            .onClick(async () => {
                                await this.processMultipleFiles(markdownFiles, 'disable');
                            });
                    });
                }

                // Add "Enable renaming" command for multiple files
                if (this.settings.commandVisibility.fileStopExcluding) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(`Enable renaming (${markdownFiles.length} files)`)
                            .setIcon("square-check")
                            .setSection("file")
                            .onClick(async () => {
                                await this.processMultipleFiles(markdownFiles, 'enable');
                            });
                    });
                }
            })
        );

        // Add multi-folder context menu handler using monkey-patching (like YAML tags)
        this.registerDomEvent(document, 'contextmenu', (evt) => {
            if (!this.settings.enableContextMenus) return;

            // Check if we're right-clicking in the file explorer
            const target = evt.target as HTMLElement;
            const fileExplorer = target.closest('.workspace-leaf-content[data-type="file-explorer"], .nav-folder, .nav-file, .tree-item');

            if (!fileExplorer) return;

            // Check for multiple folder selection immediately
            const selectedFolders = this.getSelectedFolders();

            if (selectedFolders.length > 1) {
                // Multiple folders are selected - set up monkey patch IMMEDIATELY
                const plugin = this;
                const remove = around(Menu.prototype, {
                    showAtPosition(old) {
                        return function (...args) {
                            remove();
                            plugin.addMultiFolderMenuItems(this, selectedFolders);
                            return old.apply(this, args);
                        }
                    }
                });

                if ((Menu as any).forEvent) {
                    const remove2 = around(Menu as any, {forEvent(old) { return function (ev: Event) {
                        const m = old.call(this, evt);
                        if (ev === evt) {
                            plugin.addMultiFolderMenuItems(m, selectedFolders);
                            remove();
                        }
                        remove2()
                        return m;
                    }}})
                    setTimeout(remove2, 0);
                }
            }
        }, true);

        // Add tag context menu handlers
        // Handle editor hashtags using Tag Wrangler's approach
        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu, editor, view) => {
                // Only show tag context menu commands if master toggle is enabled
                if (!this.settings.enableContextMenus) return;

                const token = editor.getClickableTokenAt(editor.getCursor());
                if (token?.type === "tag") {
                    const tagName = token.text.startsWith('#') ? token.text.slice(1) : token.text;
                    this.addTagMenuItems(menu, tagName);
                }
            })
        );

        // Handle tag pane context menus using Tag Wrangler's pattern
        this.registerDomEvent(document, 'contextmenu', (evt) => {
            // Only show tag context menu commands if master toggle is enabled
            if (!this.settings.enableContextMenus) return;

            const target = evt.target as HTMLElement;

            // Check for tag pane tags
            const tagElement = target.closest('.tag-pane-tag');
            if (tagElement) {
                // Extract tag name from tag pane using Tag Wrangler's approach
                const tagNameEl = tagElement.querySelector('.tag-pane-tag-text, .tag-pane-tag .tree-item-inner-text');
                const tagText = tagNameEl?.textContent?.trim();

                if (tagText) {
                    const tagName = tagText.startsWith('#') ? tagText.slice(1) : tagText;

                    // Use Tag Wrangler's menuForEvent pattern
                    const menu = this.menuForEvent(evt);
                    this.addTagMenuItems(menu, tagName);
                }
                return;
            }

            // Check for YAML property view tags (frontmatter tags) - handled separately with monkey patching
            const yamlTagElement = target.closest('.metadata-property[data-property-key="tags"] .multi-select-pill');
            if (yamlTagElement) {
                // YAML tags are handled by the monkey-patched Menu.prototype.showAtPosition
                return;
            }

            // Check for reading mode tag links
            const readingModeTag = target.closest('a.tag[href^="#"]');
            if (readingModeTag) {
                const href = readingModeTag.getAttribute('href');
                if (href) {
                    const tagName = href.slice(1); // Remove the #

                    // Use Tag Wrangler's menuForEvent pattern
                    const menu = this.menuForEvent(evt);
                    this.addTagMenuItems(menu, tagName);
                }
                return;
            }
        }, true);

        // Handle YAML property view tags with monkey patching (like Tag Wrangler)
        this.registerDomEvent(document, 'contextmenu', (evt) => {
            if (!this.settings.enableContextMenus) return;

            const target = evt.target as HTMLElement;
            const yamlTagElement = target.closest('.metadata-property[data-property-key="tags"] .multi-select-pill');

            if (yamlTagElement) {
                const tagText = yamlTagElement.textContent?.trim();
                if (tagText) {
                    const tagName = tagText.startsWith('#') ? tagText.slice(1) : tagText;

                    // Use proper monkey-around like Tag Wrangler
                    const plugin = this;
                    const remove = around(Menu.prototype, {
                        showAtPosition(old) {
                            return function (...args) {
                                remove();
                                plugin.addTagMenuItems(this, tagName);
                                return old.apply(this, args);
                            }
                        }
                    });

                    if ((Menu as any).forEvent) {
                        const remove2 = around(Menu as any, {forEvent(old) { return function (ev: Event) {
                            const m = old.call(this, evt);
                            if (ev === evt) {
                                plugin.addTagMenuItems(m, tagName);
                                remove();
                            }
                            remove2()
                            return m;
                        }}})
                        setTimeout(remove2, 0);
                    }
                    setTimeout(remove, 0);
                }
            }
        }, true);

        // Add search results context menu handler
        this.registerEvent(
            this.app.workspace.on("search:results-menu", (menu: Menu, leaf: any) => {
                // Only show context menu commands if master toggle is enabled
                if (!this.settings.enableVaultSearchContextMenu) return;

                // Extract files from search results
                let files: TFile[] = [];
                if (leaf.dom?.vChildren?.children) {
                    leaf.dom.vChildren.children.forEach((e: any) => {
                        if (e.file && e.file instanceof TFile && e.file.extension === 'md') {
                            files.push(e.file);
                        }
                    });
                }

                // Only add menu items if we have markdown files
                if (files.length < 1) return;

                let hasVisibleItems = false;

                // Add "Put first line in title" command for search results
                if (this.settings.vaultSearchContextMenuVisibility.putFirstLineInTitle) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(`Put first line in title (${files.length} notes)`)
                            .setIcon("file-pen")
                            .setSection("search")
                            .onClick(async () => {
                                const selfReferentialFiles: string[] = [];
                                let processedCount = 0;

                                for (const file of files) {
                                    const result = await this.renameFile(file, true, true, true);
                                    if (result.success) {
                                        processedCount++;
                                    } else if (result.reason === 'self-referential') {
                                        selfReferentialFiles.push(file.name);
                                    }
                                }

                                // Show summary notice for self-referential files
                                if (selfReferentialFiles.length > 0) {
                                    const fileList = selfReferentialFiles.length === 1
                                        ? selfReferentialFiles[0]
                                        : selfReferentialFiles.length === 2
                                        ? selfReferentialFiles.join(' and ')
                                        : `${selfReferentialFiles.slice(0, -1).join(', ')}, and ${selfReferentialFiles.slice(-1)[0]}`;

                                    new Notice(`${selfReferentialFiles.length} file${selfReferentialFiles.length === 1 ? '' : 's'} not renamed due to self-referential link${selfReferentialFiles.length === 1 ? '' : 's'} in first line: ${fileList}`, 0);
                                }
                            });
                    });
                }

                // Add exclusion commands if applicable
                // Note: For search results, we'll apply to all files regardless of current exclusion status
                if (this.settings.vaultSearchContextMenuVisibility.disable) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(`Disable renaming for notes (${files.length} notes)`)
                            .setIcon("square-x")
                            .setSection("search")
                            .onClick(async () => {
                                if (!this.settings.disableRenamingKey || !this.settings.disableRenamingValue) {
                                    new Notice("Disable renaming property not configured in settings");
                                    return;
                                }

                                let successCount = 0;
                                let errorCount = 0;

                                for (const file of files) {
                                    try {
                                        const hasProperty = await hasDisablePropertyInFile(file, this.app, this.settings);
                                        if (!hasProperty) {
                                            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                                frontmatter[this.settings.disableRenamingKey] = this.settings.disableRenamingValue;
                                            });
                                            successCount++;
                                        }
                                    } catch (error) {
                                        errorCount++;
                                    }
                                }

                                if (errorCount > 0) {
                                    new Notice(`Disabled renaming for ${successCount} notes with ${errorCount} errors`);
                                } else {
                                    new Notice(`Disabled renaming for ${successCount} notes`);
                                }
                            });
                    });
                }

                if (this.settings.vaultSearchContextMenuVisibility.enable) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(`Enable renaming for notes (${files.length} notes)`)
                            .setIcon("square-check")
                            .setSection("search")
                            .onClick(async () => {
                                if (!this.settings.disableRenamingKey || !this.settings.disableRenamingValue) {
                                    new Notice("Disable renaming property not configured in settings");
                                    return;
                                }

                                let successCount = 0;
                                let errorCount = 0;

                                for (const file of files) {
                                    try {
                                        const hasProperty = await hasDisablePropertyInFile(file, this.app, this.settings);
                                        if (hasProperty) {
                                            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                                delete frontmatter[this.settings.disableRenamingKey];
                                            });
                                            successCount++;
                                        }
                                    } catch (error) {
                                        errorCount++;
                                    }
                                }

                                if (errorCount > 0) {
                                    new Notice(`Enabled renaming for ${successCount} notes with ${errorCount} errors`);
                                } else {
                                    new Notice(`Enabled renaming for ${successCount} notes`);
                                }
                            });
                    });
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("modify", (abstractFile) => {
                // Only process if automatic renaming is enabled
                if (this.settings.renameNotes !== "automatically") return;

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
                // Re-register dynamic commands when active file changes
                this.registerDynamicCommands();
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

        // Setup notification suppression to hide external modification notices
        this.setupNotificationSuppression();

        // Setup cursor positioning for new notes
        this.setupCursorPositioning();

        // Setup save event hook for rename on save
        this.setupSaveEventHook();

        // Initialize property visibility
        this.updatePropertyVisibility();
    }

    onunload() {
        // Clean up save event hook
        if (this.originalSaveCallback) {
            const saveCommand = (this.app as any).commands?.commands?.['editor:save-file'];
            if (saveCommand) {
                saveCommand.checkCallback = this.originalSaveCallback;
            }
        }

        // Clean up notification suppression
        this.cleanupNotificationSuppression();

        // Clean up property hiding styles and observer
        document.head.querySelector('#flit-hide-property-style')?.remove();
        this.cleanupPropertyObserver();

        // Clean up any pending alias update timers
        aliasUpdateTimers.forEach((timer) => clearTimeout(timer));
        aliasUpdateTimers.clear();


        // Clean up command palette observer
        if (this.commandPaletteObserver) {
            this.commandPaletteObserver.disconnect();
            this.commandPaletteObserver = null;
        }

        verboseLog(this, 'Plugin unloaded');
    }

    async loadSettings(): Promise<void> {
        const loadedData = await this.loadData() || {};
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            loadedData
        );

        // Ensure scopeStrategy is always set
        if (!this.settings.scopeStrategy) {
            this.settings.scopeStrategy = 'Enable in all notes except below';
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

    private originalSaveCallback?: (checking: boolean) => boolean | void;

    setupSaveEventHook(): void {
        // Get the save command
        const saveCommand = (this.app as any).commands?.commands?.['editor:save-file'];
        if (saveCommand) {
            // Store the original callback
            this.originalSaveCallback = saveCommand.checkCallback;

            // Override the save command
            saveCommand.checkCallback = (checking: boolean) => {
                // First call the original save logic
                const result = this.originalSaveCallback ? this.originalSaveCallback(checking) : true;

                // If not checking and save succeeded, run our rename logic
                if (!checking && this.settings.renameOnSave) {
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile && activeFile.extension === 'md') {
                        // Run rename (unless excluded) with no delay and suppress notices
                        setTimeout(() => {
                            this.renameFile(activeFile, true, false, true);
                        }, 100); // Small delay to ensure save is complete
                    }
                }

                return result;
            };

            verboseLog(this, 'Save event hook installed for rename on save');
        }
    }

    setupCursorPositioning(): void {
        // Listen for file creation events
        this.registerEvent(
            this.app.vault.on("create", (file) => {
                if (!this.settings.moveCursorToFirstLine) return;
                if (!(file instanceof TFile) || file.extension !== 'md') return;

                // Simple cursor positioning at beginning of first line
                setTimeout(() => {
                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (activeView && activeView.file === file) {
                        const editor = activeView.editor;
                        if (editor) {
                            editor.setCursor({ line: 0, ch: 0 });
                            editor.focus();
                            verboseLog(this, `Moved cursor to beginning of first line for new file: ${file.path}`);
                        }
                    }
                }, 50);
            })
        );

        // Also listen for when a file is opened (in case the create event doesn't catch it)
        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                if (!this.settings.moveCursorToFirstLine) return;
                if (!file || file.extension !== 'md') return;

                // Check if this is a newly created file (empty or very small)
                this.app.vault.cachedRead(file).then((content) => {
                    if (content.trim().length === 0 || content.trim().length < 10) {
                        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (activeView && activeView.file === file) {
                            const editor = activeView.editor;
                            if (editor) {
                                // Move cursor to first line
                                if (this.settings.placeCursorAtLineEnd) {
                                    // Get the length of the first line and place cursor at the end
                                    const firstLineLength = editor.getLine(0).length;
                                    editor.setCursor({ line: 0, ch: firstLineLength });
                                    verboseLog(this, `Moved cursor to end of first line (${firstLineLength} chars) for opened empty file: ${file.path}`);
                                } else {
                                    // Place cursor at the beginning of the first line
                                    editor.setCursor({ line: 0, ch: 0 });
                                    verboseLog(this, `Moved cursor to beginning of first line for opened empty file: ${file.path}`);
                                }
                                editor.focus();
                            }
                        }
                    }
                });
            })
        );
    }

    private notificationObserver?: MutationObserver;

    setupNotificationSuppression(): void {
        // Create observer to watch for new notification elements
        this.notificationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        // Look for notice elements
                        const notices = node.classList.contains('notice') ? [node] : node.querySelectorAll('.notice');

                        notices.forEach((notice) => {
                            if (notice instanceof HTMLElement) {
                                const noticeText = notice.textContent || '';

                                // Check conditions for suppressing external modification notifications
                                const conditions = {
                                    hasExternal: noticeText.includes('has been modified externally, merging changes automatically'),
                                    hasMd: noticeText.includes('.md'),
                                    noUpdated: !noticeText.includes('Updated'),
                                    startsQuote: noticeText.trim().charCodeAt(0) === 8220, // Left double quotation mark
                                    shortEnough: noticeText.length < 200
                                };

                                // Suppress if all conditions are met AND the setting is enabled
                                if (this.settings.suppressMergeNotifications &&
                                    conditions.hasExternal && conditions.hasMd && conditions.noUpdated &&
                                    conditions.startsQuote && conditions.shortEnough) {
                                    notice.style.display = 'none';
                                    verboseLog(this, `Suppressed external modification notice: ${noticeText.substring(0, 50)}...`);
                                }
                            }
                        });
                    }
                });
            });
        });

        // Start observing
        this.notificationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    cleanupNotificationSuppression(): void {
        if (this.notificationObserver) {
            this.notificationObserver.disconnect();
            this.notificationObserver = undefined;
        }
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