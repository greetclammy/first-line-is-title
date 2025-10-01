import { TFile, Notice } from "obsidian";
import { verboseLog } from '../utils';
import FirstLineIsTitle from '../../main';

/**
 * PropertyManager
 *
 * Manages notification suppression.
 *
 * Responsibilities:
 * - Suppress external modification notifications
 * - Handle frontmatter property operations
 */
export class PropertyManager {
    private plugin: FirstLineIsTitle;
    private notificationObserver?: MutationObserver;

    constructor(plugin: FirstLineIsTitle) {
        this.plugin = plugin;
    }

    get app() {
        return this.plugin.app;
    }

    get settings() {
        return this.plugin.settings;
    }

    /**
     * Setup notification suppression for external modification notices
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
     * Cleanup notification suppression observer
     */
    cleanupNotificationSuppression(): void {
        if (this.notificationObserver) {
            this.notificationObserver.disconnect();
            this.notificationObserver = undefined;
        }
    }

    /**
     * Get notification observer (for external access if needed)
     */
    getNotificationObserver(): MutationObserver | undefined {
        return this.notificationObserver;
    }
}