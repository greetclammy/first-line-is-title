import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { DEFAULT_SETTINGS } from '../constants';
import { RenameAllFilesModal } from '../modals';

export class GeneralTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        // Dev warning banner
        const warningEl = this.containerEl.createDiv({ cls: 'flit-dev-warning' });
        warningEl.innerHTML = `
            <div style="padding: 1em; margin-bottom: 1em; border: 1px solid var(--background-modifier-border); border-radius: 4px; background-color: var(--background-secondary);">
                <strong style="color: var(--text-accent);">⚠️ IMPORTANT</strong><br>
                The plugin is in active development — things can break, or change drastically between releases.<br><br><strong>Ensure your files are regularly <a href="https://help.obsidian.md/backup" target="_blank">backed up</a>.</strong>
            </div>
        `;

        // Define rename on focus container and visibility function
        let renameOnFocusContainer: HTMLElement;

        const updateRenameOnFocusVisibility = () => {
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
        renameNotesDesc.appendText("Choose when notes should be renamed if the first line differs from filename.");
        renameNotesDesc.createEl("br");
        renameNotesDesc.createEl("br");
        renameNotesDesc.createEl("strong", { text: "Automatically:" });
        renameNotesDesc.appendText(" process when editing notes open in the editor.");
        renameNotesDesc.createEl("br");
        renameNotesDesc.createEl("strong", { text: "Manually:" });
        renameNotesDesc.appendText(" only process notes when invoking a plugin command.");

        renameNotesSetting.addDropdown((dropdown) =>
                dropdown
                    .addOption("automatically", "Automatically")
                    .addOption("manually", "Manually")
                    .setValue(this.plugin.settings.renameNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.renameNotes = value as "automatically" | "manually";
                        // Disable renameOnFocus when switching to manual mode
                        if (value === "manually") {
                            this.plugin.settings.renameOnFocus = false;
                        }
                        this.plugin.debugLog('renameNotes', value);
                        await this.plugin.saveSettings();
                        // Update visibility of automatic rename settings in advanced tab
                        (this.plugin as any).updateAutomaticRenameVisibility?.();
                        updateRenameOnFocusVisibility();
                    })
            );

        // Create sub-option for rename on focus
        const renameOnFocusSetting = new Setting(this.containerEl)
            .setName("Rename on focus")
            .setDesc("Automatically rename notes when they become active in the editor.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameOnFocus)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnFocus = value;
                        this.plugin.debugLog('renameOnFocus', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Create container for rename on focus sub-option
        renameOnFocusContainer = this.containerEl.createDiv('flit-sub-settings');
        renameOnFocusContainer.appendChild(renameOnFocusSetting.settingEl);

        // Set initial visibility
        updateRenameOnFocusVisibility();

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

        // 3. char count
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

        // Create sub-option for wait for template
        const waitForTemplateSetting = new Setting(this.containerEl)
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

        // Create container for wait for template sub-option
        waitForTemplateContainer = this.containerEl.createDiv('flit-sub-settings');
        waitForTemplateContainer.appendChild(waitForTemplateSetting.settingEl);

        // Set initial visibility
        updateWaitForTemplateVisibility();

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

        // Create container for cursor position sub-option
        cursorPositionContainer = this.containerEl.createDiv('flit-sub-settings');
        cursorPositionContainer.appendChild(cursorPositionSetting.settingEl);

        // Set initial visibility
        updateCursorPositionVisibility();

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