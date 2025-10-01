import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { DEFAULT_SETTINGS } from '../constants';
import { RenameAllFilesModal } from '../modals';

export class GeneralTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {

        // 1. rename notes
        new Setting(this.containerEl)
            .setName("Rename notes")
            .setDesc("Choose when notes should be renamed if the first line differs from filename.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("automatically", "Automatically")
                    .addOption("manually", "Manually")
                    .setValue(this.plugin.settings.renameNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.renameNotes = value as "automatically" | "manually";
                        this.plugin.debugLog('renameNotes', value);
                        await this.plugin.saveSettings();
                        // Update visibility of automatic rename settings in advanced tab
                        (this.plugin as any).updateAutomaticRenameVisibility?.();
                    })
            );

        // 2. what to put in title
        new Setting(this.containerEl)
            .setName("What to put in title")
            .setDesc("Choose what first line content should be copied to filename.")
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

        // 3. rename on save
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

        // 4. char count
        const charCountSetting = new Setting(this.containerEl)
            .setName("Character count")
            .setDesc("");

        // Create styled description for character count
        const charCountDesc = charCountSetting.descEl;
        charCountDesc.appendText("The maximum number of characters to put in filename.");
        charCountDesc.createEl("br");
        charCountDesc.createEl("small").createEl("strong", { text: "Default: 100" });

        // Create container for slider with reset button
        const charCountContainer = charCountSetting.controlEl.createDiv({ cls: "flit-char-text-input-container" });

        const charCountRestoreButton = charCountContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": "Restore default" }
        });
        setIcon(charCountRestoreButton, "rotate-ccw");

        // Create slider element manually and append to container
        const sliderDiv = charCountContainer.createDiv();

        charCountSetting.addSlider((slider) => {
            slider
                .setLimits(1, 255, 1)
                .setValue(this.plugin.settings.charCount)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.charCount = value;
                    this.plugin.debugLog('charCount', value);
                    await this.plugin.saveSettings();
                });

            // Move slider to our custom container
            sliderDiv.appendChild(slider.sliderEl);
        });

        charCountRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.charCount = DEFAULT_SETTINGS.charCount;
            this.plugin.debugLog('charCount', this.plugin.settings.charCount);
            await this.plugin.saveSettings();

            // Update the slider value by triggering a re-render or finding the slider element
            const sliderInput = sliderDiv.querySelector('input[type="range"]') as HTMLInputElement;
            if (sliderInput) {
                sliderInput.value = String(DEFAULT_SETTINGS.charCount);
                sliderInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // TEMPORARILY DISABLED: Insert title in first line on note creation
        // Define title insertion function and container
        // let titleInsertionContainer: HTMLElement;

        // const updateTitleInsertionVisibility = () => {
        //     if (this.plugin.settings.insertTitleOnCreation) {
        //         titleInsertionContainer.show();
        //     } else {
        //         titleInsertionContainer.hide();
        //     }
        // };

        // // Insert title on creation setting
        // new Setting(this.containerEl)
        //     .setName("Insert title in first line on note creation")
        //     .setDesc("Place the filename in the first line when creating a new note (unless the filename is 'Untitled' or 'Untitled n'). Convert forbidden character replacements (as configured in *Replace characters*) back to their original forms.")
        //     .addToggle((toggle) =>
        //         toggle
        //             .setValue(this.plugin.settings.insertTitleOnCreation)
        //             .onChange(async (value) => {
        //                 this.plugin.settings.insertTitleOnCreation = value;
        //                 this.plugin.debugLog('insertTitleOnCreation', value);
        //                 await this.plugin.saveSettings();
        //                 updateTitleInsertionVisibility();
        //             })
        //     );

        // // Title insertion delay (sub-option)
        // const titleInsertionDelaySetting = new Setting(this.containerEl)
        //     .setName("Title insertion delay")
        //     .setDesc("Delay in milliseconds before inserting title. Increase this to allow template plugins (Templater, Core Templates) to apply first.")
        //     .addSlider((slider) =>
        //         slider
        //             .setLimits(0, 2000, 50)
        //             .setValue(this.plugin.settings.titleInsertionDelay)
        //             .setDynamicTooltip()
        //             .onChange(async (value) => {
        //                 this.plugin.settings.titleInsertionDelay = value;
        //                 this.plugin.debugLog('titleInsertionDelay', value);
        //                 await this.plugin.saveSettings();
        //             })
        //     );

        // // Create container for title insertion delay sub-option
        // titleInsertionContainer = this.containerEl.createDiv('flit-sub-settings');
        // titleInsertionContainer.appendChild(titleInsertionDelaySetting.settingEl);

        // // Set initial visibility
        // updateTitleInsertionVisibility();

        // Define cursor position function and container
        let cursorPositionContainer: HTMLElement;

        const updateCursorPositionVisibility = () => {
            if (this.plugin.settings.moveCursorToFirstLine) {
                cursorPositionContainer.show();
            } else {
                cursorPositionContainer.hide();
            }
        };

        // 8. move cursor
        new Setting(this.containerEl)
            .setName("Move cursor to first line")
            .setDesc("Place the cursor in the first line when creating a new note.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.moveCursorToFirstLine)
                    .onChange(async (value) => {
                        this.plugin.settings.moveCursorToFirstLine = value;
                        this.plugin.debugLog('moveCursorToFirstLine', value);
                        await this.plugin.saveSettings();
                        updateCursorPositionVisibility();
                    })
            );

        // Create sub-option for cursor position
        const cursorPositionSetting = new Setting(this.containerEl)
            .setName("Place cursor at first line end")
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

        // Create container for cursor position sub-option
        cursorPositionContainer = this.containerEl.createDiv('flit-sub-settings');
        cursorPositionContainer.appendChild(cursorPositionSetting.settingEl);

        // Set initial visibility
        updateCursorPositionVisibility();

        // Rename all notes (moved to end)
        new Setting(this.containerEl)
            .setName("Rename all notes")
            .setDesc("Process the whole vault. Can also be run from the Command palette.")
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
        `;

        const button = feedbackContainer.createEl("button", {
            cls: "mod-cta"
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