import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { DEFAULT_SETTINGS } from '../constants';
import { RenameAllFilesModal } from '../modals';

export class GeneralTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        let renameOnFocusContainer: HTMLElement;

        const updateAutomaticRenameVisibility = () => {
            if (this.plugin.settings.renameNotes === "automatically") {
                renameOnFocusContainer.show();
            } else {
                renameOnFocusContainer.hide();
            }
        };

        // 1. rename notes
        const renameNotesSetting = new Setting(this.containerEl)
            .setName("Rename notes")
            .setDesc("");

        // Create styled description for rename notes
        const renameNotesDesc = renameNotesSetting.descEl;
        renameNotesDesc.appendText("Set how notes should be processed.");

        renameNotesSetting.addDropdown((dropdown) =>
                dropdown
                    .addOption("automatically", "Automatically when open and modified")
                    .addOption("manually", "Manually via command only")
                    .setValue(this.plugin.settings.renameNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.renameNotes = value as "automatically" | "manually";
                        this.plugin.debugLog('renameNotes', value);
                        await this.plugin.saveSettings();
                        updateAutomaticRenameVisibility();
                        updateCursorPositionVisibility();
                        (this.plugin as any).updateAutomaticRenameVisibility?.();
                    })
            );

        // Create shared container for automatic rename sub-options
        const automaticRenameContainer = this.containerEl.createDiv('flit-sub-settings');

        // Create sub-option for rename on focus
        const renameOnFocusSetting = new Setting(automaticRenameContainer)
            .setName("Rename on focus")
            .setDesc("Process notes when they get opened in the editor.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameOnFocus)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnFocus = value;
                        this.plugin.debugLog('renameOnFocus', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Move cursor to first line
        new Setting(automaticRenameContainer)
            .setName("Move cursor to first line")
            .setDesc("Place the cursor in the first line when creating a new note unless in excluded note.")
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

        // Place cursor at line end
        const placeCursorSetting = new Setting(automaticRenameContainer)
            .setName("Place cursor at line end")
            .setDesc("When moving the cursor to a first line with content, place it at the end of the line instead of the start.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.placeCursorAtLineEnd)
                    .onChange(async (value) => {
                        this.plugin.settings.placeCursorAtLineEnd = value;
                        this.plugin.debugLog('placeCursorAtLineEnd', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Wait for cursor template
        const waitForTemplateCursorSetting = new Setting(automaticRenameContainer)
            .setName("Wait for template")
            .setDesc("Move the cursor after a new note template is applied and it does not have an excluded tag or property.")
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
                placeCursorSetting.settingEl.show();
                waitForTemplateCursorSetting.settingEl.show();
            } else {
                placeCursorSetting.settingEl.hide();
                waitForTemplateCursorSetting.settingEl.hide();
            }
        };

        // Set initial visibility for cursor options
        updateCursorOptionsVisibility();

        // Alias container for visibility updates
        renameOnFocusContainer = automaticRenameContainer;

        // Set initial visibility
        updateAutomaticRenameVisibility();

        // 2. what to put in title
        new Setting(this.containerEl)
            .setName("What to put in title")
            .setDesc("Set what first line content should be copied to filename.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("any_first_line_content", "Any text")
                    .addOption("headings_only", "Headings only")
                    .setValue(this.plugin.settings.whatToPutInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.whatToPutInTitle = value as "any_first_line_content" | "headings_only";
                        this.plugin.debugLog('whatToPutInTitle', value);
                        await this.plugin.saveSettings();
                    })
            );


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
            .setName("Insert title in first line on note creation")
            .setDesc("");

        // Create styled description
        const insertTitleDesc = insertTitleSetting.descEl;
        insertTitleDesc.appendText("Place the filename in the first line when creating a new empty note (unless ");
        insertTitleDesc.createEl("em", { text: "Untitled" });
        insertTitleDesc.appendText("). Convert forbidden character replacements back to their original forms, as set in ");
        insertTitleDesc.createEl("em", { text: "Replace characters" });
        insertTitleDesc.appendText(".");

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
            .setName("Insert after template")
            .setDesc("Let a new note template insert a Properties block before inserting the filename.")
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
            .setName("Add heading")
            .setDesc("Make the first line a heading.")
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
            .setName("Rename on save")
            .setDesc("Rename notes on manual save (Ctrl/Cmd-S on desktop by default).")
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
            .setName("Rename all notes")
            .setDesc("Process all notes in vault. Can also be run from the Command palette.")
            .addButton((button) =>
                button.setButtonText("Rename").onClick(() => {
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
        button.appendText("Leave feedback");
    }
}