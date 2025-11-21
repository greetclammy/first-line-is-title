import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from "./settings-base";
import { t, getCurrentLocale } from "../i18n";

export class CommandsTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  render(): void {
    const ribbonHeaderSetting = new Setting(this.containerEl)
      .setName(t("settings.commands.ribbon.title"))
      .setDesc(t("settings.commands.ribbon.desc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.core.enableRibbon)
          .onChange(async (value) => {
            this.plugin.settings.core.enableRibbon = value;
            this.plugin.debugLog("enableRibbon", value);
            await this.plugin.saveSettings();
            updateRibbonUI();
          });
      });
    ribbonHeaderSetting.settingEl.addClass("flit-master-toggle");
    this.containerEl.createEl("br");

    const ribbonContainer = this.containerEl.createDiv();

    const updateRibbonUI = () => {
      if (this.plugin.settings.core.enableRibbon) {
        ribbonContainer.show();
      } else {
        ribbonContainer.hide();
      }
    };

    const ribbonCurrentSetting = new Setting(ribbonContainer)
      .setName(t("commands.putFirstLineInTitle"))
      .setDesc(t("commands.descriptions.renameActiveNoteEvenExcluded"))
      .addToggle((toggle) => {
        toggle
          .setValue(
            this.plugin.settings.core.ribbonVisibility.renameCurrentFile,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.ribbonVisibility.renameCurrentFile =
              value;
            this.plugin.debugLog("ribbonVisibility.renameCurrentFile", value);
            await this.plugin.saveSettings();
          });
      });
    const ribbonCurrentIcon = ribbonCurrentSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(ribbonCurrentIcon, "file-pen");
    ribbonCurrentSetting.nameEl.insertBefore(
      ribbonCurrentIcon,
      ribbonCurrentSetting.nameEl.firstChild,
    );

    const ribbonBulkSetting = new Setting(ribbonContainer)
      .setName(t("commands.putFirstLineInTitleAllNotes"))
      .setDesc(t("commands.descriptions.renameAllNotesExceptExcluded"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.core.ribbonVisibility.renameAllNotes)
          .onChange(async (value) => {
            this.plugin.settings.core.ribbonVisibility.renameAllNotes = value;
            this.plugin.debugLog("ribbonVisibility.renameAllNotes", value);
            await this.plugin.saveSettings();
          });
      });
    const ribbonBulkIcon = ribbonBulkSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(ribbonBulkIcon, "file-stack");
    ribbonBulkSetting.nameEl.insertBefore(
      ribbonBulkIcon,
      ribbonBulkSetting.nameEl.firstChild,
    );

    const ribbonToggleSetting = new Setting(ribbonContainer)
      .setName(t("commands.toggleAutomaticRenaming"))
      .setDesc("");

    const ribbonToggleDesc = ribbonToggleSetting.descEl;
    ribbonToggleDesc.appendText(
      t("commands.descriptions.toggleRenameSetting.part1"),
    );
    if (getCurrentLocale() === "ru") {
      ribbonToggleDesc.appendText(
        "«" + t("commands.descriptions.toggleRenameSetting.renameNotes") + "»",
      );
    } else {
      ribbonToggleDesc.createEl("em", {
        text: t("commands.descriptions.toggleRenameSetting.renameNotes"),
      });
    }
    ribbonToggleDesc.appendText(
      t("commands.descriptions.toggleRenameSetting.part2"),
    );
    if (getCurrentLocale() === "ru") {
      ribbonToggleDesc.appendText(
        "«" +
          t("commands.descriptions.toggleRenameSetting.automatically") +
          "»",
      );
    } else {
      ribbonToggleDesc.createEl("em", {
        text: t("commands.descriptions.toggleRenameSetting.automatically"),
      });
    }
    ribbonToggleDesc.appendText(
      t("commands.descriptions.toggleRenameSetting.part3"),
    );
    if (getCurrentLocale() === "ru") {
      ribbonToggleDesc.appendText(
        "«" + t("commands.descriptions.toggleRenameSetting.manually") + "»",
      );
    } else {
      ribbonToggleDesc.createEl("em", {
        text: t("commands.descriptions.toggleRenameSetting.manually"),
      });
    }
    ribbonToggleDesc.appendText(
      t("commands.descriptions.toggleRenameSetting.part4"),
    );

    ribbonToggleSetting.addToggle((toggle) => {
      toggle
        .setValue(
          this.plugin.settings.core.ribbonVisibility.toggleAutomaticRenaming,
        )
        .onChange(async (value) => {
          this.plugin.settings.core.ribbonVisibility.toggleAutomaticRenaming =
            value;
          this.plugin.debugLog(
            "ribbonVisibility.toggleAutomaticRenaming",
            value,
          );
          await this.plugin.saveSettings();
        });
    });
    const ribbonToggleIcon = ribbonToggleSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(ribbonToggleIcon, "file-cog");
    ribbonToggleSetting.nameEl.insertBefore(
      ribbonToggleIcon,
      ribbonToggleSetting.nameEl.firstChild,
    );

    updateRibbonUI();
    const commandPaletteHeaderSetting = new Setting(this.containerEl)
      .setName(t("settings.commands.palette.title"))
      .setDesc(t("settings.commands.palette.desc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.core.enableCommandPalette)
          .onChange(async (value) => {
            this.plugin.settings.core.enableCommandPalette = value;
            this.plugin.debugLog("enableCommandPalette", value);
            await this.plugin.saveSettings();
            updateCommandPaletteUI();
          });
      });
    commandPaletteHeaderSetting.settingEl.addClass("flit-master-toggle");
    this.containerEl.createEl("br");

    const commandPaletteContainer = this.containerEl.createDiv();
    commandPaletteContainer.addClass("flit-master-disable-target");

    const updateCommandPaletteUI = () => {
      if (this.plugin.settings.core.enableCommandPalette) {
        commandPaletteContainer.show();
      } else {
        commandPaletteContainer.hide();
      }
    };

    const setting1 = new Setting(commandPaletteContainer)
      .setName(t("commands.putFirstLineInTitle"))
      .setDesc(t("commands.descriptions.renameActiveNoteEvenExcluded"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandPaletteVisibility
              .renameCurrentFile,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandPaletteVisibility.renameCurrentFile =
              value;
            this.plugin.debugLog(
              "commandPaletteVisibility.renameCurrentFile",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );

    const icon1 = setting1.nameEl.createDiv({ cls: "setting-item-icon" });
    setIcon(icon1, "file-pen");
    setting1.nameEl.insertBefore(icon1, setting1.nameEl.firstChild);

    const setting2 = new Setting(commandPaletteContainer)
      .setName(t("commands.putFirstLineInTitleUnlessExcluded"))
      .setDesc(t("commands.descriptions.renameActiveNoteUnlessExcluded"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandPaletteVisibility
              .renameCurrentFileUnlessExcluded,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandPaletteVisibility.renameCurrentFileUnlessExcluded =
              value;
            this.plugin.debugLog(
              "commandPaletteVisibility.renameCurrentFileUnlessExcluded",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );

    const icon2 = setting2.nameEl.createDiv({ cls: "setting-item-icon" });
    setIcon(icon2, "file-pen");
    setting2.nameEl.insertBefore(icon2, setting2.nameEl.firstChild);

    const setting3 = new Setting(commandPaletteContainer)
      .setName(t("commands.putFirstLineInTitleAllNotes"))
      .setDesc(t("commands.descriptions.renameAllNotesExceptExcluded"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandPaletteVisibility.renameAllFiles,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandPaletteVisibility.renameAllFiles =
              value;
            this.plugin.debugLog(
              "commandPaletteVisibility.renameAllFiles",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );

    const icon3 = setting3.nameEl.createDiv({ cls: "setting-item-icon" });
    setIcon(icon3, "file-stack");
    setting3.nameEl.insertBefore(icon3, setting3.nameEl.firstChild);

    const setting8 = new Setting(commandPaletteContainer)
      .setName(t("commands.toggleAutomaticRenaming"))
      .setDesc("");

    const setting8Desc = setting8.descEl;
    setting8Desc.appendText(
      t("commands.descriptions.toggleRenameSetting.part1"),
    );
    if (getCurrentLocale() === "ru") {
      setting8Desc.appendText(
        "«" + t("commands.descriptions.toggleRenameSetting.renameNotes") + "»",
      );
    } else {
      setting8Desc.createEl("em", {
        text: t("commands.descriptions.toggleRenameSetting.renameNotes"),
      });
    }
    setting8Desc.appendText(
      t("commands.descriptions.toggleRenameSetting.part2"),
    );
    if (getCurrentLocale() === "ru") {
      setting8Desc.appendText(
        "«" +
          t("commands.descriptions.toggleRenameSetting.automatically") +
          "»",
      );
    } else {
      setting8Desc.createEl("em", {
        text: t("commands.descriptions.toggleRenameSetting.automatically"),
      });
    }
    setting8Desc.appendText(
      t("commands.descriptions.toggleRenameSetting.part3"),
    );
    if (getCurrentLocale() === "ru") {
      setting8Desc.appendText(
        "«" + t("commands.descriptions.toggleRenameSetting.manually") + "»",
      );
    } else {
      setting8Desc.createEl("em", {
        text: t("commands.descriptions.toggleRenameSetting.manually"),
      });
    }
    setting8Desc.appendText(
      t("commands.descriptions.toggleRenameSetting.part4"),
    );

    setting8.addToggle((toggle) =>
      toggle
        .setValue(
          this.plugin.settings.core.commandPaletteVisibility
            .toggleAutomaticRenaming,
        )
        .onChange(async (value) => {
          this.plugin.settings.core.commandPaletteVisibility.toggleAutomaticRenaming =
            value;
          this.plugin.debugLog(
            "commandPaletteVisibility.toggleAutomaticRenaming",
            value,
          );
          await this.plugin.saveSettings();
        }),
    );

    const icon8 = setting8.nameEl.createDiv({ cls: "setting-item-icon" });
    setIcon(icon8, "file-cog");
    setting8.nameEl.insertBefore(icon8, setting8.nameEl.firstChild);

    const setting4 = new Setting(commandPaletteContainer)
      .setName(t("commands.disableRenamingForNote"))
      .setDesc(t("commands.descriptions.excludeActiveNote"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandPaletteVisibility.disableRenaming,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandPaletteVisibility.disableRenaming =
              value;
            this.plugin.debugLog(
              "commandPaletteVisibility.disableRenaming",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );

    const icon4 = setting4.nameEl.createDiv({ cls: "setting-item-icon" });
    setIcon(icon4, "square-x");
    setting4.nameEl.insertBefore(icon4, setting4.nameEl.firstChild);

    const setting5 = new Setting(commandPaletteContainer)
      .setName(t("commands.enableRenamingForNote"))
      .setDesc(t("commands.descriptions.stopExcludingActiveNote"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandPaletteVisibility.enableRenaming,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandPaletteVisibility.enableRenaming =
              value;
            this.plugin.debugLog(
              "commandPaletteVisibility.enableRenaming",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );

    const icon5 = setting5.nameEl.createDiv({ cls: "setting-item-icon" });
    setIcon(icon5, "square-check");
    setting5.nameEl.insertBefore(icon5, setting5.nameEl.firstChild);

    const setting6 = new Setting(commandPaletteContainer)
      .setName(t("commands.addSafeInternalLink"))
      .setDesc("");

    const setting6Desc = setting6.descEl;
    setting6Desc.appendText(
      t("commands.descriptions.createLinkWithForbiddenChars.part1"),
    );
    if (getCurrentLocale() === "ru") {
      setting6Desc.appendText(
        "«" +
          t(
            "commands.descriptions.createLinkWithForbiddenChars.replaceCharacters",
          ) +
          "»",
      );
    } else {
      setting6Desc.createEl("em", {
        text: t(
          "commands.descriptions.createLinkWithForbiddenChars.replaceCharacters",
        ),
      });
    }
    setting6Desc.appendText(
      t("commands.descriptions.createLinkWithForbiddenChars.part2"),
    );

    setting6.addToggle((toggle) =>
      toggle
        .setValue(
          this.plugin.settings.core.commandVisibility.addSafeInternalLink,
        )
        .onChange(async (value) => {
          this.plugin.settings.core.commandVisibility.addSafeInternalLink =
            value;
          this.plugin.debugLog("commandVisibility.addSafeInternalLink", value);
          await this.plugin.saveSettings();
        }),
    );

    const icon6 = setting6.nameEl.createDiv({ cls: "setting-item-icon" });
    setIcon(icon6, "link");
    setting6.nameEl.insertBefore(icon6, setting6.nameEl.firstChild);

    const setting7 = new Setting(commandPaletteContainer)
      .setName(t("commands.addSafeInternalLinkWithCaption"))
      .setDesc("");

    const setting7Desc = setting7.descEl;
    setting7Desc.appendText(
      t("commands.descriptions.createLinkWithValidPath.part1"),
    );
    if (getCurrentLocale() === "ru") {
      setting7Desc.appendText(
        "«" +
          t("commands.descriptions.createLinkWithValidPath.replaceCharacters") +
          "»",
      );
    } else {
      setting7Desc.createEl("em", {
        text: t(
          "commands.descriptions.createLinkWithValidPath.replaceCharacters",
        ),
      });
    }
    setting7Desc.appendText(
      t("commands.descriptions.createLinkWithValidPath.part2"),
    );

    setting7.addToggle((toggle) =>
      toggle
        .setValue(
          this.plugin.settings.core.commandVisibility
            .addSafeInternalLinkWithCaption,
        )
        .onChange(async (value) => {
          this.plugin.settings.core.commandVisibility.addSafeInternalLinkWithCaption =
            value;
          this.plugin.debugLog(
            "commandVisibility.addSafeInternalLinkWithCaption",
            value,
          );
          await this.plugin.saveSettings();
        }),
    );

    const icon7 = setting7.nameEl.createDiv({ cls: "setting-item-icon" });
    setIcon(icon7, "link");
    setting7.nameEl.insertBefore(icon7, setting7.nameEl.firstChild);

    const settingInsertFilename = new Setting(commandPaletteContainer)
      .setName(t("commands.insertFilename"))
      .setDesc("");

    const insertFilenameDesc = settingInsertFilename.descEl;
    const descParts = t("commands.descriptions.insertFilename").split("*");
    insertFilenameDesc.appendText(descParts[0]);
    if (descParts[1]) {
      if (getCurrentLocale() === "ru") {
        insertFilenameDesc.appendText("«" + descParts[1] + "»");
      } else {
        insertFilenameDesc.createEl("em", { text: descParts[1] });
      }
    }
    if (descParts[2]) {
      insertFilenameDesc.appendText(descParts[2]);
    }

    settingInsertFilename.addToggle((toggle) =>
      toggle
        .setValue(
          this.plugin.settings.core.commandPaletteVisibility.insertFilename,
        )
        .onChange(async (value) => {
          this.plugin.settings.core.commandPaletteVisibility.insertFilename =
            value;
          this.plugin.debugLog(
            "commandPaletteVisibility.insertFilename",
            value,
          );
          await this.plugin.saveSettings();
        }),
    );

    const iconInsertFilename = settingInsertFilename.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(iconInsertFilename, "clipboard-type");
    settingInsertFilename.nameEl.insertBefore(
      iconInsertFilename,
      settingInsertFilename.nameEl.firstChild,
    );

    updateCommandPaletteUI();
    const fileHeaderSetting = new Setting(this.containerEl)
      .setName(t("settings.commands.file.title"))
      .setDesc(t("settings.commands.file.desc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.core.enableFileCommands)
          .onChange(async (value) => {
            this.plugin.settings.core.enableFileCommands = value;
            this.plugin.debugLog("enableFileCommands", value);
            await this.plugin.saveSettings();
            updateFileUI();
          });
      });

    fileHeaderSetting.settingEl.addClass("flit-master-toggle");
    this.containerEl.createEl("br");

    const fileContainer = this.containerEl.createDiv();
    fileContainer.addClass("flit-master-disable-target");

    const updateFileUI = () => {
      if (this.plugin.settings.core.enableFileCommands) {
        fileContainer.show();
      } else {
        fileContainer.hide();
      }
    };

    const filePutFirstLineSetting = new Setting(fileContainer)
      .setName(t("commands.putFirstLineInTitle"))
      .setDesc(t("commands.descriptions.renameNoteEvenExcluded"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandVisibility.filePutFirstLineInTitle,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandVisibility.filePutFirstLineInTitle =
              value;
            this.plugin.debugLog(
              "commandVisibility.filePutFirstLineInTitle",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );
    const fileIcon = filePutFirstLineSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(fileIcon, "file-pen");
    filePutFirstLineSetting.nameEl.insertBefore(
      fileIcon,
      filePutFirstLineSetting.nameEl.firstChild,
    );

    const fileDisableSetting = new Setting(fileContainer)
      .setName(t("commands.disableRenamingForNote"))
      .setDesc(t("commands.descriptions.excludeNote"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.commandVisibility.fileExclude)
          .onChange(async (value) => {
            this.plugin.settings.core.commandVisibility.fileExclude = value;
            this.plugin.debugLog("commandVisibility.fileExclude", value);
            await this.plugin.saveSettings();
          }),
      );
    const fileDisableIcon = fileDisableSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(fileDisableIcon, "square-x");
    fileDisableSetting.nameEl.insertBefore(
      fileDisableIcon,
      fileDisableSetting.nameEl.firstChild,
    );

    const fileEnableSetting = new Setting(fileContainer)
      .setName(t("commands.enableRenamingForNote"))
      .setDesc(t("commands.descriptions.stopExcludingNote"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandVisibility.fileStopExcluding,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandVisibility.fileStopExcluding =
              value;
            this.plugin.debugLog("commandVisibility.fileStopExcluding", value);
            await this.plugin.saveSettings();
          }),
      );
    const fileEnableIcon = fileEnableSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(fileEnableIcon, "square-check");
    fileEnableSetting.nameEl.insertBefore(
      fileEnableIcon,
      fileEnableSetting.nameEl.firstChild,
    );

    const folderHeaderSetting = new Setting(this.containerEl)
      .setName(t("settings.commands.folder.title"))
      .setDesc(t("settings.commands.folder.desc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.core.enableFolderCommands)
          .onChange(async (value) => {
            this.plugin.settings.core.enableFolderCommands = value;
            this.plugin.debugLog("enableFolderCommands", value);
            await this.plugin.saveSettings();
            updateFolderUI();
          });
      });

    folderHeaderSetting.settingEl.addClass("flit-master-toggle");
    this.containerEl.createEl("br");

    const folderContainer = this.containerEl.createDiv();
    folderContainer.addClass("flit-master-disable-target");

    const updateFolderUI = () => {
      if (this.plugin.settings.core.enableFolderCommands) {
        folderContainer.show();
      } else {
        folderContainer.hide();
      }
    };

    const folderPutFirstLineSetting = new Setting(folderContainer)
      .setName(t("commands.putFirstLineInTitle"))
      .setDesc(t("commands.descriptions.renameAllNotesInFolder"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandVisibility
              .folderPutFirstLineInTitle,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandVisibility.folderPutFirstLineInTitle =
              value;
            this.plugin.debugLog(
              "commandVisibility.folderPutFirstLineInTitle",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );
    const folderIcon = folderPutFirstLineSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(folderIcon, "folder-pen");
    folderPutFirstLineSetting.nameEl.insertBefore(
      folderIcon,
      folderPutFirstLineSetting.nameEl.firstChild,
    );

    const folderDisableSetting = new Setting(folderContainer)
      .setName(t("commands.disableRenamingInFolder"))
      .setDesc(t("commands.descriptions.excludeFolder"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.commandVisibility.folderExclude)
          .onChange(async (value) => {
            this.plugin.settings.core.commandVisibility.folderExclude = value;
            this.plugin.debugLog("commandVisibility.folderExclude", value);
            await this.plugin.saveSettings();
          }),
      );
    const folderDisableIcon = folderDisableSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(folderDisableIcon, "square-x");
    folderDisableSetting.nameEl.insertBefore(
      folderDisableIcon,
      folderDisableSetting.nameEl.firstChild,
    );

    const folderEnableSetting = new Setting(folderContainer)
      .setName(t("commands.enableRenamingInFolder"))
      .setDesc(t("commands.descriptions.stopExcludingFolder"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandVisibility.folderStopExcluding,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandVisibility.folderStopExcluding =
              value;
            this.plugin.debugLog(
              "commandVisibility.folderStopExcluding",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );
    const folderEnableIcon = folderEnableSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(folderEnableIcon, "square-check");
    folderEnableSetting.nameEl.insertBefore(
      folderEnableIcon,
      folderEnableSetting.nameEl.firstChild,
    );

    const tagHeaderSetting = new Setting(this.containerEl)
      .setName(t("settings.commands.tag.title"))
      .setDesc(t("settings.commands.tag.desc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.core.enableTagCommands)
          .onChange(async (value) => {
            this.plugin.settings.core.enableTagCommands = value;
            this.plugin.debugLog("enableTagCommands", value);
            await this.plugin.saveSettings();
            updateTagUI();
          });
      });

    tagHeaderSetting.settingEl.addClass("flit-master-toggle");
    this.containerEl.createEl("br");

    const tagContainer = this.containerEl.createDiv();
    tagContainer.addClass("flit-master-disable-target");

    const updateTagUI = () => {
      if (this.plugin.settings.core.enableTagCommands) {
        tagContainer.show();
      } else {
        tagContainer.hide();
      }
    };

    const tagPutFirstLineSetting = new Setting(tagContainer)
      .setName(t("commands.putFirstLineInTitle"))
      .setDesc(t("commands.descriptions.renameAllNotesWithTag"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandVisibility.tagPutFirstLineInTitle,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandVisibility.tagPutFirstLineInTitle =
              value;
            this.plugin.debugLog(
              "commandVisibility.tagPutFirstLineInTitle",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );
    const tagIcon = tagPutFirstLineSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(tagIcon, "file-pen");
    tagPutFirstLineSetting.nameEl.insertBefore(
      tagIcon,
      tagPutFirstLineSetting.nameEl.firstChild,
    );

    const tagDisableSetting = new Setting(tagContainer)
      .setName(t("commands.disableRenamingForTag"))
      .setDesc(t("commands.descriptions.excludeTag"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.commandVisibility.tagExclude)
          .onChange(async (value) => {
            this.plugin.settings.core.commandVisibility.tagExclude = value;
            this.plugin.debugLog("commandVisibility.tagExclude", value);
            await this.plugin.saveSettings();
          }),
      );
    const tagDisableIcon = tagDisableSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(tagDisableIcon, "square-x");
    tagDisableSetting.nameEl.insertBefore(
      tagDisableIcon,
      tagDisableSetting.nameEl.firstChild,
    );

    const tagEnableSetting = new Setting(tagContainer)
      .setName(t("commands.enableRenamingForTag"))
      .setDesc(t("commands.descriptions.stopExcludingTag"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.commandVisibility.tagStopExcluding,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.commandVisibility.tagStopExcluding =
              value;
            this.plugin.debugLog("commandVisibility.tagStopExcluding", value);
            await this.plugin.saveSettings();
          }),
      );
    const tagEnableIcon = tagEnableSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(tagEnableIcon, "square-check");
    tagEnableSetting.nameEl.insertBefore(
      tagEnableIcon,
      tagEnableSetting.nameEl.firstChild,
    );

    const vaultSearchHeaderSetting = new Setting(this.containerEl)
      .setName(t("settings.commands.search.title"))
      .setDesc(t("settings.commands.search.desc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.core.enableVaultSearchContextMenu)
          .onChange(async (value) => {
            this.plugin.settings.core.enableVaultSearchContextMenu = value;
            this.plugin.debugLog("enableVaultSearchContextMenu", value);
            await this.plugin.saveSettings();
            updateVaultSearchUI();
          });
      });

    vaultSearchHeaderSetting.settingEl.addClass("flit-master-toggle");
    this.containerEl.createEl("br");

    const vaultSearchContainer = this.containerEl.createDiv({
      cls: "flit-vault-search-container",
    });
    vaultSearchContainer.addClass("flit-master-disable-target");

    const updateVaultSearchUI = () => {
      if (this.plugin.settings.core.enableVaultSearchContextMenu) {
        vaultSearchContainer.show();
      } else {
        vaultSearchContainer.hide();
      }
    };

    const vaultSearchPutFirstLineSetting = new Setting(vaultSearchContainer)
      .setName(t("commands.putFirstLineInTitle"))
      .setDesc(t("commands.descriptions.renameAllNotesInSearchResults"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.vaultSearchContextMenuVisibility
              .putFirstLineInTitle,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.vaultSearchContextMenuVisibility.putFirstLineInTitle =
              value;
            this.plugin.debugLog(
              "vaultSearchContextMenuVisibility.putFirstLineInTitle",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );
    const vaultSearchIcon = vaultSearchPutFirstLineSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(vaultSearchIcon, "file-pen");
    vaultSearchPutFirstLineSetting.nameEl.insertBefore(
      vaultSearchIcon,
      vaultSearchPutFirstLineSetting.nameEl.firstChild,
    );

    const vaultSearchDisableSetting = new Setting(vaultSearchContainer)
      .setName(t("commands.disableRenaming"))
      .setDesc(t("commands.descriptions.excludeAllNotesInSearchResults"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.vaultSearchContextMenuVisibility.disable,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.vaultSearchContextMenuVisibility.disable =
              value;
            this.plugin.debugLog(
              "vaultSearchContextMenuVisibility.disable",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );
    const vaultSearchDisableIcon = vaultSearchDisableSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(vaultSearchDisableIcon, "square-x");
    vaultSearchDisableSetting.nameEl.insertBefore(
      vaultSearchDisableIcon,
      vaultSearchDisableSetting.nameEl.firstChild,
    );

    const vaultSearchEnableSetting = new Setting(vaultSearchContainer)
      .setName(t("commands.enableRenaming"))
      .setDesc(t("commands.descriptions.stopExcludingAllNotesInSearchResults"))
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.core.vaultSearchContextMenuVisibility.enable,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.vaultSearchContextMenuVisibility.enable =
              value;
            this.plugin.debugLog(
              "vaultSearchContextMenuVisibility.enable",
              value,
            );
            await this.plugin.saveSettings();
          }),
      );
    const vaultSearchEnableIcon = vaultSearchEnableSetting.nameEl.createDiv({
      cls: "setting-item-icon",
    });
    setIcon(vaultSearchEnableIcon, "square-check");
    vaultSearchEnableSetting.nameEl.insertBefore(
      vaultSearchEnableIcon,
      vaultSearchEnableSetting.nameEl.firstChild,
    );

    updateFileUI();
    updateFolderUI();
    updateTagUI();
    updateVaultSearchUI();
  }
}
