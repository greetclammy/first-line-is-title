import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from "./settings-base";
import { DEFAULT_SETTINGS } from "../constants";
import { RenameAllFilesModal } from "../modals";
import { t, getCurrentLocale } from "../i18n";

export class GeneralTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  render(): void {
    let renameOnFocusContainer: HTMLElement;
    let placeCursorSetting: Setting;

    const updateAutomaticRenameVisibility = () => {
      if (this.plugin.settings.core.renameNotes === "automatically") {
        renameOnFocusContainer.show();
      } else {
        renameOnFocusContainer.hide();
      }
    };

    // 1. rename notes
    new Setting(this.containerEl)
      .setName(t("settings.general.renameNotes.name"))
      .setDesc(t("settings.general.renameNotes.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(
            "automatically",
            t("settings.general.renameNotes.automatically"),
          )
          .addOption("manually", t("settings.general.renameNotes.manually"))
          .setValue(this.plugin.settings.core.renameNotes)
          .onChange(async (value) => {
            this.plugin.settings.core.renameNotes = value as
              | "automatically"
              | "manually";
            this.plugin.debugLog("renameNotes", value);
            await this.plugin.saveSettings();
            updateAutomaticRenameVisibility();
          }),
      );

    // Create shared container for automatic rename sub-options
    const automaticRenameContainer =
      this.containerEl.createDiv("flit-sub-settings");

    // Create sub-option for rename on focus
    new Setting(automaticRenameContainer)
      .setName(t("settings.general.renameOnFocus.name"))
      .setDesc(t("settings.general.renameOnFocus.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.renameOnFocus)
          .onChange(async (value) => {
            this.plugin.settings.core.renameOnFocus = value;
            this.plugin.debugLog("renameOnFocus", value);
            await this.plugin.saveSettings();
          }),
      );

    // Alias container for visibility updates
    renameOnFocusContainer = automaticRenameContainer;

    // Set initial visibility
    updateAutomaticRenameVisibility();

    // Only rename if heading
    new Setting(this.containerEl)
      .setName(t("settings.general.onlyRenameIfHeading.name"))
      .setDesc(t("settings.general.onlyRenameIfHeading.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.onlyRenameIfHeading)
          .onChange(async (value) => {
            this.plugin.settings.core.onlyRenameIfHeading = value;
            this.plugin.debugLog("onlyRenameIfHeading", value);
            await this.plugin.saveSettings();
          }),
      );

    // Move cursor to first line
    new Setting(this.containerEl)
      .setName(t("settings.general.moveCursorToFirstLine.name"))
      .setDesc(t("settings.general.moveCursorToFirstLine.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.moveCursorToFirstLine)
          .onChange(async (value) => {
            this.plugin.settings.core.moveCursorToFirstLine = value;
            this.plugin.debugLog("moveCursorToFirstLine", value);
            await this.plugin.saveSettings();
            updateCursorOptionsVisibility();
          }),
      );

    // Create cursor options sub-container
    const cursorOptionsContainer =
      this.containerEl.createDiv("flit-sub-settings");

    // Place cursor at line end
    placeCursorSetting = new Setting(cursorOptionsContainer)
      .setName(t("settings.general.placeCursorAtLineEnd.name"))
      .setDesc(t("settings.general.placeCursorAtLineEnd.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.placeCursorAtLineEnd)
          .onChange(async (value) => {
            this.plugin.settings.core.placeCursorAtLineEnd = value;
            this.plugin.debugLog("placeCursorAtLineEnd", value);
            await this.plugin.saveSettings();
          }),
      );

    // Define cursor options visibility function
    const updateCursorOptionsVisibility = () => {
      if (this.plugin.settings.core.moveCursorToFirstLine) {
        cursorOptionsContainer.show();
      } else {
        cursorOptionsContainer.hide();
      }
    };

    // Set initial visibility for cursor options
    updateCursorOptionsVisibility();

    // Insert title in first line on note creation
    const insertTitleSetting = new Setting(this.containerEl)
      .setName(t("settings.general.insertTitleOnCreation.name"))
      .setDesc("");

    // Create styled description
    const insertTitleDesc = insertTitleSetting.descEl;
    insertTitleDesc.appendText(
      t("settings.general.insertTitleOnCreation.desc.part1"),
    );
    if (getCurrentLocale() === "ru") {
      insertTitleDesc.appendText(
        "«" + t("settings.general.insertTitleOnCreation.desc.untitled") + "»",
      );
    } else {
      insertTitleDesc.createEl("em", {
        text: t("settings.general.insertTitleOnCreation.desc.untitled"),
      });
    }
    insertTitleDesc.appendText(
      t("settings.general.insertTitleOnCreation.desc.part2"),
    );

    insertTitleSetting.addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.core.insertTitleOnCreation)
        .onChange(async (value) => {
          this.plugin.settings.core.insertTitleOnCreation = value;
          this.plugin.debugLog("insertTitleOnCreation", value);
          await this.plugin.saveSettings();
          updateInsertTitleOptionsVisibility();
        }),
    );

    // Create insert title options sub-container
    const insertTitleOptionsContainer =
      this.containerEl.createDiv("flit-sub-settings");

    // Convert character replacements
    const convertCharsSetting = new Setting(insertTitleOptionsContainer)
      .setName(t("settings.general.convertReplacementCharactersInTitle.name"))
      .setDesc("");

    // Create styled description
    const convertCharsDesc = convertCharsSetting.descEl;
    convertCharsDesc.appendText(
      t("settings.general.convertReplacementCharactersInTitle.desc.part1"),
    );
    convertCharsDesc.createEl("em", {
      text: t(
        "settings.general.convertReplacementCharactersInTitle.desc.replaceCharacters",
      ),
    });
    convertCharsDesc.appendText(
      t("settings.general.convertReplacementCharactersInTitle.desc.part2"),
    );

    convertCharsSetting.addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.core.convertReplacementCharactersInTitle)
        .onChange(async (value) => {
          this.plugin.settings.core.convertReplacementCharactersInTitle = value;
          this.plugin.debugLog("convertReplacementCharactersInTitle", value);
          await this.plugin.saveSettings();
        }),
    );

