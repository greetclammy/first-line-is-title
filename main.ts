import { Menu, Notice, Plugin, TFile, TFolder, setIcon, MarkdownView } from "obsidian";
import { PluginSettings } from './src/types';
import { DEFAULT_SETTINGS, UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS, TITLE_CHAR_REVERSAL_MAP } from './src/constants';
import {
    verboseLog,
    detectOS,
    isFileExcluded,
    shouldProcessFile,
    hasDisablePropertyInFile,
    containsSafeword,
    extractTitle,
    isValidHeading,
    generateSafeLinkTarget
} from './src/utils';
import { RenameAllFilesModal, RenameFolderModal, ClearSettingsModal, ProcessTagModal, InternalLinkModal } from './src/modals';
import { FirstLineIsTitleSettings } from './src/settings/settings-main';
import { RenameEngine } from './src/core/rename-engine';
import { ContextMenuManager } from './src/ui/context-menus';
import { FolderOperations } from './src/operations/folder-operations';
import { TagOperations } from './src/operations/tag-operations';
import { AliasManager } from './src/core/alias-manager';
import { DebugUtils } from './src/utils/debug';
import { FileOperations } from './src/operations/file-operations';
import { CommandSetup } from './src/ui/command-setup';
import { PropertyVisibility } from './src/ui/property-visibility';
import { EventHandlers } from './src/utils/event-handlers';
import { around } from "monkey-around";

/*
 * FLIT Processing Commandments (CURRENTLY BEING REWORKED, NOT IN EFFECT)
 *
 * ✅ FLIT SHALL Process Files Only When:
 * 1. User modifies first line in open editor
 * 2. User manually triggers rename command (individual or batch)
 * AND file is not excluded from renaming
 *
 * ❌ FLIT SHALL NOT Process Files When:
 * 1. Editor is closed during modification
 * 2. External file changes (sync, other apps)
 * 3. Startup/background processing
 * 4. File is excluded from renaming
 *
 * 🕐 Check Interval Rule:
 * Eligibility determined at modification time, not processing time.
 * If editor was open when user typed, file gets renamed even if editor closes before interval expires.
 */

/*
 * ⚠️  CONSOLE LOG POLICY
 */

// High-performance cache system replaces all global variables
import { CacheManager } from './src/core/cache-manager';
import { EditorLifecycleManager } from './src/core/editor-lifecycle';
import { WorkspaceIntegration } from './src/core/workspace-integration';
import { PropertyManager } from './src/core/property-manager';
import { PluginInitializer } from './src/core/plugin-initializer';
import { CommandRegistrar } from './src/core/command-registrar';

// Global cache manager instance for cross-module access
let globalCacheManager: CacheManager | null = null;

// Provide cache manager access to other modules
(globalThis as any).flitGlobals = {
    // Cache manager access
    getCacheManager: () => globalCacheManager,

    // Backwards compatibility wrappers (will be removed after module updates)
    renamedFileCount: () => 0, // Counter removed - not needed with optimized system
    setRenamedFileCount: (value: number) => { /* deprecated */ },
    incrementRenamedFileCount: () => { /* deprecated */ },
    tempNewPaths: () => globalCacheManager?.getStats().tempPathsCount || 0,
    setTempNewPaths: (value: string[]) => { /* deprecated - use cacheManager.reservePath() */ },
    previousContent: () => new Map(), // Use cacheManager.getContent() instead
    aliasUpdateTimers: () => new Map(), // Use cacheManager.setAliasTimer() instead
    aliasUpdateInProgress: () => new Set(), // Use cacheManager.isAliasInProgress() instead
    lastModifyTime: () => new Map() // Use cacheManager.trackOperation() instead
};

export default class FirstLineIsTitle extends Plugin {
    settings: PluginSettings;
    isFullyLoaded: boolean = false;

    // High-performance cache system
    cacheManager: CacheManager;

    renameEngine: RenameEngine;
    contextMenuManager: ContextMenuManager;
    folderOperations: FolderOperations;
    tagOperations: TagOperations;
    aliasManager: AliasManager;
    debugUtils: DebugUtils;
    fileOperations: FileOperations;
    commandSetup: CommandSetup;
    propertyVisibility: PropertyVisibility;
    eventHandlers: EventHandlers;
    editorLifecycle: EditorLifecycleManager;
    workspaceIntegration: WorkspaceIntegration;
    propertyManager: PropertyManager;

    // Track files with pending metadata cache updates (for alias manager sync)
    pendingMetadataUpdates: Set<string> = new Set();

    isTagWranglerEnabled(): boolean {
        return this.app.plugins.enabledPlugins.has("tag-wrangler");
    }

    cleanupStaleCache(): void {
        // Delegate to optimized cache manager
        if (this.cacheManager) {
            this.cacheManager.forceCleanup();
            verboseLog(this, 'Cache cleanup completed');
        }
    }

