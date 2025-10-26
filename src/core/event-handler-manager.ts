import { Menu, TFile, TFolder, Editor, MarkdownView, EventRef, getFrontMatterInfo } from 'obsidian';
import FirstLineIsTitlePlugin from '../../main';
import { verboseLog } from '../utils';
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
    }

    /**
     * Unregister all event handlers.
     * Called during plugin unload.
     */
    unregisterAllHandlers(): void {
        this.registeredEvents.forEach(ref => this.plugin.app.workspace.offref(ref));
        this.registeredEvents = [];
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

                // Use optimal editor change handler
                this.plugin.editorLifecycle.handleEditorChangeWithThrottle(editor, info.file);
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
                    this.plugin.editorLifecycle.clearCreationDelayTimer(file.path);
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
                        verboseLog(this.plugin, `Modify event: processing ${file.path} (fileReadMethod: ${this.plugin.settings.core.fileReadMethod})`);
                        await this.plugin.renameEngine.processFile(file, true);
                    }
                }

                // Update aliases if enabled (respects manual/automatic mode)
                if (this.plugin.settings.aliases.enableAliases &&
                    this.plugin.settings.core.renameNotes === 'automatically') {
                    // Check if only frontmatter changed - skip alias update to preserve YAML formatting
                    const currentContent = await this.plugin.app.vault.read(file);
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

                    // Skip if file has pending metadata update from processFrontMatter
                    if (this.plugin.pendingMetadataUpdates.has(file.path)) {
                        verboseLog(this.plugin, `Skipping alias update - pending metadata write: ${file.path}`);
                        return;
                    }

                    await this.plugin.aliasManager.updateAliasIfNeeded(file, currentContent);
                }
            })
        );

        // Metadata change handler
        this.registerEvent(
            this.plugin.app.metadataCache.on('changed', async (file) => {
                if (!this.plugin.settings.aliases.enableAliases) return;
                if (this.plugin.settings.core.renameNotes !== 'automatically') return;
                if (file.extension !== 'md') return;

                // Skip if file operation in progress (rename, etc.)
                if (this.plugin.cacheManager?.isLocked(file.path)) return;

                // Skip if file is in creation delay period
                if (this.plugin.editorLifecycle.isFileInCreationDelay(file.path)) {
                    if (this.plugin.settings.core.verboseLogging) {
                        console.debug(`Skipping metadata-alias: file in creation delay: ${file.path}`);
                    }
                    return;
                }

                // Check if only frontmatter changed - skip alias update to preserve YAML formatting
                const currentContent = await this.plugin.app.vault.read(file);
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

                // Skip if file has pending metadata update from processFrontMatter
                // Clear from Set since metadata cache has now processed the update
                if (this.plugin.pendingMetadataUpdates.has(file.path)) {
                    this.plugin.pendingMetadataUpdates.delete(file.path);
                    verboseLog(this.plugin, `Skipping alias update - cleared pending metadata write: ${file.path}`);
                    return;
                }

                await this.plugin.aliasManager.updateAliasIfNeeded(file, currentContent);
            })
        );
    }
}
