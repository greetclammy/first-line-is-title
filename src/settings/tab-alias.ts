import { Setting, setIcon, ToggleComponent, Platform } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from "./settings-base";
import { DEFAULT_SETTINGS } from "../constants";
import { t, getCurrentLocale } from "../i18n";

export class PropertiesTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  render(): void {
    const updateAliasConditionalSettings = async () => {
      const customRulesEnabled =
        this.plugin.settings.customRules.enableCustomReplacements;
      applyCustomRulesInAliasSetting.components[0].setDisabled(
        !customRulesEnabled,
      );
      if (customRulesEnabled) {
        applyCustomRulesInAliasSetting.settingEl.classList.remove(
          "flit-row-disabled",
        );
        if (applyCustomRulesToggle) {
          applyCustomRulesToggle.toggleEl.tabIndex = 0;
          applyCustomRulesToggle.toggleEl.removeAttribute("aria-disabled");
          applyCustomRulesToggle.toggleEl.classList.remove("flit-pointer-none");
        }
      } else {
        applyCustomRulesInAliasSetting.settingEl.classList.add(
          "flit-row-disabled",
        );
        if (applyCustomRulesToggle) {
          applyCustomRulesToggle.toggleEl.tabIndex = -1;
          applyCustomRulesToggle.toggleEl.setAttribute("aria-disabled", "true");
          applyCustomRulesToggle.toggleEl.classList.add("flit-pointer-none");
        }
        if (this.plugin.settings.markupStripping.applyCustomRulesInAlias) {
          this.plugin.settings.markupStripping.applyCustomRulesInAlias = false;
          await this.plugin.saveSettings();
          (
            applyCustomRulesInAliasSetting.components[0] as ToggleComponent
          ).setValue(false);
        }
      }
      const stripMarkupEnabled =
        this.plugin.settings.markupStripping.enableStripMarkup;
      stripMarkupInAliasSetting.components[0].setDisabled(!stripMarkupEnabled);
      if (stripMarkupEnabled) {
        stripMarkupInAliasSetting.settingEl.classList.remove(
          "flit-row-disabled",
        );
        if (stripMarkupToggle) {
          stripMarkupToggle.toggleEl.tabIndex = 0;
          stripMarkupToggle.toggleEl.removeAttribute("aria-disabled");
          stripMarkupToggle.toggleEl.classList.remove("flit-pointer-none");
        }
      } else {
        stripMarkupInAliasSetting.settingEl.classList.add("flit-row-disabled");
        if (stripMarkupToggle) {
          stripMarkupToggle.toggleEl.tabIndex = -1;
          stripMarkupToggle.toggleEl.setAttribute("aria-disabled", "true");
          stripMarkupToggle.toggleEl.classList.add("flit-pointer-none");
        }
        if (this.plugin.settings.markupStripping.stripMarkupInAlias) {
          this.plugin.settings.markupStripping.stripMarkupInAlias = false;
          await this.plugin.saveSettings();
          (stripMarkupInAliasSetting.components[0] as ToggleComponent).setValue(
            false,
          );
        }
      }
    };

