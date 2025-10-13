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
import { RenameAllFilesModal, RenameFolderModal, ClearSettingsModal, ProcessTagModal, InternalLinkModal, RenameModal, DisableEnableModal } from './src/modals';
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

// High-performance cache system replaces all global variables
import { CacheManager } from './src/core/cache-manager';
import { EditorLifecycleManager } from './src/core/editor-lifecycle';
import { WorkspaceIntegration } from './src/core/workspace-integration';
import { PropertyManager } from './src/core/property-manager';
import { PluginInitializer } from './src/core/plugin-initializer';
import { CommandRegistrar } from './src/core/command-registrar';
import { TitleInsertion } from './src/core/title-insertion';
import { LinkManager } from './src/core/link-manager';

export default class FirstLineIsTitle extends Plugin {
    settings: PluginSettings;
    isFullyLoaded: boolean = false;
    pluginLoadTime: number = 0;

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
    titleInsertion: TitleInsertion;
    linkManager: LinkManager;

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
    outputDebugFileContent(file: TFile, action: string, editorContent?: string): void {
        if (!this.settings.verboseLogging || !this.settings.debugOutputFullContent) {
            return;
        }

        try {
            const content = editorContent ?? 'N/A (no editor content available)';

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
        return this.titleInsertion.insertTitleOnCreation(file);
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

        const exclusionOverrides = { ignoreFolder: true, ignoreTag: true, ignoreProperty: true };

        for (const file of files) {
            try {
                if (action === 'rename') {
                    const result = await this.renameEngine.processFile(file, true, true, undefined, false, exclusionOverrides);
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

    private parsePropertyValue(value: string): string | number | boolean {
        // Try to parse as boolean
        const lowerValue = value.toLowerCase().trim();
        if (lowerValue === 'true') return true;
        if (lowerValue === 'false') return false;

        // Try to parse as number
        if (!isNaN(Number(value)) && value.trim() !== '') {
            return Number(value);
        }

        // Return as string
        return value;
    }

    async disableRenamingForNote(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice("Error: no active note.");
            return;
        }

        // Ensure property type is set to checkbox before adding property
        await this.propertyManager.ensurePropertyTypeIsCheckbox();

        // Check if property already exists
        const hasProperty = await hasDisablePropertyInFile(activeFile, this.app);

        try {
            if (!hasProperty) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    frontmatter[this.settings.disableRenamingKey] = this.parsePropertyValue(this.settings.disableRenamingValue);
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
                    delete frontmatter[this.settings.disableRenamingKey];
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
        return this.linkManager.addSafeInternalLink();
    }

    async addSafeInternalLinkWithCaption(): Promise<void> {
        return this.linkManager.addSafeInternalLinkWithCaption();
    }

    updatePropertyVisibility(): void {
        this.propertyVisibility.updatePropertyVisibility();
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

    getCurrentTimestamp(): string {
        const now = new Date();
        return now.getFullYear() + '-' +
               String(now.getMonth() + 1).padStart(2, '0') + '-' +
               String(now.getDate()).padStart(2, '0') + ' ' +
               String(now.getHours()).padStart(2, '0') + ':' +
               String(now.getMinutes()).padStart(2, '0');
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

    // Track FLIT modifications to suppress debug output
    private flitModifications = new Set<string>();

    markFlitModificationStart(path: string): void {
        this.flitModifications.add(path);
    }

    markFlitModificationEnd(path: string): void {
        setTimeout(() => {
            this.flitModifications.delete(path);
        }, 100);
    }

    // Track batch operations to suppress debug output
    private batchOperations = new Set<string>();

    markBatchOperationStart(path: string): void {
        this.batchOperations.add(path);
    }

    markBatchOperationEnd(path: string): void {
        setTimeout(() => {
            this.batchOperations.delete(path);
        }, 100);
    }

    async onload(): Promise<void> {
        this.pluginLoadTime = Date.now();
        await this.loadSettings();

        // Reset Debug mode if more than 24 hours have passed since it was enabled
        if (this.settings.verboseLogging && this.settings.debugEnabledTimestamp) {
            const enabledTime = new Date(this.settings.debugEnabledTimestamp).getTime();
            const currentTime = new Date().getTime();
            const hoursPassed = (currentTime - enabledTime) / (1000 * 60 * 60);

            if (hoursPassed >= 24) {
                this.settings.verboseLogging = false;
                await this.saveSettings();
            }
        }

        // Initialize high-performance cache system
        this.cacheManager = new CacheManager(this);

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

        // Initialize file operations (required by workspace integration)
        this.fileOperations = new FileOperations(this);

        // Initialize editor lifecycle manager
        this.editorLifecycle = new EditorLifecycleManager(this);

        // Initialize workspace integration manager
        this.workspaceIntegration = new WorkspaceIntegration(this);

        // Initialize property manager
        this.propertyManager = new PropertyManager(this);

        // Initialize title insertion manager
        this.titleInsertion = new TitleInsertion(this);

        // Initialize link manager
        this.linkManager = new LinkManager(this);

        // Initialize property visibility manager
        this.propertyVisibility = new PropertyVisibility(this);

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
                                    const exclusionOverrides = { ignoreFolder: true, ignoreTag: true, ignoreProperty: true };
                                    await this.renameEngine.processFile(file, true, false, true, undefined, false, exclusionOverrides);
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
                            const expectedValue = String(this.settings.disableRenamingValue).toLowerCase();
                            hasDisableProperty = valueStr === expectedValue;
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
                                        // Ensure property type is set to checkbox before adding property
                                        await this.propertyManager.ensurePropertyTypeIsCheckbox();

                                        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                                            frontmatter[this.settings.disableRenamingKey] = this.parsePropertyValue(this.settings.disableRenamingValue);
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
                                            delete frontmatter[this.settings.disableRenamingKey];
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

        // Add multi-file/folder context menu handlers
        this.registerEvent(
            this.app.workspace.on("files-menu", (menu, files) => {
                // Only show context menu commands if master toggle is enabled
                if (!this.settings.enableContextMenus) return;

                // Filter for markdown files and folders
                const markdownFiles = files.filter(file => file instanceof TFile && file.extension === 'md') as TFile[];
                const folders = files.filter(file => file instanceof TFolder) as TFolder[];

                // If both files and folders are selected, don't show any commands
                if (markdownFiles.length > 0 && folders.length > 0) return;

                // If neither files nor folders, exit
                if (markdownFiles.length === 0 && folders.length === 0) return;

                let hasVisibleItems = false;

                // Handle multiple markdown files
                if (markdownFiles.length > 0) {
                    // Add "Put first line in title" command for multiple files
                    if (this.settings.commandVisibility.filePutFirstLineInTitle) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle(`Put first line in title (${markdownFiles.length} notes)`)
                                .setIcon("file-pen")
                                .onClick(async () => {
                                    new RenameModal(this.app, this, markdownFiles).open();
                                });
                        });
                    }

                    // Add disable renaming command for multiple files
                    if (this.settings.commandVisibility.fileExclude) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle(`Disable renaming (${markdownFiles.length} notes)`)
                                .setIcon("square-x")
                                .onClick(async () => {
                                    new DisableEnableModal(this.app, this, markdownFiles, 'disable').open();
                                });
                        });
                    }

                    // Add enable renaming command for multiple files
                    if (this.settings.commandVisibility.fileStopExcluding) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle(`Enable renaming (${markdownFiles.length} notes)`)
                                .setIcon("square-check")
                                .onClick(async () => {
                                    new DisableEnableModal(this.app, this, markdownFiles, 'enable').open();
                                });
                        });
                    }
                }

                // Handle multiple folders
                if (folders.length > 1) {
                    this.contextMenuManager.addMultiFolderMenuItems(menu, folders);
                }
            })
        );

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

                    if (Menu.forEvent) {
                        const remove2 = around(Menu, {forEvent(old) { return function (ev: Event) {
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
                                new RenameModal(this.app, this, files).open();
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
                            .setTitle(`Disable renaming (${files.length} notes)`)
                            .setIcon("square-x")
                            .onClick(async () => {
                                new DisableEnableModal(this.app, this, files, 'disable').open();
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
                            .setTitle(`Enable renaming (${files.length} notes)`)
                            .setIcon("square-check")
                            .onClick(async () => {
                                new DisableEnableModal(this.app, this, files, 'enable').open();
                            });
                    });
                }
            })
        );


        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (leaf) => {
                if (this.settings.renameOnFocus && leaf && leaf.view && leaf.view.file && leaf.view.file instanceof TFile && leaf.view.file.extension === 'md') {
                    verboseLog(this, `File focused: ${leaf.view.file.path}`);
                    this.renameEngine.processFile(leaf.view.file, true);
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on("editor-change", async (editor, info) => {
                verboseLog(this, `Editor change detected for file: ${info.file?.path || 'unknown'}`);

                // Check for YAML insertion to resolve waitForYamlOrTimeout early
                if (info.file && editor) {
                    const content = editor.getValue();
                    this.fileOperations.checkYamlAndResolve(info.file, content);

                    // Debug output current editor content
                    this.outputDebugFileContent(info.file, 'MODIFIED', content);
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

                if (this.settings.checkInterval === 0) {
                    verboseLog(this, `Processing immediate change for: ${info.file.path}`);
                    await this.renameEngine.processEditorChangeOptimal(editor, info.file);
                } else {
                    verboseLog(this, `Editor changed, starting/checking throttle timer for: ${info.file.path}`);
                    this.editorLifecycle.handleEditorChangeWithThrottle(editor, info.file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("delete", (abstractFile) => {
                if (abstractFile instanceof TFile) {
                    if (this.cacheManager) {
                        this.cacheManager.notifyFileDeleted(abstractFile.path);
                    }
                    verboseLog(this, `File deleted, cleaned up cache: ${abstractFile.path}`);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("rename", (abstractFile, oldPath) => {
                if (abstractFile instanceof TFile) {
                    if (this.cacheManager) {
                        this.cacheManager.notifyFileRenamed(oldPath, abstractFile.path);
                    }
                    verboseLog(this, `File renamed, updated cache: ${oldPath} -> ${abstractFile.path}`);
                }
            })
        );

        this.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
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
                this.editorLifecycle.initializeCheckingSystem();
                verboseLog(this, 'Checking system initialized based on checkInterval setting');
            }, 1000);
        });
    }

    onunload() {
        if (this.cacheManager) {
            this.cacheManager.dispose();
        }

        if (this.editorLifecycle) {
            this.editorLifecycle.clearCheckingSystems();
        }

        if (this.workspaceIntegration) {
            this.workspaceIntegration.cleanup();
        }

        if (this.propertyManager) {
            this.propertyManager.cleanupNotificationSuppression();
        }

        if (this.propertyVisibility) {
            this.propertyVisibility.cleanup();
        }

        if (this.cacheManager) {
            this.cacheManager.clearAllAliasTimers();
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

        if (!this.settings.scopeStrategy) {
            this.settings.scopeStrategy = 'Enable in all notes except below';
        }

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