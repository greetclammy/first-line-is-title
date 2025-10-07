import { TFile, MarkdownView, setIcon, Notice } from "obsidian";
import { verboseLog } from '../utils';
import FirstLineIsTitle from '../../main';

/**
 * WorkspaceIntegration
 *
 * Manages integration with Obsidian workspace UI elements:
 * - Ribbon icons
 * - Command palette customization
 * - Save event hooks
 * - Cursor positioning on file creation
 *
 * Responsibilities:
 * - Register and configure ribbon icons
 * - Add custom icons to command palette
 * - Hook into save events for rename on save
 * - Position cursor on new file creation
 */
export class WorkspaceIntegration {
    private plugin: FirstLineIsTitle;
    private commandPaletteObserver?: MutationObserver;
    private originalSaveCallback?: (checking: boolean) => boolean | void;

    constructor(plugin: FirstLineIsTitle) {
        this.plugin = plugin;
    }

    get app() {
        return this.plugin.app;
    }

    get settings() {
        return this.plugin.settings;
    }

    get isFullyLoaded() {
        return this.plugin.isFullyLoaded;
    }

    get renameEngine() {
        return this.plugin.renameEngine;
    }

    /**
     * Setup custom icons in command palette
     */
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

    /**
     * Register ribbon icons according to settings
     */
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
                    if (!activeFile || activeFile.extension !== 'md') {
                        verboseLog(this.plugin, `Showing notice: No active editor`);
                        new Notice("No active editor");
                        return;
                    }
                    verboseLog(this.plugin, `Ribbon command triggered for ${activeFile.path} (ignoring exclusions)`);
                    await this.renameEngine.processFile(activeFile, true, true, true);
                }
            },
            {
                condition: this.settings.ribbonVisibility.renameAllNotes,
                icon: 'files',
                title: 'Put first line in title in all notes',
                callback: async () => {
                    await this.plugin.folderOperations.renameAllFiles();
                }
            }
        ];

        // Add ribbon icons in order, only if enabled
        ribbonActions.forEach(action => {
            if (action.condition) {
                this.plugin.addRibbonIcon(action.icon, action.title, action.callback);
            }
        });
    }

    /**
     * Setup save event hook for rename on save
     */
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

                // If not checking and save succeeded, run our rename logic - process immediately regardless of check interval
                if (!checking && this.settings.renameOnSave) {
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile && activeFile.extension === 'md') {
                        // Run rename (unless excluded) with no delay and show notices like manual command
                        setTimeout(() => {
                            this.renameEngine.processFile(activeFile, true, false, true);
                        }, 100); // Small delay to ensure save is complete
                    }
                }

                return result;
            };

            verboseLog(this.plugin, 'Save event hook installed for rename on save');
        }
    }

    /**
     * Setup processing for new files - sequential execution after single delay
     */
    setupCursorPositioning(): void {
        // Listen for file creation events
        this.plugin.registerEvent(
            this.app.vault.on("create", (file) => {
                if (!(file instanceof TFile) || file.extension !== 'md') return;
                if (!this.isFullyLoaded) return;

                console.log(`CREATE: New file created, processing in ${this.settings.newNoteDelay}ms: ${file.name}`);

                // Check if title will be skipped (early detection)
                const untitledPattern = /^Untitled(\s[1-9]\d*)?$/;
                const isUntitled = untitledPattern.test(file.basename);

                // Step 1: Always move cursor immediately (if enabled)
                if (this.settings.moveCursorToFirstLine) {
                    const activeLeaf = this.app.workspace.activeLeaf;
                    const inCanvas = activeLeaf?.view?.getViewType() === "canvas";
                    if (!inCanvas) {
                        setTimeout(async () => {
                            // Check for content immediately
                            let hasContent = false;
                            try {
                                const content = await this.app.vault.read(file);
                                hasContent = content.trim() !== '';
                            } catch (error) {
                                // File might not be readable yet, assume no content
                            }

                            // Determine if title insertion will be skipped
                            const willSkipTitleInsertion = !this.settings.insertTitleOnCreation || isUntitled || hasContent;

                            // Position cursor with placeCursorAtLineEnd if title will be skipped
                            this.plugin.fileOperations.handleCursorPositioning(file, willSkipTitleInsertion);
                        }, 50);
                    }
                }

                const timer = setTimeout(async () => {
                    console.log(`CREATE: Processing new file after delay: ${file.name}`);

                    try {
                        let titleWasInserted = false;

                        // Step 2: Insert title if enabled
                        if (this.settings.insertTitleOnCreation) {
                            titleWasInserted = await this.plugin.fileOperations.insertTitleOnCreation(file);
                        }

                        // Step 3: Position cursor based on what happened
                        // Only reposition if title was actually inserted and placeCursorAtLineEnd is ON
                        // All skip cases (Untitled, has content) are already handled immediately above
                        if (this.settings.moveCursorToFirstLine && titleWasInserted && this.settings.placeCursorAtLineEnd) {
                            const activeLeaf = this.app.workspace.activeLeaf;
                            const inCanvas = activeLeaf?.view?.getViewType() === "canvas";

                            if (!inCanvas) {
                                setTimeout(() => {
                                    this.plugin.fileOperations.handleCursorPositioning(file);
                                }, 50);
                            }
                        }

                        // Step 4: Rename file if automatic mode
                        if (this.settings.renameNotes === "automatically") {
                            await this.renameEngine.processFile(file, true, false);
                        }

                        console.log(`CREATE: Completed processing new file: ${file.name}`);
                    } catch (error) {
                        console.error(`CREATE: Failed to process new file ${file.path}:`, error);
                    } finally {
                        this.plugin.editorLifecycle.clearCreationDelayTimer(file.path);
                    }
                }, this.settings.newNoteDelay);

                this.plugin.editorLifecycle.setCreationDelayTimer(file.path, timer);
            })
        );
    }

    /**
     * Cleanup all workspace integrations
     */
    cleanup(): void {
        // Clean up save event hook
        if (this.originalSaveCallback) {
            const saveCommand = (this.app as any).commands?.commands?.['editor:save-file'];
            if (saveCommand) {
                saveCommand.checkCallback = this.originalSaveCallback;
            }
        }

        // Clean up command palette observer
        if (this.commandPaletteObserver) {
            this.commandPaletteObserver.disconnect();
            this.commandPaletteObserver = undefined;
        }
    }

    /**
     * Get command palette observer (for external access)
     */
    getCommandPaletteObserver(): MutationObserver | undefined {
        return this.commandPaletteObserver;
    }
}