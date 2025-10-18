import { Platform, Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { DEFAULT_SETTINGS } from '../constants';
import { t, getCurrentLocale } from '../i18n';

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
                applyCustomRulesToggle.toggleEl.tabIndex = 0;
                applyCustomRulesToggle.toggleEl.removeAttribute('aria-disabled');
                applyCustomRulesToggle.toggleEl.style.pointerEvents = '';
            } else {
                applyCustomRulesInAliasSetting.settingEl.classList.add('flit-row-disabled');
                applyCustomRulesToggle.toggleEl.tabIndex = -1;
                applyCustomRulesToggle.toggleEl.setAttribute('aria-disabled', 'true');
                applyCustomRulesToggle.toggleEl.style.pointerEvents = 'none';
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
                stripMarkupToggle.toggleEl.tabIndex = 0;
                stripMarkupToggle.toggleEl.removeAttribute('aria-disabled');
                stripMarkupToggle.toggleEl.style.pointerEvents = '';
            } else {
                stripMarkupInAliasSetting.settingEl.classList.add('flit-row-disabled');
                stripMarkupToggle.toggleEl.tabIndex = -1;
                stripMarkupToggle.toggleEl.setAttribute('aria-disabled', 'true');
                stripMarkupToggle.toggleEl.style.pointerEvents = 'none';
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
            .setName(t('settings.alias.addAlias.name'))
            .setDesc(t('settings.alias.addAlias.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAliases)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAliases = value;
                        this.plugin.debugLog('enableAliases', value);

                        // On first enable, turn on default toggles
                        if (value && !this.plugin.settings.hasEnabledAliases) {
                            this.plugin.settings.keepEmptyAliasProperty = true;
                            // Enable stripMarkupInAlias if enableStripMarkup is ON
                            if (this.plugin.settings.enableStripMarkup) {
                                this.plugin.settings.stripMarkupInAlias = true;
                            }
                            // Enable applyCustomRulesInAlias if enableCustomReplacements is ON
                            if (this.plugin.settings.enableCustomReplacements) {
                                this.plugin.settings.applyCustomRulesInAlias = true;
                            }
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
            this.updateInteractiveState(aliasContainer, this.plugin.settings.enableAliases);
            // Also update any disabled rows
            this.updateDisabledRowsAccessibility(aliasContainer);

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
            .setName(t('settings.alias.aliasPropertyName.name'))
            .setDesc("");

        // Create styled description for alias property key
        const aliasKeyDesc = aliasPropertyKeySetting.descEl;
        aliasKeyDesc.appendText(t('settings.alias.aliasPropertyName.desc'));

        // Create bullet list for notes within descEl
        const aliasNotesDesc = aliasKeyDesc.createEl("div");
        aliasNotesDesc.style.marginTop = "6px";
        aliasNotesDesc.style.marginBottom = "0px";

        const ul = aliasNotesDesc.createEl('ul');
        ul.style.margin = '0';
        ul.style.paddingLeft = '20px';

        ul.createEl('li', { text: t('settings.alias.aliasPropertyName.quickSwitcher') });

        ul.createEl('li', { text: t('settings.alias.aliasPropertyName.multipleProperties') });

        const li2 = ul.createEl('li');
        li2.appendText(t('settings.alias.aliasPropertyName.noteTitle.part1'));
        li2.createEl("a", {
            text: "Omnisearch",
            href: "obsidian://show-plugin?id=omnisearch"
        });
        li2.appendText(t('settings.alias.aliasPropertyName.noteTitle.part2'));
        li2.createEl("a", {
            text: "Notebook Navigator",
            href: "obsidian://show-plugin?id=notebook-navigator"
        });
        li2.appendText(t('settings.alias.aliasPropertyName.noteTitle.part3'));
        li2.createEl("a", {
            text: "Front Matter Title",
            href: "obsidian://show-plugin?id=obsidian-front-matter-title-plugin"
        });
        li2.appendText(t('settings.alias.aliasPropertyName.noteTitle.part4'));

        aliasKeyDesc.createEl("br");
        aliasKeyDesc.createEl("small").createEl("strong", { text: t('settings.alias.aliasPropertyName.default') });

        // Create input container for alias property key with restore button
        const aliasPropertyKeyContainer = aliasPropertyKeySetting.controlEl.createDiv({ cls: "flit-char-text-input-container" });

        const aliasPropertyKeyRestoreButton = aliasPropertyKeyContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": t('settings.replaceCharacters.restoreDefault') }
        });
        setIcon(aliasPropertyKeyRestoreButton, "rotate-ccw");

        const aliasPropertyKeyTextInput = aliasPropertyKeyContainer.createEl("input", { type: "text", cls: "flit-char-text-input" });
        aliasPropertyKeyTextInput.placeholder = t('settings.replaceCharacters.emptyPlaceholder');
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
            .setName(t('settings.alias.onlyAddIfDiffers.name'))
            .setDesc(t('settings.alias.onlyAddIfDiffers.desc'))
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
            .setName(t('settings.alias.truncateAlias.name'))
            .setDesc("");

        // Create styled description for truncate alias
        const truncateDesc = truncateAliasSetting.descEl;
        truncateDesc.appendText(t('settings.alias.truncateAlias.desc.part1'));
        if (getCurrentLocale() === 'ru') {
            truncateDesc.appendText('«' + t('settings.alias.truncateAlias.desc.charCount') + '»');
        } else {
            truncateDesc.createEl("em", { text: t('settings.alias.truncateAlias.desc.charCount') });
        }
        truncateDesc.appendText(t('settings.alias.truncateAlias.desc.part2'));
        if (getCurrentLocale() === 'ru') {
            truncateDesc.appendText('«' + t('settings.alias.truncateAlias.desc.miscellaneous') + '»');
        } else {
            truncateDesc.createEl("em", { text: t('settings.alias.truncateAlias.desc.miscellaneous') });
        }
        truncateDesc.appendText(t('settings.alias.truncateAlias.desc.part3'));

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
            .setName(t('settings.alias.applyCustomRules.name'))
            .setDesc("");

        // Create styled description for apply custom rules
        const customRulesDesc = applyCustomRulesInAliasSetting.descEl;
        customRulesDesc.appendText(t('settings.alias.applyCustomRules.desc.part1'));
        if (getCurrentLocale() === 'ru') {
            customRulesDesc.appendText('«' + t('settings.alias.applyCustomRules.desc.customRules') + '»');
        } else {
            customRulesDesc.createEl("em", { text: t('settings.alias.applyCustomRules.desc.customRules') });
        }
        customRulesDesc.appendText(t('settings.alias.applyCustomRules.desc.part2'));

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

                // Set initial accessibility state
                if (!this.plugin.settings.enableCustomReplacements) {
                    toggle.toggleEl.tabIndex = -1;
                    toggle.toggleEl.setAttribute('aria-disabled', 'true');
                    toggle.toggleEl.style.pointerEvents = 'none';
                }
            });

        const stripMarkupInAliasSetting = new Setting(aliasContainer)
            .setName(t('settings.alias.stripMarkup.name'))
            .setDesc("");

        // Create styled description for strip markup
        const stripMarkupDesc = stripMarkupInAliasSetting.descEl;
        stripMarkupDesc.appendText(t('settings.alias.stripMarkup.desc.part1'));
        if (getCurrentLocale() === 'ru') {
            stripMarkupDesc.appendText('«' + t('settings.alias.stripMarkup.desc.stripMarkup') + '»');
        } else {
            stripMarkupDesc.createEl("em", { text: t('settings.alias.stripMarkup.desc.stripMarkup') });
        }
        stripMarkupDesc.appendText(t('settings.alias.stripMarkup.desc.part2'));

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

                // Set initial accessibility state
                if (!this.plugin.settings.enableStripMarkup) {
                    toggle.toggleEl.tabIndex = -1;
                    toggle.toggleEl.setAttribute('aria-disabled', 'true');
                    toggle.toggleEl.style.pointerEvents = 'none';
                }
            });

        const keepEmptyAliasPropertySetting = new Setting(aliasContainer)
            .setName(t('settings.alias.keepEmptyProperty.name'))
            .setDesc(t('settings.alias.keepEmptyProperty.desc'))
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
            .setName(t('settings.alias.hideProperty.name'))
            .setDesc(t('settings.alias.hideProperty.desc'))
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('never', t('settings.alias.hideProperty.never'))
                    .addOption('when_empty', t('settings.alias.hideProperty.onlyWhenEmpty'))
                    .addOption('always', t('settings.alias.hideProperty.always'))
                    .setValue(this.plugin.settings.hideAliasProperty)
                    .onChange(async (value) => {
                        this.plugin.settings.hideAliasProperty = value as 'never' | 'when_empty' | 'always';
                        this.plugin.debugLog('hideAliasProperty', value);
                        await this.plugin.saveSettings();
                        this.updatePropertyVisibility();
                        hideInSidebarSetting.settingEl.style.display = (value === 'when_empty' || value === 'always') ? '' : 'none';
                    })
            );

        // Create sub-settings container for "Hide in sidebar" (2nd level indent)
        const hideInSidebarContainer = aliasContainer.createDiv('flit-sub-settings');

        const hideInSidebarSetting = new Setting(hideInSidebarContainer)
            .setName(t('settings.alias.hideInSidebar.name'))
            .setDesc(t('settings.alias.hideInSidebar.desc'))
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
            .setName(t('settings.alias.hideMergeNotifications.name'))
            .setDesc(t('settings.alias.hideMergeNotifications.desc'))
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

        // Limitations subsection (desktop only)
        if (!Platform.isMobile) {
            const limitationsSetting = new Setting(aliasContainer)
                .setName(t('settings.alias.limitations.title'))
                .setDesc("");

            limitationsSetting.settingEl.addClass('flit-section-header');

            // Create limitations description
            const limitationsContainer = aliasContainer.createDiv();
            const limitationsDesc = limitationsContainer.createEl("p", { cls: "setting-item-description" });
            limitationsDesc.style.marginTop = "12px";
            limitationsDesc.appendText(t('settings.alias.limitations.desc.part1'));
            limitationsDesc.createEl("a", {
                text: "Hover Editor",
                href: "obsidian://show-plugin?id=obsidian-hover-editor"
            });
            limitationsDesc.appendText(t('settings.alias.limitations.desc.part2'));
        }

        // Initialize UI
        renderAliasSettings();

        // Ensure conditional settings are updated on initial render
        updateAliasConditionalSettings();

        // Register update function on plugin for cross-tab communication
        (this.plugin as typeof this.plugin & { updateAliasConditionalSettings?: () => Promise<void> }).updateAliasConditionalSettings = updateAliasConditionalSettings;
    }

    private updatePropertyVisibility(): void {
        // Get reference to main plugin for property visibility update
        this.plugin.updatePropertyVisibility();
    }
}