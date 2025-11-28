import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from "./settings-base";
import {
  ExclusionStrategy,
  TagPropertyExclusionStrategy,
  TagMatchingMode,
} from "../types";
import { FolderSuggest, TagSuggest } from "../suggests";
import { DEFAULT_SETTINGS } from "../constants";
import { t, getCurrentLocale } from "../i18n";
import { TIMING } from "../constants/timing";

export class IncludeExcludeTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  async render(): Promise<void> {
    const tabDesc = this.containerEl.createEl("div", {
      cls: "setting-item-description",
    });
    tabDesc.createEl("strong", { text: t("settings.exclusions.desc") });
    tabDesc.classList.add("flit-margin-bottom-15");

    const importantNote = this.containerEl.createEl("p", {
      cls: "setting-item-description",
    });
    importantNote.appendText(t("settings.exclusions.note"));
    importantNote.classList.add("flit-margin-bottom-15");

    new Setting(this.containerEl)
      .setName(t("settings.exclusions.folders.title"))
      .setDesc(t("settings.exclusions.folders.desc"))
      .setHeading();

    const folderNote = this.containerEl.createEl("p", {
      cls: "setting-item-description",
    });
    folderNote.classList.add("flit-margin-top-15");
    folderNote.classList.add("flit-margin-bottom-15");
    folderNote.textContent = t("settings.exclusions.folders.renamedWarning");