    // Format as heading
    new Setting(insertTitleOptionsContainer)
      .setName(t("settings.general.formatAsHeading.name"))
      .setDesc(t("settings.general.formatAsHeading.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.markupStripping.addHeadingToTitle)
          .onChange(async (value) => {
            this.plugin.settings.markupStripping.addHeadingToTitle = value;
            this.plugin.debugLog("addHeadingToTitle", value);
            await this.plugin.saveSettings();
          }),
      );

    // Define insert title options visibility function
    const updateInsertTitleOptionsVisibility = () => {
      if (this.plugin.settings.core.insertTitleOnCreation) {
        insertTitleOptionsContainer.show();
      } else {
        insertTitleOptionsContainer.hide();
      }
    };

    // Set initial visibility for insert title options
    updateInsertTitleOptionsVisibility();

    // Rename on save
    new Setting(this.containerEl)
      .setName(t("settings.general.renameOnSave.name"))
      .setDesc(t("settings.general.renameOnSave.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.renameOnSave)
          .onChange(async (value) => {
            this.plugin.settings.core.renameOnSave = value;
            this.plugin.debugLog("renameOnSave", value);
            await this.plugin.saveSettings();
          }),
      );

    // Rename all notes (moved to end)
    new Setting(this.containerEl)
      .setName(t("settings.general.renameAllNotes.name"))
      .setDesc(t("settings.general.renameAllNotes.desc"))
      .addButton((button) =>
        button
          .setButtonText(t("settings.general.renameAllNotes.button"))
          .onClick(() => {
            new RenameAllFilesModal(this.plugin.app, this.plugin).open();
          }),
      );

    // Feedback button (commander-style)
    const feedbackContainer = this.containerEl.createEl("div", {
      cls: "flit-feedback-container",
    });

    const button = feedbackContainer.createEl("button", {
      cls: "mod-cta flit-leave-feedback-button flit-feedback-button",
    });
    button.addEventListener("click", () => {
      window.open(
        "https://github.com/greetclammy/first-line-is-title?tab=readme-ov-file#%EF%B8%8F-support",
        "_blank",
      );
    });

    // Add icon (commander-style)
    const iconDiv = button.createEl("div");
    setIcon(iconDiv, "message-square-reply");

    // Add text
    button.appendText(t("settings.general.leaveFeedback"));
  }
}
