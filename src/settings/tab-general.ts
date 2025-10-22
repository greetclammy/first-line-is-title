import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { DEFAULT_SETTINGS } from '../constants';
import { RenameAllFilesModal } from '../modals';
import { t, getCurrentLocale } from '../i18n';

export class GeneralTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        let renameOnFocusContainer: HTMLElement;
        let placeCursorSetting: Setting;
        let convertCharsToggleContainer: HTMLElement;
        let convertCharsSetting: Setting;
        let convertCharsToggle: any;

        const updateAutomaticRenameVisibility = () => {
            if (this.plugin.settings.core.renameNotes === "automatically") {
                renameOnFocusContainer.show();
            } else {
                renameOnFocusContainer.hide();
            }
        };

        // 1. rename notes
        const renameNotesSetting = new Setting(this.containerEl)
            .setName(t('settings.general.renameNotes.name'))
            .setDesc("");

        // Create styled description for rename notes
        const renameNotesDesc = renameNotesSetting.descEl;
        renameNotesDesc.appendText(t('settings.general.renameNotes.desc'));

        renameNotesSetting.addDropdown((dropdown) =>
                dropdown
                    .addOption("automatically", t('settings.general.renameNotes.automatically'))
                    .addOption("manually", t('settings.general.renameNotes.manually'))
                    .setValue(this.plugin.settings.core.renameNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.core.renameNotes = value as "automatically" | "manually";
                        this.plugin.debugLog('renameNotes', value);
                        await this.plugin.saveSettings();
                        updateAutomaticRenameVisibility();
                        (this.plugin as typeof this.plugin & { updateAutomaticRenameVisibility?: () => void }).updateAutomaticRenameVisibility?.();
                    })
            );

        // Create shared container for automatic rename sub-options
        const automaticRenameContainer = this.containerEl.createDiv('flit-sub-settings');

        // Create sub-option for rename on focus
        const renameOnFocusSetting = new Setting(automaticRenameContainer)
            .setName(t('settings.general.renameOnFocus.name'))
            .setDesc(t('settings.general.renameOnFocus.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.core.renameOnFocus)
                    .onChange(async (value) => {
                        this.plugin.settings.core.renameOnFocus = value;
                        this.plugin.debugLog('renameOnFocus', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Alias container for visibility updates
        renameOnFocusContainer = automaticRenameContainer;

        // Set initial visibility
        updateAutomaticRenameVisibility();

        // 2. only rename if heading
        new Setting(this.containerEl)
            .setName(t('settings.general.onlyRenameIfHeading.name'))
            .setDesc(t('settings.general.onlyRenameIfHeading.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.core.onlyRenameIfHeading)
                    .onChange(async (value) => {
                        this.plugin.settings.core.onlyRenameIfHeading = value;
                        this.plugin.debugLog('onlyRenameIfHeading', value);
                        await this.plugin.saveSettings();
                    })
            );

        let cursorOptionsContainer: HTMLElement;

        const updateCursorOptionsVisibility = () => {
            if (this.plugin.settings.core.moveCursorToFirstLine) {
                cursorOptionsContainer.show();
            } else {
                cursorOptionsContainer.hide();
            }
        };

        new Setting(this.containerEl)
            .setName(t('settings.general.moveCursorToFirstLine.name'))
            .setDesc(t('settings.general.moveCursorToFirstLine.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.core.moveCursorToFirstLine)
                    .onChange(async (value) => {
                        this.plugin.settings.core.moveCursorToFirstLine = value;
                        this.plugin.debugLog('moveCursorToFirstLine', value);
                        await this.plugin.saveSettings();
                        updateCursorOptionsVisibility();
                    })
            );

        cursorOptionsContainer = this.containerEl.createDiv('flit-sub-settings');

        placeCursorSetting = new Setting(cursorOptionsContainer)
            .setName(t('settings.general.placeCursorAtLineEnd.name'))
            .setDesc(t('settings.general.placeCursorAtLineEnd.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.core.placeCursorAtLineEnd)
                    .onChange(async (value) => {
                        this.plugin.settings.core.placeCursorAtLineEnd = value;
                        this.plugin.debugLog('placeCursorAtLineEnd', value);
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(cursorOptionsContainer)
            .setName(t('settings.general.disableInExcludedNotes.name'))
            .setDesc(t('settings.general.disableInExcludedNotes.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.core.disableCursorInExcludedNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.core.disableCursorInExcludedNotes = value;
                        this.plugin.debugLog('disableCursorInExcludedNotes', value);
                        await this.plugin.saveSettings();
                    })
            );

        const waitForTemplateSetting = new Setting(cursorOptionsContainer)
            .setName(t('settings.general.waitForTemplate.name'))
            .setDesc("");

        // Create styled description for wait for template
        const waitForTemplateDesc = waitForTemplateSetting.descEl;
        waitForTemplateDesc.appendText(t('settings.general.waitForTemplate.desc.part1'));
        // Add Templater link
        waitForTemplateDesc.createEl("a", {
            text: t('settings.general.waitForTemplate.desc.templater'),
            href: "obsidian://show-plugin?id=templater-obsidian"
        });
        waitForTemplateDesc.appendText(t('settings.general.waitForTemplate.desc.part2'));
        if (getCurrentLocale() === 'ru') {
            waitForTemplateDesc.appendText('«' + t('settings.general.waitForTemplate.desc.exclusions') + '»');
        } else {
            waitForTemplateDesc.createEl("em", { text: t('settings.general.waitForTemplate.desc.exclusions') });
        }
        waitForTemplateDesc.appendText(t('settings.general.waitForTemplate.desc.part3'));
        if (getCurrentLocale() === 'ru') {
            waitForTemplateDesc.appendText('«' + t('settings.general.waitForTemplate.desc.placeCursorAtLineEnd') + '»');
        } else {
            waitForTemplateDesc.createEl("em", { text: t('settings.general.waitForTemplate.desc.placeCursorAtLineEnd') });
        }
        waitForTemplateDesc.appendText(t('settings.general.waitForTemplate.desc.part4'));

        waitForTemplateSetting.addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.core.waitForCursorTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.core.waitForCursorTemplate = value;
                    this.plugin.debugLog('waitForCursorTemplate', value);
                    await this.plugin.saveSettings();
                })
        );

        updateCursorOptionsVisibility();

        let waitForTemplateContainer: HTMLElement;

        const updateWaitForTemplateVisibility = () => {
            if (this.plugin.settings.core.insertTitleOnCreation) {
                waitForTemplateContainer.show();
            } else {
                waitForTemplateContainer.hide();
            }
        };

        // Function to update convert chars toggle visibility based on replace forbidden chars setting
        const updateConvertCharsToggleVisibility = () => {
            if (this.plugin.settings.replaceCharacters.enableForbiddenCharReplacements) {
                convertCharsToggleContainer.classList.remove('flit-state-disabled');
                convertCharsToggleContainer.classList.remove('flit-opacity-half');
                convertCharsToggleContainer.classList.remove('flit-pointer-none');
                convertCharsSetting.setDisabled(false);
                if (convertCharsToggle) {
                    convertCharsToggle.toggleEl.tabIndex = 0;
                    convertCharsToggle.toggleEl.removeAttribute('aria-disabled');
                    convertCharsToggle.toggleEl.classList.remove('flit-pointer-none');
                }
            } else {
                // Only apply opacity if parent doesn't already have flit-master-disabled
                // to prevent opacity stacking (0.5 × 0.5 = 0.25)
                if (!waitForTemplateContainer.classList.contains('flit-master-disabled')) {
                    convertCharsToggleContainer.classList.add('flit-opacity-half');
                }
                convertCharsToggleContainer.classList.add('flit-pointer-none');
                convertCharsSetting.setDisabled(true);
                if (convertCharsToggle) {
                    convertCharsToggle.toggleEl.tabIndex = -1;
                    convertCharsToggle.toggleEl.setAttribute('aria-disabled', 'true');
                    convertCharsToggle.toggleEl.classList.add('flit-pointer-none');
                }
            }
        };

        const insertTitleSetting = new Setting(this.containerEl)
            .setName(t('settings.general.insertTitleOnCreation.name'))
            .setDesc("");

        // Create styled description
        const insertTitleDesc = insertTitleSetting.descEl;
        insertTitleDesc.appendText(t('settings.general.insertTitleOnCreation.desc.part1'));
        if (getCurrentLocale() === 'ru') {
            insertTitleDesc.appendText('«' + t('settings.general.insertTitleOnCreation.desc.untitled') + '»');
        } else {
            insertTitleDesc.createEl("em", { text: t('settings.general.insertTitleOnCreation.desc.untitled') });
        }
        insertTitleDesc.appendText(t('settings.general.insertTitleOnCreation.desc.part2'));

        insertTitleSetting.addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.core.insertTitleOnCreation)
                .onChange(async (value) => {
                    this.plugin.settings.core.insertTitleOnCreation = value;
                    this.plugin.debugLog('insertTitleOnCreation', value);
                    await this.plugin.saveSettings();
                    updateWaitForTemplateVisibility();
                })
        );

        waitForTemplateContainer = this.containerEl.createDiv('flit-sub-settings');

        const insertAfterTemplateSetting = new Setting(waitForTemplateContainer)
            .setName(t('settings.general.insertAfterTemplate.name'))
            .setDesc("");

        // Create styled description for insert after template
        const insertAfterTemplateDesc = insertAfterTemplateSetting.descEl;
        insertAfterTemplateDesc.appendText(t('settings.general.insertAfterTemplate.desc.part1'));
        // Add Templater link
        insertAfterTemplateDesc.createEl("a", {
            text: t('settings.general.insertAfterTemplate.desc.templater'),
            href: "obsidian://show-plugin?id=templater-obsidian"
        });
        insertAfterTemplateDesc.appendText(t('settings.general.insertAfterTemplate.desc.part2'));

        insertAfterTemplateSetting.addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.core.waitForTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.core.waitForTemplate = value;
                        this.plugin.debugLog('waitForTemplate', value);
                        await this.plugin.saveSettings();
                    })
            );

        convertCharsSetting = new Setting(waitForTemplateContainer)
            .setName(t('settings.general.convertReplacementCharactersInTitle.name'))
            .setDesc("");

        // Create styled description for convert chars setting
        const convertCharsDesc = convertCharsSetting.descEl;
        convertCharsDesc.appendText(t('settings.general.convertReplacementCharactersInTitle.desc.part1'));
        if (getCurrentLocale() === 'ru') {
            convertCharsDesc.appendText('«' + t('settings.general.convertReplacementCharactersInTitle.desc.replaceCharacters') + '»');
        } else {
            convertCharsDesc.createEl("em", { text: t('settings.general.convertReplacementCharactersInTitle.desc.replaceCharacters') });
        }
        convertCharsDesc.appendText(t('settings.general.convertReplacementCharactersInTitle.desc.part2'));

        convertCharsSetting.addToggle((toggle) => {
                convertCharsToggle = toggle;
                toggle
                    .setValue(this.plugin.settings.core.convertReplacementCharactersInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.core.convertReplacementCharactersInTitle = value;
                        this.plugin.debugLog('convertReplacementCharactersInTitle', value);
                        await this.plugin.saveSettings();
                    });

                // Set initial accessibility state
                if (!this.plugin.settings.replaceCharacters.enableForbiddenCharReplacements) {
                    toggle.toggleEl.tabIndex = -1;
                    toggle.toggleEl.setAttribute('aria-disabled', 'true');
                    toggle.toggleEl.classList.add('flit-pointer-none');
                }
            });

        convertCharsToggleContainer = convertCharsSetting.settingEl;

        updateConvertCharsToggleVisibility();

        new Setting(waitForTemplateContainer)
            .setName(t('settings.general.formatAsHeading.name'))
            .setDesc(t('settings.general.formatAsHeading.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.markupStripping.addHeadingToTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.markupStripping.addHeadingToTitle = value;
                        this.plugin.debugLog('addHeadingToTitle', value);
                        await this.plugin.saveSettings();
                    })
            );

        updateWaitForTemplateVisibility();

        new Setting(this.containerEl)
            .setName(t('settings.general.renameOnSave.name'))
            .setDesc(t('settings.general.renameOnSave.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.core.renameOnSave)
                    .onChange(async (value) => {
                        this.plugin.settings.core.renameOnSave = value;
                        this.plugin.debugLog('renameOnSave', value);
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.containerEl)
            .setName(t('settings.general.renameAllNotes.name'))
            .setDesc(t('settings.general.renameAllNotes.desc'))
            .addButton((button) =>
                button.setButtonText(t('settings.general.renameAllNotes.button')).onClick(() => {
                    new RenameAllFilesModal(this.plugin.app, this.plugin as any).open();
                })
            );

        const feedbackContainer = this.containerEl.createEl("div", {
            cls: "flit-feedback-container"
        });

        const button = feedbackContainer.createEl("button", {
            cls: "mod-cta flit-leave-feedback-button flit-feedback-button"
        });
        button.addEventListener('click', () => {
            window.open("https://github.com/greetclammy/first-line-is-title/issues", "_blank");
        });

        const iconDiv = button.createEl("div");
        setIcon(iconDiv, "message-square-reply");

        button.appendText(t('settings.general.leaveFeedback'));

        // Create updateGeneralConditionalSettings function for cross-tab updates
        const updateGeneralConditionalSettings = async () => {
            if (convertCharsSetting && convertCharsToggle && convertCharsToggleContainer) {
                updateConvertCharsToggleVisibility();
            }
        };

        // Assign to plugin for cross-tab access
        (this.plugin as typeof this.plugin & { updateGeneralConditionalSettings?: () => Promise<void> }).updateGeneralConditionalSettings = updateGeneralConditionalSettings;
    }
}