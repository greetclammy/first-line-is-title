import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { DEFAULT_SETTINGS } from '../constants';

export class PropertiesTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        // Function to update visual state of conditional alias settings
        const updateAliasConditionalSettings = async () => {
            // Update "Apply custom rules" visual state
            const customRulesEnabled = this.plugin.settings.enableCustomReplacements;
            applyCustomRulesInAliasSetting.components[0].setDisabled(!customRulesEnabled);
            if (customRulesEnabled) {
                applyCustomRulesInAliasSetting.settingEl.classList.remove('flit-row-disabled');
            } else {
                applyCustomRulesInAliasSetting.settingEl.classList.add('flit-row-disabled');
                // Force setting to OFF when master toggle is disabled
                if (this.plugin.settings.applyCustomRulesInAlias) {
                    this.plugin.settings.applyCustomRulesInAlias = false;
                    await this.plugin.saveSettings();
                    applyCustomRulesInAliasSetting.components[0].setValue(false);
                }
            }

            // Update "Strip markup" visual state
            const stripMarkupEnabled = this.plugin.settings.enableStripMarkup;
            stripMarkupInAliasSetting.components[0].setDisabled(!stripMarkupEnabled);
            if (stripMarkupEnabled) {
                stripMarkupInAliasSetting.settingEl.classList.remove('flit-row-disabled');
            } else {
                stripMarkupInAliasSetting.settingEl.classList.add('flit-row-disabled');
                // Force setting to OFF when master toggle is disabled
                if (this.plugin.settings.stripMarkupInAlias) {
                    this.plugin.settings.stripMarkupInAlias = false;
                    await this.plugin.saveSettings();
                    stripMarkupInAliasSetting.components[0].setValue(false);
                }
            }
        };

        // Add alias setting
        const aliasToggleSetting = new Setting(this.containerEl)
            .setName("Add alias")
            .setDesc("Always copy the first line to a property. Allows to make forbidden characters searchable.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAliases)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAliases = value;
                        this.plugin.debugLog('enableAliases', value);

                        // On first enable, turn on default toggles
                        if (value && !this.plugin.settings.hasEnabledAliases) {
                            this.plugin.settings.keepEmptyAliasProperty = true;
                            this.plugin.settings.hasEnabledAliases = true;
                        }

                        await this.plugin.saveSettings();
                        renderAliasSettings();
                    })
            );

        aliasToggleSetting.settingEl.addClass('flit-master-toggle');
        aliasToggleSetting.settingEl.addClass('flit-no-border');
        aliasToggleSetting.settingEl.style.marginBottom = '20px';

        // Create container for alias settings
        const aliasContainer = this.containerEl.createDiv({ cls: 'flit-alias-container' });

        // Store toggle references for updating visual state
        let addAliasConditionalToggle: any;
        let truncateAliasToggle: any;
        let applyCustomRulesToggle: any;
        let stripMarkupToggle: any;
        let keepEmptyToggle: any;
        let hideInSidebarToggle: any;
        let suppressMergeToggle: any;

        const renderAliasSettings = () => {
            // Update master disable state for entire section
            if (this.plugin.settings.enableAliases) {
                aliasContainer.classList.remove('flit-master-disabled');
            } else {
                aliasContainer.classList.add('flit-master-disabled');
            }

            // Update visual state of all toggles
            const showActualState = this.plugin.settings.hasEnabledAliases;

            if (addAliasConditionalToggle) {
                addAliasConditionalToggle.setValue(showActualState ? this.plugin.settings.addAliasOnlyIfFirstLineDiffers : false);
            }
            if (truncateAliasToggle) {
                truncateAliasToggle.setValue(showActualState ? this.plugin.settings.truncateAlias : false);
            }
            if (applyCustomRulesToggle) {
                applyCustomRulesToggle.setValue(showActualState ? this.plugin.settings.applyCustomRulesInAlias : false);
            }
            if (stripMarkupToggle) {
                stripMarkupToggle.setValue(showActualState ? this.plugin.settings.stripMarkupInAlias : false);
            }
            if (keepEmptyToggle) {
                keepEmptyToggle.setValue(showActualState ? this.plugin.settings.keepEmptyAliasProperty : false);
            }
            if (hideInSidebarToggle) {
                hideInSidebarToggle.setValue(showActualState ? this.plugin.settings.hideAliasInSidebar : false);
            }
            if (suppressMergeToggle) {
                suppressMergeToggle.setValue(showActualState ? this.plugin.settings.suppressMergeNotifications : false);
            }

            updateAliasConditionalSettings();
        };

        // Sub-options at first level
        const aliasPropertyKeySetting = new Setting(aliasContainer)
            .setName("Alias property name")
            .setDesc("");

        // Create styled description for alias property key
        const aliasKeyDesc = aliasPropertyKeySetting.descEl;
        aliasKeyDesc.appendText("Configure the property key in which to insert the alias.\nUse the default to make it searchable in the Quick switcher. You can also set this property as note title in ");
        const omnisearchLink = aliasKeyDesc.createEl("a", { text: "Omnisearch" });
        omnisearchLink.href = "obsidian://show-plugin?id=obsidian-omnisearch";
        omnisearchLink.style.color = "var(--text-accent)";
        aliasKeyDesc.appendText(" settings.");
        aliasKeyDesc.createEl("br");
        aliasKeyDesc.createEl("small").createEl("strong", { text: "Default: aliases" });

        // Create input container for alias property key with restore button
        const aliasPropertyKeyContainer = aliasPropertyKeySetting.controlEl.createDiv({ cls: "flit-char-text-input-container" });

        const aliasPropertyKeyRestoreButton = aliasPropertyKeyContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": "Restore default" }
        });
        setIcon(aliasPropertyKeyRestoreButton, "rotate-ccw");

        const aliasPropertyKeyTextInput = aliasPropertyKeyContainer.createEl("input", { type: "text", cls: "flit-char-text-input" });
        aliasPropertyKeyTextInput.placeholder = "Empty";
        aliasPropertyKeyTextInput.style.width = "120px";
        aliasPropertyKeyTextInput.value = this.plugin.settings.aliasPropertyKey;

        aliasPropertyKeyRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.aliasPropertyKey = DEFAULT_SETTINGS.aliasPropertyKey;
            aliasPropertyKeyTextInput.value = DEFAULT_SETTINGS.aliasPropertyKey;
            this.plugin.debugLog('aliasPropertyKey', this.plugin.settings.aliasPropertyKey);
            await this.plugin.saveSettings();
        });

        aliasPropertyKeyTextInput.addEventListener('input', async (e) => {
            const value = (e.target as HTMLInputElement).value;
            this.plugin.settings.aliasPropertyKey = value.trim() || 'aliases';
            this.plugin.debugLog('aliasPropertyKey', this.plugin.settings.aliasPropertyKey);
            await this.plugin.saveSettings();
        });

        const addAliasConditionalSetting = new Setting(aliasContainer)
            .setName("Only add alias if first line differs from title")
            .setDesc("For example, if the filename was truncated, or some characters have been omitted or replaced.")
            .addToggle((toggle) => {
                addAliasConditionalToggle = toggle;
                toggle
                    .setValue(this.plugin.settings.hasEnabledAliases ? this.plugin.settings.addAliasOnlyIfFirstLineDiffers : false)
                    .onChange(async (value) => {
                        this.plugin.settings.addAliasOnlyIfFirstLineDiffers = value;
                        this.plugin.debugLog('addAliasOnlyIfFirstLineDiffers', value);
                        await this.plugin.saveSettings();
                    });
            });

        const truncateAliasSetting = new Setting(aliasContainer)
            .setName("Truncate alias")
            .setDesc("");

        // Create styled description for truncate alias
        const truncateDesc = truncateAliasSetting.descEl;
        truncateDesc.appendText("In accordance with the ");
        truncateDesc.createEl("em", { text: "Character count" });
        truncateDesc.appendText(" value in ");
        truncateDesc.createEl("em", { text: "General" });
        truncateDesc.appendText(" settings.");

        truncateAliasSetting.addToggle((toggle) => {
                truncateAliasToggle = toggle;
                toggle
                    .setValue(this.plugin.settings.hasEnabledAliases ? this.plugin.settings.truncateAlias : false)
                    .onChange(async (value) => {
                        this.plugin.settings.truncateAlias = value;
                        this.plugin.debugLog('truncateAlias', value);
                        await this.plugin.saveSettings();
                    });
            });

        const applyCustomRulesInAliasSetting = new Setting(aliasContainer)
            .setName("Apply custom rules")
            .setDesc("");

        // Create styled description for apply custom rules
        const customRulesDesc = applyCustomRulesInAliasSetting.descEl;
        customRulesDesc.appendText("Apply custom text replacements to alias, as configured in ");
        customRulesDesc.createEl("em", { text: "Custom rules" });
        customRulesDesc.appendText(" settings.");

        applyCustomRulesInAliasSetting.addToggle((toggle) => {
                applyCustomRulesToggle = toggle;
                toggle
                    .setValue(this.plugin.settings.hasEnabledAliases ? this.plugin.settings.applyCustomRulesInAlias : false)
                    .setDisabled(!this.plugin.settings.enableCustomReplacements)
                    .onChange(async (value) => {
                        this.plugin.settings.applyCustomRulesInAlias = value;
                        this.plugin.debugLog('applyCustomRulesInAlias', value);
                        await this.plugin.saveSettings();
                    });
            });

        const stripMarkupInAliasSetting = new Setting(aliasContainer)
            .setName("Strip markup")
            .setDesc("");

        // Create styled description for strip markup
        const stripMarkupDesc = stripMarkupInAliasSetting.descEl;
        stripMarkupDesc.appendText("Omit markup syntax in alias, as configured in ");
        stripMarkupDesc.createEl("em", { text: "Strip markup" });
        stripMarkupDesc.appendText(" settings.");

        stripMarkupInAliasSetting
            .addToggle((toggle) => {
                stripMarkupToggle = toggle;
                toggle
                    .setValue(this.plugin.settings.hasEnabledAliases ? this.plugin.settings.stripMarkupInAlias : false)
                    .setDisabled(!this.plugin.settings.enableStripMarkup)
                    .onChange(async (value) => {
                        this.plugin.settings.stripMarkupInAlias = value;
                        this.plugin.debugLog('stripMarkupInAlias', value);
                        await this.plugin.saveSettings();
                    });
            });

        const keepEmptyAliasPropertySetting = new Setting(aliasContainer)
            .setName("Keep empty alias property")
            .setDesc("When the plugin removes the first line alias and no other aliases remain, keep the empty property rather than delete it.")
            .addToggle((toggle) => {
                keepEmptyToggle = toggle;
                toggle
                    .setValue(this.plugin.settings.hasEnabledAliases ? this.plugin.settings.keepEmptyAliasProperty : false)
                    .onChange(async (value) => {
                        this.plugin.settings.keepEmptyAliasProperty = value;
                        this.plugin.debugLog('keepEmptyAliasProperty', value);
                        await this.plugin.saveSettings();
                    });
            });

        const hideAliasPropertySetting = new Setting(aliasContainer)
            .setName("Hide alias property")
            .setDesc("Hide the alias property in Reading view and Live Preview. Will always remain visible in Source view.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('never', 'Never')
                    .addOption('when_empty', 'Only when empty')
                    .addOption('always', 'Always')
                    .setValue(this.plugin.settings.hideAliasProperty)
                    .onChange(async (value) => {
                        this.plugin.settings.hideAliasProperty = value as any;
                        this.plugin.debugLog('hideAliasProperty', value);
                        await this.plugin.saveSettings();
                        this.updatePropertyVisibility();
                        hideInSidebarSetting.settingEl.style.display = (value === 'when_empty' || value === 'always') ? '' : 'none';
                    })
            );

        // Create sub-settings container for "Hide in sidebar" (2nd level indent)
        const hideInSidebarContainer = aliasContainer.createDiv('flit-sub-settings');

        const hideInSidebarSetting = new Setting(hideInSidebarContainer)
            .setName("Hide in sidebar")
            .setDesc("Also hide the property in the properties sidebar.")
            .addToggle((toggle) => {
                hideInSidebarToggle = toggle;
                toggle
                    .setValue(this.plugin.settings.hasEnabledAliases ? this.plugin.settings.hideAliasInSidebar : false)
                    .onChange(async (value) => {
                        this.plugin.settings.hideAliasInSidebar = value;
                        this.plugin.debugLog('hideAliasInSidebar', value);
                        await this.plugin.saveSettings();
                        // Update property visibility when this setting changes
                        this.updatePropertyVisibility();
                    });
            });

        // Initially hide/show the sidebar setting based on current hideAliasProperty value
        hideInSidebarSetting.settingEl.style.display = (this.plugin.settings.hideAliasProperty === 'when_empty' || this.plugin.settings.hideAliasProperty === 'always') ? '' : 'none';

        const suppressMergeNotificationsSetting = new Setting(aliasContainer)
            .setName("Hide merge notifications")
            .setDesc("Suppress notifications about files being modified externally and merged automatically.")
            .addToggle((toggle) => {
                suppressMergeToggle = toggle;
                toggle
                    .setValue(this.plugin.settings.hasEnabledAliases ? this.plugin.settings.suppressMergeNotifications : false)
                    .onChange(async (value) => {
                        this.plugin.settings.suppressMergeNotifications = value;
                        this.plugin.debugLog('suppressMergeNotifications', value);
                        await this.plugin.saveSettings();
                    });
            });

        // Initialize UI
        renderAliasSettings();
    }

    private updatePropertyVisibility(): void {
        // Get reference to main plugin for property visibility update
        (this.plugin as any).updatePropertyVisibility?.();
    }
}