    async putFirstLineInTitleForFolder(folder: TFolder): Promise<void> {
        return this.folderOperations.putFirstLineInTitleForFolder(folder);
    }

    async toggleFolderExclusion(folderPath: string): Promise<void> {
        return this.folderOperations.toggleFolderExclusion(folderPath);
    }

    async putFirstLineInTitleForTag(tagName: string, omitBodyTags: boolean = false, omitNestedTags: boolean = false): Promise<void> {
        return this.tagOperations.putFirstLineInTitleForTag(tagName, omitBodyTags, omitNestedTags);
    }

    async toggleTagExclusion(tagName: string): Promise<void> {
        return this.tagOperations.toggleTagExclusion(tagName);
    }


    // Debug logging helper for setting changes
    debugLog(settingName: string, value: any): void {
        if (this.settings.verboseLogging) {
            console.debug(`Setting changed: ${settingName} = ${JSON.stringify(value)}`);
        }
    }

    // Debug file content output
    async outputDebugFileContent(file: TFile, action: string): Promise<void> {
        if (!this.settings.verboseLogging || !this.settings.debugOutputFullContent) {
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            console.debug(`CONTENT [${action}] ${file.path}:`);
            console.debug('--- FILE CONTENT START ---');
            console.debug(content);
            console.debug('--- FILE CONTENT END ---');
        } catch (error) {
            console.debug(`CONTENT [${action}] ${file.path}: Failed to read file:`, error);
        }
    }

    // Output all current settings when debug mode is enabled
    outputAllSettings(): void {
        if (!this.settings.verboseLogging) {
            return;
        }

        console.debug('SETTINGS: Complete configuration dump:');
        console.debug('--- SETTINGS START ---');
        console.debug(JSON.stringify(this.settings, null, 2));
        console.debug('--- SETTINGS END ---');
    }



