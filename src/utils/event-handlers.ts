import { TFile, MarkdownView } from "obsidian";
import { PluginSettings } from '../types';
import { verboseLog } from '../utils';
import FirstLineIsTitle from '../../main';

export class EventHandlers {
    private notificationObserver?: MutationObserver;
    private originalSaveCallback?: any;

    constructor(private plugin: FirstLineIsTitle) {}

    get app() {
        return this.plugin.app;
    }

    get settings(): PluginSettings {
        return this.plugin.settings;
    }

    /**
     * Sets up hook to intercept save events and trigger rename if enabled
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
                        // Use a small delay to ensure save is completed
                        setTimeout(() => {
                            this.plugin.renameEngine.renameFile(activeFile, true, false).catch((error) => {
                                console.error(`SAVE: Failed to process file ${activeFile.path}:`, error);
                            });
                        }, 50);
                    }
                }

                return result;
            };
        }
    }

    /**
     * Sets up cursor positioning for new files
     */
    setupCursorPositioning(): void {
        // Listen for file creation events
        this.plugin.registerEvent(
            this.app.vault.on("create", (file) => {
                if (!(file instanceof TFile) || file.extension !== 'md') return;
                // Only process files created after plugin has fully loaded (prevents processing existing files on startup)
                if (!this.plugin.isFullyLoaded) return;

                // Process new files - coordinate delay with check interval
                if (this.settings.renameNotes === "automatically") {
                    if (this.settings.fileCreationDelay > 0) {
                        // Mark file as in creation delay period to prevent other systems from processing it
                        this.plugin.editorLifecycle.markFileInCreationDelay(file.path);

                        // When delay is enabled, process after delay, then let normal system handle subsequent changes
                        console.log(`CREATE: New file created, processing in ${this.settings.fileCreationDelay}ms: ${file.name}`);
                        setTimeout(async () => {
                            console.log(`CREATE: Processing new file after delay: ${file.name}`);
                            try {
                                await this.plugin.renameEngine.renameFile(file, true, false);
                                // Remove from creation delay tracking - file can now be processed by normal systems
                                this.plugin.editorLifecycle.removeFileFromCreationDelay(file.path);
                                // After initial rename, the file enters normal polling/event system
                                // For polling mode, subsequent changes will be handled by check interval
                            } catch (error) {
                                console.error(`CREATE: Failed to process new file ${file.path}:`, error);
                                // Still remove from tracking even if processing failed
                                this.plugin.editorLifecycle.removeFileFromCreationDelay(file.path);
                            }
                        }, this.settings.fileCreationDelay);
                    } else {
                        // No delay - use normal checking system (respects check interval)
                        console.log(`CREATE: New file created, using normal checking system: ${file.name}`);
                        if (this.settings.checkInterval === 0) {
                            // Immediate processing for event-based system
                            this.plugin.renameEngine.renameFile(file, true, false).catch((error) => {
                                console.error(`CREATE: Failed to process new file ${file.path}:`, error);
                            });
                        }
                        // For checkInterval > 0, the file will be processed when user starts typing (editor-change event triggers throttle)
                    }
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
     * Sets up notification suppression for external modification notices
     */
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
                                    verboseLog(this.plugin, `Suppressed external modification notice: ${noticeText.substring(0, 50)}...`);
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

    /**
     * Cleans up notification suppression observer
     */
    cleanupNotificationSuppression(): void {
        if (this.notificationObserver) {
            this.notificationObserver.disconnect();
            this.notificationObserver = undefined;
        }
    }

    /**
     * Restores original save callback
     */
    cleanupSaveEventHook(): void {
        if (this.originalSaveCallback) {
            const saveCommand = (this.app as any).commands?.commands?.['editor:save-file'];
            if (saveCommand) {
                saveCommand.checkCallback = this.originalSaveCallback;
            }
            this.originalSaveCallback = undefined;
        }
    }

    /**
     * Cleans up all event handlers and observers
     */
    cleanup(): void {
        this.cleanupNotificationSuppression();
        this.cleanupSaveEventHook();
    }
}