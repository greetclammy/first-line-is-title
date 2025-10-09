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
                        verboseLog(this.plugin, `Showing notice: Error: no active note.`);
                        new Notice("Error: no active note.");
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
                callback: () => {
                    const { RenameAllFilesModal } = require('../modals');
                    new RenameAllFilesModal(this.app, this.plugin).open();
                }
            },
            {
                condition: this.settings.ribbonVisibility.toggleAutomaticRenaming,
                icon: 'file-cog',
                title: 'Toggle automatic renaming',
                callback: async () => {
                    const newValue = this.settings.renameNotes === "automatically" ? "manually" : "automatically";
                    this.settings.renameNotes = newValue;
                    await this.plugin.saveSettings();
                    new Notice(`Automatic renaming ${newValue === "automatically" ? "enabled" : "disabled"}.`);
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
            this.app.vault.on("create", async (file) => {
                if (!(file instanceof TFile) || file.extension !== 'md') return;
                if (!this.isFullyLoaded) return;

                // Define processing function first
                const processFileCreation = async () => {
                // Capture initial content immediately from the specific file's editor
                let initialContent = '';
                try {
                    const leaves = this.app.workspace.getLeavesOfType("markdown");
                    for (const leaf of leaves) {
                        const view = leaf.view as MarkdownView;
                        if (view && view.file?.path === file.path && view.editor) {
                            initialContent = view.editor.getValue();
                            verboseLog(this.plugin, `CREATE: Captured initial editor content for ${file.path}: ${initialContent.length} chars`);
                            break;
                        }
                    }
                } catch (error) {
                    verboseLog(this.plugin, `CREATE: Could not read initial editor content`);
                }

                verboseLog(this.plugin, `CREATE: New file created, processing in ${this.settings.newNoteDelay}ms: ${file.name}`);

                // Check if title will be skipped (early detection)
                const untitledPattern = /^Untitled(\s[1-9]\d*)?$/;
                const isUntitled = untitledPattern.test(file.basename);

                // Step 1: Move cursor based on waitForCursorTemplate setting
                if (this.settings.renameNotes === "automatically" && this.settings.moveCursorToFirstLine) {
                    // If waitForCursorTemplate is OFF, move cursor immediately
                    if (!this.settings.waitForCursorTemplate) {
                        // Check if file is excluded from processing (folder/tag/property exclusions)
                        const isExcluded = await this.plugin.fileOperations.isFileExcludedForCursorPositioning(file, initialContent);

                        if (!isExcluded) {
                            const activeLeaf = this.app.workspace.activeLeaf;
                            const inCanvas = activeLeaf?.view?.getViewType() === "canvas";
                            if (!inCanvas) {
                                setTimeout(async () => {
                                    // Use captured initial content to check if file has content
                                    const hasContent = initialContent.trim() !== '';

                                    // Determine if title insertion will be skipped
                                    const willSkipTitleInsertion = !this.settings.insertTitleOnCreation || isUntitled || hasContent;

                                    // Position cursor with placeCursorAtLineEnd if title will be skipped
                                    this.plugin.fileOperations.handleCursorPositioning(file, willSkipTitleInsertion);
                                }, 50);
                            }
                        } else {
                            verboseLog(this.plugin, `Skipping cursor positioning - file is excluded: ${file.path}`);
                        }
                    } else {
                        // waitForCursorTemplate is ON - wait for YAML (600ms timeout), then move cursor
                        verboseLog(this.plugin, `Waiting for template before cursor positioning: ${file.path}`);

                        // Wait for YAML or timeout (600ms for Editor mode)
                        const templateWaitTime = 600;
                        await this.plugin.fileOperations.waitForYamlOrTimeout(file, templateWaitTime);

                        // Get current content after template
                        const leaves = this.app.workspace.getLeavesOfType("markdown");
                        let currentContent: string | undefined;
                        for (const leaf of leaves) {
                            const view = leaf.view as MarkdownView;
                            if (view && view.file?.path === file.path && view.editor) {
                                currentContent = view.editor.getValue();
                                break;
                            }
                        }

                        // Check exclusions with current content (may have template tags/properties)
                        const isExcluded = await this.plugin.fileOperations.isFileExcludedForCursorPositioning(file, currentContent);

                        if (!isExcluded) {
                            const activeLeaf = this.app.workspace.activeLeaf;
                            const inCanvas = activeLeaf?.view?.getViewType() === "canvas";
                            if (!inCanvas) {
                                setTimeout(() => {
                                    // Determine if we should use placeCursorAtLineEnd setting
                                    const hasContent = currentContent && currentContent.trim() !== '';
                                    const willSkipTitleInsertion = !this.settings.insertTitleOnCreation || isUntitled || hasContent;
                                    this.plugin.fileOperations.handleCursorPositioning(file, willSkipTitleInsertion);
                                }, 50);
                            }
                        } else {
                            verboseLog(this.plugin, `Skipping cursor positioning after template - file is excluded: ${file.path}`);
                        }
                    }
                }

                const timer = setTimeout(async () => {
                    verboseLog(this.plugin, `CREATE: Processing new file after delay: ${file.name}`);

                    try {
                        let titleWasInserted = false;

                        // Step 2: Insert title if enabled (pass initial content captured at creation time)
                        if (this.settings.insertTitleOnCreation) {
                            titleWasInserted = await this.plugin.fileOperations.insertTitleOnCreation(file, initialContent);
                            verboseLog(this.plugin, `CREATE: insertTitleOnCreation returned ${titleWasInserted}`);
                        }

                        // Step 3: Reposition cursor if title was inserted and placeCursorAtLineEnd is ON
                        if (this.settings.renameNotes === "automatically" && this.settings.moveCursorToFirstLine) {
                            // Reposition to end of title if title was inserted and placeCursorAtLineEnd is ON
                            if (titleWasInserted && this.settings.placeCursorAtLineEnd) {
                                // Get current content after title insertion
                                const leaves = this.app.workspace.getLeavesOfType("markdown");
                                let currentContent: string | undefined;
                                for (const leaf of leaves) {
                                    const view = leaf.view as MarkdownView;
                                    if (view && view.file?.path === file.path && view.editor) {
                                        currentContent = view.editor.getValue();
                                        break;
                                    }
                                }

                                // Check exclusion after title insertion
                                const isExcluded = await this.plugin.fileOperations.isFileExcludedForCursorPositioning(file, currentContent);

                                if (!isExcluded) {
                                    const activeLeaf = this.app.workspace.activeLeaf;
                                    const inCanvas = activeLeaf?.view?.getViewType() === "canvas";

                                    if (!inCanvas) {
                                        setTimeout(() => {
                                            this.plugin.fileOperations.handleCursorPositioning(file);
                                        }, 50);
                                    }
                                } else {
                                    verboseLog(this.plugin, `Skipping post-title cursor repositioning - file is excluded: ${file.path}`);
                                }
                            }
                        }

                        // Step 4: Rename file if automatic mode
                        if (this.settings.renameNotes === "automatically") {
                            // Get current editor content if file is open
                            let editorContent: string | undefined;
                            const leaves = this.app.workspace.getLeavesOfType("markdown");
                            for (const leaf of leaves) {
                                const view = leaf.view as any;
                                if (view && view.file && view.file.path === file.path && view.editor) {
                                    editorContent = view.editor.getValue();
                                    break;
                                }
                            }
                            await this.renameEngine.processFile(file, true, false, false, editorContent);
                        }

                        verboseLog(this.plugin, `CREATE: Completed processing new file: ${file.name}`);
                    } catch (error) {
                        console.error(`CREATE: Failed to process new file ${file.path}:`, error);
                    } finally {
                        this.plugin.editorLifecycle.clearCreationDelayTimer(file.path);
                    }
                }, this.settings.newNoteDelay);

                this.plugin.editorLifecycle.setCreationDelayTimer(file.path, timer);
                }; // End processFileCreation

                // Wait for markdown view to be ready (handles both existing tabs and new first file)
                const checkViewReady = async () => {
                    const leaves = this.app.workspace.getLeavesOfType("markdown");
                    for (const leaf of leaves) {
                        const view = leaf.view as MarkdownView;
                        if (view && view.file?.path === file.path) {
                            verboseLog(this.plugin, `CREATE: Markdown view ready for ${file.name}`);
                            return true;
                        }
                    }
                    return false;
                };

                // Try immediate check first
                const immediateCheck = await checkViewReady();
                if (!immediateCheck) {
                    // View not ready, wait and retry
                    setTimeout(async () => {
                        const delayedCheck = await checkViewReady();
                        if (!delayedCheck) {
                            verboseLog(this.plugin, `CREATE: No markdown view found for ${file.name} after delay, skipping`);
                            return;
                        }
                        // Process after view is ready
                        await processFileCreation();
                    }, 100);
                    return;
                }

                // View is ready immediately, process now
                verboseLog(this.plugin, `CREATE: File created ${file.name}, markdown view ready`);
                await processFileCreation();
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