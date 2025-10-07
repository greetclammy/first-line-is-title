import { PluginSettingTab, App } from "obsidian";
import { FirstLineIsTitlePlugin } from './settings-base';

// Import all tab classes
import { GeneralTab } from './tab-general';
import { IncludeExcludeTab } from './tab-exclusions';
import { PropertiesTab } from './tab-alias';
import { ForbiddenCharsTab } from './tab-replace-characters';
import { StripMarkupTab } from './tab-strip-markup';
import { CustomReplacementsTab } from './tab-custom-rules';
import { SafewordsTab } from './tab-safewords';
import { CommandsTab } from './tab-commands';
import { AdvancedTab } from './tab-miscellaneous';

export class FirstLineIsTitleSettings extends PluginSettingTab {
    plugin: FirstLineIsTitlePlugin;
    private settingsPage: HTMLDivElement | null = null;

    private readonly TABS = {
        GENERAL: { id: 'general', name: 'General', class: GeneralTab },
        INCLUDE_EXCLUDE: { id: 'include-exclude', name: 'Exclusions', class: IncludeExcludeTab },
        FORBIDDEN_CHARS: { id: 'forbidden-chars', name: 'Replace characters', class: ForbiddenCharsTab },
        CUSTOM_REPLACEMENTS: { id: 'custom-replacements', name: 'Custom rules', class: CustomReplacementsTab },
        SAFEWORDS: { id: 'safewords', name: 'Safewords', class: SafewordsTab },
        STRIP_MARKUP: { id: 'strip-markup', name: 'Strip markup', class: StripMarkupTab },
        PROPERTIES: { id: 'properties', name: 'Alias', class: PropertiesTab },
        COMMANDS: { id: 'commands', name: 'Commands', class: CommandsTab },
        ADVANCED: { id: 'advanced', name: 'Miscellaneous', class: AdvancedTab }
    };

