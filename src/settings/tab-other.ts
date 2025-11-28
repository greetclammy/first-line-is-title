import { Setting, setIcon, Notice } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from "./settings-base";
import { NotificationMode, FileReadMethod } from "../types";
import { DEFAULT_SETTINGS } from "../constants";
import { ClearSettingsModal } from "../modals";
import { verboseLog } from "../utils";
import { t, getCurrentLocale } from "../i18n";
import { PluginInitializer } from "../core/plugin-initializer";

export class OtherTab extends SettingsTabBase {
  private conditionalSettings: Setting[] = [];

  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
    // Register visibility update function on plugin
    (
      this.plugin as typeof this.plugin & {
        updateAutomaticRenameVisibility?: () => void;
      }
    ).updateAutomaticRenameVisibility =
      this.updateAutomaticRenameVisibility.bind(this);
  }

  render(): void {
    const charCountSetting = new Setting(this.containerEl)
      .setName(t("settings.other.charCount.name"))
      .setDesc("");

    // Create styled description for character count
    const charCountDesc = charCountSetting.descEl;
    charCountDesc.appendText(t("settings.other.charCount.desc"));
    charCountDesc.createEl("br");
    charCountDesc
      .createEl("small")
      .createEl("strong", { text: t("settings.other.charCount.default") });

    const charCountContainer = charCountSetting.controlEl.createDiv({
      cls: "flit-char-text-input-container",
    });

    const charCountRestoreButton = charCountContainer.createEl("button", {
      cls: "clickable-icon flit-restore-icon",
      attr: { "aria-label": t("ariaLabels.restoreDefault") },
    });
    setIcon(charCountRestoreButton, "rotate-ccw");

    const sliderDiv = charCountContainer.createDiv();

    charCountSetting.addSlider((slider) => {
      slider
        .setLimits(1, 252, 1)
        .setValue(this.plugin.settings.core.charCount)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.core.charCount = value;
          this.plugin.debugLog("charCount", value);
          await this.plugin.saveSettings();
        });

      // Move slider to our custom container
      sliderDiv.appendChild(slider.sliderEl);
    });

    charCountRestoreButton.addEventListener("click", async () => {
      this.plugin.settings.core.charCount = DEFAULT_SETTINGS.core.charCount;
      this.plugin.debugLog("charCount", this.plugin.settings.core.charCount);
      await this.plugin.saveSettings();

      // Update the slider value by triggering a re-render or finding the slider element
      const sliderInput = sliderDiv.querySelector(
        'input[type="range"]',
      ) as HTMLInputElement;
      if (sliderInput) {
        sliderInput.value = String(DEFAULT_SETTINGS.core.charCount);
        sliderInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    const notificationSetting = new Setting(this.containerEl)
      .setName(t("settings.other.notificationMode.name"))
      .setDesc(t("settings.other.notificationMode.desc"));

    notificationSetting.addDropdown((dropdown) =>
      dropdown
        .addOption("Always", t("settings.other.notificationMode.always"))
        .addOption(
          "On title change",
          t("settings.other.notificationMode.onTitleChange"),
        )
        .addOption("Never", t("settings.other.notificationMode.never"))
        .setValue(this.plugin.settings.core.manualNotificationMode)
        .onChange(async (value: NotificationMode) => {
          this.plugin.settings.core.manualNotificationMode = value;
          this.plugin.debugLog("manualNotificationMode", value);
          await this.plugin.saveSettings();
        }),
    );

    new Setting(this.containerEl)
      .setName(t("settings.other.preserveModificationDate.name"))
      .setDesc(t("settings.other.preserveModificationDate.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.preserveModificationDate)
          .onChange(async (value) => {
            this.plugin.settings.core.preserveModificationDate = value;
            this.plugin.debugLog("preserveModificationDate", value);
            await this.plugin.saveSettings();
          }),
      );

    const cardLinkSetting = new Setting(this.containerEl)
      .setName(t("settings.other.grabCardLink.name"))
      .setDesc("");

    const cardLinkDesc = cardLinkSetting.descEl;
    cardLinkDesc.appendText(t("settings.other.grabCardLink.desc.part1"));
    cardLinkDesc.createEl("a", {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- proper noun (plugin name)
      text: "Auto Card Link",
      href: "obsidian://show-plugin?id=auto-card-link",
    });
    cardLinkDesc.appendText(t("settings.other.grabCardLink.desc.part2"));
    cardLinkDesc.createEl("a", {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- proper noun (plugin name)
      text: "Link Embed",
      href: "obsidian://show-plugin?id=obsidian-link-embed",
    });
    cardLinkDesc.appendText(t("settings.other.grabCardLink.desc.part3"));

    cardLinkSetting.addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.markupStripping.grabTitleFromCardLink)
        .onChange(async (value) => {
          this.plugin.settings.markupStripping.grabTitleFromCardLink = value;
          this.plugin.debugLog("grabTitleFromCardLink", value);
          await this.plugin.saveSettings();
        }),
    );

    const newNoteDelaySetting = new Setting(this.containerEl)
      .setName(t("settings.other.newNoteDelay.name"))
      .setDesc("");

    // Create styled description for new note delay
    const newNoteDelayDesc = newNoteDelaySetting.descEl;
    newNoteDelayDesc.appendText(t("settings.other.newNoteDelay.desc"));
    newNoteDelayDesc.createEl("br");
    newNoteDelayDesc
      .createEl("small")
      .createEl("strong", { text: t("settings.other.newNoteDelay.default") });

    const newNoteDelayContainer = newNoteDelaySetting.controlEl.createDiv({
      cls: "flit-char-text-input-container",
    });

    const newNoteDelayRestoreButton = newNoteDelayContainer.createEl("button", {
      cls: "clickable-icon flit-restore-icon",
      attr: { "aria-label": t("ariaLabels.restoreDefault") },
    });
    setIcon(newNoteDelayRestoreButton, "rotate-ccw");

    const newNoteDelaySliderDiv = newNoteDelayContainer.createDiv();

    newNoteDelaySetting.addSlider((slider) => {
      slider
        .setLimits(0, 5000, 50)
        .setValue(this.plugin.settings.core.newNoteDelay)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.core.newNoteDelay = value;
          this.plugin.debugLog("newNoteDelay", value);
          await this.plugin.saveSettings();
        });

      // Move slider to our custom container
      newNoteDelaySliderDiv.appendChild(slider.sliderEl);
    });

    newNoteDelayRestoreButton.addEventListener("click", async () => {
      this.plugin.settings.core.newNoteDelay =
        DEFAULT_SETTINGS.core.newNoteDelay;
      this.plugin.debugLog(
        "newNoteDelay",
        this.plugin.settings.core.newNoteDelay,
      );
      await this.plugin.saveSettings();

      // Update the slider value by triggering a re-render or finding the slider element
      const sliderInput = newNoteDelaySliderDiv.querySelector(
        'input[type="range"]',
      ) as HTMLInputElement;
      if (sliderInput) {
        sliderInput.value = String(DEFAULT_SETTINGS.core.newNoteDelay);
        sliderInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    const contentReadMethodSetting = new Setting(this.containerEl)
      .setName(t("settings.other.contentReadMethod.name"))
      .setDesc("");

    // Create styled description for content read method
    const contentReadMethodDesc = contentReadMethodSetting.descEl;
    contentReadMethodDesc.appendText(
      t("settings.other.contentReadMethod.desc"),
    );
    contentReadMethodDesc.createEl("br");
    contentReadMethodDesc.createEl("small").createEl("strong", {
      text: t("settings.other.contentReadMethod.default"),
    });

    const contentReadContainer = contentReadMethodSetting.controlEl.createDiv({
      cls: "flit-content-read-container flit-display-flex flit-gap-10",
    });

    const contentReadRestoreButton = contentReadContainer.createEl("button", {
      attr: { "aria-label": t("ariaLabels.restoreDefaultContentRead") },
      cls: "clickable-icon flit-restore-button",
    });
    setIcon(contentReadRestoreButton, "rotate-ccw");

    const dropdown = contentReadContainer.createEl("select", {
      cls: "dropdown",
    });
    dropdown.createEl("option", {
      value: "Editor",
      text: t("settings.other.contentReadMethod.editor"),
    });
    dropdown.createEl("option", {
      value: "Cache",
      text: t("settings.other.contentReadMethod.cache"),
    });
    dropdown.createEl("option", {
      value: "File",
      text: t("settings.other.contentReadMethod.file"),
    });
    dropdown.value = this.plugin.settings.core.fileReadMethod;

    contentReadRestoreButton.addEventListener("click", async () => {
      dropdown.value = DEFAULT_SETTINGS.core.fileReadMethod;
      this.plugin.settings.core.fileReadMethod =
        DEFAULT_SETTINGS.core.fileReadMethod;
      this.plugin.debugLog(
        "fileReadMethod",
        this.plugin.settings.core.fileReadMethod,
      );
      await this.plugin.saveSettings();
      this.updateAutomaticRenameVisibility();
    });

    dropdown.addEventListener("change", async (e) => {
      const newMode = (e.target as HTMLSelectElement).value as FileReadMethod;
      this.plugin.settings.core.fileReadMethod = newMode;
      this.plugin.debugLog(
        "fileReadMethod",
        this.plugin.settings.core.fileReadMethod,
      );
      await this.plugin.saveSettings();
      this.updateAutomaticRenameVisibility();
    });

    const contentReadSubSettingsContainer =
      this.containerEl.createDiv("flit-sub-settings");

    const checkIntervalSetting = new Setting(contentReadSubSettingsContainer)
      .setName(t("settings.other.checkInterval.name"))
      .setDesc("");

    // Create styled description for check interval
    const checkIntervalDesc = checkIntervalSetting.descEl;
    checkIntervalDesc.appendText(t("settings.other.checkInterval.desc"));
    checkIntervalDesc.createEl("br");
    checkIntervalDesc
      .createEl("small")
      .createEl("strong", { text: t("settings.other.checkInterval.default") });

    const checkIntervalContainer = checkIntervalSetting.controlEl.createDiv({
      cls: "flit-char-text-input-container",
    });

    const checkIntervalRestoreButton = checkIntervalContainer.createEl(
      "button",
      {
        cls: "clickable-icon flit-restore-icon",
        attr: { "aria-label": t("ariaLabels.restoreDefault") },
      },
    );
    setIcon(checkIntervalRestoreButton, "rotate-ccw");

    const checkIntervalSliderDiv = checkIntervalContainer.createDiv();

    checkIntervalSetting.addSlider((slider) => {
      slider
        .setLimits(0, 5000, 50)
        .setValue(this.plugin.settings.core.checkInterval)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.core.checkInterval = value;
          this.plugin.debugLog("checkInterval", value);
          await this.plugin.saveSettings();

          // Reinitialize checking system with new interval
          this.plugin.editorLifecycle?.initializeCheckingSystem();
        });

      // Move slider to our custom container
      checkIntervalSliderDiv.appendChild(slider.sliderEl);
    });

    checkIntervalRestoreButton.addEventListener("click", async () => {
      this.plugin.settings.core.checkInterval =
        DEFAULT_SETTINGS.core.checkInterval;
      this.plugin.debugLog(
        "checkInterval",
        this.plugin.settings.core.checkInterval,
      );
      await this.plugin.saveSettings();

      // Reinitialize checking system with default interval
      this.plugin.editorLifecycle?.initializeCheckingSystem();

      // Update the slider value
      const sliderInput = checkIntervalSliderDiv.querySelector(
        'input[type="range"]',
      ) as HTMLInputElement;
      if (sliderInput) {
        sliderInput.value = String(DEFAULT_SETTINGS.core.checkInterval);
        sliderInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    this.conditionalSettings = [checkIntervalSetting];

    let debugSubSettingsContainer: HTMLElement;

    const updateDebugSubOptionVisibility = () => {
      if (this.plugin.settings.core.verboseLogging) {
        debugSubSettingsContainer.removeClass("flit-display-none");
      } else {
        debugSubSettingsContainer.addClass("flit-display-none");
      }
    };

    new Setting(this.containerEl)
      .setName(t("settings.other.debug.name"))
      .setDesc(t("settings.other.debug.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.verboseLogging)
          .onChange(async (value) => {
            // Log BEFORE changing the value so we can see the OFF message
            this.plugin.debugLog("verboseLogging", value);

            this.plugin.settings.core.verboseLogging = value;
            // Update debug enabled timestamp when turning ON, clear when turning OFF
            if (value) {
              this.plugin.settings.core.debugEnabledTimestamp =
                this.plugin.getCurrentTimestamp?.() || "";
            } else {
              this.plugin.settings.core.debugEnabledTimestamp = "";
            }
            await this.plugin.saveSettings();
            // Show/hide the sub-option based on debug state
            updateDebugSubOptionVisibility();
            // Output all settings when debug mode is turned ON
            if (value) {
              this.plugin.outputAllSettings?.();
            }
          }),
      );

    debugSubSettingsContainer = this.containerEl.createDiv("flit-sub-settings");

    new Setting(debugSubSettingsContainer)
      .setName(t("settings.other.debugOutputContent.name"))
      .setDesc(t("settings.other.debugOutputContent.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.core.debugOutputFullContent)
          .onChange(async (value) => {
            this.plugin.settings.core.debugOutputFullContent = value;
            this.plugin.debugLog("debugOutputFullContent", value);
            await this.plugin.saveSettings();
          }),
      );

    updateDebugSubOptionVisibility();

    // Manage settings (Import/Export)
    new Setting(this.containerEl)
      .setName(t("settings.other.manageSettings.name"))
      .setDesc(t("settings.other.manageSettings.desc"))
      .addButton((button) =>
        button
          .setButtonText(t("settings.other.manageSettings.import"))
          .onClick(() => {
            const input = document.createElement("input");
            input.setAttrs({
              type: "file",
              accept: ".json",
            });

            input.onchange = () => {
              const selectedFile = input.files?.[0];

              if (selectedFile) {
                const reader = new FileReader();
                reader.readAsText(selectedFile, "UTF-8");
                reader.onload = async (readerEvent) => {
                  let importedJson;
                  const content = readerEvent.target?.result;
                  if (typeof content === "string") {
                    try {
                      importedJson = JSON.parse(content);
                    } catch (error) {
                      new Notice(t("notifications.invalidImportFile"));
                      console.error(t("notifications.invalidImportFile"));
                      return;
                    }
                  }

                  if (importedJson) {
                    // Merge imported settings with DEFAULT_SETTINGS structure
                    const newSettings = Object.assign({}, DEFAULT_SETTINGS);
                    for (const setting in this.plugin.settings) {
                      if (importedJson[setting]) {
                        // @ts-ignore
                        newSettings[setting] = importedJson[setting];
                      }
                    }

                    this.plugin.settings = newSettings;
                    await this.plugin.saveSettings();

                    // Show notification
                    new Notice(t("notifications.settingsImported"));

                    // Force complete tab re-render
                    const settingsTab = (
                      this.plugin as typeof this.plugin & {
                        settingsTab?: { display(): void };
                      }
                    ).settingsTab;
                    if (settingsTab && settingsTab.display) {
                      settingsTab.display();
                    } else {
                      // Fallback: re-render just this tab
                      this.containerEl.empty();
                      this.render();
                    }
                  }

                  input.remove();
                };
              }
            };

            input.click();
          }),
      )
      .addButton((button) =>
        button
          .setButtonText(t("settings.other.manageSettings.export"))
          .onClick(async () => {
            const settingsText = JSON.stringify(this.plugin.settings, null, 2);
            const fileName = "first-line-is-title-settings.json";

            // Try navigator.share() for mobile (iOS/Android)
            if (navigator.share && navigator.canShare) {
              try {
                const blob = new Blob([settingsText], {
                  type: "application/json",
                });
                const file = new File([blob], fileName, {
                  type: "application/json",
                });

                if (navigator.canShare({ files: [file] })) {
                  await navigator.share({
                    files: [file],
                    title: "First Line is Title Settings",
                  });
                  return;
                }
              } catch (error) {
                console.error("Share failed:", error);
                // Fall through to download link
              }
            }

            // Fallback for desktop: download link
            const exportLink = document.createElement("a");
            exportLink.setAttrs({
              download: fileName,
              href: `data:application/json;charset=utf-8,${encodeURIComponent(settingsText)}`,
            });
            exportLink.click();
            exportLink.remove();
          }),
      );

    new Setting(this.containerEl)
      .setName(t("settings.other.clearSettings.name"))
      .setDesc(t("settings.other.clearSettings.desc"))
      .addButton((button) => {
        button
          .setButtonText(t("modals.buttons.clearSettings"))
          .setWarning()
          .onClick(async () => {
            new ClearSettingsModal(this.plugin.app, this.plugin, async () => {
              // Reset all settings to defaults with deep copy
              this.plugin.settings = JSON.parse(
                JSON.stringify(DEFAULT_SETTINGS),
              );

              // Localize default safeword example based on current locale
              const locale = getCurrentLocale();
              if (locale === "ru") {
                this.plugin.settings.safewords.safewords[0].text = "Задачи";
              } else {
                this.plugin.settings.safewords.safewords[0].text = "To do";
              }

              // Keep tracking that settings have been shown (don't show first-time notice again)
              this.plugin.settings.core.hasShownFirstTimeNotice = true;
              // Update last usage date to current date
              this.plugin.settings.core.lastUsageDate =
                this.plugin.getTodayDateString?.() || "";

              // Save the cleared settings
              await this.plugin.saveSettings();

              // Re-run first-time setup logic (enable defaults, detect template folders/excalidraw)
              const pluginInitializer = new PluginInitializer(this.plugin);
              await pluginInitializer.initializeFirstEnableLogic();
              await pluginInitializer.checkFirstTimeExclusionsSetup();

              // Show notification
              verboseLog(
                this.plugin,
                `Showing notice: ${t("notifications.settingsCleared")}`,
              );
              new Notice(t("notifications.settingsCleared"));

              // Force complete tab re-render by calling the parent's display method
              // We need to get a reference to the parent settings tab
              const settingsTab = (
                this.plugin as typeof this.plugin & {
                  settingsTab?: { display(): void };
                }
              ).settingsTab;
              if (settingsTab && settingsTab.display) {
                settingsTab.display();
              } else {
                // Fallback: re-render just this tab
                this.containerEl.empty();
                this.render();
              }
            }).open();
          });
      });

    this.updateAutomaticRenameVisibility();
  }

  private updateAutomaticRenameVisibility(): void {
    if (this.conditionalSettings.length === 0) return;

    const shouldShow =
      this.plugin.settings.core.renameNotes === "automatically";

    // Check interval should show when renameNotes === "automatically"
    // It controls throttling for editor-change events, which fire for all content read methods
    this.conditionalSettings.forEach((setting) => {
      if (shouldShow) {
        setting.settingEl.removeClass("flit-display-none");
      } else {
        setting.settingEl.addClass("flit-display-none");
      }
    });
  }
}
