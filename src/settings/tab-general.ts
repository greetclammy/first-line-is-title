/* eslint-disable @typescript-eslint/no-misused-promises */
import { Setting, SettingGroup, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from "./settings-base";
import { RenameAllFilesModal } from "../modals";
import { t, getCurrentLocale } from "../i18n";

export class GeneralTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  render(): void {
    // Declare variables for settings that need references
    let renameNotesSetting: Setting;
    let moveCursorSetting: Setting;
    let insertTitleSetting: Setting;

    // Sub-settings containers
    let renameOnFocusContainer: HTMLElement;
    let cursorOptionsContainer: HTMLElement;
    let insertTitleOptionsContainer: HTMLElement;

    // Visibility update functions
    const updateAutomaticRenameVisibility = () => {
      if (this.plugin.settings.core.renameNotes === "automatically") {
        renameOnFocusContainer.show();
      } else {
        renameOnFocusContainer.hide();
      }
    };

    const updateCursorOptionsVisibility = () => {
      if (this.plugin.settings.core.moveCursorToFirstLine) {
        cursorOptionsContainer.show();
      } else {
        cursorOptionsContainer.hide();
      }
    };

    const updateInsertTitleOptionsVisibility = () => {
      if (this.plugin.settings.core.insertTitleOnCreation) {
        insertTitleOptionsContainer.show();
      } else {
        insertTitleOptionsContainer.hide();
      }
    };

    // General settings using SettingGroup
    new SettingGroup(this.containerEl)
      .addClass("flit-general-group")
      // 1. Rename notes
      .addSetting((s) => {
        renameNotesSetting = s;
        s.setName(t("settings.general.renameNotes.name"))
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
      })
      // 2. Only rename if heading
      .addSetting((s) =>
        s
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
          ),
      )
      // 3. Title case
      .addSetting((s) =>
        s
          .setName(t("settings.general.titleCase.name"))
          .setDesc(t("settings.general.titleCase.desc"))
          .addDropdown((dropdown) =>
            dropdown
              .addOption("preserve", t("settings.general.titleCase.preserve"))
              .addOption("uppercase", t("settings.general.titleCase.uppercase"))
              .addOption("lowercase", t("settings.general.titleCase.lowercase"))
              .setValue(this.plugin.settings.core.titleCase)
              .onChange(async (value) => {
                this.plugin.settings.core.titleCase = value as
                  | "preserve"
                  | "uppercase"
                  | "lowercase";
                this.plugin.debugLog("titleCase", value);
                await this.plugin.saveSettings();
              }),
          ),
      )
      // 4. Move cursor to first line
      .addSetting((s) => {
        moveCursorSetting = s;
        s.setName(t("settings.general.moveCursorToFirstLine.name"))
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
      })
      // 5. Insert title in first line on note creation
      .addSetting((s) => {
        insertTitleSetting = s;
        s.setName(t("settings.general.insertTitleOnCreation.name")).addToggle(
          (toggle) =>
            toggle
              .setValue(this.plugin.settings.core.insertTitleOnCreation)
              .onChange(async (value) => {
                this.plugin.settings.core.insertTitleOnCreation = value;
                this.plugin.debugLog("insertTitleOnCreation", value);
                await this.plugin.saveSettings();
                updateInsertTitleOptionsVisibility();
              }),
        );
      })
      // 6. Rename on save
      .addSetting((s) =>
        s
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
          ),
      )
      // 7. Rename all notes
      .addSetting((s) =>
        s
          .setName(t("settings.general.renameAllNotes.name"))
          .setDesc(t("settings.general.renameAllNotes.desc"))
          .addButton((button) =>
            button
              .setButtonText(t("settings.general.renameAllNotes.button"))
              .onClick(() => {
                new RenameAllFilesModal(this.plugin.app, this.plugin).open();
              }),
          ),
      );

    // Add styled description for insertTitleSetting
    const insertTitleDesc = insertTitleSetting!.descEl;
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

    // Get the setting-items container for sub-settings
    const settingItems = this.containerEl.querySelector(
      ".flit-general-group .setting-items",
    );

    // Create sub-settings containers inside setting-items
    // Position them after their parent settings
    renameOnFocusContainer = (settingItems ?? this.containerEl).createDiv(
      "flit-sub-settings",
    );
    renameNotesSetting!.settingEl.after(renameOnFocusContainer);

    cursorOptionsContainer = (settingItems ?? this.containerEl).createDiv(
      "flit-sub-settings",
    );
    moveCursorSetting!.settingEl.after(cursorOptionsContainer);

    insertTitleOptionsContainer = (settingItems ?? this.containerEl).createDiv(
      "flit-sub-settings",
    );
    insertTitleSetting!.settingEl.after(insertTitleOptionsContainer);

    // Sub-setting: Rename on focus
    new Setting(renameOnFocusContainer)
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

    // Sub-setting: Place cursor at line end
    new Setting(cursorOptionsContainer)
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

    // Sub-setting: Convert character replacements
    const convertCharsSetting = new Setting(insertTitleOptionsContainer)
      .setName(t("settings.general.convertReplacementCharactersInTitle.name"))
      .setDesc("");

    const convertCharsDesc = convertCharsSetting.descEl;
    convertCharsDesc.appendText(
      t("settings.general.convertReplacementCharactersInTitle.desc.part1"),
    );
    if (getCurrentLocale() === "ru") {
      convertCharsDesc.appendText(
        "«" +
          t(
            "settings.general.convertReplacementCharactersInTitle.desc.replaceCharacters",
          ) +
          "»",
      );
    } else {
      convertCharsDesc.createEl("em", {
        text: t(
          "settings.general.convertReplacementCharactersInTitle.desc.replaceCharacters",
        ),
      });
    }
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

    // Sub-setting: Format as heading
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

    // Set initial visibility for all sub-settings
    updateAutomaticRenameVisibility();
    updateCursorOptionsVisibility();
    updateInsertTitleOptionsVisibility();

    // Feedback button (commander-style)
    const feedbackContainer = this.containerEl.createEl("div", {
      cls: "flit-feedback-container",
    });

    const button = feedbackContainer.createEl("button", {
      cls: "mod-cta flit-leave-feedback-button flit-feedback-button",
    });
    button.addEventListener("click", () => {
      window.open(
        "https://github.com/greetclammy/first-line-is-title/issues",
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
