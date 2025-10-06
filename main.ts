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

    // Dynamic event listener references for mode-based switching
    private editorChangeListeners: any[] = [];
    private modifyEventListener: any = null;

    // Debug file content tracking for change detection
    private fileContentBeforeChange: Map<string, string> = new Map();
    private flitModifiedFiles: Set<string> = new Set();
    private batchOperationFiles: Set<string> = new Set();

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

    // Track FLIT modifications
    markFlitModificationStart(filePath: string): void {
        this.flitModifiedFiles.add(filePath);
    }

    markFlitModificationEnd(filePath: string): void {
        // Keep the flag for a short time to catch the modify event
        setTimeout(() => {
            this.flitModifiedFiles.delete(filePath);
        }, 1000);
    }

    isFlitModification(filePath: string): boolean {
        return this.flitModifiedFiles.has(filePath);
    }

    // Track batch operations
    markBatchOperationStart(filePath: string): void {
        this.batchOperationFiles.add(filePath);
    }

    markBatchOperationEnd(filePath: string): void {
        this.batchOperationFiles.delete(filePath);
    }

    isInBatchOperation(filePath: string): boolean {
        return this.batchOperationFiles.has(filePath);
    }

    // Debug file content output
    async outputDebugFileContent(file: TFile, action: string, providedContent?: string): Promise<void> {
        if (!this.settings.verboseLogging || !this.settings.debugOutputFullContent) {
            return;
        }

        // Skip output for batch operations
        if (this.isInBatchOperation(file.path)) {
            return;
        }

        try {
            const content = providedContent !== undefined ? providedContent : await this.app.vault.read(file);

            // For OPENED and CREATED actions, output full content
            if (action === 'OPENED' || action === 'CREATED') {
                console.debug(`CONTENT [${action}] ${file.path}:`);
                console.debug('--- FILE CONTENT START ---');
                console.debug(content);
                console.debug('--- FILE CONTENT END ---');
                return;
            }

            // For MODIFIED action, output only changed lines
            if (action === 'MODIFIED') {
                const previousContent = this.fileContentBeforeChange.get(file.path);

                if (!previousContent) {
                    // No previous content tracked, output full content
                    console.debug(`CONTENT [${action}] ${file.path}:`);
                    console.debug('--- FILE CONTENT START ---');
                    console.debug(content);
                    console.debug('--- FILE CONTENT END ---');
                } else {
                    // Compare and output only changed lines
                    const previousLines = previousContent.split('\n');
                    const currentLines = content.split('\n');
                    const changedLines: {lineNum: number, content: string}[] = [];

                    const maxLines = Math.max(previousLines.length, currentLines.length);
                    for (let i = 0; i < maxLines; i++) {
                        if (previousLines[i] !== currentLines[i]) {
                            changedLines.push({
                                lineNum: i + 1,
                                content: currentLines[i] || ''
                            });
                        }
                    }

                    if (changedLines.length > 0) {
                        const isFlitMod = this.isFlitModification(file.path);
                        const modSource = isFlitMod ? 'MODIFYING' : 'MODIFIED';
                        console.debug(`CONTENT [${modSource}] ${file.path}:`);
                        console.debug('--- MODIFIED LINES START ---');
                        for (const change of changedLines) {
                            console.debug(`Line ${change.lineNum}: ${change.content}`);
                        }
                        console.debug('--- MODIFIED LINES END ---');
                    }
                }

                // Update stored content for next comparison
                this.fileContentBeforeChange.set(file.path, content);
            }
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

        verboseLog(this, `Showing notice: Processing ${files.length} files...`);
        new Notice(`Processing ${files.length} files...`);

        for (const file of files) {
            try {
                if (action === 'rename') {
                    // Run the "even if excluded" version with batch operation flag
                    const result = await this.renameEngine.processFile(file, true, true, true, undefined, true);
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
            verboseLog(this, `Showing notice: Completed: ${processed} renamed, ${skipped} skipped, ${errors} errors`);
            new Notice(`Completed: ${processed} renamed, ${skipped} skipped, ${errors} errors`);
        } else {
            verboseLog(this, `Showing notice: Successfully processed ${processed} files. ${skipped} skipped.`);
            new Notice(`Successfully processed ${processed} files. ${skipped} skipped.`);
        }
    }





    async registerDynamicCommands(): Promise<void> {
        if (!this.settings.enableCommandPalette) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') return;

        // Check if the disable property exists in the current file
        const hasDisableProperty = await hasDisablePropertyInFile(activeFile, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue);

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
            verboseLog(this, `Showing notice: No active editor`);
            new Notice("No active editor");
            return;
        }

        // Check if property already exists
        const hasProperty = await hasDisablePropertyInFile(activeFile, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue);

        try {
            if (!hasProperty) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    frontmatter[this.settings.disableRenamingKey] = this.settings.disableRenamingValue;
                });
                // Re-register commands to reflect new state
                await this.registerDynamicCommands();
            }

            verboseLog(this, `Showing notice: Disabled renaming for ${activeFile.name}`);
            new Notice(`Disabled renaming for ${activeFile.name}`);
        } catch (error) {
            verboseLog(this, `Showing notice: Failed to disable renaming: ${error.message}`);
            new Notice(`Failed to disable renaming: ${error.message}`);
        }
    }

    async enableRenamingForNote(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            verboseLog(this, `Showing notice: No active editor`);
            new Notice("No active editor");
            return;
        }

        // Check if property exists
        const hasProperty = await hasDisablePropertyInFile(activeFile, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue);

        try {
            if (hasProperty) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    delete frontmatter[this.settings.disableRenamingKey];
                });
                // Re-register commands to reflect new state
                await this.registerDynamicCommands();
            }

            verboseLog(this, `Showing notice: Enabled renaming for ${activeFile.name}`);
            new Notice(`Enabled renaming for ${activeFile.name}`);
        } catch (error) {
            verboseLog(this, `Showing notice: Failed to enable renaming: ${error.message}`);
            new Notice(`Failed to enable renaming: ${error.message}`);
        }
    }

    async addSafeInternalLink(): Promise<void> {
        // Try to get active editor from any view type (markdown, canvas, etc.)
        const activeEditor = this.app.workspace.activeEditor?.editor;
        if (!activeEditor) {
            verboseLog(this, `Showing notice: No active editor`);
            new Notice("No active editor");
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
            verboseLog(this, `Showing notice: No active editor`);
            new Notice("No active editor");
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

        // Check for first-time setup
        if (!this.settings.hasShownFirstTimeNotice) {
            this.showFirstTimeNotice();
            return;
        }

        // Check for long inactivity (30+ days) - only if automatic renaming is enabled
        if (this.settings.lastUsageDate &&
            this.isInactive(this.settings.lastUsageDate, today) &&
            this.settings.renameNotes === 'automatically') {
            this.showInactivityNotice();
        }

        // Update last usage date (after checks to avoid overwriting old dates)
        this.updateLastUsageDate(today);
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
        verboseLog(this, `Showing notice: Please open First Line is Title settings to set your preferences. Ensure your files are regularly backed up.`);
        new Notice("Please open First Line is Title settings to set your preferences. Ensure your files are regularly backed up.", 10000);
        this.settings.hasShownFirstTimeNotice = true;
        this.saveSettings();
    }

    private showInactivityNotice(): void {
        verboseLog(this, `Showing notice: Please open First Line is Title settings to set your preferences. Ensure your files are regularly backed up.`);
        new Notice("Please open First Line is Title settings to set your preferences. Ensure your files are regularly backed up.", 10000);
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

        // Disable debug if last used on a different day
        const today = this.getTodayDateString();
        if (this.settings.lastUsageDate !== today && this.settings.verboseLogging) {
            this.settings.verboseLogging = false;
            await this.saveSettings();
        }

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

        // Initialize file operations
        this.fileOperations = new FileOperations(this);

        // Initialize property manager
        this.propertyManager = new PropertyManager(this);

        // Always disable debug mode on plugin load (don't preserve ON state)
        // TODO: Re-enable this later if needed
        // this.settings.verboseLogging = false;

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
                                    await this.renameEngine.processFile(file, true, true, true);
                                });
                        });
                    }

                    // Add file exclusion commands using frontmatter properties
                    // Use synchronous check with cached metadata instead of async file read
                    const fileCache = this.app.metadataCache.getFileCache(file);
                    let hasDisableProperty = false;

                    if (fileCache && fileCache.frontmatter) {
                        const frontmatter = fileCache.frontmatter;
                        const value = frontmatter[this.settings.disableRenamingKey];
                        if (value !== undefined) {
                            // Handle different value formats (string, number, boolean)
                            const valueStr = String(value).toLowerCase();
                            hasDisableProperty = valueStr === this.settings.disableRenamingValue.toLowerCase();
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
                                            frontmatter[this.settings.disableRenamingKey] = this.settings.disableRenamingValue;
                                        });
                                        verboseLog(this, `Showing notice: Disabled renaming for ${file.name}`);
                                        new Notice(`Disabled renaming for ${file.name}`);
                                    } catch (error) {
                                        verboseLog(this, `Showing notice: Failed to disable renaming: ${error.message}`);
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
                                .onClick(async () => {
                                    try {
                                        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                            delete frontmatter[this.settings.disableRenamingKey];
                                        });
                                        verboseLog(this, `Showing notice: Enabled renaming for ${file.name}`);
                                        new Notice(`Enabled renaming for ${file.name}`);
                                    } catch (error) {
                                        verboseLog(this, `Showing notice: Failed to enable renaming: ${error.message}`);
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
                            .setTitle("Put first line in title")
                            .setIcon("file-pen")
                            .onClick(async () => {
                                await this.processMultipleFiles(markdownFiles, 'rename');
                            });
                    });
                }

                // Add "Disable renaming for notes" command for multiple files
                if (this.settings.commandVisibility.fileExclude) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle("Disable renaming for notes")
                            .setIcon("square-x")
                            .onClick(async () => {
                                let successCount = 0;
                                let errorCount = 0;

                                for (const file of markdownFiles) {
                                    try {
                                        const hasProperty = await hasDisablePropertyInFile(file, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue);
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
                                    verboseLog(this, `Showing notice: Disabled renaming for ${successCount} notes with ${errorCount} errors`);
                                    new Notice(`Disabled renaming for ${successCount} notes with ${errorCount} errors`);
                                } else {
                                    verboseLog(this, `Showing notice: Disabled renaming for ${successCount} notes`);
                                    new Notice(`Disabled renaming for ${successCount} notes`);
                                }
                            });
                    });
                }

                // Add "Enable renaming for notes" command for multiple files
                if (this.settings.commandVisibility.fileStopExcluding) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle("Enable renaming for notes")
                            .setIcon("square-check")
                            .onClick(async () => {
                                let successCount = 0;
                                let errorCount = 0;

                                for (const file of markdownFiles) {
                                    try {
                                        const hasProperty = await hasDisablePropertyInFile(file, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue);
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
                                    verboseLog(this, `Showing notice: Enabled renaming for ${successCount} notes with ${errorCount} errors`);
                                    new Notice(`Enabled renaming for ${successCount} notes with ${errorCount} errors`);
                                } else {
                                    verboseLog(this, `Showing notice: Enabled renaming for ${successCount} notes`);
                                    new Notice(`Enabled renaming for ${successCount} notes`);
                                }
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
                                    const result = await this.renameEngine.processFile(file, true, true, true, undefined, true);
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

                                    verboseLog(this, `Showing notice: ${selfReferentialFiles.length} file${selfReferentialFiles.length === 1 ? '' : 's'} not renamed due to self-referential link${selfReferentialFiles.length === 1 ? '' : 's'} in first line: ${fileList}`);
                                    new Notice(`${selfReferentialFiles.length} file${selfReferentialFiles.length === 1 ? '' : 's'} not renamed due to self-referential link${selfReferentialFiles.length === 1 ? '' : 's'} in first line: ${fileList}`, 0);
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
                                        const hasProperty = await hasDisablePropertyInFile(file, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue);
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
                                    verboseLog(this, `Showing notice: Disabled renaming for ${successCount} notes with ${errorCount} errors`);
                                    new Notice(`Disabled renaming for ${successCount} notes with ${errorCount} errors`);
                                } else {
                                    verboseLog(this, `Showing notice: Disabled renaming for ${successCount} notes`);
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
                            .onClick(async () => {
                                let successCount = 0;
                                let errorCount = 0;

                                for (const file of files) {
                                    try {
                                        const hasProperty = await hasDisablePropertyInFile(file, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue);
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
                                    verboseLog(this, `Showing notice: Enabled renaming for ${successCount} notes with ${errorCount} errors`);
                                    new Notice(`Enabled renaming for ${successCount} notes with ${errorCount} errors`);
                                } else {
                                    verboseLog(this, `Showing notice: Enabled renaming for ${successCount} notes`);
                                    new Notice(`Enabled renaming for ${successCount} notes`);
                                }
                            });
                    });
                }
            })
        );

        // Dynamic event listeners - setup based on fileReadMethod
        // Editor mode → editor-change events
        // Cache/File modes → modify events
        this.setupEventListeners();

        // Debug file content monitoring for opened files
        this.registerEvent(
            this.app.workspace.on("file-open", async (file) => {
                if (this.settings.verboseLogging && this.settings.debugOutputFullContent) {
                    if (file && file.extension === 'md') {
                        // Output full content when file opens
                        await this.outputDebugFileContent(file, 'OPENED');

                        // Store content for later comparison
                        try {
                            const content = await this.app.vault.read(file);
                            this.fileContentBeforeChange.set(file.path, content);
                        } catch (error) {
                            console.debug(`Failed to store content for ${file.path}:`, error);
                        }
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
                    }, this.settings.newNoteDelay);
                }
            })
        );
        */

        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (leaf) => {
                // Handle rename on focus if enabled - process immediately regardless of check interval
                if (this.settings.renameNotes === "automatically" && this.settings.renameOnFocus && leaf && leaf.view && leaf.view.file && leaf.view.file instanceof TFile && leaf.view.file.extension === 'md') {
                    // Skip files in creation delay
                    if (this.editorLifecycle.isFileInCreationDelay(leaf.view.file.path)) {
                        verboseLog(this, `File in creation delay, skipping rename on focus: ${leaf.view.file.path}`);
                    } else {
                        verboseLog(this, `File focused: ${leaf.view.file.path}`);
                        this.renameEngine.processFile(leaf.view.file, true, false);
                    }
                }

                // Check for tab closures with pending throttle timers
                if (this.settings.checkInterval > 0 && this.editorLifecycle) {
                    verboseLog(this, 'active-leaf-change event: checking for closed tabs with pending throttles');
                    this.editorLifecycle.updateActiveEditorTracking();
                }
            })
        );

        // Additional events to catch file closing scenarios
        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                // Check for tab closures with pending throttle timers
                if (this.settings.checkInterval > 0 && this.editorLifecycle) {
                    verboseLog(this, 'file-open event: checking for closed tabs with pending throttles');
                    this.editorLifecycle.updateActiveEditorTracking();
                }
            })
        );

        // Note: Removed active-leaf-change handler - polling approach handles missed changes more systematically

        // Listen for layout changes that might indicate file closing
        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                // Check for tab closures with pending throttle timers
                if (this.settings.checkInterval > 0 && this.editorLifecycle) {
                    verboseLog(this, 'layout-change event: checking for closed tabs with pending throttles');
                    this.editorLifecycle.updateActiveEditorTracking();
                }
            })
        );

        // Listen for window beforeunload to catch app closing
        this.registerDomEvent(window, 'beforeunload', () => {
            // No pending changes with immediate processing
            verboseLog(this, 'App closing - immediate processing completed all changes');
        });


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

    /**
     * Setup event listeners based on fileReadMethod
     * Editor mode → editor-change events
     * Cache/File modes → modify events
     */
    private setupEventListeners(): void {
        // Clean up any existing listeners first
        this.teardownDynamicListeners();

        if (this.settings.fileReadMethod === 'Editor') {
            this.setupEditorModeListeners();
        } else {
            this.setupFileSystemModeListeners();
        }
    }

    /**
     * Setup editor-change listeners for Editor mode
     */
    private setupEditorModeListeners(): void {
        // YAML template detection
        const yamlListener = this.registerEvent(
            this.app.workspace.on("editor-change", async (editor, info) => {
                if (info.file && info.file.extension === 'md') {
                    const content = editor.getValue();
                    this.fileOperations.checkYamlAndResolve(info.file, content);
                }
            })
        );
        this.editorChangeListeners.push(yamlListener);

        // Rename processing
        const renameListener = this.registerEvent(
            this.app.workspace.on("editor-change", async (editor, info) => {
                verboseLog(this, `Editor change detected for file: ${info.file?.path || 'unknown'}`);

                // Debug output for editor changes
                if (this.settings.verboseLogging && this.settings.debugOutputFullContent && info.file && info.file.extension === 'md') {
                    // Output modified lines with current editor content
                    await this.outputDebugFileContent(info.file, 'MODIFIED', editor.getValue());
                }

                if (this.settings.renameNotes !== "automatically") {
                    verboseLog(this, `Skipping: automatic renaming disabled (${this.settings.renameNotes})`);
                    return;
                }

                if (!info.file || info.file.extension !== 'md') {
                    verboseLog(this, `Skipping: not markdown file (${info.file?.extension || 'no file'})`);
                    return;
                }

                if (!this.isFullyLoaded) {
                    verboseLog(this, `Skipping: plugin not fully loaded`);
                    return;
                }

                if (this.editorLifecycle.isFileInCreationDelay(info.file.path)) {
                    verboseLog(this, `Skipping: file in creation delay - ${info.file.path}`);
                    return;
                }

                if (this.settings.checkInterval === 0) {
                    verboseLog(this, `Processing immediate change for: ${info.file.path}`);
                    await this.renameEngine.processEditorChangeOptimal(editor, info.file);
                } else {
                    verboseLog(this, `Editor changed, starting/checking throttle timer for: ${info.file.path}`);
                    this.editorLifecycle.handleEditorChangeWithThrottle(editor, info.file);
                }
            })
        );
        this.editorChangeListeners.push(renameListener);

        verboseLog(this, 'Setup complete: Editor mode listeners registered');
    }

    /**
     * Setup modify listeners for Cache/File modes
     */
    private setupFileSystemModeListeners(): void {
        this.modifyEventListener = this.registerEvent(
            this.app.vault.on("modify", async (abstractFile) => {
                if (!(abstractFile instanceof TFile) || abstractFile.extension !== 'md') {
                    return;
                }

                // Debug output - store content before change and output modified lines
                if (this.settings.verboseLogging && this.settings.debugOutputFullContent) {
                    await this.outputDebugFileContent(abstractFile, 'MODIFIED');
                }

                if (this.settings.renameNotes !== "automatically") {
                    return;
                }

                if (!this.isFullyLoaded) {
                    return;
                }

                if (this.editorLifecycle.isFileInCreationDelay(abstractFile.path)) {
                    return;
                }

                verboseLog(this, `File modify event - processing with ${this.settings.fileReadMethod} mode: ${abstractFile.path}`);
                await this.renameEngine.processFile(abstractFile, true, false, false);
            })
        );

        verboseLog(this, `Setup complete: ${this.settings.fileReadMethod} mode listener registered`);
    }

    /**
     * Teardown dynamic event listeners (mode-specific ones)
     */
    private teardownDynamicListeners(): void {
        // Unregister editor-change listeners
        for (const listener of this.editorChangeListeners) {
            this.app.workspace.offref(listener);
        }
        this.editorChangeListeners = [];

        // Unregister modify listener
        if (this.modifyEventListener) {
            this.app.vault.offref(this.modifyEventListener);
            this.modifyEventListener = null;
        }

        verboseLog(this, 'Teardown complete: Dynamic listeners unregistered');
    }

    /**
     * Switch event listeners when fileReadMethod changes
     */
    switchFileReadMode(newMode: string): void {
        verboseLog(this, `Switching file read mode from ${this.settings.fileReadMethod} to ${newMode}`);
        this.settings.fileReadMethod = newMode as any;
        this.setupEventListeners();
    }


}