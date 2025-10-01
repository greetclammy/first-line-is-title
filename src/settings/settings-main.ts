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

        for (const [tabKey, tabInfo] of Object.entries(this.TABS)) {
            const tabEl = tabBar.createEl('div', { cls: 'flit-settings-tab' });
            tabEl.setAttribute('data-tab-id', tabInfo.id);
            const tabNameEl = tabEl.createEl('div', { cls: 'flit-settings-tab-name' });
            tabNameEl.innerHTML = tabInfo.name; // Use innerHTML to support line breaks

            if (this.plugin.settings.currentSettingsTab === tabInfo.id) {
                tabEl.addClass('flit-settings-tab-active');
            }

            tabEl.addEventListener('click', () => {
                // Remove active class from all tabs
                for (const child of tabBar.children) {
                    child.removeClass('flit-settings-tab-active');
                }

                // Add active class to clicked tab
                tabEl.addClass('flit-settings-tab-active');

                // Update settings and render
                this.plugin.settings.currentSettingsTab = tabInfo.id;
                this.plugin.saveSettings();
                this.renderTab(tabInfo.id);
            });
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