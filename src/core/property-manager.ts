import { TFile, Notice, normalizePath } from "obsidian";
import { verboseLog } from '../utils';
import FirstLineIsTitle from '../../main';

interface TypesJson {
    types: Record<string, string>;
}

/**
 * PropertyManager
 *
 * Manages notification suppression and property type registration.
 *
 * Responsibilities:
 * - Suppress external modification notifications
 * - Handle frontmatter property operations
 * - Manage property types in types.json
 */
export class PropertyManager {
    private plugin: FirstLineIsTitle;
    private notificationObserver?: MutationObserver;
    private propertyTypeCache: Map<string, 'checkbox' | 'text' | null> = new Map();

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

    /**
     * Get path to types.json in vault's .obsidian folder
     */
    private getTypesJsonPath(): string {
        return normalizePath(`${this.app.vault.configDir}/types.json`);
    }

    /**
     * Read types.json file
     */
    private async readTypesJson(): Promise<TypesJson> {
        const path = this.getTypesJsonPath();
        try {
            const content = await this.app.vault.adapter.read(path);
            return JSON.parse(content);
        } catch (error) {
            // If file doesn't exist or is invalid, return empty structure
            verboseLog(this.plugin, `types.json not found or invalid, creating new structure`);
            return { types: {} };
        }
    }

    /**
     * Write types.json file
     */
    private async writeTypesJson(data: TypesJson): Promise<void> {
        const path = this.getTypesJsonPath();
        try {
            const content = JSON.stringify(data, null, 2);
            await this.app.vault.adapter.write(path, content);
            verboseLog(this.plugin, `Updated types.json`);
        } catch (error) {
            console.error('Failed to write types.json:', error);
        }
    }

    /**
     * Check if value is boolean (true or false)
     */
    private isBooleanValue(value: any): boolean {
        return value === true || value === false ||
               value === 'true' || value === 'false';
    }

    /**
     * Normalize boolean values to actual boolean type
     */
    private normalizeBooleanValue(value: any): boolean | any {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    }

    /**
     * Update property type in types.json based on its value
     *
     * Property type changes ONLY in these cases:
     * 1. Settings key changed (disableRenamingKey) → boolean/non-boolean
     * 2. Settings value changed (disableRenamingValue) → boolean/non-boolean
     * 3. Restore button clicked → default value
     * 4. Clear settings → default value
     * 5. First plugin load → default value (one time only)
     *
     * NOT when properties are added to individual files.
     *
     * Behavior:
     * - Boolean value (true/false) → set as 'checkbox' in types.json
     * - Non-boolean value → delete from types.json entirely
     *
     * @param propertyKey The property key to update
     * @param propertyValue The current value of the property
     */
    async updatePropertyType(propertyKey: string, propertyValue: any): Promise<void> {
        const normalizedValue = this.normalizeBooleanValue(propertyValue);
        const isBoolean = this.isBooleanValue(normalizedValue);

        // Read current types.json
        const typesData = await this.readTypesJson();
        const currentType = typesData.types[propertyKey];

        if (isBoolean) {
            // Value is boolean → set as checkbox if not already
            if (currentType !== 'checkbox') {
                typesData.types[propertyKey] = 'checkbox';
                await this.writeTypesJson(typesData);
                verboseLog(this.plugin, `Property "${propertyKey}" set to checkbox (value: ${normalizedValue})`);
            }
            // Update cache
            this.propertyTypeCache.set(propertyKey, 'checkbox');
        } else {
            // Value is not boolean → remove from types.json if present
            if (currentType) {
                delete typesData.types[propertyKey];
                await this.writeTypesJson(typesData);
                verboseLog(this.plugin, `Property "${propertyKey}" removed from types.json (non-boolean value)`);
            }
            // Update cache
            this.propertyTypeCache.set(propertyKey, null);
        }
    }

    /**
     * Update property type based on current settings value
     * Call this when disableRenamingKey or disableRenamingValue changes in settings
     */
    async updatePropertyTypeFromSettings(): Promise<void> {
        const propertyKey = this.settings.disableRenamingKey;
        const propertyValue = this.settings.disableRenamingValue;

        if (!propertyKey) return;

        await this.updatePropertyType(propertyKey, propertyValue);
    }
}