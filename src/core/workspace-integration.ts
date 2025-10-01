import { Notice, TFile, MarkdownView, setIcon } from "obsidian";
import { verboseLog } from '../utils';
import { RenameAllFilesModal } from '../modals';
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
                    if (!activeFile) {
                        new Notice("No active editor");
                        return;
                    }
                    if (activeFile.extension === 'md') {
                        verboseLog(this.plugin, `Manual rename command triggered for ${activeFile.path} (ignoring exclusions)`);
                        await this.renameEngine.renameFile(activeFile, true, true, true);
                    }
                }
            },
            {
                condition: this.settings.ribbonVisibility.renameAllNotes,
                icon: 'files',
                title: 'Put first line in title in all notes',
                callback: () => {
                    verboseLog(this.plugin, 'Bulk rename command triggered');
                    new RenameAllFilesModal(this.app, this.plugin).open();
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
                        // Run rename (unless excluded) with no delay and suppress notices
                        setTimeout(() => {
                            this.renameEngine.renameFile(activeFile, true, false);
                        }, 100); // Small delay to ensure save is complete
                    }
                }

                return result;
            };

            verboseLog(this.plugin, 'Save event hook installed for rename on save');
        }
    }

    /**
     * Setup cursor positioning on file creation
     */
    setupCursorPositioning(): void {
        // Listen for file creation events
        this.plugin.registerEvent(
            this.app.vault.on("create", (file) => {
                if (!(file instanceof TFile) || file.extension !== 'md') return;
                // Only process files created after plugin has fully loaded (prevents processing existing files on startup)
                if (!this.isFullyLoaded) return;

                // Process new files after 2000ms delay to avoid conflicts with Web Clipper/Templater
                if (this.settings.renameNotes === "automatically") {
                    console.log(`CREATE: New file created, processing in 2000ms: ${file.name}`);
                    setTimeout(() => {
                        console.log(`CREATE: Processing new file: ${file.name}`);
                        this.renameEngine.renameFile(file, true, false).catch((error) => {
                            console.error(`CREATE: Failed to process new file ${file.path}:`, error);
                        });
                    }, 2000);
                }

                // Cursor positioning for new files (skip if insertTitleOnCreation handles it)
                if (this.settings.moveCursorToFirstLine && !this.settings.insertTitleOnCreation) {
                    setTimeout(() => {
                        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (activeView && activeView.file === file) {
                            const editor = activeView.editor;
                            if (editor) {
                                if (this.settings.placeCursorAtLineEnd) {
                                    // Get the length of the first line and place cursor at the end
                                    const firstLineLength = editor.getLine(0).length;
                                    editor.setCursor({ line: 0, ch: firstLineLength });
                                    verboseLog(this.plugin, `Moved cursor to end of first line (${firstLineLength} chars) for new file: ${file.path}`);
                                } else {
                                    // Place cursor at the beginning of the first line
                                    editor.setCursor({ line: 0, ch: 0 });
                                    verboseLog(this.plugin, `Moved cursor to beginning of first line for new file: ${file.path}`);
                                }
                                editor.focus();
                            }
                        }
                    }, 50);
                }
            })
        );

        // Also listen for when a file is opened (in case the create event doesn't catch it)
        this.plugin.registerEvent(
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
                                    verboseLog(this.plugin, `Moved cursor to end of first line (${firstLineLength} chars) for opened empty file: ${file.path}`);
                                } else {
                                    // Place cursor at the beginning of the first line
                                    editor.setCursor({ line: 0, ch: 0 });
                                    verboseLog(this.plugin, `Moved cursor to beginning of first line for opened empty file: ${file.path}`);
                                }
                                editor.focus();
                            }
                        }
                    }
                });
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