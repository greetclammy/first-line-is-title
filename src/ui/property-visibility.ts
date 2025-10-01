import { PluginSettings } from '../types';
import FirstLineIsTitle from '../../main';

export class PropertyVisibility {
    private propertyObserver?: MutationObserver;

    constructor(private plugin: FirstLineIsTitle) {}

    get settings(): PluginSettings {
        return this.plugin.settings;
    }

    /**
     * Sets up property hiding for a specific property key using DOM observation
     */
    private setupPropertyHiding(propertyKey: string): void {
        // Clean up existing observer
        this.cleanupPropertyObserver();

        // Create new observer to watch for property changes
        this.propertyObserver = new MutationObserver((mutations) => {
            mutations.forEach(() => {
                this.hideProperties(propertyKey);
            });
        });

        // Start observing
        this.propertyObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-property-key']
        });

        // Initial hide
        this.hideProperties(propertyKey);
    }

    /**
     * Hides properties based on current settings and context
     */
    private hideProperties(propertyKey: string): void {
        // Find all property elements with the target key
        const properties = document.querySelectorAll(`[data-property-key="${propertyKey}"]`);

        properties.forEach((property) => {
            // Skip if in source view (check for CodeMirror editor context)
            const isInSourceView = property.closest('.cm-editor') &&
                                   !property.closest('.metadata-container');
            if (isInSourceView) {
                return;
            }

            // Detect context: sidebar vs in-note
            // Sidebar properties are typically in workspace-leaf-content but NOT in markdown views
            const isInSidebar = property.closest('.workspace-leaf-content') &&
                               !property.closest('.workspace-leaf-content[data-type="markdown"]') &&
                               !property.closest('.markdown-source-view') &&
                               !property.closest('.markdown-preview-view');

            // Determine if this property should be hidden based on the mode and context
            let shouldHide = false;

            if (this.settings.hideAliasProperty === 'always') {
                // Always hide, regardless of emptiness, but consider sidebar setting
                if (isInSidebar && !this.settings.hideAliasInSidebar) {
                    // In sidebar but sidebar hiding is disabled - don't hide
                    shouldHide = false;
                } else {
                    // Either not in sidebar, or sidebar hiding is enabled - hide it
                    shouldHide = true;
                }
            } else if (this.settings.hideAliasProperty === 'when_empty') {
                // Only hide if property is empty, and consider sidebar setting
                const valueContainer = property.querySelector('.metadata-property-value');
                const isEmpty = !valueContainer ||
                               valueContainer.textContent?.trim() === '' ||
                               valueContainer.children.length === 0;

                if (isEmpty) {
                    if (isInSidebar && !this.settings.hideAliasInSidebar) {
                        // In sidebar but sidebar hiding is disabled - don't hide even if empty
                        shouldHide = false;
                    } else {
                        // Either not in sidebar, or sidebar hiding is enabled - hide it
                        shouldHide = true;
                    }
                } else {
                    // Not empty - don't hide
                    shouldHide = false;
                }
            }

            const metadataContainer = property.closest('.metadata-container');
            const metadataProperties = property.closest('.metadata-properties');

            if (shouldHide) {
                // Property should be hidden - apply context-specific logic
                if (metadataProperties) {
                    const allProperties = metadataProperties.querySelectorAll('.metadata-property[data-property-key]');

                    if (allProperties.length === 1 && allProperties[0] === property) {
                        // This is the only property and it should be hidden
                        if (isInSidebar) {
                            // SIDEBAR: Only hide .metadata-properties, preserve "Add property" button
                            (metadataProperties as HTMLElement).style.display = 'none';
                        } else {
                            // IN-NOTE: Hide entire .metadata-container including "Add property" button
                            if (metadataContainer) {
                                (metadataContainer as HTMLElement).style.display = 'none';
                            } else {
                                // Fallback if no container found
                                (metadataProperties as HTMLElement).style.display = 'none';
                            }
                        }
                    } else {
                        // There are other properties - just hide this individual property
                        (property as HTMLElement).style.display = 'none';
                        // Ensure properties section remains visible since there are other properties
                        (metadataProperties as HTMLElement).style.display = '';
                        if (metadataContainer) {
                            (metadataContainer as HTMLElement).style.display = '';
                        }
                    }
                } else {
                    // Fallback: just hide the individual property
                    (property as HTMLElement).style.display = 'none';
                }
            } else {
                // Property should be shown
                (property as HTMLElement).style.display = '';

                // Ensure containers are visible since we have a property that should be shown
                if (metadataProperties) {
                    (metadataProperties as HTMLElement).style.display = '';
                }
                if (metadataContainer) {
                    (metadataContainer as HTMLElement).style.display = '';
                }
            }
        });
    }

    /**
     * Cleans up the property observer and restores any hidden elements
     */
    private cleanupPropertyObserver(): void {
        if (this.propertyObserver) {
            this.propertyObserver.disconnect();
            this.propertyObserver = undefined;
        }

        // Remove any hiding styles applied by the observer
        const hiddenProperties = document.querySelectorAll('[data-property-key][style*="display: none"]');
        hiddenProperties.forEach((property) => {
            (property as HTMLElement).style.display = '';
        });

        // Also restore any hidden properties sections
        const hiddenContainers = document.querySelectorAll('.metadata-container[style*="display: none"], .frontmatter-container[style*="display: none"], .metadata-properties[style*="display: none"]');
        hiddenContainers.forEach((container) => {
            (container as HTMLElement).style.display = '';
        });
    }

    /**
     * Updates property visibility based on current settings
     */
    updatePropertyVisibility(): void {
        // Remove any existing property hiding styles
        document.head.querySelector('#flit-hide-property-style')?.remove();

        // Clean up any existing observer
        this.cleanupPropertyObserver();

        if (this.settings.hideAliasProperty === 'never') {
            return; // No hiding needed
        }

        const propertyKey = this.settings.aliasPropertyKey || 'aliases';

        if (this.settings.hideAliasProperty === 'always' || this.settings.hideAliasProperty === 'when_empty') {
            // Use DOM observation for both modes to handle container hiding properly
            this.setupPropertyHiding(propertyKey);
        }
    }

    /**
     * Cleans up all property visibility related observers and styles
     */
    cleanup(): void {
        this.cleanupPropertyObserver();
    }
}