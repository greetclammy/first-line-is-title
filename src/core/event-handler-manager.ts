import { Menu, TFile, TFolder, Editor, MarkdownView, EventRef, getFrontMatterInfo } from 'obsidian';
import FirstLineIsTitlePlugin from '../../main';
import { verboseLog, canModifyFile } from '../utils';
import { t, tp } from '../i18n';
import { RenameModal, DisableEnableModal } from '../modals';
import { around } from 'monkey-around';
import { detectTagFromDOM, detectTagFromEditor } from '../utils/tag-detection';

/**
 * Manages all event handler registration for the First Line is Title plugin.
 * Centralizes event handler logic previously scattered in main.ts.
 */
export class EventHandlerManager {
    private plugin: FirstLineIsTitlePlugin;
    private registeredEvents: EventRef[] = [];
    private cursorDebugUninstaller?: () => void;

    constructor(plugin: FirstLineIsTitlePlugin) {
        this.plugin = plugin;
    }

    /**
     * Register all event handlers for the plugin.
     * Called during plugin load.
     */
    registerAllHandlers(): void {
        this.registerFileMenuHandler();
        this.registerFilesMenuHandler();
        this.registerEditorMenuHandler();
        this.registerTagSearchMenuHandler();
        this.registerSearchResultsMenuHandler();
        this.registerEditorChangeHandler();
        this.registerFileSystemHandlers();
        this.registerActiveLeafChangeHandler();
        this.setupCursorDebugInterceptor();
    }

    /**
     * Unregister all event handlers.
     * Called during plugin unload.
     */
    unregisterAllHandlers(): void {
        this.registeredEvents.forEach(ref => this.plugin.app.workspace.offref(ref));
        this.registeredEvents = [];

        // Clean up cursor debug interceptor if installed
        if (this.cursorDebugUninstaller) {
            this.cursorDebugUninstaller();
            this.cursorDebugUninstaller = undefined;
        }
    }

    /**
     * Register a single event and track it for cleanup
     */
    private registerEvent(event: EventRef): void {
        this.plugin.registerEvent(event);
        this.registeredEvents.push(event);
    }

    /**
     * File menu handler - single file/folder context menu
     */
    private registerFileMenuHandler(): void {
        this.registerEvent(
            this.plugin.app.workspace.on("file-menu", (menu, file) => {
                if (!this.plugin.settings.core.enableContextMenus) return;

                if (file instanceof TFile && file.extension === 'md') {
                    this.plugin.contextMenuManager.addFileMenuItems(menu, file);
                } else if (file instanceof TFolder) {
                    this.plugin.contextMenuManager.addFolderMenuItems(menu, file);
                }
            })
        );
    }