    const mainToggle = new Setting(this.containerEl)
      .setName(t("settings.alias.addAlias.name"))
      .setDesc(t("settings.alias.addAlias.desc"))
      .setHeading()
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.aliases.enableAliases)
          .onChange(async (value) => {
            this.plugin.settings.aliases.enableAliases = value;
            this.plugin.debugLog("enableAliases", value);

            // On first enable, turn on default toggles and enable stripMarkupInAlias/applyCustomRulesInAlias conditionally
            if (value && !this.plugin.settings.core.hasEnabledAliases) {
              this.plugin.settings.aliases.keepEmptyAliasProperty = true;
              if (this.plugin.settings.markupStripping.enableStripMarkup) {
                this.plugin.settings.markupStripping.stripMarkupInAlias = true;
              }
              if (this.plugin.settings.customRules.enableCustomReplacements) {
                this.plugin.settings.markupStripping.applyCustomRulesInAlias = true;
              }
              this.plugin.settings.core.hasEnabledAliases = true;
            }

            await this.plugin.saveSettings();
            renderAliasSettings();
          }),
      );
    mainToggle.settingEl.addClass("flit-heading-no-border");

    const aliasContainer = this.containerEl.createDiv({
      cls: "flit-alias-container",
    });
    let addAliasConditionalToggle: ToggleComponent | undefined;
    let truncateAliasToggle: ToggleComponent | undefined;
    let applyCustomRulesToggle: ToggleComponent | undefined;
    let stripMarkupToggle: ToggleComponent | undefined;
    let keepEmptyToggle: ToggleComponent | undefined;
    let hideInSidebarToggle: ToggleComponent | undefined;
    let suppressMergeToggle: ToggleComponent | undefined;

    const renderAliasSettings = () => {
      this.updateInteractiveState(
        aliasContainer,
        this.plugin.settings.aliases.enableAliases,
      );
      this.updateDisabledRowsAccessibility(aliasContainer);
      const showActualState = this.plugin.settings.core.hasEnabledAliases;

      if (addAliasConditionalToggle) {
        addAliasConditionalToggle.setValue(
          showActualState
            ? this.plugin.settings.aliases.addAliasOnlyIfFirstLineDiffers
            : false,
        );
      }
      if (truncateAliasToggle) {
        truncateAliasToggle.setValue(
          showActualState ? this.plugin.settings.aliases.truncateAlias : false,
        );
      }
      if (applyCustomRulesToggle) {
        applyCustomRulesToggle.setValue(
          showActualState
            ? this.plugin.settings.markupStripping.applyCustomRulesInAlias
            : false,
        );
      }
      if (stripMarkupToggle) {
        stripMarkupToggle.setValue(
          showActualState
            ? this.plugin.settings.markupStripping.stripMarkupInAlias
            : false,
        );
      }
      if (keepEmptyToggle) {
        keepEmptyToggle.setValue(
          showActualState
            ? this.plugin.settings.aliases.keepEmptyAliasProperty
            : false,
        );
      }
      if (hideInSidebarToggle) {
        hideInSidebarToggle.setValue(
          showActualState
            ? this.plugin.settings.aliases.hideAliasInSidebar
            : false,
        );
      }
      if (suppressMergeToggle) {
        suppressMergeToggle.setValue(
          showActualState
            ? this.plugin.settings.core.suppressMergeNotifications
            : false,
        );
      }

      void updateAliasConditionalSettings();
    };

    const aliasPropertyKeySetting = new Setting(aliasContainer)
      .setName(t("settings.alias.aliasPropertyName.name"))
      .setDesc("");

    const aliasKeyDesc = aliasPropertyKeySetting.descEl;
    aliasKeyDesc.appendText(t("settings.alias.aliasPropertyName.desc"));

    const aliasNotesDesc = aliasKeyDesc.createEl("div", {
      cls: "flit-margin-top-6 flit-margin-bottom-0",
    });

    const ul = aliasNotesDesc.createEl("ul", {
      cls: "flit-margin-0 flit-padding-left-20",
    });

    ul.createEl("li", {
      text: t("settings.alias.aliasPropertyName.quickSwitcher"),
    });

    ul.createEl("li", {
      text: t("settings.alias.aliasPropertyName.multipleProperties"),
    });

    const li2 = ul.createEl("li");
    li2.appendText(t("settings.alias.aliasPropertyName.noteTitle.part1"));
    li2.createEl("a", {
      text: "Omnisearch",
      href: "obsidian://show-plugin?id=omnisearch",
    });
    li2.appendText(t("settings.alias.aliasPropertyName.noteTitle.part2"));
    li2.createEl("a", {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- proper noun (plugin name)
      text: "Notebook Navigator",
      href: "obsidian://show-plugin?id=notebook-navigator",
    });
    li2.appendText(t("settings.alias.aliasPropertyName.noteTitle.part3"));
    li2.createEl("a", {
      // eslint-disable-next-line obsidianmd/ui/sentence-case -- proper noun (plugin name)
      text: "Front Matter Title",
      href: "obsidian://show-plugin?id=obsidian-front-matter-title-plugin",
    });
    li2.appendText(t("settings.alias.aliasPropertyName.noteTitle.part4"));

    aliasKeyDesc.createEl("br");
    aliasKeyDesc.createEl("small").createEl("strong", {
      text: t("settings.alias.aliasPropertyName.default"),
    });
    const aliasPropertyKeyContainer =
      aliasPropertyKeySetting.controlEl.createDiv({
        cls: "flit-char-text-input-container",
      });

    const aliasPropertyKeyRestoreButton = aliasPropertyKeyContainer.createEl(
      "button",
      {
        cls: "clickable-icon flit-restore-icon",
        attr: { "aria-label": t("settings.replaceCharacters.restoreDefault") },
      },
    );
    setIcon(aliasPropertyKeyRestoreButton, "rotate-ccw");

    const aliasPropertyKeyTextInput = aliasPropertyKeyContainer.createEl(
      "input",
      { type: "text", cls: "flit-char-text-input flit-width-120" },
    );
    aliasPropertyKeyTextInput.placeholder = t(
      "settings.replaceCharacters.emptyPlaceholder",
    );
    aliasPropertyKeyTextInput.value =
      this.plugin.settings.aliases.aliasPropertyKey;

    aliasPropertyKeyRestoreButton.addEventListener("click", () => {
      void (async () => {
        this.plugin.settings.aliases.aliasPropertyKey =
          DEFAULT_SETTINGS.aliases.aliasPropertyKey;
        aliasPropertyKeyTextInput.value =
          DEFAULT_SETTINGS.aliases.aliasPropertyKey;
        this.plugin.debugLog(
          "aliasPropertyKey",
          this.plugin.settings.aliases.aliasPropertyKey,
        );
        await this.plugin.saveSettings();
      })();
    });

    aliasPropertyKeyTextInput.addEventListener("input", (e) => {
      void (async () => {
        const value = (e.target as HTMLInputElement).value;
        this.plugin.settings.aliases.aliasPropertyKey =
          value.trim() || "aliases";
        this.plugin.debugLog(
          "aliasPropertyKey",
          this.plugin.settings.aliases.aliasPropertyKey,
        );
        await this.plugin.saveSettings();
      })();
    });

    new Setting(aliasContainer)
      .setName(t("settings.alias.onlyAddIfDiffers.name"))
      .setDesc(t("settings.alias.onlyAddIfDiffers.desc"))
      .addToggle((toggle) => {
        addAliasConditionalToggle = toggle;
        toggle
          .setValue(
            this.plugin.settings.core.hasEnabledAliases
              ? this.plugin.settings.aliases.addAliasOnlyIfFirstLineDiffers
              : false,
          )
          .onChange(async (value) => {
            this.plugin.settings.aliases.addAliasOnlyIfFirstLineDiffers = value;
            this.plugin.debugLog("addAliasOnlyIfFirstLineDiffers", value);
            await this.plugin.saveSettings();
          });
      });

    const truncateAliasSetting = new Setting(aliasContainer)
      .setName(t("settings.alias.truncateAlias.name"))
      .setDesc("");

    const truncateDesc = truncateAliasSetting.descEl;
    truncateDesc.appendText(t("settings.alias.truncateAlias.desc.part1"));
    if (getCurrentLocale() === "ru") {
      truncateDesc.appendText(
        "«" + t("settings.alias.truncateAlias.desc.charCount") + "»",
      );
    } else {
      truncateDesc.createEl("em", {
        text: t("settings.alias.truncateAlias.desc.charCount"),
      });
    }
    truncateDesc.appendText(t("settings.alias.truncateAlias.desc.part2"));
    if (getCurrentLocale() === "ru") {
      truncateDesc.appendText(
        "«" + t("settings.alias.truncateAlias.desc.other") + "»",
      );
    } else {
      truncateDesc.createEl("em", {
        text: t("settings.alias.truncateAlias.desc.other"),
      });
    }
    truncateDesc.appendText(t("settings.alias.truncateAlias.desc.part3"));

    truncateAliasSetting.addToggle((toggle) => {
      truncateAliasToggle = toggle;
      toggle
        .setValue(
          this.plugin.settings.core.hasEnabledAliases
            ? this.plugin.settings.aliases.truncateAlias
            : false,
        )
        .onChange(async (value) => {
          this.plugin.settings.aliases.truncateAlias = value;
          this.plugin.debugLog("truncateAlias", value);
          await this.plugin.saveSettings();
        });
    });

    const applyCustomRulesInAliasSetting = new Setting(aliasContainer)
      .setName(t("settings.alias.applyCustomRules.name"))
      .setDesc("");

    const customRulesDesc = applyCustomRulesInAliasSetting.descEl;
    customRulesDesc.appendText(t("settings.alias.applyCustomRules.desc.part1"));
    if (getCurrentLocale() === "ru") {
      customRulesDesc.appendText(
        "«" + t("settings.alias.applyCustomRules.desc.customRules") + "»",
      );
    } else {
      customRulesDesc.createEl("em", {
        text: t("settings.alias.applyCustomRules.desc.customRules"),
      });
    }
    customRulesDesc.appendText(t("settings.alias.applyCustomRules.desc.part2"));

    applyCustomRulesInAliasSetting.addToggle((toggle) => {
      applyCustomRulesToggle = toggle;
      toggle
        .setValue(
          this.plugin.settings.core.hasEnabledAliases
            ? this.plugin.settings.markupStripping.applyCustomRulesInAlias
            : false,
        )
        .setDisabled(!this.plugin.settings.customRules.enableCustomReplacements)
        .onChange(async (value) => {
          this.plugin.settings.markupStripping.applyCustomRulesInAlias = value;
          this.plugin.debugLog("applyCustomRulesInAlias", value);
          await this.plugin.saveSettings();
        });

      if (!this.plugin.settings.customRules.enableCustomReplacements) {
        toggle.toggleEl.tabIndex = -1;
        toggle.toggleEl.setAttribute("aria-disabled", "true");
        toggle.toggleEl.classList.add("flit-pointer-none");
      }
    });

    const stripMarkupInAliasSetting = new Setting(aliasContainer)
      .setName(t("settings.alias.stripMarkup.name"))
      .setDesc("");

    const stripMarkupDesc = stripMarkupInAliasSetting.descEl;
    stripMarkupDesc.appendText(t("settings.alias.stripMarkup.desc.part1"));
    if (getCurrentLocale() === "ru") {
      stripMarkupDesc.appendText(
        "«" + t("settings.alias.stripMarkup.desc.stripMarkup") + "»",
      );
    } else {
      stripMarkupDesc.createEl("em", {
        text: t("settings.alias.stripMarkup.desc.stripMarkup"),
      });
    }
    stripMarkupDesc.appendText(t("settings.alias.stripMarkup.desc.part2"));

    stripMarkupInAliasSetting.addToggle((toggle) => {
      stripMarkupToggle = toggle;
      toggle
        .setValue(
          this.plugin.settings.core.hasEnabledAliases
            ? this.plugin.settings.markupStripping.stripMarkupInAlias
            : false,
        )
        .setDisabled(!this.plugin.settings.markupStripping.enableStripMarkup)
        .onChange(async (value) => {
          this.plugin.settings.markupStripping.stripMarkupInAlias = value;
          this.plugin.debugLog("stripMarkupInAlias", value);
          await this.plugin.saveSettings();
        });

      if (!this.plugin.settings.markupStripping.enableStripMarkup) {
        toggle.toggleEl.tabIndex = -1;
        toggle.toggleEl.setAttribute("aria-disabled", "true");
        toggle.toggleEl.classList.add("flit-pointer-none");
      }
    });

    new Setting(aliasContainer)
      .setName(t("settings.alias.keepEmptyProperty.name"))
      .setDesc(t("settings.alias.keepEmptyProperty.desc"))
      .addToggle((toggle) => {
        keepEmptyToggle = toggle;
        toggle
          .setValue(
            this.plugin.settings.core.hasEnabledAliases
              ? this.plugin.settings.aliases.keepEmptyAliasProperty
              : false,
          )
          .onChange(async (value) => {
            this.plugin.settings.aliases.keepEmptyAliasProperty = value;
            this.plugin.debugLog("keepEmptyAliasProperty", value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(aliasContainer)
      .setName(t("settings.alias.hideProperty.name"))
      .setDesc(t("settings.alias.hideProperty.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("never", t("settings.alias.hideProperty.never"))
          .addOption(
            "when_empty",
            t("settings.alias.hideProperty.onlyWhenEmpty"),
          )
          .addOption("always", t("settings.alias.hideProperty.always"))
          .setValue(this.plugin.settings.aliases.hideAliasProperty)
          .onChange(async (value) => {
            this.plugin.settings.aliases.hideAliasProperty = value as
              | "never"
              | "when_empty"
              | "always";
            this.plugin.debugLog("hideAliasProperty", value);
            await this.plugin.saveSettings();
            this.updatePropertyVisibility();
            if (value === "when_empty" || value === "always") {
              hideInSidebarSetting.settingEl.removeClass("flit-display-none");
            } else {
              hideInSidebarSetting.settingEl.addClass("flit-display-none");
            }
          }),
      );

    const hideInSidebarContainer =
      aliasContainer.createDiv("flit-sub-settings");

    const hideInSidebarSetting = new Setting(hideInSidebarContainer)
      .setName(t("settings.alias.hideInSidebar.name"))
      .setDesc(t("settings.alias.hideInSidebar.desc"))
      .addToggle((toggle) => {
        hideInSidebarToggle = toggle;
        toggle
          .setValue(
            this.plugin.settings.core.hasEnabledAliases
              ? this.plugin.settings.aliases.hideAliasInSidebar
              : false,
          )
          .onChange(async (value) => {
            this.plugin.settings.aliases.hideAliasInSidebar = value;
            this.plugin.debugLog("hideAliasInSidebar", value);
            await this.plugin.saveSettings();
            this.updatePropertyVisibility();
          });
      });
    if (
      this.plugin.settings.aliases.hideAliasProperty === "when_empty" ||
      this.plugin.settings.aliases.hideAliasProperty === "always"
    ) {
      hideInSidebarSetting.settingEl.removeClass("flit-display-none");
    } else {
      hideInSidebarSetting.settingEl.addClass("flit-display-none");
    }

    new Setting(aliasContainer)
      .setName(t("settings.alias.hideMergeNotifications.name"))
      .setDesc(t("settings.alias.hideMergeNotifications.desc"))
      .addToggle((toggle) => {
        suppressMergeToggle = toggle;
        toggle
          .setValue(
            this.plugin.settings.core.hasEnabledAliases
              ? this.plugin.settings.core.suppressMergeNotifications
              : false,
          )
          .onChange(async (value) => {
            this.plugin.settings.core.suppressMergeNotifications = value;
            this.plugin.debugLog("suppressMergeNotifications", value);
            await this.plugin.saveSettings();
          });
      });

    if (!Platform.isMobile) {
      new Setting(aliasContainer)
        .setName(t("settings.alias.limitations.title"))
        .setDesc("")
        .setHeading();

      const limitationsContainer = aliasContainer.createDiv();
      const limitationsDesc = limitationsContainer.createEl("p", {
        cls: "setting-item-description flit-margin-top-12",
      });
      limitationsDesc.appendText(t("settings.alias.limitations.desc.part1"));
      limitationsDesc.createEl("a", {
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- proper noun (plugin name)
        text: "Hover Editor",
        href: "obsidian://show-plugin?id=obsidian-hover-editor",
      });
      limitationsDesc.appendText(t("settings.alias.limitations.desc.part2"));
    }

    renderAliasSettings();

    void updateAliasConditionalSettings();
    (
      this.plugin as typeof this.plugin & {
        updateAliasConditionalSettings?: () => Promise<void>;
      }
    ).updateAliasConditionalSettings = updateAliasConditionalSettings;
  }

  private updatePropertyVisibility(): void {
    this.plugin.updatePropertyVisibility?.();
  }
}
