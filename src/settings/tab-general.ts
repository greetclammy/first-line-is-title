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
        let waitForTemplateCursorSetting: Setting;

        const updateAutomaticRenameVisibility = () => {
            if (this.plugin.settings.renameNotes === "automatically") {
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
                    .setValue(this.plugin.settings.renameNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.renameNotes = value as "automatically" | "manually";
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
                    .setValue(this.plugin.settings.renameOnFocus)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnFocus = value;
                        this.plugin.debugLog('renameOnFocus', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Alias container for visibility updates
        renameOnFocusContainer = automaticRenameContainer;

        // Set initial visibility
        updateAutomaticRenameVisibility();

        // 2. what to put in title
        new Setting(this.containerEl)
            .setName(t('settings.general.whatToPutInTitle.name'))
            .setDesc(t('settings.general.whatToPutInTitle.desc'))
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("any_first_line_content", t('settings.general.whatToPutInTitle.anyText'))
                    .addOption("headings_only", t('settings.general.whatToPutInTitle.headingsOnly'))
                    .setValue(this.plugin.settings.whatToPutInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.whatToPutInTitle = value as "any_first_line_content" | "headings_only";
                        this.plugin.debugLog('whatToPutInTitle', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Move cursor to first line
        new Setting(this.containerEl)
            .setName(t('settings.general.moveCursorToFirstLine.name'))
            .setDesc(t('settings.general.moveCursorToFirstLine.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.moveCursorToFirstLine)
                    .onChange(async (value) => {
                        this.plugin.settings.moveCursorToFirstLine = value;
                        this.plugin.debugLog('moveCursorToFirstLine', value);
                        await this.plugin.saveSettings();
                        updateCursorOptionsVisibility();
                    })
            );

        // Create cursor options sub-container
        const cursorOptionsContainer = this.containerEl.createDiv('flit-sub-settings');

        // Place cursor at line end
        placeCursorSetting = new Setting(cursorOptionsContainer)
            .setName(t('settings.general.placeCursorAtLineEnd.name'))
            .setDesc(t('settings.general.placeCursorAtLineEnd.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.placeCursorAtLineEnd)
                    .onChange(async (value) => {
                        this.plugin.settings.placeCursorAtLineEnd = value;
                        this.plugin.debugLog('placeCursorAtLineEnd', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Disable in excluded folders
        new Setting(cursorOptionsContainer)
            .setName(t('settings.general.disableInExcludedFolders.name'))
            .setDesc(t('settings.general.disableInExcludedFolders.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.disableCursorInExcludedFolders)
                    .onChange(async (value) => {
                        this.plugin.settings.disableCursorInExcludedFolders = value;
                        this.plugin.debugLog('disableCursorInExcludedFolders', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Wait for cursor template
        waitForTemplateCursorSetting = new Setting(cursorOptionsContainer)
            .setName(t('settings.general.waitForTemplate.name'))
            .setDesc(t('settings.general.waitForTemplate.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.waitForCursorTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.waitForCursorTemplate = value;
                        this.plugin.debugLog('waitForCursorTemplate', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Define cursor options visibility function
        const updateCursorOptionsVisibility = () => {
            if (this.plugin.settings.moveCursorToFirstLine) {
                cursorOptionsContainer.show();
            } else {
                cursorOptionsContainer.hide();
            }
        };

        // Set initial visibility for cursor options
        updateCursorOptionsVisibility();

        // Define wait for template container and visibility function
        let waitForTemplateContainer: HTMLElement;

        const updateWaitForTemplateVisibility = () => {
            if (this.plugin.settings.insertTitleOnCreation) {
                waitForTemplateContainer.show();
            } else {
                waitForTemplateContainer.hide();
            }
        };

        // Insert title in first line on note creation
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
        if (getCurrentLocale() === 'ru') {
            insertTitleDesc.appendText('«' + t('settings.general.insertTitleOnCreation.desc.replaceCharacters') + '»');
        } else {
            insertTitleDesc.createEl("em", { text: t('settings.general.insertTitleOnCreation.desc.replaceCharacters') });
        }
        insertTitleDesc.appendText(t('settings.general.insertTitleOnCreation.desc.part3'));

        insertTitleSetting.addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.insertTitleOnCreation)
                .onChange(async (value) => {
                    this.plugin.settings.insertTitleOnCreation = value;
                    this.plugin.debugLog('insertTitleOnCreation', value);
                    await this.plugin.saveSettings();
                    updateWaitForTemplateVisibility();
                })
        );

        // Create container for wait for template sub-option
        waitForTemplateContainer = this.containerEl.createDiv('flit-sub-settings');

        // Create sub-option for wait for template
        const waitForTemplateSetting = new Setting(waitForTemplateContainer)
            .setName(t('settings.general.insertAfterTemplate.name'))
            .setDesc(t('settings.general.insertAfterTemplate.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.waitForTemplate)
                    .onChange(async (value) => {
                        this.plugin.settings.waitForTemplate = value;
                        this.plugin.debugLog('waitForTemplate', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Create sub-option for add heading
        new Setting(waitForTemplateContainer)
            .setName(t('settings.general.formatAsHeading.name'))
            .setDesc(t('settings.general.formatAsHeading.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.addHeadingToTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.addHeadingToTitle = value;
                        this.plugin.debugLog('addHeadingToTitle', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Set initial visibility
        updateWaitForTemplateVisibility();

        // Rename on save
        new Setting(this.containerEl)
            .setName(t('settings.general.renameOnSave.name'))
            .setDesc(t('settings.general.renameOnSave.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameOnSave)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnSave = value;
                        this.plugin.debugLog('renameOnSave', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Rename all notes (moved to end)
        new Setting(this.containerEl)
            .setName(t('settings.general.renameAllNotes.name'))
            .setDesc(t('settings.general.renameAllNotes.desc'))
            .addButton((button) =>
                button.setButtonText(t('settings.general.renameAllNotes.button')).onClick(() => {
                    new RenameAllFilesModal(this.plugin.app, this.plugin).open();
                })
            );

        // Feedback button (commander-style)
        const feedbackContainer = this.containerEl.createEl("div");
        feedbackContainer.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            margin: 20px 0;
            padding: 4px 0;
            overflow: visible;
        `;

        const button = feedbackContainer.createEl("button", {
            cls: "mod-cta flit-leave-feedback-button"
        });
        button.style.display = "flex";
        button.style.alignItems = "center";
        button.style.gap = "8px";
        button.addEventListener('click', () => {
            window.open("https://github.com/greetclammy/first-line-is-title/issues", "_blank");
        });

        // Add icon (commander-style)
        const iconDiv = button.createEl("div");
        setIcon(iconDiv, "message-square-reply");

        // Add text
        button.appendText(t('settings.general.leaveFeedback'));
    }
}