    /**
     * Files menu handler - multiple files/folders selection
     */
    private registerFilesMenuHandler(): void {
        this.registerEvent(
            this.plugin.app.workspace.on("files-menu", (menu, files) => {
                if (!this.plugin.settings.core.enableContextMenus) return;

                const markdownFiles = files.filter(file => file instanceof TFile && file.extension === 'md') as TFile[];
                const folders = files.filter(file => file instanceof TFolder) as TFolder[];

                // If both files and folders are selected, don't show any commands
                if (markdownFiles.length > 0 && folders.length > 0) return;
                if (markdownFiles.length === 0 && folders.length === 0) return;

                let hasVisibleItems = false;

                // Handle multiple markdown files
                if (markdownFiles.length > 0) {
                    if (this.plugin.settings.core.commandVisibility.filePutFirstLineInTitle) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle(tp('commands.putFirstLineInTitleNNotes', markdownFiles.length))
                                .setIcon("file-pen")
                                .onClick(async () => {
                                    new RenameModal(this.plugin.app, this.plugin, markdownFiles).open();
                                });
                        });
                    }

                    if (this.plugin.settings.core.commandVisibility.fileExclude) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle(tp('commands.disableRenamingNNotes', markdownFiles.length))
                                .setIcon("square-x")
                                .onClick(async () => {
                                    new DisableEnableModal(this.plugin.app, this.plugin, markdownFiles, 'disable').open();
                                });
                        });
                    }

                    if (this.plugin.settings.core.commandVisibility.fileStopExcluding) {
                        if (!hasVisibleItems) {
                            menu.addSeparator();
                            hasVisibleItems = true;
                        }
                        menu.addItem((item) => {
                            item
                                .setTitle(tp('commands.enableRenamingNNotes', markdownFiles.length))
                                .setIcon("square-check")
                                .onClick(async () => {
                                    new DisableEnableModal(this.plugin.app, this.plugin, markdownFiles, 'enable').open();
                                });
                        });
                    }
                }

                // Handle multiple folders
                if (folders.length > 1) {
                    this.plugin.contextMenuManager.addMultiFolderMenuItems(menu, folders);
                }
            })
        );
    }

    /**
     * Editor menu handler - tag context menus in editor.
     * Uses unified tag detection for hashtags in note body.
     */
    private registerEditorMenuHandler(): void {
        this.registerEvent(
            this.plugin.app.workspace.on("editor-menu", (menu, editor, view) => {
                if (!this.plugin.settings.core.enableContextMenus) return;
                if (!(view instanceof MarkdownView)) return;

                const pos = editor.getCursor();
                const line = editor.getLine(pos.line);
                const tagName = detectTagFromEditor(line, pos.ch);

                if (tagName) {
                    this.plugin.contextMenuManager.addTagMenuItems(menu, tagName);
                }
            })
        );
    }

    /**
     * Unified tag context menu handler using event delegation.
     * Handles both tag pane and YAML frontmatter tags with a single DOM listener.
     */
    private registerTagSearchMenuHandler(): void {
        // Single event-delegated handler for all DOM-based tag contexts
        this.plugin.registerDomEvent(document, 'contextmenu', (evt) => {
            if (!this.plugin.settings.core.enableContextMenus) return;

            const target = evt.target as HTMLElement;
            const tagInfo = detectTagFromDOM(target);

            if (!tagInfo) return;

            // Different handling based on where tag was found
            if (tagInfo.location === 'tag-pane') {
                // Tag pane: use Tag Wrangler's menuForEvent pattern
                const menu = this.plugin.contextMenuManager.menuForEvent(evt);
                this.plugin.contextMenuManager.addTagMenuItems(menu, tagInfo.tagName);
            } else if (tagInfo.location === 'yaml') {
                // YAML tags: use monkey-patching to inject into Obsidian's native menu
                const plugin = this.plugin;
                const remove = around(Menu.prototype, {
                    showAtPosition(old) {
                        return function (...args) {
                            remove();
                            plugin.contextMenuManager.addTagMenuItems(this, tagInfo.tagName);
                            return old.apply(this, args);
                        }
                    }
                });
            }
        });
    }

    /**
     * Search results menu handler
     */
    private registerSearchResultsMenuHandler(): void {
        this.registerEvent(
            // Undocumented workspace event type - not in official API
            this.plugin.app.workspace.on("search:results-menu" as any, (menu: Menu, leaf: any) => {
                if (!this.plugin.settings.core.enableVaultSearchContextMenu) return;

                // Extract files from search results DOM structure
                let files: TFile[] = [];
                if (leaf.dom?.vChildren?.children) {
                    leaf.dom.vChildren.children.forEach((e: any) => {
                        if (e.file && e.file instanceof TFile && e.file.extension === 'md') {
                            files.push(e.file);
                        }
                    });
                }

                if (files.length < 1) return;

                let hasVisibleItems = false;

                if (this.plugin.settings.core.vaultSearchContextMenuVisibility.putFirstLineInTitle) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(tp('commands.putFirstLineInTitleNNotes', files.length))
                            .setIcon("file-pen")
                            .onClick(async () => {
                                new RenameModal(this.plugin.app, this.plugin, files).open();
                            });
                    });
                }

                if (this.plugin.settings.core.vaultSearchContextMenuVisibility.disable) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(tp('commands.disableRenamingNNotes', files.length))
                            .setIcon("square-x")
                            .onClick(async () => {
                                new DisableEnableModal(this.plugin.app, this.plugin, files, 'disable').open();
                            });
                    });
                }

                if (this.plugin.settings.core.vaultSearchContextMenuVisibility.enable) {
                    if (!hasVisibleItems) {
                        menu.addSeparator();
                        hasVisibleItems = true;
                    }
                    menu.addItem((item) => {
                        item
                            .setTitle(tp('commands.enableRenamingNNotes', files.length))
                            .setIcon("square-check")
                            .onClick(async () => {
                                new DisableEnableModal(this.plugin.app, this.plugin, files, 'enable').open();
                            });
                    });
                }
            })
        );
    }

    /**
     * Editor change handler - processes file changes in real-time
     */
    private registerEditorChangeHandler(): void {
        this.registerEvent(
            this.plugin.app.workspace.on("editor-change", async (editor, info) => {
                if (this.plugin.settings.core.verboseLogging) {
                    console.debug(`Editor change detected for file: ${info.file?.path || 'unknown'}`);
                }

                if (this.plugin.settings.core.renameNotes !== "automatically") {
                    if (this.plugin.settings.core.verboseLogging) {
                        console.debug(`Skipping editor-change: renameNotes=${this.plugin.settings.core.renameNotes}`);
                    }
                    return;
                }

                if (!info.file) {
                    if (this.plugin.settings.core.verboseLogging) {
                        console.debug(`Skipping editor-change: no file in info`);
                    }
                    return;
                }

                if (info.file.extension !== 'md') {
                    if (this.plugin.settings.core.verboseLogging) {
                        console.debug(`Skipping editor-change: not markdown (${info.file.extension})`);
                    }
                    return;
                }

                // Check for YAML insertion to resolve waitForYamlOrTimeout early
                if (info.file && editor) {
                    const content = editor.getValue();
                    this.plugin.fileOperations.checkYamlAndResolve(info.file, content);

                    // Early exit if still within creation delay window
                    if (this.plugin.editorLifecycle.isFileInCreationDelay(info.file.path)) {
                        if (this.plugin.settings.core.verboseLogging) {
                            console.debug(`Skipping editor-change: file in creation delay: ${info.file.path}`);
                        }
                        return;
                    }
                }

                if (!this.plugin.isFullyLoaded) {
                    if (this.plugin.settings.core.verboseLogging) {
                        console.debug(`Skipping editor-change: plugin not fully loaded`);
                    }
                    return;
                }

                // Use appropriate handler based on checkInterval setting
                if (this.plugin.settings.core.checkInterval === 0) {
                    // Immediate processing - no throttle
                    this.plugin.renameEngine.processEditorChangeOptimal(editor, info.file);
                } else {
                    // Throttled processing
                    this.plugin.editorLifecycle.handleEditorChangeWithThrottle(editor, info.file);
                }
            })
        );
    }

    /**
     * File system event handlers (rename, delete, modify)
     */
    private registerFileSystemHandlers(): void {
        // File rename handler
        this.registerEvent(
            this.plugin.app.vault.on('rename', async (file, oldPath) => {
                if (file instanceof TFile && file.extension === 'md') {
                    // Update file state
                    this.plugin.fileStateManager?.notifyFileRenamed(oldPath, file.path);

                    // Update editor tracking
                    this.plugin.editorLifecycle?.notifyFileRenamed(oldPath, file.path);

                    // Update cache
                    if (this.plugin.cacheManager) {
                        this.plugin.cacheManager.notifyFileRenamed(oldPath, file.path);
                    }
                    verboseLog(this.plugin, `File renamed, updated cache: ${oldPath} -> ${file.path}`);
                }
            })
        );

        // File delete handler
        this.registerEvent(
            this.plugin.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    this.plugin.cacheManager?.notifyFileDeleted(file.path);
                    this.plugin.fileStateManager?.notifyFileDeleted(file.path);
                }
            })
        );

        // File modify handler
        this.registerEvent(
            this.plugin.app.vault.on('modify', async (file) => {
                if (!(file instanceof TFile)) return;
                if (file.extension !== 'md') return;

                // Skip if file operation in progress (rename, etc.)
                if (this.plugin.cacheManager?.isLocked(file.path)) return;

                // Skip if file is in creation delay period
                if (this.plugin.editorLifecycle.isFileInCreationDelay(file.path)) {
                    verboseLog(this.plugin, `Skipping modify: file in creation delay: ${file.path}`);
                    return;
                }

                // Process rename for Cache/File modes (catches cache updates after save)
                if (this.plugin.settings.core.fileReadMethod === 'Cache' ||
                    this.plugin.settings.core.fileReadMethod === 'File') {
                    if (this.plugin.settings.core.renameNotes === 'automatically' && this.plugin.isFullyLoaded) {
                        // Central gate: check policy requirements and always-on safeguards
                        const {canModify, reason} = await canModifyFile(
                            file,
                            this.plugin.app,
                            this.plugin.settings.exclusions.disableRenamingKey,
                            this.plugin.settings.exclusions.disableRenamingValue,
                            false // automatic operation
                        );

                        if (!canModify) {
                            verboseLog(this.plugin, `Skipping modify rename: ${reason}: ${file.path}`);
                            return;
                        }

                        verboseLog(this.plugin, `Modify event: processing ${file.path} (fileReadMethod: ${this.plugin.settings.core.fileReadMethod})`);
                        await this.plugin.renameEngine.processFile(file, true);
                    }
                }

                // Update aliases if enabled
                if (this.plugin.settings.aliases.enableAliases) {
                    // Respect renameNotes setting for automatic operations
                    if (this.plugin.settings.core.renameNotes !== 'automatically') return;

                    // Central gate: check policy requirements and always-on safeguards
                    const {canModify, reason} = await canModifyFile(
                        file,
                        this.plugin.app,
                        this.plugin.settings.exclusions.disableRenamingKey,
                        this.plugin.settings.exclusions.disableRenamingValue,
                        false // automatic operation
                    );

                    if (!canModify) {
                        verboseLog(this.plugin, `Skipping modify alias update: ${reason}: ${file.path}`);
                        return;
                    }

                    // Read content respecting fileReadMethod setting
                    const currentContent = this.plugin.settings.core.fileReadMethod === 'Cache'
                        ? await this.plugin.app.vault.cachedRead(file)
                        : await this.plugin.app.vault.read(file);
                    const previousContent = this.plugin.fileStateManager.getLastEditorContent(file.path);

                    if (previousContent) {
                        const currentFrontmatterInfo = getFrontMatterInfo(currentContent);
                        const previousFrontmatterInfo = getFrontMatterInfo(previousContent);

                        const currentContentAfterFrontmatter = currentContent.substring(currentFrontmatterInfo.contentStart);
                        const previousContentAfterFrontmatter = previousContent.substring(previousFrontmatterInfo.contentStart);

                        if (currentContentAfterFrontmatter === previousContentAfterFrontmatter) {
                            if (this.plugin.settings.core.verboseLogging) {
                                console.debug(`Skipping alias update - only frontmatter edited: ${file.path}`);
                            }
                            // Don't update lastEditorContent here - let the editor handler do it
                            return;
                        }
                    }

                    // Pass content to avoid second read and race condition
                    await this.plugin.aliasManager.updateAliasIfNeeded(file, currentContent);
                }
            })
        );

        // Metadata change handler
        this.registerEvent(
            this.plugin.app.metadataCache.on('changed', async (file) => {
                if (!this.plugin.settings.aliases.enableAliases) return;
                if (file.extension !== 'md') return;

                // Respect renameNotes setting for automatic operations
                if (this.plugin.settings.core.renameNotes !== 'automatically') return;

                // Skip if file operation in progress (rename, etc.)
                if (this.plugin.cacheManager?.isLocked(file.path)) return;

                // Skip if file is in creation delay period
                if (this.plugin.editorLifecycle.isFileInCreationDelay(file.path)) {
                    if (this.plugin.settings.core.verboseLogging) {
                        console.debug(`Skipping metadata-alias: file in creation delay: ${file.path}`);
                    }
                    return;
                }

                // Central gate: check policy requirements and always-on safeguards
                const {canModify, reason} = await canModifyFile(
                    file,
                    this.plugin.app,
                    this.plugin.settings.exclusions.disableRenamingKey,
                    this.plugin.settings.exclusions.disableRenamingValue,
                    false // automatic operation
                );

                if (!canModify) {
                    verboseLog(this.plugin, `Skipping metadata alias update: ${reason}: ${file.path}`);
                    return;
                }

                // Read content respecting fileReadMethod setting
                const currentContent = this.plugin.settings.core.fileReadMethod === 'Cache'
                    ? await this.plugin.app.vault.cachedRead(file)
                    : await this.plugin.app.vault.read(file);
                const previousContent = this.plugin.fileStateManager.getLastEditorContent(file.path);

                if (previousContent) {
                    const currentFrontmatterInfo = getFrontMatterInfo(currentContent);
                    const previousFrontmatterInfo = getFrontMatterInfo(previousContent);

                    const currentContentAfterFrontmatter = currentContent.substring(currentFrontmatterInfo.contentStart);
                    const previousContentAfterFrontmatter = previousContent.substring(previousFrontmatterInfo.contentStart);

                    if (currentContentAfterFrontmatter === previousContentAfterFrontmatter) {
                        if (this.plugin.settings.core.verboseLogging) {
                            console.debug(`Skipping metadata-alias update - only frontmatter edited: ${file.path}`);
                        }
                        // Don't update lastEditorContent here - let the editor handler do it
                        return;
                    }
                }

                // Pass content to avoid second read and race condition
                await this.plugin.aliasManager.updateAliasIfNeeded(file, currentContent);
            })
        );
    }

    /**
     * Active leaf change handler - checks for pending alias updates when popover closes
     */
    private registerActiveLeafChangeHandler(): void {
        this.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', async () => {
                if (!this.plugin.settings.aliases.enableAliases) return;
                if (this.plugin.settings.core.renameNotes !== 'automatically') return;

                // Check all files with pending alias recheck
                await this.checkPendingAliasUpdates();
            })
        );
    }

    /**
     * Check files with pending alias updates and update if no longer in popover
     */
    private async checkPendingAliasUpdates(): Promise<void> {
        // Get files with pending alias recheck
        const filesWithPendingRecheck = this.plugin.fileStateManager.getFilesWithPendingAliasRecheck();

        if (filesWithPendingRecheck.length === 0) return;

        verboseLog(this.plugin, `Checking ${filesWithPendingRecheck.length} files with pending alias updates`);

        for (const filePath of filesWithPendingRecheck) {
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                // File was deleted, clear the flag
                this.plugin.fileStateManager.clearPendingAliasRecheck(filePath);
                continue;
            }

            // Check if file is still in a popover
            const isStillInPopover = this.isFileInPopover(file);

            if (!isStillInPopover) {
                // Popover closed - update alias immediately
                verboseLog(this.plugin, `Popover closed, updating alias: ${filePath}`);
                this.plugin.fileStateManager.clearPendingAliasRecheck(filePath);

                // Trigger alias update
                await this.plugin.aliasManager.updateAliasIfNeeded(file, undefined, undefined, false, false);
            }
        }
    }

    /**
     * Check if file is currently open in a popover (not main workspace)
     */
    private isFileInPopover(file: TFile): boolean {
        const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

        for (const leaf of leaves) {
            const view = leaf.view as MarkdownView;
            if (view?.file?.path === file.path) {
                // File is open - check if this leaf is the active view
                if (activeView && view === activeView && view.file?.path === file.path) {
                    // This is the active view in main workspace
                    return false;
                }
                // File is in a non-active leaf (could be popover)
                // If there's an active view for a different file, this is likely a popover
                if (activeView && activeView.file?.path !== file.path) {
                    return true;
                }
            }
        }

        // File not found in any editor
        return false;
    }

    /**
     * Setup global cursor debug interceptor (only when verbose logging enabled)
     * Intercepts ALL setCursor calls from FLIT, Obsidian, and other plugins
     */
    private setupCursorDebugInterceptor(): void {
        // Only install interceptor if verbose logging is enabled
        if (!this.plugin.settings.core.verboseLogging) {
            return;
        }

        const plugin = this.plugin;

        this.cursorDebugUninstaller = around(Editor.prototype, {
            setCursor(old) {
                return function (pos: any, ...args: any[]) {
                    // Get current cursor position before change
                    const oldCursor = this.getCursor();

                    // Get current file path
                    let filePath = 'unknown';
                    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
                    if (activeView?.file) {
                        filePath = activeView.file.path;
                    }

                    // Parse new position (could be {line, ch} or just a number)
                    let newLine: string | number = 'unknown';
                    let newCh: string | number = 'unknown';
                    if (typeof pos === 'object' && pos !== null) {
                        newLine = pos.line ?? 'unknown';
                        newCh = pos.ch ?? 'unknown';
                    } else if (typeof pos === 'number') {
                        newLine = pos;
                    }

                    // Log the cursor movement
                    console.debug(
                        `[CURSOR-GLOBAL] File: ${filePath} | ` +
                        `From: line ${oldCursor.line} ch ${oldCursor.ch} → ` +
                        `To: line ${newLine} ch ${newCh}`
                    );

                    // Call original setCursor
                    return old.call(this, pos, ...args);
                };
            }
        });

        verboseLog(this.plugin, '[CURSOR-DEBUG] Global cursor interceptor installed');
    }
}