    async insertTitleOnCreation(file: TFile): Promise<void> {

        try {
            // Check if filename is "Untitled" or "Untitled n" (where n is any integer)
            const untitledPattern = /^Untitled(\s\d+)?$/;
            if (untitledPattern.test(file.basename)) {
                verboseLog(this, `Skipping title insertion for untitled file: ${file.path}`);
                return;
            }

            // Read current file content
            let content: string;
            try {
                content = await this.app.vault.read(file);
            } catch (error) {
                console.error(`Failed to read file ${file.path} for title insertion:`, error);
                return;
            }

            // Debug: log what content we found
            verboseLog(this, `Title insertion delay complete. File content length: ${content.length} chars, trimmed: "${content.trim()}"`);

            // Check if file already has content (skip if not empty)
            if (content.trim() !== '') {
                verboseLog(this, `Skipping title insertion - file already has content: ${file.path}`);
                return;
            }

            // Get clean title by reversing forbidden character replacements
            let cleanTitle = file.basename;

            // Apply character reversal mapping
            for (const [forbiddenChar, normalChar] of Object.entries(TITLE_CHAR_REVERSAL_MAP)) {
                cleanTitle = cleanTitle.replaceAll(forbiddenChar, normalChar);
            }

            verboseLog(this, `Inserting title "${cleanTitle}" in new file: ${file.path}`);

            // Check if we're in canvas view to decide cursor behavior
            const activeLeaf = this.app.workspace.activeLeaf;
            const inCanvas = activeLeaf?.view?.getViewType() === "canvas";

            // Create content with title and cursor positioning
            let newContent = cleanTitle;

            // Only add cursor if not in canvas and moveCursorToFirstLine is enabled
            if (!inCanvas && this.settings.moveCursorToFirstLine) {
                if (this.settings.placeCursorAtLineEnd) {
                    newContent += "\n"; // Place cursor at end of title line
                } else {
                    newContent += "\n"; // Place cursor on new line after title
                }
            } else {
                newContent += "\n"; // Always add at least one newline after title
            }

            // Re-read current content with retry logic (template may still be applying)
            let currentContent: string;
            let retryCount = 0;
            const maxRetries = 3;
            const retryDelay = 500;

            do {
                try {
                    currentContent = await this.app.vault.read(file);
                    verboseLog(this, `Re-read file content (attempt ${retryCount + 1}). Length: ${currentContent.length} chars`);

                    if (currentContent.trim() !== '') {
                        verboseLog(this, `Template content found after ${retryCount + 1} attempts`);
                        break; // Template applied, stop retrying
                    }

                    if (retryCount < maxRetries - 1) {
                        verboseLog(this, `File still empty, retrying in ${retryDelay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }

                } catch (error) {
                    console.error(`Failed to re-read file ${file.path} for title insertion:`, error);
                    return;
                }
                retryCount++;
            } while (retryCount < maxRetries && currentContent.trim() === '');

            // If file now has content (template applied), insert title properly
            if (currentContent.trim() !== '') {
                verboseLog(this, `File now has template content, inserting title into existing content`);

                // Use metadata cache to find where to insert title
                const metadata = this.app.metadataCache.getFileCache(file);
                const lines = currentContent.split('\n');

                if (metadata?.frontmatterPosition) {
                    // Insert title after frontmatter
                    const insertLine = metadata.frontmatterPosition.end.line + 1;
                    lines.splice(insertLine, 0, cleanTitle);
                    verboseLog(this, `Inserted title after frontmatter at line ${insertLine}`);
                } else {
                    // Insert title at beginning
                    lines.unshift(cleanTitle);
                    verboseLog(this, `Inserted title at beginning of file`);
                }

                const finalContent = lines.join('\n');
                await this.app.vault.modify(file, finalContent);
            } else {
                // File still empty, use original behavior
                verboseLog(this, `File still empty, inserting title as new content`);
                await this.app.vault.modify(file, newContent);
            }

            // Handle cursor positioning and view mode if file is currently open
            if (!inCanvas && this.settings.moveCursorToFirstLine) {
                setTimeout(() => {
                    this.handleCursorPositioning(file);
                }, 50);
            }

            verboseLog(this, `Successfully inserted title in ${file.path}`);

        } catch (error) {
            console.error(`Error inserting title on creation for ${file.path}:`, error);
        }
    }

    private async handleCursorPositioning(file: TFile): Promise<void> {
        try {
            verboseLog(this, `handleCursorPositioning called for ${file.path}`);
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            verboseLog(this, `Active view found: ${!!activeView}, file matches: ${activeView?.file?.path === file.path}`);

            if (activeView && activeView.file?.path === file.path) {
                // Set to source mode
                await activeView.leaf.setViewState({
                    type: "markdown",
                    state: {
                        mode: "source",
                        source: false
                    }
                });

                // Focus the editor
                await activeView.editor?.focus();

                // Position cursor - find actual title line using metadata cache
                let titleLineNumber = 0;
                let titleLineLength = 0;

                // Use metadata cache to determine frontmatter position
                const metadata = this.app.metadataCache.getFileCache(file);
                if (metadata?.frontmatterPosition) {
                    // Title is on the line after frontmatter
                    titleLineNumber = metadata.frontmatterPosition.end.line + 1;
                    verboseLog(this, `Found frontmatter ending at line ${metadata.frontmatterPosition.end.line}, title on line ${titleLineNumber}`);
                } else {
                    // No frontmatter, title is on first line
                    titleLineNumber = 0;
                    verboseLog(this, `No frontmatter found, title on line ${titleLineNumber}`);
                }

                titleLineLength = activeView.editor?.getLine(titleLineNumber)?.length || 0;

                if (this.settings.placeCursorAtLineEnd) {
                    // Move to end of title line
                    activeView.editor?.setCursor({ line: titleLineNumber, ch: titleLineLength });
                    verboseLog(this, `Moved cursor to end of title line ${titleLineNumber} (${titleLineLength} chars) via handleCursorPositioning for ${file.path}`);
                } else {
                    // Move to line after title
                    activeView.editor?.setCursor({ line: titleLineNumber + 1, ch: 0 });
                    verboseLog(this, `Moved cursor to line after title (line ${titleLineNumber + 1}) via handleCursorPositioning for ${file.path}`);
                }
            } else {
                verboseLog(this, `Skipping cursor positioning - no matching active view for ${file.path}`);
            }
        } catch (error) {
            console.error(`Error positioning cursor for ${file.path}:`, error);
        }
    }


    getSelectedFolders(): TFolder[] {
        return this.folderOperations.getSelectedFolders();
    }

    getAllMarkdownFilesInFolder(folder: TFolder): TFile[] {
        return this.folderOperations.getAllMarkdownFilesInFolder(folder);
    }

    async processMultipleFolders(folders: TFolder[], action: 'rename'): Promise<void> {
        return this.folderOperations.processMultipleFolders(folders, action);
    }

    async processMultipleFiles(files: TFile[], action: 'rename'): Promise<void> {
        if (files.length === 0) return;

        let processed = 0;
        let skipped = 0;
        let errors = 0;

        new Notice(`Renaming ${files.length} notes...`);

        for (const file of files) {
            try {
                if (action === 'rename') {
                    // Run the "even if excluded" version
                    const result = await this.renameEngine.renameFile(file, true, true, true);
                    if (result.success) {
                        processed++;
                    } else {
                        skipped++;
                    }
                }
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
                errors++;
            }
        }

        // Show completion notice
        if (errors > 0) {
            new Notice(`Renamed ${processed}/${files.length} notes with ${errors} errors. Check console for details.`, 0);
        } else {
            new Notice(`Renamed ${processed}/${files.length} notes.`, 0);
        }
    }





    async registerDynamicCommands(): Promise<void> {
        if (!this.settings.enableCommandPalette) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') return;

        // Check if the disable property exists in the current file
        const hasDisableProperty = await hasDisablePropertyInFile(activeFile, this.app);

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
            new Notice("Error: no active note.");
            return;
        }

        // Check if property already exists
        const hasProperty = await hasDisablePropertyInFile(activeFile, this.app);

        try {
            if (!hasProperty) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    frontmatter["no rename"] = "true";
                });
                // Re-register commands to reflect new state
                await this.registerDynamicCommands();
            }

            new Notice(`Disabled renaming for: ${activeFile.basename}`);
        } catch (error) {
            console.error('Failed to disable renaming:', error);
            new Notice(`Failed to disable renaming. Check console for details.`);
        }
    }

    async enableRenamingForNote(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice("Error: no active note.");
            return;
        }

        // Check if property exists
        const hasProperty = await hasDisablePropertyInFile(activeFile, this.app);

        try {
            if (hasProperty) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    delete frontmatter["no rename"];
                });
                // Re-register commands to reflect new state
                await this.registerDynamicCommands();
            }

            new Notice(`Enabled renaming for: ${activeFile.basename}`);
        } catch (error) {
            console.error('Failed to enable renaming:', error);
            new Notice(`Failed to enable renaming. Check console for details.`);
        }
    }

    async addSafeInternalLink(): Promise<void> {
        // Try to get active editor from any view type (markdown, canvas, etc.)
        const activeEditor = this.app.workspace.activeEditor?.editor;
        if (!activeEditor) {
            new Notice("Error: no active note.");
            return;
        }

        const selection = activeEditor.getSelection();

        if (selection.trim()) {
            // Selection exists - process directly
            const safeLinkTarget = generateSafeLinkTarget(selection, this.settings);
            const wikiLink = `[[${safeLinkTarget}]]`;
            activeEditor.replaceSelection(wikiLink);
        } else {
            // No selection - show modal
            const modal = new InternalLinkModal(this.app, this, (linkTarget: string) => {
                const safeLinkTarget = generateSafeLinkTarget(linkTarget, this.settings);
                const wikiLink = `[[${safeLinkTarget}]]`;
                activeEditor.replaceSelection(wikiLink);
            });
            modal.open();
        }
    }

    async addSafeInternalLinkWithCaption(): Promise<void> {
        // Try to get active editor from any view type (markdown, canvas, etc.)
        const activeEditor = this.app.workspace.activeEditor?.editor;
        if (!activeEditor) {
            new Notice("Error: no active note.");
            return;
        }

        const selection = activeEditor.getSelection();

        if (selection.trim()) {
            // Selection exists - use selection as caption and create safe target
            const safeLinkTarget = generateSafeLinkTarget(selection, this.settings);
            const wikiLink = `[[${safeLinkTarget}|${selection}]]`;
            activeEditor.replaceSelection(wikiLink);
        } else {
            // No selection - show modal
            const modal = new InternalLinkModal(this.app, this, (linkTarget: string, linkCaption?: string) => {
                const safeLinkTarget = generateSafeLinkTarget(linkTarget, this.settings);
                let wikiLink: string;
                if (linkCaption && linkCaption.trim()) {
                    wikiLink = `[[${safeLinkTarget}|${linkCaption}]]`;
                } else {
                    wikiLink = `[[${safeLinkTarget}|${linkTarget}]]`;
                }
                activeEditor.replaceSelection(wikiLink);
            }, true); // true for withCaption
            modal.open();
        }
    }

    private propertyObserver?: MutationObserver;

    private setupPropertyHiding(propertyKey: string): void {
        // Clean up existing observer
        this.cleanupPropertyObserver();

        // Create new observer to watch for property changes
        this.propertyObserver = new MutationObserver((mutations) => {
            mutations.forEach(() => {
                this.hideProperties(propertyKey);
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
        this.hideProperties(propertyKey);
    }

    private hideProperties(propertyKey: string): void {
        // Find all property elements with the target key
        const properties = document.querySelectorAll(`[data-property-key="${propertyKey}"]`);

        properties.forEach((property) => {
            // Skip if in source view (check for CodeMirror editor context)
            const isInSourceView = property.closest('.cm-editor') &&
                                   !property.closest('.metadata-container');
            if (isInSourceView) {
                return;
            }

            // Detect context: sidebar vs in-note
            // Sidebar properties are typically in workspace-leaf-content but NOT in markdown views
            const isInSidebar = property.closest('.workspace-leaf-content') &&
                               !property.closest('.workspace-leaf-content[data-type="markdown"]') &&
                               !property.closest('.markdown-source-view') &&
                               !property.closest('.markdown-preview-view');

            // Determine if this property should be hidden based on the mode and context
            let shouldHide = false;

            if (this.settings.hideAliasProperty === 'always') {
                // Always hide, regardless of emptiness, but consider sidebar setting
                if (isInSidebar && !this.settings.hideAliasInSidebar) {
                    // In sidebar but sidebar hiding is disabled - don't hide
                    shouldHide = false;
                } else {
                    // Either not in sidebar, or sidebar hiding is enabled - hide it
                    shouldHide = true;
                }
            } else if (this.settings.hideAliasProperty === 'when_empty') {
                // Only hide if property is empty, and consider sidebar setting
                const valueContainer = property.querySelector('.metadata-property-value');
                const isEmpty = !valueContainer ||
                               valueContainer.textContent?.trim() === '' ||
                               valueContainer.children.length === 0;

                if (isEmpty) {
                    if (isInSidebar && !this.settings.hideAliasInSidebar) {
                        // In sidebar but sidebar hiding is disabled - don't hide even if empty
                        shouldHide = false;
                    } else {
                        // Either not in sidebar, or sidebar hiding is enabled - hide it
                        shouldHide = true;
                    }
                } else {
                    // Not empty - don't hide
                    shouldHide = false;
                }
            }

            const metadataContainer = property.closest('.metadata-container');
            const metadataProperties = property.closest('.metadata-properties');

            if (shouldHide) {
                // Property should be hidden - apply context-specific logic
                if (metadataProperties) {
                    const allProperties = metadataProperties.querySelectorAll('.metadata-property[data-property-key]');

                    if (allProperties.length === 1 && allProperties[0] === property) {
                        // This is the only property and it should be hidden
                        if (isInSidebar) {
                            // SIDEBAR: Only hide .metadata-properties, preserve "Add property" button
                            (metadataProperties as HTMLElement).style.display = 'none';
                        } else {
                            // IN-NOTE: Hide entire .metadata-container including "Add property" button
                            if (metadataContainer) {
                                (metadataContainer as HTMLElement).style.display = 'none';
                            } else {
                                // Fallback if no container found
                                (metadataProperties as HTMLElement).style.display = 'none';
                            }
                        }
                    } else {
                        // There are other properties - just hide this individual property
                        (property as HTMLElement).style.display = 'none';
                        // Ensure properties section remains visible since there are other properties
                        (metadataProperties as HTMLElement).style.display = '';
                        if (metadataContainer) {
                            (metadataContainer as HTMLElement).style.display = '';
                        }
                    }
                } else {
                    // Fallback: just hide the individual property
                    (property as HTMLElement).style.display = 'none';
                }
            } else {
                // Property should be shown
                (property as HTMLElement).style.display = '';

                // Ensure containers are visible since we have a property that should be shown
                if (metadataProperties) {
                    (metadataProperties as HTMLElement).style.display = '';
                }
                if (metadataContainer) {
                    (metadataContainer as HTMLElement).style.display = '';
                }
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

        // Also restore any hidden properties sections
        const hiddenContainers = document.querySelectorAll('.metadata-container[style*="display: none"], .frontmatter-container[style*="display: none"], .metadata-properties[style*="display: none"]');
        hiddenContainers.forEach((container) => {
            (container as HTMLElement).style.display = '';
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

        if (this.settings.hideAliasProperty === 'always' || this.settings.hideAliasProperty === 'when_empty') {
            // Use DOM observation for both modes to handle container hiding properly
            this.setupPropertyHiding(propertyKey);
        }
    }

    private checkAndShowNotices(): void {
        const today = this.getTodayDateString();

        // Update last usage date
        this.updateLastUsageDate(today);

        // Check for first-time setup
        if (!this.settings.hasShownFirstTimeNotice) {
            this.showFirstTimeNotice();
            return;
        }

        // Check for long inactivity (30+ days) - only if automatic renaming is enabled
        if (this.settings.lastUsageDate &&
            this.isInactive(this.settings.lastUsageDate, today) &&
            this.settings.renameNotes === 'Automatically') {
            this.showInactivityNotice();
        }
    }

    getTodayDateString(): string {
        const today = new Date();
        return today.getFullYear() + '-' +
               String(today.getMonth() + 1).padStart(2, '0') + '-' +
               String(today.getDate()).padStart(2, '0');
    }

    private isInactive(lastUsageDate: string, todayDate: string): boolean {
        const lastDate = new Date(lastUsageDate);
        const today = new Date(todayDate);
        const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff > 30;
    }

    private showFirstTimeNotice(): void {
        new Notice("Please open First Line is Title settings to set your preferences. Ensure your files are backed up.");
        this.settings.hasShownFirstTimeNotice = true;
        this.saveSettings();
    }

    private showInactivityNotice(): void {
        new Notice("Please open First Line is Title settings to set your preferences. Ensure your files are backed up.");
    }

    private updateLastUsageDate(today: string): void {
        if (this.settings.lastUsageDate !== today) {
            this.settings.lastUsageDate = today;
            this.saveSettings();
        }
    }

    // Call this method at the start of any significant plugin operation
    trackUsage(): void {
        const today = this.getTodayDateString();
        this.updateLastUsageDate(today);
    }

    async onload(): Promise<void> {
        await this.loadSettings();

        // Initialize high-performance cache system
        this.cacheManager = new CacheManager(this);
        globalCacheManager = this.cacheManager;

        // Check for first-time setup or long inactivity
        this.checkAndShowNotices();

        // Initialize the rename engine
        this.renameEngine = new RenameEngine(this);

        // Initialize the alias manager
        this.aliasManager = new AliasManager(this);

        this.contextMenuManager = new ContextMenuManager(this);

        // Initialize operation classes
        this.folderOperations = new FolderOperations(
            this.app,
            this.settings,
            this.renameEngine,
            this.saveSettings.bind(this),
            this.debugLog.bind(this),
            this.processMultipleFiles.bind(this)
        );

        this.tagOperations = new TagOperations(
            this.app,
            this.settings,
            this.renameEngine,
            this.saveSettings.bind(this),
            this.debugLog.bind(this)
        );

        // Initialize editor lifecycle manager
        this.editorLifecycle = new EditorLifecycleManager(this);

        // Initialize workspace integration manager
        this.workspaceIntegration = new WorkspaceIntegration(this);

        // Initialize property manager
        this.propertyManager = new PropertyManager(this);

        // Always disable debug mode on plugin load (don't preserve ON state)
        // TODO: Re-enable this later if needed
        // this.settings.verboseLogging = false;

        // DISABLED: Force disable title insertion due to template conflicts
        this.settings.insertTitleOnCreation = false;

        // Auto-detect OS every time plugin loads
        this.settings.osPreset = detectOS();
        await this.saveSettings();

        verboseLog(this, 'Plugin loaded', this.settings);
        verboseLog(this, `Detected OS: \`${this.settings.osPreset}\``);

        // Initialize first-enable logic and load styles
        const pluginInitializer = new PluginInitializer(this);
        await pluginInitializer.initializeFirstEnableLogic();
        await pluginInitializer.loadStyles();

        this.addSettingTab(new FirstLineIsTitleSettings(this.app, this));

        // Register command palette commands
        const commandRegistrar = new CommandRegistrar(this);
        commandRegistrar.registerCommands();

        // Defer ribbon icon registration to ensure they're placed last
        if (this.settings.enableRibbon) {
            this.app.workspace.onLayoutReady(() => {
                // Use setTimeout to ensure this runs after all other plugins have loaded
                setTimeout(() => {
                    this.workspaceIntegration.registerRibbonIcons();
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
                                .onClick(async () => {
                                    // Run the "even if excluded" version
                                    await this.renameEngine.renameFile(file, true, true, true);
                                });
                        });
                    }

                    // Add file exclusion commands using frontmatter properties
                    // Use synchronous check with cached metadata instead of async file read
                    const fileCache = this.app.metadataCache.getFileCache(file);
                    let hasDisableProperty = false;

                    if (fileCache && fileCache.frontmatter) {
                        const frontmatter = fileCache.frontmatter;
                        const value = frontmatter["no rename"];
                        if (value !== undefined) {
                            // Handle different value formats (string, number, boolean)
                            const valueStr = String(value).toLowerCase();
                            hasDisableProperty = valueStr === "true";
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
                                .onClick(async () => {
                                    try {
                                        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                            frontmatter["no rename"] = "true";
                                        });
                                        new Notice(`Disabled renaming for: ${file.basename}`);
                                    } catch (error) {
                                        console.error('Failed to disable renaming:', error);
                                        new Notice(`Failed to disable renaming. Check console for details.`);
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
                                .onClick(async () => {
                                    try {
                                        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                            delete frontmatter["no rename"];
                                        });
                                        new Notice(`Enabled renaming for: ${file.basename}`);
                                    } catch (error) {
                                        console.error('Failed to enable renaming:', error);
                                        new Notice(`Failed to enable renaming. Check console for details.`);
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
                                .onClick(() => {
                                    new RenameFolderModal(this.app, this, file).open();
                                });
                        });
                    }

                    // Add folder exclusion commands with dynamic text
                    const shouldShowDisable = this.contextMenuManager.shouldShowDisableMenuForFolder(file.path);
                    const menuText = this.contextMenuManager.getFolderMenuText(file.path);

                    if (shouldShowDisable && this.settings.commandVisibility.folderExclude) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle(menuText.disable)
                                .setIcon("square-x")
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
                            .onClick(async () => {
                                await this.processMultipleFiles(markdownFiles, 'rename');
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
                            plugin.contextMenuManager.addMultiFolderMenuItems(this, selectedFolders);
                            return old.apply(this, args);
                        }
                    }
                });

                if ((Menu as any).forEvent) {
                    const remove2 = around(Menu as any, {forEvent(old) { return function (ev: Event) {
                        const m = old.call(this, evt);
                        if (ev === evt) {
                            plugin.contextMenuManager.addMultiFolderMenuItems(m, selectedFolders);
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
                    this.contextMenuManager.addTagMenuItems(menu, tagName);
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
                    const menu = this.contextMenuManager.menuForEvent(evt);
                    this.contextMenuManager.addTagMenuItems(menu, tagName);
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
                    const menu = this.contextMenuManager.menuForEvent(evt);
                    this.contextMenuManager.addTagMenuItems(menu, tagName);
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
                                plugin.contextMenuManager.addTagMenuItems(this, tagName);
                                return old.apply(this, args);
                            }
                        }
                    });

                    if ((Menu as any).forEvent) {
                        const remove2 = around(Menu as any, {forEvent(old) { return function (ev: Event) {
                            const m = old.call(this, evt);
                            if (ev === evt) {
                                plugin.contextMenuManager.addTagMenuItems(m, tagName);
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
                            .onClick(async () => {
                                const selfReferentialFiles: string[] = [];
                                let processedCount = 0;

                                for (const file of files) {
                                    const result = await this.renameEngine.renameFile(file, true, true, true);
                                    if (result.success) {
                                        processedCount++;
                                    }
                                }
                            });
                    });
                }

                // Add disable/enable renaming commands for search results
                if (this.settings.vaultSearchContextMenuVisibility.disable) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(`Disable renaming for notes (${files.length} notes)`)
                            .setIcon("square-x")
                            .onClick(async () => {
                                let successCount = 0;
                                let errorCount = 0;

                                for (const file of files) {
                                    try {
                                        const hasProperty = await hasDisablePropertyInFile(file, this.app);
                                        if (!hasProperty) {
                                            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                                frontmatter["no rename"] = "true";
                                            });
                                            successCount++;
                                        }
                                    } catch (error) {
                                        console.error('Failed to disable renaming:', error);
                                        errorCount++;
                                        new Notice(`Failed to disable renaming. Check console for details.`);
                                    }
                                }

                                new Notice(`Disabled renaming for ${successCount} notes.`);
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
                            .onClick(async () => {
                                let successCount = 0;
                                let errorCount = 0;

                                for (const file of files) {
                                    try {
                                        const hasProperty = await hasDisablePropertyInFile(file, this.app);
                                        if (hasProperty) {
                                            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                                delete frontmatter["no rename"];
                                            });
                                            successCount++;
                                        }
                                    } catch (error) {
                                        console.error('Failed to enable renaming:', error);
                                        errorCount++;
                                        new Notice(`Failed to enable renaming. Check console for details.`);
                                    }
                                }

                                new Notice(`Enabled renaming for ${successCount} notes.`);
                            });
                    });
                }
            })
        );

        // REMOVED: Unauthorized modify event processing (violates FLIT Commandments)
        // Only user-initiated changes in open editors are allowed

        // Debug file content monitoring - separate listener for debug output
        this.registerEvent(
            this.app.vault.on("modify", (abstractFile) => {
                if (this.settings.verboseLogging && this.settings.debugOutputFullContent) {
                    if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
                        this.outputDebugFileContent(abstractFile, 'MODIFIED');
                    }
                }
            })
        );

        // Debug file content monitoring for created files
        this.registerEvent(
            this.app.vault.on("create", (abstractFile) => {
                if (this.settings.verboseLogging && this.settings.debugOutputFullContent) {
                    if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
                        // Small delay to ensure file content is available
                        setTimeout(() => {
                            this.outputDebugFileContent(abstractFile, 'CREATED');
                        }, 100);
                    }
                }
            })
        );

        // DISABLED: Handle title insertion on note creation (template conflicts)
        /*
        this.registerEvent(
            this.app.vault.on("create", (abstractFile) => {
                if (this.settings.insertTitleOnCreation && abstractFile instanceof TFile && abstractFile.extension === 'md') {
                    // Small delay to ensure file is fully created and can be processed
                    setTimeout(() => {
                        this.insertTitleOnCreation(abstractFile);
                    }, this.settings.titleInsertionDelay);
                }
            })
        );
        */

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (leaf) => {
                // Handle rename on focus if enabled - process immediately regardless of check interval
                if (this.settings.renameOnFocus && leaf && leaf.view && leaf.view.file && leaf.view.file instanceof TFile && leaf.view.file.extension === 'md') {
                    verboseLog(this, `File focused: ${leaf.view.file.path}`);
                    this.renameEngine.renameFile(leaf.view.file, true, false);
                }

                // No pending changes with immediate processing
            })
        );

        // Additional events to catch file closing scenarios
        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                // No pending changes with immediate processing
            })
        );

        // Note: Removed active-leaf-change handler - polling approach handles missed changes more systematically

        // Listen for layout changes that might indicate file closing
        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                // No pending changes with immediate processing
            })
        );

        // Listen for window beforeunload to catch app closing
        this.registerDomEvent(window, 'beforeunload', () => {
            // No pending changes with immediate processing
            verboseLog(this, 'App closing - immediate processing completed all changes');
        });

        // Keyboard event listeners no longer needed since we process on editor-change events
        // checkInterval = 0: Process immediately on each change
        // checkInterval > 0: Start throttle timer on first change (process N ms after first change, not last)
        this.registerEvent(
            this.app.workspace.on("editor-change", async (editor, info) => {
                verboseLog(this, `Editor change detected for file: ${info.file?.path || 'unknown'}`);

                // Only process if automatic renaming is enabled
                if (this.settings.renameNotes !== "automatically") {
                    verboseLog(this, `Skipping: automatic renaming disabled (${this.settings.renameNotes})`);
                    return;
                }

                // Only process markdown files
                if (!info.file || info.file.extension !== 'md') {
                    verboseLog(this, `Skipping: not markdown file (${info.file?.extension || 'no file'})`);
                    return;
                }

                // Don't process files being created during plugin startup
                if (!this.isFullyLoaded) {
                    verboseLog(this, `Skipping: plugin not fully loaded`);
                    return;
                }

                if (this.settings.checkInterval === 0) {
                    // Process immediately for 0ms interval
                    verboseLog(this, `Processing immediate change for: ${info.file.path}`);
                    await this.renameEngine.processEditorChangeOptimal(editor, info.file);
                } else {
                    // Use throttle for checkInterval > 0
                    verboseLog(this, `Editor changed, starting/checking throttle timer for: ${info.file.path}`);
                    this.editorLifecycle.handleEditorChangeWithThrottle(editor, info.file);
                }
            })
        );

        // Listen for file deletion events to clean up cache
        this.registerEvent(
            this.app.vault.on("delete", (abstractFile) => {
                if (abstractFile instanceof TFile) {
                    // Notify cache manager of file deletion
                    if (this.cacheManager) {
                        this.cacheManager.notifyFileDeleted(abstractFile.path);
                    }
                    verboseLog(this, `File deleted, cleaned up cache: ${abstractFile.path}`);
                }
            })
        );

        // Listen for file rename events to update cache
        this.registerEvent(
            this.app.vault.on("rename", (abstractFile, oldPath) => {
                if (abstractFile instanceof TFile) {
                    // Notify cache manager of file rename
                    if (this.cacheManager) {
                        this.cacheManager.notifyFileRenamed(oldPath, abstractFile.path);
                    }

                    verboseLog(this, `File renamed, updated cache: ${oldPath} -> ${abstractFile.path}`);
                }
            })
        );

        // Listen for metadata cache updates (critical for alias sync)
        this.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                // Clear pending metadata update flag when cache is updated
                if (this.pendingMetadataUpdates.has(file.path)) {
                    this.pendingMetadataUpdates.delete(file.path);
                    verboseLog(this, `Metadata cache updated, cleared pending flag: ${file.path}`);
                }
            })
        );

        // Setup notification suppression to hide external modification notices
        this.propertyManager.setupNotificationSuppression();

        // Setup cursor positioning for new notes
        this.workspaceIntegration.setupCursorPositioning();

        // Setup save event hook for rename on save
        this.workspaceIntegration.setupSaveEventHook();

        // Initialize property visibility
        this.updatePropertyVisibility();

        // Mark plugin as fully loaded after layout is ready to prevent processing existing files on startup
        this.app.workspace.onLayoutReady(() => {
            setTimeout(() => {
                this.isFullyLoaded = true;

                // Initialize the appropriate checking system based on settings after plugin is fully loaded
                this.editorLifecycle.initializeCheckingSystem();

                // Event-driven system: 0ms = immediate, >0ms = throttle (process N ms after editor change)
                verboseLog(this, 'Checking system initialized based on checkInterval setting');
            }, 1000); // Additional delay to ensure all initial file events have been processed
        });
    }

    onunload() {
        // Dispose of cache manager and clean up all resources
        if (this.cacheManager) {
            this.cacheManager.dispose();
            globalCacheManager = null;
        }

        // Clean up editor lifecycle manager
        if (this.editorLifecycle) {
            this.editorLifecycle.clearCheckingSystems();
        }

        // Clean up workspace integration
        if (this.workspaceIntegration) {
            this.workspaceIntegration.cleanup();
        }

        // Clean up notification suppression
        if (this.propertyManager) {
            this.propertyManager.cleanupNotificationSuppression();
        }

        // Clean up property hiding styles and observer
        document.head.querySelector('#flit-hide-property-style')?.remove();
        this.cleanupPropertyObserver();

        // Clean up any pending alias update timers
        aliasUpdateTimers.forEach((timer) => clearTimeout(timer));
        aliasUpdateTimers.clear();

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


}