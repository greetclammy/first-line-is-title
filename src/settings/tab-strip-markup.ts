import { Setting } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from "./settings-base";
import { t, getCurrentLocale } from "../i18n";

export class StripMarkupTab extends SettingsTabBase {
  constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
    super(plugin, containerEl);
  }

  render(): void {
    const mainToggle = new Setting(this.containerEl)
      .setName(t("settings.stripMarkup.name"))
      .setDesc(t("settings.stripMarkup.desc"))
      .setHeading()
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.markupStripping.enableStripMarkup)
          .onChange(async (value) => {
            this.plugin.settings.markupStripping.enableStripMarkup = value;
            this.plugin.debugLog("enableStripMarkup", value);

            // Auto-toggle OFF dependent settings when disabling
            if (!value) {
              if (this.plugin.settings.markupStripping.stripMarkupInAlias) {
                this.plugin.settings.markupStripping.stripMarkupInAlias = false;
              }
            }

            await this.plugin.saveSettings();
            updateStripMarkupUI();
            (
              this.plugin as typeof this.plugin & {
                updateAliasConditionalSettings?: () => Promise<void>;
              }
            ).updateAliasConditionalSettings?.();
          });
      });
    mainToggle.settingEl.addClass("flit-heading-no-border");

    const stripMarkupContainer = this.containerEl.createDiv({
      cls: "flit-strip-markup-container",
    });

    const updateStripMarkupUI = () => {
      this.updateInteractiveState(
        stripMarkupContainer,
        this.plugin.settings.markupStripping.enableStripMarkup,
      );
      this.updateDisabledRowsAccessibility(stripMarkupContainer);
    };
    const markupToggles = [
      { key: "headings" },
      { key: "bold" },
      { key: "italic" },
      { key: "strikethrough" },
      { key: "highlight" },
      { key: "wikilinks" },
      { key: "markdownLinks" },
      { key: "quote" },
      { key: "callouts" },
      { key: "unorderedLists" },
      { key: "orderedLists" },
      { key: "taskLists" },
      { key: "code" },
      { key: "codeBlocks" },
      { key: "footnotes" },
      { key: "comments" },
      { key: "stripTableMarkup", isCustom: true },
      { key: "stripInlineMathMarkup", isCustom: true },
      { key: "stripMathBlockMarkup", isCustom: true },
      { key: "htmlTags" },
    ];

    let stripCommentsEntirelyContainer: HTMLElement;

    const updateStripCommentsEntirelyVisibility = () => {
      if (this.plugin.settings.markupStripping.stripMarkupSettings.comments) {
        stripCommentsEntirelyContainer.show();
      } else {
        stripCommentsEntirelyContainer.hide();
      }
    };

    let detectDiagramsContainer: HTMLElement;

    const updateDetectDiagramsVisibility = () => {
      if (this.plugin.settings.markupStripping.stripMarkupSettings.codeBlocks) {
        detectDiagramsContainer.show();
      } else {
        detectDiagramsContainer.hide();
      }
    };

    markupToggles.forEach((toggle) => {
      const setting = new Setting(stripMarkupContainer)
        .setName(t(`settings.stripMarkup.${toggle.key}.name`))
        .setDesc("");
      const desc = setting.descEl;
      const isRussian = getCurrentLocale() === "ru";
      const descKey = `settings.stripMarkup.${toggle.key}.desc`;
      const part1Key = `${descKey}.part1`;
      const part1Value = t(part1Key);
      if (part1Value !== part1Key) {
        let index = 1;

        while (true) {
          let foundAny = false;
          const partKey = `${descKey}.part${index}`;
          const partValue = t(partKey);
          if (partValue !== partKey) {
            desc.appendText(partValue);
            foundAny = true;
          }
          const exampleKey = `${descKey}.example${index}`;
          const exampleValue = t(exampleKey);
          if (exampleValue !== exampleKey) {
            desc.createEl("code", { text: exampleValue });
            foundAny = true;
          }
          if (index === 1) {
            const specialKeys = ["table", "mathBlock"];
            for (const specialKey of specialKeys) {
              const fullKey = `${descKey}.${specialKey}`;
              const specialValue = t(fullKey);
              if (specialValue !== fullKey) {
                if (isRussian) {
                  desc.appendText("«" + specialValue + "»");
                } else {
                  desc.createEl("em", { text: specialValue });
                }
                foundAny = true;
                break;
              }
            }
          }

          if (!foundAny) break;
          index++;
        }
      } else {
        desc.appendText(t(descKey));
      }

      setting.addToggle((toggleControl) => {
        // Custom property added by plugin, not in Obsidian's Toggle interface
        if ((toggle as any).isCustom) {
          toggleControl
            .setValue(
              this.plugin.settings.markupStripping[
                toggle.key as keyof typeof this.plugin.settings.markupStripping
              ] as boolean,
            )
            .onChange(async (value) => {
              (this.plugin.settings.markupStripping[
                toggle.key as keyof typeof this.plugin.settings.markupStripping
              ] as boolean) = value;
              this.plugin.debugLog(toggle.key, value);
              await this.plugin.saveSettings();
            });
        } else {
          toggleControl
            .setValue(
              this.plugin.settings.markupStripping.stripMarkupSettings[
                toggle.key as keyof typeof this.plugin.settings.markupStripping.stripMarkupSettings
              ],
            )
            .onChange(async (value) => {
              this.plugin.settings.markupStripping.stripMarkupSettings[
                toggle.key as keyof typeof this.plugin.settings.markupStripping.stripMarkupSettings
              ] = value;
              this.plugin.debugLog(`stripMarkupSettings.${toggle.key}`, value);
              await this.plugin.saveSettings();
              if (toggle.key === "comments") {
                updateStripCommentsEntirelyVisibility();
              }
              if (toggle.key === "codeBlocks") {
                updateDetectDiagramsVisibility();
              }
            });
        }
      });
      if (toggle.key === "comments") {
        const stripCommentsEntirelySetting = new Setting(stripMarkupContainer)
          .setName(t("settings.stripMarkup.commentsEntirely.name"))
          .setDesc(t("settings.stripMarkup.commentsEntirely.desc"))
          .addToggle((toggle) =>
            toggle
              .setValue(
                this.plugin.settings.markupStripping.stripCommentsEntirely,
              )
              .onChange(async (value) => {
                this.plugin.settings.markupStripping.stripCommentsEntirely =
                  value;
                this.plugin.debugLog("stripCommentsEntirely", value);
                await this.plugin.saveSettings();
              }),
          );

        stripCommentsEntirelyContainer =
          stripMarkupContainer.createDiv("flit-sub-settings");
        stripCommentsEntirelyContainer.appendChild(
          stripCommentsEntirelySetting.settingEl,
        );

        updateStripCommentsEntirelyVisibility();
      }
      if (toggle.key === "codeBlocks") {
        const detectDiagramsSetting = new Setting(stripMarkupContainer)
          .setName(t("settings.stripMarkup.detectDiagrams.name"))
          .setDesc("");
        const desc = detectDiagramsSetting.descEl;
        const isRussian = getCurrentLocale() === "ru";
        const descKey = "settings.stripMarkup.detectDiagrams.desc";
        const part1Key = `${descKey}.part1`;
        const part1Value = t(part1Key);

        if (part1Value !== part1Key) {
          let index = 1;
          while (true) {
            let foundAny = false;

            const partKey = `${descKey}.part${index}`;
            const partValue = t(partKey);
            if (partValue !== partKey) {
              desc.appendText(partValue);
              foundAny = true;
            }
            if (index === 1) {
              const specialKeys = ["diagram"];
              for (const specialKey of specialKeys) {
                const fullKey = `${descKey}.${specialKey}`;
                const specialValue = t(fullKey);
                if (specialValue !== fullKey) {
                  if (isRussian) {
                    desc.appendText("«" + specialValue + "»");
                  } else {
                    desc.createEl("em", { text: specialValue });
                  }
                  foundAny = true;
                  break;
                }
              }
            }

            if (!foundAny) break;
            index++;
          }
        }

        detectDiagramsSetting.addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.markupStripping.detectDiagrams)
            .onChange(async (value) => {
              this.plugin.settings.markupStripping.detectDiagrams = value;
              this.plugin.debugLog("detectDiagrams", value);
              await this.plugin.saveSettings();
            }),
        );

        detectDiagramsContainer =
          stripMarkupContainer.createDiv("flit-sub-settings");
        detectDiagramsContainer.appendChild(detectDiagramsSetting.settingEl);

        updateDetectDiagramsVisibility();
      }
    });

    const templaterSetting = new Setting(stripMarkupContainer)
      .setName(t("settings.stripMarkup.templater.name"))
      .setDesc("");
    const templaterDesc = templaterSetting.descEl;
    templaterDesc.appendText(t("settings.stripMarkup.templater.desc.part1"));
    templaterDesc.createEl("a", {
      text: "Templater",
      href: "obsidian://show-plugin?id=templater-obsidian",
    });
    templaterDesc.appendText(t("settings.stripMarkup.templater.desc.part2"));
    templaterDesc.createEl("code", {
      text: t("settings.stripMarkup.templater.desc.code"),
    });
    templaterDesc.appendText(t("settings.stripMarkup.templater.desc.part3"));

    templaterSetting.addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.markupStripping.stripTemplaterSyntax)
        .onChange(async (value) => {
          this.plugin.settings.markupStripping.stripTemplaterSyntax = value;
          this.plugin.debugLog("stripTemplaterSyntax", value);
          await this.plugin.saveSettings();
        }),
    );

    updateStripMarkupUI();
  }
}
