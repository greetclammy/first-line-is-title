import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from "./settings-base";
import { detectOS } from "../utils";
import { DEFAULT_SETTINGS } from "../constants";
import { t, getCurrentLocale } from "../i18n";
import { CharReplacements } from "../types/char-replacement";

export class ForbiddenCharsTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  render(): void {
    const headerToggleSetting = new Setting(this.containerEl)
      .setName(t("settings.replaceCharacters.name"))
      .setDesc(t("settings.replaceCharacters.desc"))
      .setHeading()
      .addToggle((toggle) => {
        toggle
          .setValue(
            this.plugin.settings.replaceCharacters
              .enableForbiddenCharReplacements,
          )
          .onChange(async (value) => {
            this.plugin.settings.replaceCharacters.enableForbiddenCharReplacements =
              value;
            this.plugin.debugLog("enableForbiddenCharReplacements", value);

            // Auto-toggle OFF dependent settings when disabling
            if (!value) {
              if (
                this.plugin.settings.core.convertReplacementCharactersInTitle
              ) {
                this.plugin.settings.core.convertReplacementCharactersInTitle = false;
              }
            }

            // On first enable, turn on all 'All OSes' options
            if (value && !this.plugin.settings.core.hasEnabledForbiddenChars) {
              const allOSesKeys = [
                "leftBracket",
                "rightBracket",
                "hash",
                "caret",
                "pipe",
                "slash",
                "colon",
              ];
              allOSesKeys.forEach((key) => {
                this.plugin.settings.replaceCharacters.charReplacements[
                  key as keyof typeof this.plugin.settings.replaceCharacters.charReplacements
                ].enabled = true;
              });
              this.plugin.settings.core.hasEnabledForbiddenChars = true;

              // If OS is Windows or Android, also enable 'Windows/Android' section
              const currentOS = detectOS();
              if (
                currentOS === "Windows" &&
                !this.plugin.settings.core.hasEnabledWindowsAndroid
              ) {
                this.plugin.settings.replaceCharacters.windowsAndroidEnabled = true;
                const windowsAndroidKeys = [
                  "asterisk",
                  "quote",
                  "lessThan",
                  "greaterThan",
                  "question",
                ];
                windowsAndroidKeys.forEach((key) => {
                  this.plugin.settings.replaceCharacters.charReplacements[
                    key as keyof typeof this.plugin.settings.replaceCharacters.charReplacements
                  ].enabled = true;
                });
                this.plugin.settings.core.hasEnabledWindowsAndroid = true;
              }
            }

            await this.plugin.saveSettings();
            updateCharacterSettings(); // Rebuild to show new toggle states
            updateCharacterReplacementUI();
            updateWindowsAndroidUI();
            if (windowsAndroidToggleComponent) {
              windowsAndroidToggleComponent.setDisabled(!value);
              if (value) {
                windowsAndroidToggleComponent.toggleEl.classList.remove(
                  "flit-state-disabled",
                );
                windowsAndroidToggleComponent.toggleEl.classList.add(
                  "flit-state-enabled",
                );
                windowsAndroidToggleComponent.toggleEl.tabIndex = 0;
                windowsAndroidToggleComponent.toggleEl.removeAttribute(
                  "aria-disabled",
                );
              } else {
                windowsAndroidToggleComponent.toggleEl.classList.remove(
                  "flit-state-enabled",
                );
                windowsAndroidToggleComponent.toggleEl.classList.add(
                  "flit-state-disabled",
                );
                windowsAndroidToggleComponent.toggleEl.tabIndex = -1;
                windowsAndroidToggleComponent.toggleEl.setAttribute(
                  "aria-disabled",
                  "true",
                );
              }
            }
            (
              this.plugin as typeof this.plugin & {
                updateGeneralConditionalSettings?: () => Promise<void>;
              }
            ).updateGeneralConditionalSettings?.();
          });
      });

    const charSettingsContainer = this.containerEl.createDiv({
      cls: "flit-char-settings-container",
    });

