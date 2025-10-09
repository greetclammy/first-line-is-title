import { Setting } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';

export class StripMarkupTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        // Master toggle
        const masterToggleSetting = new Setting(this.containerEl)
            .setName("Strip markup")
            .setDesc("Set markup syntax to omit in filenames.")
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
                        (this.plugin as any).updateAliasConditionalSettings?.();
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
            { key: 'italic', name: 'Strip italic markup', desc: 'For example, turn *Hello* or _Hello_ into Hello.' },
            { key: 'bold', name: 'Strip bold markup', desc: 'For example, turn **Hello** or __Hello__ into Hello.' },
            { key: 'strikethrough', name: 'Strip strikethrough markup', desc: 'For example, turn ~~Hello~~ into Hello.' },
            { key: 'highlight', name: 'Strip highlight markup', desc: 'For example, turn ==Hello== into Hello.' },
            { key: 'code', name: 'Strip code markup', desc: 'For example, turn `Hello` into Hello.' },
            { key: 'comments', name: 'Strip comment markup', desc: 'For example, turn %%Hello%% or <!--Hello--> into Hello.' },
            { key: 'tasks', name: 'Strip task markup', desc: 'For example, turn - [x] Hello into Hello.' },
            { key: 'headings', name: 'Strip heading markup', desc: 'For example, turn ### Hello into Hello.' },
            { key: 'blockquote', name: 'Strip blockquote markup', desc: 'For example, turn >Hello into Hello.' },
            { key: 'callouts', name: 'Strip callout markup', desc: 'For example, turn >[!info] Hello into Hello.' },
            { key: 'footnotes', name: 'Strip footnote markup', desc: 'For example, turn Hello[^1] or Hello^[note] into Hello.' },
            { key: 'wikilinks', name: 'Strip wikilink markup', desc: 'For example, turn [[Hello]] or [[Hi|Hello]] into Hello.' },
            { key: 'markdownLinks', name: 'Strip markdown link markup', desc: 'For example, turn [Hello](https://example.org) into Hello.' },
            { key: 'htmlTags', name: 'Strip HTML tags', desc: 'For example, turn <u>Hello</u> into Hello.' }
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
            new Setting(stripMarkupContainer)
                .setName(toggle.name)
                .setDesc(toggle.desc)
                .addToggle((toggleControl) =>
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
                        })
                );

            // Add sub-option right after comments toggle
            if (toggle.key === 'comments') {
                const stripCommentsEntirelySetting = new Setting(stripMarkupContainer)
                    .setName("Strip comments entirely")
                    .setDesc("Don't put the comment itself in title.")
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
            .setName("Strip Templater syntax")
            .setDesc("");

        // Create styled description for Templater setting
        const templaterDesc = templaterSetting.descEl;
        templaterDesc.appendText("Omit ");
        templaterDesc.createEl("a", {
            text: "Templater",
            href: "obsidian://show-plugin?id=templater-obsidian"
        });
        templaterDesc.appendText(" syntax like ");
        templaterDesc.createEl("code", { text: "<% tp.file.cursor() %>" });
        templaterDesc.appendText(".");

        templaterSetting
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.stripTemplaterSyntax)
                    .onChange(async (value) => {
                        this.plugin.settings.stripTemplaterSyntax = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Initialize UI
        updateStripMarkupUI();
    }
}