    const subfolderSetting = new Setting(this.containerEl)
      .setName(t("settings.exclusions.folders.matchSubfolders.name"))
      .setDesc(t("settings.exclusions.folders.matchSubfolders.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.exclusions.excludeSubfolders)
          .onChange(async (value) => {
            this.plugin.settings.exclusions.excludeSubfolders = value;
            this.plugin.debugLog("excludeSubfolders", value);
            await this.plugin.saveSettings();
          }),
      );
    subfolderSetting.settingEl.classList.add("flit-border-top-none");

    new Setting(this.containerEl)
      .setName(t("settings.exclusions.folders.exclusionMode.name"))
      .setDesc(t("settings.exclusions.folders.exclusionMode.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(
            "Only exclude...",
            t("settings.exclusions.folders.exclusionMode.onlyExclude"),
          )
          .addOption(
            "Exclude all except...",
            t("settings.exclusions.folders.exclusionMode.excludeAllExcept"),
          )
          .setValue(this.plugin.settings.exclusions.folderScopeStrategy)
          .onChange(async (value: ExclusionStrategy) => {
            this.plugin.settings.exclusions.folderScopeStrategy = value;
            this.plugin.debugLog("folderScopeStrategy", value);
            await this.plugin.saveSettings();
          }),
      );

    const folderContainer = this.containerEl.createDiv();

    const renderExcludedFolders = () => {
      folderContainer.empty();
      this.plugin.settings.exclusions.excludedFolders.forEach(
        (folder, index) => {
          const folderSetting = new Setting(folderContainer);
          let textInput: any;
          let removeButton: any;

          const updateButtonState = () => {
            const isLastEmptyEntry =
              this.plugin.settings.exclusions.excludedFolders.length === 1 &&
              this.plugin.settings.exclusions.excludedFolders[0].trim() === "";

            if (isLastEmptyEntry) {
              removeButton.setDisabled(true);
              removeButton.extraSettingsEl.classList.add("flit-state-disabled");
              removeButton.extraSettingsEl.removeAttribute("aria-label");
            } else {
              removeButton.setDisabled(false);
              removeButton.extraSettingsEl.classList.remove(
                "flit-state-disabled",
              );
              removeButton.extraSettingsEl.classList.add("flit-state-enabled");
              removeButton.setTooltip(t("ariaLabels.remove"));
            }
          };

          folderSetting
            .addText((text) => {
              textInput = text;
              text
                .setPlaceholder(t("settings.exclusions.folders.placeholder"))
                .setValue(folder)
                .onChange(async (value) => {
                  this.plugin.settings.exclusions.excludedFolders[index] =
                    value;
                  this.plugin.debugLog(
                    "excludedFolders",
                    this.plugin.settings.exclusions.excludedFolders,
                  );
                  await this.plugin.saveSettings();
                  updateButtonState();
                });
              text.inputEl.classList.add("flit-width-100");

              try {
                // Get all exclusions except the current one being edited
                const otherExclusions =
                  this.plugin.settings.exclusions.excludedFolders.filter(
                    (_, i) => i !== index,
                  );
                new FolderSuggest(
                  this.plugin.app,
                  text.inputEl,
                  async (selectedPath: string) => {
                    this.plugin.settings.exclusions.excludedFolders[index] =
                      selectedPath;
                    this.plugin.debugLog(
                      "excludedFolders",
                      this.plugin.settings.exclusions.excludedFolders,
                    );
                    await this.plugin.saveSettings();
                    updateButtonState();
                  },
                  otherExclusions,
                );
              } catch (error) {
                console.error("Failed to create FolderSuggest:", error);
              }
            })
            .addExtraButton((button) => {
              removeButton = button;
              button.setIcon("x");

              button.onClick(async () => {
                const isLastEmptyEntry =
                  this.plugin.settings.exclusions.excludedFolders.length ===
                    1 &&
                  this.plugin.settings.exclusions.excludedFolders[0].trim() ===
                    "";

                if (!isLastEmptyEntry) {
                  this.plugin.settings.exclusions.excludedFolders.splice(
                    index,
                    1,
                  );
                  if (
                    this.plugin.settings.exclusions.excludedFolders.length === 0
                  ) {
                    this.plugin.settings.exclusions.excludedFolders.push("");
                  }

                  await this.plugin.saveSettings();
                  renderExcludedFolders();
                }
              });

              updateButtonState();
            });

          folderSetting.settingEl.addClass("flit-excluded-folder-setting");
        },
      );

      const addButtonSetting = new Setting(folderContainer).addButton(
        (button) => {
          button
            .setButtonText(t("settings.exclusions.folders.addButton"))
            .onClick(async () => {
              const isBottomEntryEmpty =
                this.plugin.settings.exclusions.excludedFolders.length > 0 &&
                this.plugin.settings.exclusions.excludedFolders[
                  this.plugin.settings.exclusions.excludedFolders.length - 1
                ].trim() === "";

              if (isBottomEntryEmpty) {
                const textInputs =
                  folderContainer.querySelectorAll('input[type="text"]');
                if (textInputs.length > 0) {
                  const lastInput = textInputs[
                    textInputs.length - 1
                  ] as HTMLInputElement;
                  lastInput.focus();
                }
              } else {
                this.plugin.settings.exclusions.excludedFolders.push("");
                await this.plugin.saveSettings();
                renderExcludedFolders();
                setTimeout(() => {
                  const textInputs =
                    folderContainer.querySelectorAll('input[type="text"]');
                  if (textInputs.length > 0) {
                    const lastInput = textInputs[
                      textInputs.length - 1
                    ] as HTMLInputElement;
                    lastInput.focus();
                  }
                }, TIMING.NEXT_TICK_MS);
              }
            });
        },
      );
      addButtonSetting.settingEl.addClass("flit-add-folder-button");
    };

    renderExcludedFolders();

    new Setting(this.containerEl)
      .setName(t("settings.exclusions.tags.title"))
      .setDesc(t("settings.exclusions.tags.desc"))
      .setHeading();

    const tagNotes = this.containerEl.createEl("div", {
      cls: "setting-item-description",
    });
    tagNotes.classList.add("flit-margin-top-15");
    tagNotes.classList.add("flit-margin-bottom-15");

    const tagUl = tagNotes.createEl("ul", {
      cls: "flit-margin-0 flit-padding-left-20",
    });

    const tagLi1 = tagUl.createEl("li");
    tagLi1.appendText(t("settings.exclusions.tags.excludeAllNote.part1"));
    if (getCurrentLocale() === "ru") {
      tagLi1.appendText(
        "«" +
          t("settings.exclusions.tags.excludeAllNote.excludeAllExcept") +
          "»",
      );
    } else {
      tagLi1.createEl("em", {
        text: t("settings.exclusions.tags.excludeAllNote.excludeAllExcept"),
      });
    }
    tagLi1.appendText(t("settings.exclusions.tags.excludeAllNote.part2"));

    const tagLi2 = tagUl.createEl("li");
    tagLi2.appendText(t("settings.exclusions.tags.tagWranglerWarning"));

    const tagMatchingSetting = new Setting(this.containerEl)
      .setName(t("settings.exclusions.tags.matchTags.name"))
      .setDesc(t("settings.exclusions.tags.matchTags.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(
            "In Properties and note body",
            t("settings.exclusions.tags.matchTags.inPropertiesAndBody"),
          )
          .addOption(
            "In Properties only",
            t("settings.exclusions.tags.matchTags.inPropertiesOnly"),
          )
          .addOption(
            "In note body only",
            t("settings.exclusions.tags.matchTags.inBodyOnly"),
          )
          .setValue(this.plugin.settings.exclusions.tagMatchingMode)
          .onChange(async (value: TagMatchingMode) => {
            this.plugin.settings.exclusions.tagMatchingMode = value;
            this.plugin.debugLog("tagMatchingMode", value);
            await this.plugin.saveSettings();
          }),
      );
    tagMatchingSetting.settingEl.classList.add("flit-border-top-none");

    new Setting(this.containerEl)
      .setName(t("settings.exclusions.tags.matchChildTags.name"))
      .setDesc(t("settings.exclusions.tags.matchChildTags.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.exclusions.excludeChildTags)
          .onChange(async (value) => {
            this.plugin.settings.exclusions.excludeChildTags = value;
            this.plugin.debugLog("excludeChildTags", value);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName(t("settings.exclusions.tags.exclusionMode.name"))
      .setDesc(t("settings.exclusions.tags.exclusionMode.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(
            "Only exclude...",
            t("settings.exclusions.folders.exclusionMode.onlyExclude"),
          )
          .addOption(
            "Exclude all except...",
            t("settings.exclusions.folders.exclusionMode.excludeAllExcept"),
          )
          .setValue(this.plugin.settings.exclusions.tagScopeStrategy)
          .onChange(async (value: TagPropertyExclusionStrategy) => {
            this.plugin.settings.exclusions.tagScopeStrategy = value;
            this.plugin.debugLog("tagScopeStrategy", value);
            await this.plugin.saveSettings();
          }),
      );

    const tagContainer = this.containerEl.createDiv();

    const renderExcludedTags = () => {
      tagContainer.empty();
      this.plugin.settings.exclusions.excludedTags.forEach((tag, index) => {
        const tagSetting = new Setting(tagContainer);
        let textInput: any;
        let removeButton: any;

        const updateButtonState = () => {
          const isLastEmptyEntry =
            this.plugin.settings.exclusions.excludedTags.length === 1 &&
            this.plugin.settings.exclusions.excludedTags[0].trim() === "";

          if (isLastEmptyEntry) {
            removeButton.setDisabled(true);
            removeButton.extraSettingsEl.classList.add("flit-state-disabled");
            removeButton.extraSettingsEl.removeAttribute("aria-label");
          } else {
            removeButton.setDisabled(false);
            removeButton.extraSettingsEl.classList.remove(
              "flit-state-disabled",
            );
            removeButton.extraSettingsEl.classList.add("flit-state-enabled");
            removeButton.setTooltip(t("ariaLabels.remove"));
          }
        };

        tagSetting
          .addText((text) => {
            textInput = text;
            text
              .setPlaceholder(t("settings.exclusions.tags.placeholder"))
              .setValue(tag)
              .onChange(async (value) => {
                this.plugin.settings.exclusions.excludedTags[index] = value;
                this.plugin.debugLog(
                  "excludedTags",
                  this.plugin.settings.exclusions.excludedTags,
                );
                await this.plugin.saveSettings();
                updateButtonState();
              });
            text.inputEl.classList.add("flit-width-100");

            try {
              // Get all exclusions except the current one being edited
              const otherExclusions =
                this.plugin.settings.exclusions.excludedTags.filter(
                  (_, i) => i !== index,
                );
              new TagSuggest(
                this.plugin.app,
                text.inputEl,
                async (selectedTag: string) => {
                  this.plugin.settings.exclusions.excludedTags[index] =
                    selectedTag;
                  this.plugin.debugLog(
                    "excludedTags",
                    this.plugin.settings.exclusions.excludedTags,
                  );
                  await this.plugin.saveSettings();
                  updateButtonState();
                },
                otherExclusions,
              );
            } catch (error) {
              console.error("Failed to create TagSuggest:", error);
            }
          })
          .addExtraButton((button) => {
            removeButton = button;
            button.setIcon("x");

            button.onClick(async () => {
              const isLastEmptyEntry =
                this.plugin.settings.exclusions.excludedTags.length === 1 &&
                this.plugin.settings.exclusions.excludedTags[0].trim() === "";

              if (!isLastEmptyEntry) {
                this.plugin.settings.exclusions.excludedTags.splice(index, 1);
                if (this.plugin.settings.exclusions.excludedTags.length === 0) {
                  this.plugin.settings.exclusions.excludedTags.push("");
                }

                await this.plugin.saveSettings();
                renderExcludedTags();
              }
            });

            updateButtonState();
          });

        tagSetting.settingEl.addClass("flit-excluded-folder-setting");
      });

      const addTagButtonSetting = new Setting(tagContainer).addButton(
        (button) => {
          button
            .setButtonText(t("settings.exclusions.tags.addButton"))
            .onClick(async () => {
              const isBottomEntryEmpty =
                this.plugin.settings.exclusions.excludedTags.length > 0 &&
                this.plugin.settings.exclusions.excludedTags[
                  this.plugin.settings.exclusions.excludedTags.length - 1
                ].trim() === "";

              if (isBottomEntryEmpty) {
                const textInputs =
                  tagContainer.querySelectorAll('input[type="text"]');
                if (textInputs.length > 0) {
                  const lastInput = textInputs[
                    textInputs.length - 1
                  ] as HTMLInputElement;
                  lastInput.focus();
                }
              } else {
                this.plugin.settings.exclusions.excludedTags.push("");
                await this.plugin.saveSettings();
                renderExcludedTags();
                setTimeout(() => {
                  const textInputs =
                    tagContainer.querySelectorAll('input[type="text"]');
                  if (textInputs.length > 0) {
                    const lastInput = textInputs[
                      textInputs.length - 1
                    ] as HTMLInputElement;
                    lastInput.focus();
                  }
                }, TIMING.NEXT_TICK_MS);
              }
            });
        },
      );
      addTagButtonSetting.settingEl.addClass("flit-add-folder-button");
    };

    renderExcludedTags();

    new Setting(this.containerEl)
      .setName(t("settings.exclusions.properties.title"))
      .setDesc(t("settings.exclusions.properties.desc"))
      .setHeading();

    const propertyNotes = this.containerEl.createEl("div", {
      cls: "setting-item-description",
    });
    propertyNotes.classList.add("flit-margin-top-15");
    propertyNotes.classList.add("flit-margin-bottom-15");

    const ul = propertyNotes.createEl("ul", {
      cls: "flit-margin-0 flit-padding-left-20",
    });

    const propLi1 = ul.createEl("li");
    propLi1.appendText(t("settings.exclusions.properties.leaveBlank.part1"));
    if (getCurrentLocale() === "ru") {
      propLi1.appendText(
        "«" + t("settings.exclusions.properties.leaveBlank.value") + "»",
      );
    } else {
      propLi1.createEl("em", {
        text: t("settings.exclusions.properties.leaveBlank.value"),
      });
    }
    propLi1.appendText(t("settings.exclusions.properties.leaveBlank.part2"));

    ul.createEl("li", {
      text: t("settings.exclusions.properties.caseInsensitive"),
    });

    const propLi3 = ul.createEl("li");
    propLi3.appendText(
      t("settings.exclusions.properties.excludeAllNote.part1"),
    );
    if (getCurrentLocale() === "ru") {
      propLi3.appendText(
        "«" +
          t("settings.exclusions.properties.excludeAllNote.excludeAllExcept") +
          "»",
      );
    } else {
      propLi3.createEl("em", {
        text: t(
          "settings.exclusions.properties.excludeAllNote.excludeAllExcept",
        ),
      });
    }
    propLi3.appendText(
      t("settings.exclusions.properties.excludeAllNote.part2"),
    );

    ul.createEl("li", {
      text: t("settings.exclusions.properties.renamedWarning"),
    });

    const propertyModeSetting = new Setting(this.containerEl)
      .setName(t("settings.exclusions.properties.exclusionMode.name"))
      .setDesc(t("settings.exclusions.properties.exclusionMode.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption(
            "Only exclude...",
            t("settings.exclusions.folders.exclusionMode.onlyExclude"),
          )
          .addOption(
            "Exclude all except...",
            t("settings.exclusions.folders.exclusionMode.excludeAllExcept"),
          )
          .setValue(this.plugin.settings.exclusions.propertyScopeStrategy)
          .onChange(async (value: TagPropertyExclusionStrategy) => {
            this.plugin.settings.exclusions.propertyScopeStrategy = value;
            this.plugin.debugLog("propertyScopeStrategy", value);
            await this.plugin.saveSettings();
          }),
      );
    propertyModeSetting.settingEl.classList.add("flit-border-top-none");

    const propertyContainer = this.containerEl.createDiv();

    const renderExcludedProperties = () => {
      propertyContainer.empty();
      if (this.plugin.settings.exclusions.excludedProperties.length === 0) {
        this.plugin.settings.exclusions.excludedProperties.push({
          key: "",
          value: "",
        });
      }
      this.plugin.settings.exclusions.excludedProperties.forEach(
        (property, index) => {
          const propertySetting = new Setting(propertyContainer);
          let keyInput: any;
          let valueInput: any;
          let removeButton: any;

          const updateButtonState = () => {
            const isLastEmptyEntry =
              this.plugin.settings.exclusions.excludedProperties.length === 1 &&
              this.plugin.settings.exclusions.excludedProperties[0].key.trim() ===
                "" &&
              this.plugin.settings.exclusions.excludedProperties[0].value.trim() ===
                "";

            if (isLastEmptyEntry) {
              removeButton.setDisabled(true);
              removeButton.extraSettingsEl.classList.add("flit-state-disabled");
              removeButton.extraSettingsEl.removeAttribute("aria-label");
            } else {
              removeButton.setDisabled(false);
              removeButton.extraSettingsEl.classList.remove(
                "flit-state-disabled",
              );
              removeButton.extraSettingsEl.classList.add("flit-state-enabled");
              removeButton.setTooltip(t("ariaLabels.remove"));
            }
          };
          const propertyInputContainer = propertySetting.controlEl.createDiv({
            cls: "flit-property-container",
          });
          propertyInputContainer.classList.add("flit-display-flex");
          propertyInputContainer.classList.add("flit-gap-10");
          propertyInputContainer.classList.add("flit-align-items-center");

          keyInput = propertyInputContainer.createEl("input", {
            type: "text",
            cls: "flit-property-key-input",
          });
          keyInput.placeholder = t(
            "settings.exclusions.properties.keyPlaceholder",
          );
          keyInput.value = property.key;
          keyInput.tabIndex = 0;

          propertyInputContainer.createEl("span", {
            text: t("settings.exclusions.properties.separator"),
            cls: "flit-colon-separator",
          });
          valueInput = propertyInputContainer.createEl("input", {
            type: "text",
            cls: "flit-property-value-input",
          });
          valueInput.placeholder = t(
            "settings.exclusions.properties.valuePlaceholder",
          );
          valueInput.value = property.value;
          valueInput.tabIndex = 0;
          keyInput.addEventListener(
            "keydown",
            (e: KeyboardEvent) => {
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                setTimeout(() => {
                  valueInput.focus();
                }, 0);
              }
            },
            true,
          );

          valueInput.addEventListener(
            "keydown",
            (e: KeyboardEvent) => {
              if (e.key === "Tab" && e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                setTimeout(() => {
                  keyInput.focus();
                }, 0);
              }
            },
            true,
          );
          keyInput.addEventListener("input", async (e: any) => {
            this.plugin.settings.exclusions.excludedProperties[index].key =
              e.target.value;
            this.plugin.debugLog(
              "excludedProperties",
              this.plugin.settings.exclusions.excludedProperties,
            );
            await this.plugin.saveSettings();
            updateButtonState();
          });

          valueInput.addEventListener("input", async (e: any) => {
            this.plugin.settings.exclusions.excludedProperties[index].value =
              e.target.value;
            this.plugin.debugLog(
              "excludedProperties",
              this.plugin.settings.exclusions.excludedProperties,
            );
            await this.plugin.saveSettings();
            updateButtonState();
          });

          propertySetting.addExtraButton((button) => {
            removeButton = button;
            button.setIcon("x");

            button.onClick(async () => {
              if (
                this.plugin.settings.exclusions.excludedProperties.length === 1
              ) {
                this.plugin.settings.exclusions.excludedProperties[0] = {
                  key: "",
                  value: "",
                };
              } else {
                this.plugin.settings.exclusions.excludedProperties.splice(
                  index,
                  1,
                );
              }

              await this.plugin.saveSettings();
              renderExcludedProperties();
            });

            updateButtonState();
          });

          propertySetting.settingEl.addClass("flit-excluded-folder-setting");
        },
      );

      const addPropertyButtonSetting = new Setting(propertyContainer).addButton(
        (button) => {
          button
            .setButtonText(t("settings.exclusions.properties.addButton"))
            .onClick(async () => {
              const lastProperty =
                this.plugin.settings.exclusions.excludedProperties[
                  this.plugin.settings.exclusions.excludedProperties.length - 1
                ];
              const isBottomEntryEmpty =
                this.plugin.settings.exclusions.excludedProperties.length > 0 &&
                lastProperty.key.trim() === "" &&
                lastProperty.value.trim() === "";

              if (isBottomEntryEmpty) {
                const keyInputs = propertyContainer.querySelectorAll(
                  ".flit-property-key-input",
                );
                if (keyInputs.length > 0) {
                  const lastInput = keyInputs[
                    keyInputs.length - 1
                  ] as HTMLInputElement;
                  lastInput.focus();
                }
              } else {
                this.plugin.settings.exclusions.excludedProperties.push({
                  key: "",
                  value: "",
                });
                await this.plugin.saveSettings();
                renderExcludedProperties();
                setTimeout(() => {
                  const keyInputs = propertyContainer.querySelectorAll(
                    ".flit-property-key-input",
                  );
                  if (keyInputs.length > 0) {
                    const lastInput = keyInputs[
                      keyInputs.length - 1
                    ] as HTMLInputElement;
                    lastInput.focus();
                  }
                }, TIMING.NEXT_TICK_MS);
              }
            });
        },
      );
      addPropertyButtonSetting.settingEl.addClass("flit-add-folder-button");
    };

    renderExcludedProperties();

    const propertyDisableSetting = new Setting(this.containerEl)
      .setName(t("settings.exclusions.disableProperty.title"))
      .setDesc("")
      .setHeading();

    const propertyDesc = propertyDisableSetting.descEl;
    propertyDesc.appendText(t("settings.exclusions.disableProperty.desc"));

    const propertyDisableNotes = this.containerEl.createEl("div", {
      cls: "setting-item-description",
    });
    propertyDisableNotes.classList.add("flit-margin-top-15");
    propertyDisableNotes.classList.add("flit-margin-bottom-15");

    const disableUl = propertyDisableNotes.createEl("ul", {
      cls: "flit-margin-0 flit-padding-left-20",
    });

    disableUl.createEl("li", {
      text: t("settings.exclusions.disableProperty.alwaysRespected"),
    });
    disableUl.createEl("li", {
      text: t("settings.exclusions.disableProperty.caseInsensitive"),
    });

    disableUl.createEl("li", {
      text: t("settings.exclusions.disableProperty.updateWarning"),
    });

    const propertyInputSetting = new Setting(this.containerEl);
    propertyInputSetting.settingEl.addClass("flit-excluded-folder-setting");
    propertyInputSetting.settingEl.classList.add("flit-border-top-none");

    const propertyControlWrapper = propertyInputSetting.controlEl.createDiv({
      cls: "flit-property-control-wrapper",
    });

    const propertyRestoreButtonContainer = propertyControlWrapper.createDiv({
      cls: "flit-restore-button-container",
    });
    const propertyRestoreButton = propertyRestoreButtonContainer.createEl(
      "button",
      {
        cls: "clickable-icon flit-restore-icon",
        attr: { "aria-label": t("settings.replaceCharacters.restoreDefault") },
      },
    );
    setIcon(propertyRestoreButton, "rotate-ccw");

    const propertyInputContainer = propertyControlWrapper.createDiv({
      cls: "flit-property-container flit-display-flex flit-gap-10 flit-align-items-center",
    });
    const keyInput = propertyInputContainer.createEl("input", {
      type: "text",
      cls: "flit-property-key-input",
    });
    keyInput.placeholder = t("settings.exclusions.properties.keyPlaceholder");
    keyInput.value = this.plugin.settings.exclusions.disableRenamingKey;
    keyInput.tabIndex = 0;

    propertyInputContainer.createEl("span", {
      text: t("settings.exclusions.properties.separator"),
      cls: "flit-colon-separator",
    });
    const valueInput = propertyInputContainer.createEl("input", {
      type: "text",
      cls: "flit-property-value-input",
    });
    valueInput.placeholder = t(
      "settings.exclusions.properties.valuePlaceholder",
    );
    valueInput.value = this.plugin.settings.exclusions.disableRenamingValue;
    valueInput.tabIndex = 0;
    keyInput.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            valueInput.focus();
          }, 0);
        }
      },
      true,
    );

    valueInput.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (e.key === "Tab" && e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            keyInput.focus();
          }, 0);
        }
      },
      true,
    );
    keyInput.addEventListener("input", async (e) => {
      this.plugin.settings.exclusions.disableRenamingKey = (
        e.target as HTMLInputElement
      ).value;
      await this.plugin.saveSettings();
    });

    valueInput.addEventListener("input", async (e) => {
      this.plugin.settings.exclusions.disableRenamingValue = (
        e.target as HTMLInputElement
      ).value;
      await this.plugin.saveSettings();
    });

    propertyRestoreButton.addEventListener("click", async () => {
      this.plugin.settings.exclusions.disableRenamingKey =
        DEFAULT_SETTINGS.exclusions.disableRenamingKey;
      this.plugin.settings.exclusions.disableRenamingValue =
        DEFAULT_SETTINGS.exclusions.disableRenamingValue;
      keyInput.value = this.plugin.settings.exclusions.disableRenamingKey;
      valueInput.value = this.plugin.settings.exclusions.disableRenamingValue;
      await this.plugin.saveSettings();
    });
    const defaultTextContainer = this.containerEl.createEl("div", {
      cls: "setting-item-description flit-margin-top-5 flit-margin-bottom-20",
    });
    defaultTextContainer.createEl("small").createEl("strong", {
      text: t("settings.exclusions.disableProperty.default"),
    });

    propertyDisableSetting.settingEl.classList.add("flit-margin-bottom-20");
  }
}
