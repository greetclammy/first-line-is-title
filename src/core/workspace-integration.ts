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
            ['Put first line in title in all notes', 'file-stack'],
            ['Disable renaming for note', 'square-x'],
            ['Enable renaming for note', 'square-check']
        ]);

        // Observer to watch for command palette suggestions
        const observer = new MutationObserver((mutations) => {
            try {
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
                                                if (!iconName) return; // Skip if no icon name found

                                                // Create icon element
                                                const iconElement = document.createElement('div');
                                                iconElement.classList.add('flit-command-icon');

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
            } catch (error) {
                console.error('Error in command palette observer:', error);
            }
        });

        try {
            // Start observing the document for changes
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Store the observer for cleanup
            this.commandPaletteObserver = observer;
        } catch (error) {
            console.error('Error starting command palette observer:', error);
        }
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
                condition: this.settings.core.ribbonVisibility.renameCurrentFile,
                icon: 'file-pen',
                title: 'Put first line in title',
                callback: () => this.plugin.commandRegistrar.executeRenameCurrentFile()
            },
            {
                condition: this.settings.core.ribbonVisibility.renameAllNotes,
                icon: 'file-stack',
                title: 'Put first line in title in all notes',
                callback: () => {
                    const { RenameAllFilesModal } = require('../modals');
                    new RenameAllFilesModal(this.app, this.plugin).open();
                }
            },
            {
                condition: this.settings.core.ribbonVisibility.toggleAutomaticRenaming,
                icon: 'file-cog',
                title: 'Toggle automatic renaming',
                callback: () => this.plugin.commandRegistrar.executeToggleAutomaticRenaming()
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
        const saveCommand = this.app.commands?.commands?.['editor:save-file'];
        if (saveCommand) {
            // Store the original callback
            this.originalSaveCallback = saveCommand.checkCallback;

            // Override the save command
            saveCommand.checkCallback = (checking: boolean) => {
                // First call the original save logic
                const result = this.originalSaveCallback ? this.originalSaveCallback(checking) : true;

                // If not checking and save succeeded, run our rename logic - process immediately regardless of check interval
                if (!checking && this.settings.core.renameOnSave) {
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile && activeFile.extension === 'md') {
                        // Run rename (unless excluded) with no delay and show notices like manual command
                        setTimeout(() => {
                            this.plugin.commandRegistrar.executeRenameUnlessExcluded();
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

                // Skip if file existed before plugin loaded (ctime before plugin load - 1s margin)
                if (file.stat.ctime < this.plugin.pluginLoadTime - 1000) {
                    return;
                }

                // Capture plugin reference explicitly for inner function
                const plugin = this.plugin;
                const app = this.app;
                const settings = this.settings.core;

                // Guard: ensure plugin is fully initialized
                if (!plugin?.fileOperations) {
                    verboseLog(plugin, `CREATE: Plugin not fully initialized, skipping ${file.name}`);
                    return;
                }

                // Define processing function first
                const processFileCreation = async () => {
                // Capture initial content immediately from the specific file's editor
                let initialContent = '';
                try {
                    const leaves = app.workspace.getLeavesOfType("markdown");
                    for (const leaf of leaves) {
                        const view = leaf.view as MarkdownView;
                        if (view && view.file?.path === file.path && view.editor) {
                            initialContent = view.editor.getValue();
                            verboseLog(plugin, `CREATE: Captured initial editor content for ${file.path}: ${initialContent.length} chars`);
                            break;
                        }
                    }
                } catch (error) {
                    verboseLog(plugin, `CREATE: Could not read initial editor content`);
                }

                verboseLog(plugin, `CREATE: New file created, processing in ${settings.newNoteDelay}ms: ${file.name}`);

                // Check if title will be skipped (early detection)
                const untitledPattern = /^Untitled(\s[1-9]\d*)?$/;
                const isUntitled = untitledPattern.test(file.basename);

                // Track Step 1's template wait promise
                let step1TemplateWaitPromise: Promise<void> | null = null;

                // Set creation delay timer IMMEDIATELY to block editor-change events
                // during cursor positioning and template waiting
                const timer = setTimeout(async () => {
                    verboseLog(plugin, `CREATE: Processing new file after delay: ${file.name}`);

                    // Wait for Step 1's template wait to complete if it's running
                    if (step1TemplateWaitPromise) {
                        verboseLog(plugin, `CREATE: Waiting for Step 1 template wait to complete before Step 2`);
                        await step1TemplateWaitPromise;
                    }

                    let titleWasInserted = false;

                    try {
                        // Step 2: Insert title if enabled
                        // Pass template content if available (cursor positioning already waited for it)
                        if (settings.insertTitleOnCreation) {
                            const templateContent = (file as any)._flitTemplateContent;

                            // Check exclusions when waitForTemplate is ON and we have template content
                            // This ensures we don't insert title in excluded folders/tags/properties
                            let skipTitleDueToExclusion = false;
                            if (settings.waitForTemplate && templateContent) {
                                const isExcluded = await plugin.fileOperations.isFileExcludedForCursorPositioning(file, templateContent);
                                if (isExcluded) {
                                    verboseLog(plugin, `Skipping title insertion - file is excluded: ${file.path}`);
                                    skipTitleDueToExclusion = true;
                                }
                            }

                            if (!skipTitleDueToExclusion) {
                                titleWasInserted = await plugin.fileOperations.insertTitleOnCreation(file, initialContent, templateContent);
                                verboseLog(plugin, `CREATE: insertTitleOnCreation returned ${titleWasInserted}`);
                            }
                        }

                        // Step 3: Handle cursor positioning when both settings are ON
                        if (settings.renameNotes === "automatically" && settings.moveCursorToFirstLine) {
                            // When both insertTitleOnCreation and placeCursorAtLineEnd are ON:
                            // - If title was inserted: cursor already at line end from insertion code
                            // - If title was NOT inserted: need to position cursor at line end here
                            const shouldPositionCursor = settings.insertTitleOnCreation && settings.placeCursorAtLineEnd && !titleWasInserted;

                            if (shouldPositionCursor) {
                                // Get current content
                                const leaves = app.workspace.getLeavesOfType("markdown");
                                let currentContent: string | undefined;
                                for (const leaf of leaves) {
                                    const view = leaf.view as MarkdownView;
                                    if (view && view.file?.path === file.path && view.editor) {
                                        currentContent = view.editor.getValue();
                                        break;
                                    }
                                }

                                // Check exclusion (only if disableCursorInExcludedNotes setting is ON)
                                const isExcluded = settings.disableCursorInExcludedNotes
                                    ? await plugin.fileOperations.isFileExcludedForCursorPositioning(file, currentContent)
                                    : false;

                                if (!isExcluded) {
                                    const view = await plugin.fileOperations.waitForViewReady(file);
                                    if (view && view.editor) {
                                        // Find first content line and position cursor at line end
                                        const content = view.editor.getValue();
                                        const lines = content.split('\n');

                                        // Detect YAML
                                        let yamlEndLine = -1;
                                        if (lines[0] === '---') {
                                            for (let i = 1; i < lines.length; i++) {
                                                if (lines[i] === '---') {
                                                    yamlEndLine = i;
                                                    break;
                                                }
                                            }
                                        }

                                        // Find first content line after YAML
                                        const contentLine = yamlEndLine !== -1 ? yamlEndLine + 1 : 0;
                                        const lineContent = view.editor.getLine(contentLine);
                                        const lineLength = lineContent.length;

                                        view.editor.focus();
                                        view.editor.setCursor({ line: contentLine, ch: lineLength });
                                        verboseLog(plugin, `CREATE: Positioned cursor at end of line ${contentLine} (${lineLength} chars) - title not inserted`);
                                    }
                                } else {
                                    verboseLog(plugin, `Skipping cursor positioning - file is excluded: ${file.path}`);
                                }
                            }
                        }

                        // Step 4: Rename file if automatic mode and plugin fully loaded
                        if (settings.renameNotes === "automatically" && plugin.isFullyLoaded) {
                            // Get current editor content if file is open
                            let editorContent: string | undefined;
                            const leaves = app.workspace.getLeavesOfType("markdown");
                            for (const leaf of leaves) {
                                const view = leaf.view as any;
                                if (view && view.file && view.file.path === file.path && view.editor) {
                                    const value = view.editor.getValue();
                                    if (typeof value === 'string') {
                                        editorContent = value;
                                    }
                                    break;
                                }
                            }
                            // Only process if file is open in editor (policy requirement)
                            if (editorContent !== undefined) {
                                await plugin.renameEngine.processFile(file, true, false, editorContent);
                            }
                        }

                        verboseLog(plugin, `CREATE: Completed processing new file: ${file.name}`);
                    } catch (error) {
                        console.error(`CREATE: Failed to process new file ${file.path}:`, error);
                    } finally {
                        // Always clean up template content to prevent memory leak
                        delete (file as any)._flitTemplateContent;
                        plugin.editorLifecycle.clearCreationDelayTimer(file.path);
                    }
                }, settings.newNoteDelay);

                plugin.editorLifecycle.setCreationDelayTimer(file.path, timer);

                // Step 1: Move cursor in note body based on waitForCursorTemplate setting
                if (settings.renameNotes === "automatically" && settings.moveCursorToFirstLine) {
                    // If waitForCursorTemplate is OFF, move cursor immediately
                    if (!settings.waitForCursorTemplate) {
                        // Check if file is excluded from processing (folder/tag/property exclusions)
                        // Only check if disableCursorInExcludedNotes setting is ON
                        const isExcluded = settings.disableCursorInExcludedNotes
                            ? await plugin.fileOperations.isFileExcludedForCursorPositioning(file, initialContent)
                            : false;

                        if (!isExcluded) {
                            const view = await plugin.fileOperations.waitForViewReady(file);
                            if (view) {
                                // Use captured initial content to check if file has content
                                const hasContent = initialContent.trim() !== '';

                                // Determine if title insertion will be skipped
                                const willSkipTitleInsertion = !settings.insertTitleOnCreation || isUntitled || hasContent;

                                // Determine if we should use placeCursorAtLineEnd in Step 1:
                                // - If both insertTitleOnCreation and placeCursorAtLineEnd are ON: don't use placeCursorAtLineEnd here (Step 3 or title insertion handles it)
                                // - Otherwise: use placeCursorAtLineEnd if title insertion will be skipped
                                const usePlaceCursorAtLineEnd = settings.insertTitleOnCreation && settings.placeCursorAtLineEnd
                                    ? false
                                    : willSkipTitleInsertion;

                                await plugin.fileOperations.handleCursorPositioning(file, usePlaceCursorAtLineEnd);
                            }
                        } else {
                            verboseLog(plugin, `Skipping cursor positioning - file is excluded: ${file.path}`);
                        }
                    } else {
                        // waitForCursorTemplate is ON - wait for template using shared utility
                        verboseLog(plugin, `Waiting for template before cursor positioning: ${file.path}`);

                        // Wrap Step 1's wait in a promise so Step 2 can await it
                        step1TemplateWaitPromise = (async () => {
                            const currentContent = await plugin.fileOperations.waitForTemplate(file, settings.newNoteDelay);

                            // Store template content for title insertion to avoid re-waiting
                            (file as any)._flitTemplateContent = currentContent;

                            // Check exclusions with current content (may have template tags/properties)
                            // Only check if disableCursorInExcludedNotes setting is ON
                            const isExcluded = settings.disableCursorInExcludedNotes
                                ? await plugin.fileOperations.isFileExcludedForCursorPositioning(file, currentContent)
                                : false;

                            if (!isExcluded) {
                                const view = await plugin.fileOperations.waitForViewReady(file);
                                if (view) {
                                    // Determine if we should use placeCursorAtLineEnd setting
                                    const hasContent = !!(currentContent && currentContent.trim() !== '');
                                    const willSkipTitleInsertion = !settings.insertTitleOnCreation || isUntitled || hasContent;

                                    // Determine if we should use placeCursorAtLineEnd in Step 1:
                                    // - If both insertTitleOnCreation and placeCursorAtLineEnd are ON: don't use placeCursorAtLineEnd here (Step 3 or title insertion handles it)
                                    // - Otherwise: use placeCursorAtLineEnd if title insertion will be skipped
                                    const usePlaceCursorAtLineEnd = settings.insertTitleOnCreation && settings.placeCursorAtLineEnd
                                        ? false
                                        : willSkipTitleInsertion;

                                    await plugin.fileOperations.handleCursorPositioning(file, usePlaceCursorAtLineEnd);
                                }
                            } else {
                                verboseLog(plugin, `Skipping cursor positioning after template - file is excluded: ${file.path}`);
                            }
                        })();

                        // Await the Step 1 promise
                        await step1TemplateWaitPromise;
                    }
                }
                }; // End processFileCreation

                // Process file creation (handles both markdown views and canvas files)
                // Individual steps will wait for view readiness if needed
                verboseLog(plugin, `CREATE: File created ${file.name}, starting processing`);
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
            const saveCommand = this.app.commands?.commands?.['editor:save-file'];
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