    const updateCharacterReplacementUI = () => {
      this.updateInteractiveState(
        charSettingsContainer,
        this.plugin.settings.replaceCharacters.enableForbiddenCharReplacements,
      );
      this.updateDisabledRowsAccessibility(charSettingsContainer);
      const tableContainers = charSettingsContainer.querySelectorAll(
        ".flit-table-container",
      );
      tableContainers.forEach((container: HTMLElement) => {
        if (
          this.plugin.settings.replaceCharacters.enableForbiddenCharReplacements
        ) {
          container.classList.remove("flit-master-disabled");
        } else {
          container.classList.add("flit-master-disabled");
        }
      });
    };

    const primaryCharSettings: Array<{
      key: keyof typeof this.plugin.settings.replaceCharacters.charReplacements;
      name: string;
      char: string;
      description?: string;
    }> = [
      {
        key: "leftBracket",
        name: t("settings.replaceCharacters.characters.leftBracket"),
        char: "[",
      },
      {
        key: "rightBracket",
        name: t("settings.replaceCharacters.characters.rightBracket"),
        char: "]",
      },
      {
        key: "hash",
        name: t("settings.replaceCharacters.characters.hash"),
        char: "#",
      },
      {
        key: "caret",
        name: t("settings.replaceCharacters.characters.caret"),
        char: "^",
      },
      {
        key: "pipe",
        name: t("settings.replaceCharacters.characters.pipe"),
        char: "|",
      },
      {
        key: "backslash",
        name: t("settings.replaceCharacters.characters.backslash"),
        char: String.fromCharCode(92),
      },
      {
        key: "slash",
        name: t("settings.replaceCharacters.characters.forwardSlash"),
        char: "/",
      },
      {
        key: "colon",
        name: t("settings.replaceCharacters.characters.colon"),
        char: ":",
      },
      {
        key: "dot",
        name: t("settings.replaceCharacters.characters.dot"),
        char: ".",
        description: t("settings.replaceCharacters.characters.dotNote"),
      },
    ];

    const windowsAndroidChars: Array<{
      key: keyof typeof this.plugin.settings.replaceCharacters.charReplacements;
      name: string;
      char: string;
    }> = [
      {
        key: "asterisk",
        name: t("settings.replaceCharacters.characters.asterisk"),
        char: "*",
      },
      {
        key: "quote",
        name: t("settings.replaceCharacters.characters.quote"),
        char: '"',
      },
      {
        key: "lessThan",
        name: t("settings.replaceCharacters.characters.lessThan"),
        char: "<",
      },
      {
        key: "greaterThan",
        name: t("settings.replaceCharacters.characters.greaterThan"),
        char: ">",
      },
      {
        key: "question",
        name: t("settings.replaceCharacters.characters.questionMark"),
        char: "?",
      },
    ];

    let windowsAndroidTableContainer: HTMLElement;
    let windowsAndroidToggleComponent: any;