    constructor(app: App, plugin: FirstLineIsTitlePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.containerEl.empty();

        // Create tab bar
        const tabBar = this.containerEl.createEl('nav', { cls: 'flit-settings-tab-bar' });
        tabBar.setAttribute('role', 'tablist');

        const tabElements: HTMLElement[] = [];

        const activateTab = (tabEl: HTMLElement, tabInfo: typeof this.TABS[keyof typeof this.TABS]) => {
            // Remove active class from all tabs
            for (const child of tabBar.children) {
                child.removeClass('flit-settings-tab-active');
                child.setAttribute('aria-selected', 'false');
                child.setAttribute('tabindex', '-1');
            }

            // Add active class to selected tab
            tabEl.addClass('flit-settings-tab-active');
            tabEl.setAttribute('aria-selected', 'true');
            tabEl.setAttribute('tabindex', '0');

            // Update settings and render
            this.plugin.settings.currentSettingsTab = tabInfo.id;
            this.plugin.saveSettings();
            this.renderTab(tabInfo.id);
        };

        for (const [tabKey, tabInfo] of Object.entries(this.TABS)) {
            const tabEl = tabBar.createEl('div', { cls: 'flit-settings-tab' });
            tabEl.setAttribute('data-tab-id', tabInfo.id);
            tabEl.setAttribute('role', 'tab');

            const isActive = this.plugin.settings.currentSettingsTab === tabInfo.id;
            tabEl.setAttribute('tabindex', isActive ? '0' : '-1');
            tabEl.setAttribute('aria-selected', isActive ? 'true' : 'false');

            const tabNameEl = tabEl.createEl('div', { cls: 'flit-settings-tab-name' });
            tabNameEl.innerHTML = tabInfo.name; // Use innerHTML to support line breaks

            if (isActive) {
                tabEl.addClass('flit-settings-tab-active');
            }

            // Click handler
            tabEl.addEventListener('click', () => {
                activateTab(tabEl, tabInfo);
            });

            // Keyboard handler
            tabEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateTab(tabEl, tabInfo);
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const currentIndex = tabElements.indexOf(tabEl);

                    // Build grid structure by detecting rows based on vertical position
                    const rows: HTMLElement[][] = [];
                    let currentRow: HTMLElement[] = [];
                    let lastTop = -1;

                    tabElements.forEach((tab) => {
                        const rect = tab.getBoundingClientRect();
                        if (lastTop === -1 || Math.abs(rect.top - lastTop) < 5) {
                            // Same row (within 5px tolerance)
                            currentRow.push(tab);
                            lastTop = rect.top;
                        } else {
                            // New row
                            if (currentRow.length > 0) {
                                rows.push(currentRow);
                            }
                            currentRow = [tab];
                            lastTop = rect.top;
                        }
                    });
                    if (currentRow.length > 0) {
                        rows.push(currentRow);
                    }

                    // Find current position in grid
                    let currentRowIndex = 0;
                    let currentColIndex = 0;
                    for (let r = 0; r < rows.length; r++) {
                        const colIndex = rows[r].indexOf(tabEl);
                        if (colIndex !== -1) {
                            currentRowIndex = r;
                            currentColIndex = colIndex;
                            break;
                        }
                    }

                    let nextTab: HTMLElement | null = null;

                    if (e.key === 'ArrowRight') {
                        const nextCol = currentColIndex + 1;
                        if (nextCol < rows[currentRowIndex].length) {
                            nextTab = rows[currentRowIndex][nextCol];
                        } else {
                            // Wrap to next row, first column
                            const nextRow = (currentRowIndex + 1) % rows.length;
                            nextTab = rows[nextRow][0];
                        }
                    } else if (e.key === 'ArrowLeft') {
                        const prevCol = currentColIndex - 1;
                        if (prevCol >= 0) {
                            nextTab = rows[currentRowIndex][prevCol];
                        } else {
                            // Wrap to previous row, last column
                            const prevRow = (currentRowIndex - 1 + rows.length) % rows.length;
                            nextTab = rows[prevRow][rows[prevRow].length - 1];
                        }
                    } else if (e.key === 'ArrowDown') {
                        const nextRow = currentRowIndex + 1;
                        if (nextRow < rows.length) {
                            // Stay in same column if possible, otherwise go to last column of next row
                            const targetCol = Math.min(currentColIndex, rows[nextRow].length - 1);
                            nextTab = rows[nextRow][targetCol];
                        } else {
                            // Wrap to first row
                            const targetCol = Math.min(currentColIndex, rows[0].length - 1);
                            nextTab = rows[0][targetCol];
                        }
                    } else if (e.key === 'ArrowUp') {
                        const prevRow = currentRowIndex - 1;
                        if (prevRow >= 0) {
                            // Stay in same column if possible, otherwise go to last column of previous row
                            const targetCol = Math.min(currentColIndex, rows[prevRow].length - 1);
                            nextTab = rows[prevRow][targetCol];
                        } else {
                            // Wrap to last row
                            const lastRow = rows.length - 1;
                            const targetCol = Math.min(currentColIndex, rows[lastRow].length - 1);
                            nextTab = rows[lastRow][targetCol];
                        }
                    }

                    if (nextTab) {
                        nextTab.focus();
                    }
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    tabElements[0].focus();
                } else if (e.key === 'End') {
                    e.preventDefault();
                    tabElements[tabElements.length - 1].focus();
                }
            });

            tabElements.push(tabEl);
        }

        // Create settings page container
        this.settingsPage = this.containerEl.createDiv({ cls: 'flit-settings-page' });

        // Render initial tab
        this.renderTab(this.plugin.settings.currentSettingsTab);
    }

    private renderTab(tabId: string): void {
        if (!this.settingsPage) return;

        this.settingsPage.empty();

        // Find the tab configuration
        const tabConfig = Object.values(this.TABS).find(tab => tab.id === tabId);

        if (tabConfig) {
            // Create and render the tab
            const tabInstance = new tabConfig.class(this.plugin, this.settingsPage);
            tabInstance.render();
        } else {
            // Default to general tab
            const generalTab = new GeneralTab(this.plugin, this.settingsPage);
            generalTab.render();
        }
    }
}