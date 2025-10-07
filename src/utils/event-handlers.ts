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
                            this.plugin.renameEngine.processFile(activeFile, true, false, true).catch((error) => {
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