    const updateCharacterSettings = () => {
      charSettingsContainer.empty();

      const allOSesHeaderSetting = new Setting(charSettingsContainer)
        .setName(t("settings.replaceCharacters.allOSes.title"))
        .setDesc(t("settings.replaceCharacters.allOSes.desc"))
        .setHeading();

      allOSesHeaderSetting.settingEl.style.borderBottom = "1px solid var(--background-modifier-border)";
      allOSesHeaderSetting.settingEl.style.paddingBottom = "12px";
      allOSesHeaderSetting.settingEl.style.marginBottom = "12px";

      const allOSesNoteEl = charSettingsContainer.createEl("div", {
        cls: "setting-item-description flit-margin-top-15 flit-margin-bottom-15",
      });
      allOSesNoteEl.appendText(
        t("settings.replaceCharacters.allOSes.note.part1"),
      );
      if (getCurrentLocale() === "ru") {
        allOSesNoteEl.appendText(
          "«" + t("settings.replaceCharacters.allOSes.note.trimLeft") + "»",
        );
      } else {
        allOSesNoteEl.createEl("em", {
          text: t("settings.replaceCharacters.allOSes.note.trimLeft"),
        });
      }
      allOSesNoteEl.appendText(
        t("settings.replaceCharacters.allOSes.note.part2"),
      );
      if (getCurrentLocale() === "ru") {
        allOSesNoteEl.appendText(
          "«" + t("settings.replaceCharacters.allOSes.note.trimRight") + "»",
        );
      } else {
        allOSesNoteEl.createEl("em", {
          text: t("settings.replaceCharacters.allOSes.note.trimRight"),
        });
      }
      allOSesNoteEl.appendText(
        t("settings.replaceCharacters.allOSes.note.part3"),
      );

      const allOSesTableContainer = charSettingsContainer.createEl("div", {
        cls: "flit-table-container",
      });
      const allOSesTableWrapper = allOSesTableContainer.createEl("div", {
        cls: "flit-table-wrapper",
      });

      const headerRow = allOSesTableWrapper.createEl("div", {
        cls: "flit-char-replacement-header",
      });

      const enableHeader = headerRow.createDiv({ cls: "flit-enable-column" });
      enableHeader.textContent = t("settings.replaceCharacters.headers.enable");

      const charNameHeader = headerRow.createDiv({
        cls: "flit-char-name-column",
      });
      charNameHeader.textContent = t(
        "settings.replaceCharacters.headers.character",
      );

      const inputHeader = headerRow.createDiv({
        cls: "flit-char-text-input-container",
      });
      inputHeader.textContent = t(
        "settings.replaceCharacters.headers.replaceWith",
      );

      const trimLeftHeader = headerRow.createDiv({
        cls: "flit-toggle-column center",
      });
      const trimLeftLine1 = trimLeftHeader.createDiv();
      trimLeftLine1.textContent = t(
        "settings.replaceCharacters.headers.trimLeft",
      );

      const trimRightHeader = headerRow.createDiv({
        cls: "flit-toggle-column center",
      });
      const trimRightLine1 = trimRightHeader.createDiv();
      trimRightLine1.textContent = t(
        "settings.replaceCharacters.headers.trimRight",
      );

      primaryCharSettings.forEach((setting) => {
        const key = setting.key as keyof CharReplacements;
        const rowEl = allOSesTableWrapper.createEl("div", {
          cls: "flit-char-replacement-setting",
        });

        const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });
        const toggleSetting = new Setting(document.createElement("div"));
        toggleSetting.addToggle((toggle) => {
          toggle
            .setValue(
              this.plugin.settings.core.hasEnabledForbiddenChars
                ? this.plugin.settings.replaceCharacters.charReplacements[key]
                    .enabled
                : false,
            )
            .onChange(async (value) => {
              this.plugin.settings.replaceCharacters.charReplacements[
                key
              ].enabled = value;
              this.plugin.debugLog(
                `charReplacements.${String(key)}.enabled`,
                value,
              );
              await this.plugin.saveSettings();
              updateRowAppearance();
            });
          toggle.toggleEl.classList.add("flit-margin-0");
          toggleContainer.appendChild(toggle.toggleEl);
        });

        const updateRowAppearance = () => {
          if (
            this.plugin.settings.replaceCharacters.charReplacements[key].enabled
          ) {
            rowEl.classList.remove("flit-row-disabled");
          } else {
            rowEl.classList.add("flit-row-disabled");
          }
        };

        const nameContainer = rowEl.createEl("div", {
          cls: "flit-char-name-column",
        });
        const nameEl = nameContainer.createEl("div", {
          text: setting.name,
          cls: "setting-item-name",
        });
        if (setting.description) {
          const descEl = nameContainer.createEl("div", {
            cls: "setting-item-description",
          });
          descEl.textContent = setting.description;
        }

        const inputContainer = rowEl.createDiv({
          cls: "flit-char-text-input-container",
        });

        const restoreButton = inputContainer.createEl("button", {
          cls: "clickable-icon flit-restore-icon",
          attr: {
            "aria-label": t("settings.replaceCharacters.restoreDefault"),
          },
        });
        setIcon(restoreButton, "rotate-ccw");
        restoreButton.addEventListener("click", async () => {
          this.plugin.settings.replaceCharacters.charReplacements[
            key
          ].replacement =
            DEFAULT_SETTINGS.replaceCharacters.charReplacements[
              key
            ].replacement;
          textInput.value =
            DEFAULT_SETTINGS.replaceCharacters.charReplacements[
              key
            ].replacement;
          await this.plugin.saveSettings();
        });

        const textInput = inputContainer.createEl("input", {
          type: "text",
          cls: "flit-char-text-input flit-width-120",
        });
        textInput.placeholder = t(
          "settings.replaceCharacters.emptyPlaceholder",
        );
        textInput.value =
          this.plugin.settings.replaceCharacters.charReplacements[
            key
          ].replacement;
        textInput.addEventListener("input", async (e) => {
          this.plugin.settings.replaceCharacters.charReplacements[
            key
          ].replacement = (e.target as HTMLInputElement).value;
          this.plugin.debugLog(
            `charReplacements.${String(key)}.replacement`,
            this.plugin.settings.replaceCharacters.charReplacements[key]
              .replacement,
          );
          await this.plugin.saveSettings();
        });

        this.addForbiddenCharProtection(textInput);

        const trimLeftContainer = rowEl.createDiv({
          cls: "flit-toggle-column center",
        });
        const trimLeftSetting = new Setting(document.createElement("div"));
        trimLeftSetting.addToggle((toggle) => {
          toggle
            .setValue(
              this.plugin.settings.core.hasEnabledForbiddenChars
                ? this.plugin.settings.replaceCharacters.charReplacements[key]
                    .trimLeft
                : false,
            )
            .onChange(async (value) => {
              this.plugin.settings.replaceCharacters.charReplacements[
                key
              ].trimLeft = value;
              this.plugin.debugLog(
                `charReplacements.${String(key)}.trimLeft`,
                value,
              );
              await this.plugin.saveSettings();
            });
          toggle.toggleEl.classList.add("flit-margin-0");
          trimLeftContainer.appendChild(toggle.toggleEl);
        });

        const trimRightContainer = rowEl.createDiv({
          cls: "flit-toggle-column center",
        });
        const trimRightSetting = new Setting(document.createElement("div"));
        trimRightSetting.addToggle((toggle) => {
          toggle
            .setValue(
              this.plugin.settings.core.hasEnabledForbiddenChars
                ? this.plugin.settings.replaceCharacters.charReplacements[key]
                    .trimRight
                : false,
            )
            .onChange(async (value) => {
              this.plugin.settings.replaceCharacters.charReplacements[
                key
              ].trimRight = value;
              this.plugin.debugLog(
                `charReplacements.${String(key)}.trimRight`,
                value,
              );
              await this.plugin.saveSettings();
            });
          toggle.toggleEl.classList.add("flit-margin-0");
          trimRightContainer.appendChild(toggle.toggleEl);
        });

        updateRowAppearance();
      });

      const windowsAndroidHeaderSetting = new Setting(charSettingsContainer)
        .setName(t("settings.replaceCharacters.windowsAndroid.title"))
        .setDesc(t("settings.replaceCharacters.windowsAndroid.desc"))
        .setHeading()
        .addToggle((toggle) => {
          windowsAndroidToggleComponent = toggle;
          toggle
            .setValue(
              this.plugin.settings.replaceCharacters.windowsAndroidEnabled,
            )
            .setDisabled(
              !this.plugin.settings.replaceCharacters
                .enableForbiddenCharReplacements,
            )
            .onChange(async (value) => {
              this.plugin.settings.replaceCharacters.windowsAndroidEnabled =
                value;
              this.plugin.debugLog("windowsAndroidEnabled", value);

              // On first enable, turn on all 'Windows/Android' options
              if (
                value &&
                !this.plugin.settings.core.hasEnabledWindowsAndroid
              ) {
                windowsAndroidChars.forEach((setting) => {
                  const charKey = setting.key as keyof CharReplacements;
                  this.plugin.settings.replaceCharacters.charReplacements[
                    charKey
                  ].enabled = true;
                });
                this.plugin.settings.core.hasEnabledWindowsAndroid = true;
                await this.plugin.saveSettings();
                updateCharacterSettings();
                return;
              }

              await this.plugin.saveSettings();
              updateWindowsAndroidUI();
            });

          // Make toggle completely non-interactive when disabled to prevent opacity stacking
          if (
            !this.plugin.settings.replaceCharacters
              .enableForbiddenCharReplacements
          ) {
            toggle.toggleEl.classList.add("flit-state-disabled");
            toggle.toggleEl.tabIndex = -1;
            toggle.toggleEl.setAttribute("aria-disabled", "true");
          }
        });

      windowsAndroidHeaderSetting.settingEl.style.borderBottom = "1px solid var(--background-modifier-border)";
      windowsAndroidHeaderSetting.settingEl.style.paddingBottom = "12px";
      windowsAndroidHeaderSetting.settingEl.style.marginBottom = "12px";
      charSettingsContainer.createEl("br");

      windowsAndroidTableContainer = charSettingsContainer.createEl("div", {
        cls: "flit-table-container flit-windows-android-table",
      });
      const windowsAndroidTableWrapper = windowsAndroidTableContainer.createEl(
        "div",
        { cls: "flit-table-wrapper" },
      );

      const winAndroidHeaderRow = windowsAndroidTableWrapper.createEl("div", {
        cls: "flit-char-replacement-header",
      });

      const winEnableHeader = winAndroidHeaderRow.createDiv({
        cls: "flit-enable-column",
      });
      winEnableHeader.textContent = t(
        "settings.replaceCharacters.headers.enable",
      );

      const winCharNameHeader = winAndroidHeaderRow.createDiv({
        cls: "flit-char-name-column",
      });
      winCharNameHeader.textContent = t(
        "settings.replaceCharacters.headers.character",
      );

      const winInputHeader = winAndroidHeaderRow.createDiv({
        cls: "flit-char-text-input-container",
      });
      winInputHeader.textContent = t(
        "settings.replaceCharacters.headers.replaceWith",
      );

      const winTrimLeftHeader = winAndroidHeaderRow.createDiv({
        cls: "flit-toggle-column center",
      });
      const winTrimLeftLine1 = winTrimLeftHeader.createDiv();
      winTrimLeftLine1.textContent = t(
        "settings.replaceCharacters.headers.trimLeft",
      );

      const winTrimRightHeader = winAndroidHeaderRow.createDiv({
        cls: "flit-toggle-column center",
      });
      const winTrimRightLine1 = winTrimRightHeader.createDiv();
      winTrimRightLine1.textContent = t(
        "settings.replaceCharacters.headers.trimRight",
      );

      windowsAndroidChars.forEach((setting) => {
        const key = setting.key as keyof CharReplacements;
        const rowEl = windowsAndroidTableWrapper.createEl("div", {
          cls: "flit-char-replacement-setting",
        });

        const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });
        const toggleSetting = new Setting(document.createElement("div"));
        toggleSetting.addToggle((toggle) => {
          toggle
            .setValue(
              this.plugin.settings.core.hasEnabledForbiddenChars &&
                this.plugin.settings.core.hasEnabledWindowsAndroid
                ? this.plugin.settings.replaceCharacters.charReplacements[key]
                    .enabled
                : false,
            )
            .onChange(async (value) => {
              this.plugin.settings.replaceCharacters.charReplacements[
                key
              ].enabled = value;
              this.plugin.debugLog(
                `charReplacements.${String(key)}.enabled`,
                value,
              );
              await this.plugin.saveSettings();
              updateRowAppearance();
            });
          toggle.toggleEl.classList.add("flit-margin-0");
          toggleContainer.appendChild(toggle.toggleEl);
        });

        const updateRowAppearance = () => {
          if (
            this.plugin.settings.replaceCharacters.charReplacements[key].enabled
          ) {
            rowEl.classList.remove("flit-row-disabled");
          } else {
            rowEl.classList.add("flit-row-disabled");
          }
        };

        const nameContainer = rowEl.createEl("div", {
          cls: "flit-char-name-column",
        });
        const nameEl = nameContainer.createEl("div", {
          text: setting.name,
          cls: "setting-item-name",
        });

        const inputContainer = rowEl.createDiv({
          cls: "flit-char-text-input-container",
        });

        const restoreButton = inputContainer.createEl("button", {
          cls: "clickable-icon flit-restore-icon",
          attr: {
            "aria-label": t("settings.replaceCharacters.restoreDefault"),
          },
        });
        setIcon(restoreButton, "rotate-ccw");
        restoreButton.addEventListener("click", async () => {
          this.plugin.settings.replaceCharacters.charReplacements[
            key
          ].replacement =
            DEFAULT_SETTINGS.replaceCharacters.charReplacements[
              key
            ].replacement;
          textInput.value =
            DEFAULT_SETTINGS.replaceCharacters.charReplacements[
              key
            ].replacement;
          await this.plugin.saveSettings();
        });

        const textInput = inputContainer.createEl("input", {
          type: "text",
          cls: "flit-char-text-input flit-width-120",
        });
        textInput.placeholder = t(
          "settings.replaceCharacters.emptyPlaceholder",
        );
        textInput.value =
          this.plugin.settings.replaceCharacters.charReplacements[
            key
          ].replacement;
        textInput.addEventListener("input", async (e) => {
          this.plugin.settings.replaceCharacters.charReplacements[
            key
          ].replacement = (e.target as HTMLInputElement).value;
          this.plugin.debugLog(
            `charReplacements.${String(key)}.replacement`,
            this.plugin.settings.replaceCharacters.charReplacements[key]
              .replacement,
          );
          await this.plugin.saveSettings();
        });

        this.addForbiddenCharProtection(textInput, true);

        const trimLeftContainer = rowEl.createDiv({
          cls: "flit-toggle-column center",
        });
        const trimLeftSetting = new Setting(document.createElement("div"));
        trimLeftSetting.addToggle((toggle) => {
          toggle
            .setValue(
              this.plugin.settings.core.hasEnabledForbiddenChars &&
                this.plugin.settings.core.hasEnabledWindowsAndroid
                ? this.plugin.settings.replaceCharacters.charReplacements[key]
                    .trimLeft
                : false,
            )
            .onChange(async (value) => {
              this.plugin.settings.replaceCharacters.charReplacements[
                key
              ].trimLeft = value;
              this.plugin.debugLog(
                `charReplacements.${String(key)}.trimLeft`,
                value,
              );
              await this.plugin.saveSettings();
            });
          toggle.toggleEl.classList.add("flit-margin-0");
          trimLeftContainer.appendChild(toggle.toggleEl);
        });

        const trimRightContainer = rowEl.createDiv({
          cls: "flit-toggle-column center",
        });
        const trimRightSetting = new Setting(document.createElement("div"));
        trimRightSetting.addToggle((toggle) => {
          toggle
            .setValue(
              this.plugin.settings.core.hasEnabledForbiddenChars &&
                this.plugin.settings.core.hasEnabledWindowsAndroid
                ? this.plugin.settings.replaceCharacters.charReplacements[key]
                    .trimRight
                : false,
            )
            .onChange(async (value) => {
              this.plugin.settings.replaceCharacters.charReplacements[
                key
              ].trimRight = value;
              this.plugin.debugLog(
                `charReplacements.${String(key)}.trimRight`,
                value,
              );
              await this.plugin.saveSettings();
            });
          toggle.toggleEl.classList.add("flit-margin-0");
          trimRightContainer.appendChild(toggle.toggleEl);
        });

        updateRowAppearance();
      });
    };

    const updateWindowsAndroidUI = () => {
      if (this.plugin.settings.replaceCharacters.windowsAndroidEnabled) {
        windowsAndroidTableContainer.show();
      } else {
        windowsAndroidTableContainer.hide();
      }
    };

    updateCharacterSettings();
    updateCharacterReplacementUI();
    updateWindowsAndroidUI();
  }
}
