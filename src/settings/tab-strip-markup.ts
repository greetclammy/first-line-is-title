import { Setting } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { t, getCurrentLocale } from '../i18n';

export class StripMarkupTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        // Master toggle
        const masterToggleSetting = new Setting(this.containerEl)
            .setName(t('settings.stripMarkup.name'))
            .setDesc(t('settings.stripMarkup.desc'))
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableStripMarkup)
                    .onChange(async (value) => {
                        this.plugin.settings.enableStripMarkup = value;
                        this.plugin.debugLog("enableStripMarkup", value);

                        // Auto-toggle OFF dependent settings when disabling
                        if (!value) {
                            if (this.plugin.settings.stripMarkupInAlias) {
                                this.plugin.settings.stripMarkupInAlias = false;
                            }
                        }

                        await this.plugin.saveSettings();
                        updateStripMarkupUI();
                        // Notify other tabs to update dependent settings
                        (this.plugin as typeof this.plugin & { updateAliasConditionalSettings?: () => Promise<void> }).updateAliasConditionalSettings?.();
                    });
            });

        masterToggleSetting.settingEl.addClass('flit-master-toggle');
        masterToggleSetting.settingEl.addClass('flit-no-border');
        masterToggleSetting.settingEl.style.marginBottom = '20px';

        // Container for individual settings
        const stripMarkupContainer = this.containerEl.createDiv({ cls: 'flit-strip-markup-container' });

        const updateStripMarkupUI = () => {
            this.updateInteractiveState(stripMarkupContainer, this.plugin.settings.enableStripMarkup);
            // Also update any disabled rows
            this.updateDisabledRowsAccessibility(stripMarkupContainer);
        };

        // Individual markup toggles
        const markupToggles = [
            { key: 'headings' },
            { key: 'bold' },
            { key: 'italic' },
            { key: 'strikethrough' },
            { key: 'highlight' },
            { key: 'wikilinks' },
            { key: 'markdownLinks' },
            { key: 'quote' },
            { key: 'callouts' },
            { key: 'unorderedLists' },
            { key: 'orderedLists' },
            { key: 'taskLists' },
            { key: 'code' },
            { key: 'codeBlocks' },
            { key: 'footnotes' },
            { key: 'comments' },
            { key: 'stripTableMarkup', isCustom: true },
            { key: 'htmlTags' }
        ];

        // Define container and visibility function for comments sub-option
        let stripCommentsEntirelyContainer: HTMLElement;

        const updateStripCommentsEntirelyVisibility = () => {
            if (this.plugin.settings.stripMarkupSettings.comments) {
                stripCommentsEntirelyContainer.show();
            } else {
                stripCommentsEntirelyContainer.hide();
            }
        };

        markupToggles.forEach((toggle) => {
            const setting = new Setting(stripMarkupContainer)
                .setName(t(`settings.stripMarkup.${toggle.key}.name`))
                .setDesc("");

            // Create styled description if needed
            if (toggle.key === 'stripTableMarkup') {
                const desc = setting.descEl;
                desc.appendText(t('settings.stripMarkup.stripTableMarkup.desc.part1'));
                if (getCurrentLocale() === 'ru') {
                    desc.appendText('«' + t('settings.stripMarkup.stripTableMarkup.desc.table') + '»');
                } else {
                    desc.createEl("em", { text: t('settings.stripMarkup.stripTableMarkup.desc.table') });
                }
                desc.appendText(t('settings.stripMarkup.stripTableMarkup.desc.part2'));
            } else {
                setting.descEl.appendText(t(`settings.stripMarkup.${toggle.key}.desc`));
            }

            setting.addToggle((toggleControl) => {
                if ((toggle as any).isCustom) {
                    // Custom setting - access directly from plugin settings
                    toggleControl
                        .setValue(this.plugin.settings[toggle.key as keyof typeof this.plugin.settings] as boolean)
                        .onChange(async (value) => {
                            (this.plugin.settings[toggle.key as keyof typeof this.plugin.settings] as boolean) = value;
                            this.plugin.debugLog(toggle.key, value);
                            await this.plugin.saveSettings();
                        });
                } else {
                    // Standard markup setting
                    toggleControl
                        .setValue(this.plugin.settings.stripMarkupSettings[toggle.key as keyof typeof this.plugin.settings.stripMarkupSettings])
                        .onChange(async (value) => {
                            this.plugin.settings.stripMarkupSettings[toggle.key as keyof typeof this.plugin.settings.stripMarkupSettings] = value;
                            this.plugin.debugLog(`stripMarkupSettings.${toggle.key}`, value);
                            await this.plugin.saveSettings();

                            // Update visibility of comments sub-option
                            if (toggle.key === 'comments') {
                                updateStripCommentsEntirelyVisibility();
                            }
                        });
                }
            });

            // Add sub-option right after comments toggle
            if (toggle.key === 'comments') {
                const stripCommentsEntirelySetting = new Setting(stripMarkupContainer)
                    .setName(t('settings.stripMarkup.commentsEntirely.name'))
                    .setDesc(t('settings.stripMarkup.commentsEntirely.desc'))
                    .addToggle((toggle) =>
                        toggle
                            .setValue(this.plugin.settings.stripCommentsEntirely)
                            .onChange(async (value) => {
                                this.plugin.settings.stripCommentsEntirely = value;
                                this.plugin.debugLog('stripCommentsEntirely', value);
                                await this.plugin.saveSettings();
                            })
                    );

                // Create container for strip comments entirely sub-option
                stripCommentsEntirelyContainer = stripMarkupContainer.createDiv('flit-sub-settings');
                stripCommentsEntirelyContainer.appendChild(stripCommentsEntirelySetting.settingEl);

                // Set initial visibility
                updateStripCommentsEntirelyVisibility();
            }
        });

        // Legacy Templater toggle
        const templaterSetting = new Setting(stripMarkupContainer)
            .setName(t('settings.stripMarkup.templater.name'))
            .setDesc("");

        // Create styled description for Templater setting
        const templaterDesc = templaterSetting.descEl;
        templaterDesc.appendText(t('settings.stripMarkup.templater.desc.part1'));
        templaterDesc.createEl("a", {
            text: "Templater",
            href: "obsidian://show-plugin?id=templater-obsidian"
        });
        templaterDesc.appendText(t('settings.stripMarkup.templater.desc.part2'));
        templaterDesc.createEl("code", { text: t('settings.stripMarkup.templater.desc.code') });
        templaterDesc.appendText(t('settings.stripMarkup.templater.desc.part3'));

        templaterSetting
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.stripTemplaterSyntax)
                    .onChange(async (value) => {
                        this.plugin.settings.stripTemplaterSyntax = value;
                        this.plugin.debugLog('stripTemplaterSyntax', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Initialize UI
        updateStripMarkupUI();
    }
}