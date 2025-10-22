import { Setting, setIcon, Notice } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { NotificationMode, FileReadMethod } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { ClearSettingsModal } from '../modals';
import { verboseLog } from '../utils';
import { t } from '../i18n';
import { PluginInitializer } from '../core/plugin-initializer';

export class MiscellaneousTab extends SettingsTabBase {
    private conditionalSettings: Setting[] = [];

    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
        // Register visibility update function on plugin
        (this.plugin as typeof this.plugin & { updateAutomaticRenameVisibility?: () => void }).updateAutomaticRenameVisibility = this.updateAutomaticRenameVisibility.bind(this);
    }

    render(): void {
        const charCountSetting = new Setting(this.containerEl)
            .setName(t('settings.miscellaneous.charCount.name'))
            .setDesc("");

        // Create styled description for character count
        const charCountDesc = charCountSetting.descEl;
        charCountDesc.appendText(t('settings.miscellaneous.charCount.desc'));
        charCountDesc.createEl("br");
        charCountDesc.createEl("small").createEl("strong", { text: t('settings.miscellaneous.charCount.default') });

        const charCountContainer = charCountSetting.controlEl.createDiv({ cls: "flit-char-text-input-container" });

        const charCountRestoreButton = charCountContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": t('ariaLabels.restoreDefault') }
        });
        setIcon(charCountRestoreButton, "rotate-ccw");

        const sliderDiv = charCountContainer.createDiv();

        charCountSetting.addSlider((slider) => {
            slider
                .setLimits(1, 255, 1)
                .setValue(this.plugin.settings.core.charCount)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.core.charCount = value;
                    this.plugin.debugLog('charCount', value);
                    await this.plugin.saveSettings();
                });

            // Move slider to our custom container
            sliderDiv.appendChild(slider.sliderEl);
        });

        charCountRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.core.charCount = DEFAULT_SETTINGS.core.charCount;
            this.plugin.debugLog('charCount', this.plugin.settings.core.charCount);
            await this.plugin.saveSettings();

            // Update the slider value by triggering a re-render or finding the slider element
            const sliderInput = sliderDiv.querySelector('input[type="range"]') as HTMLInputElement;
            if (sliderInput) {
                sliderInput.value = String(DEFAULT_SETTINGS.core.charCount);
                sliderInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });


        const notificationSetting = new Setting(this.containerEl)
            .setName(t('settings.miscellaneous.notificationMode.name'))
            .setDesc(t('settings.miscellaneous.notificationMode.desc'));

        notificationSetting.addDropdown((dropdown) =>
            dropdown
                .addOption('Always', t('settings.miscellaneous.notificationMode.always'))
                .addOption('On title change', t('settings.miscellaneous.notificationMode.onTitleChange'))
                .addOption('Never', t('settings.miscellaneous.notificationMode.never'))
                .setValue(this.plugin.settings.core.manualNotificationMode)
                .onChange(async (value: NotificationMode) => {
                    this.plugin.settings.core.manualNotificationMode = value;
                    this.plugin.debugLog('manualNotificationMode', value);
                    await this.plugin.saveSettings();
                })
        );

        const cardLinkSetting = new Setting(this.containerEl)
            .setName(t('settings.miscellaneous.grabCardLink.name'))
            .setDesc("");

        const cardLinkDesc = cardLinkSetting.descEl;
        cardLinkDesc.appendText(t('settings.miscellaneous.grabCardLink.desc.part1'));
        cardLinkDesc.createEl("a", {
            text: "Auto Card Link",
            href: "obsidian://show-plugin?id=auto-card-link"
        });
        cardLinkDesc.appendText(t('settings.miscellaneous.grabCardLink.desc.part2'));
        cardLinkDesc.createEl("a", {
            text: "Link Embed",
            href: "obsidian://show-plugin?id=obsidian-link-embed"
        });
        cardLinkDesc.appendText(t('settings.miscellaneous.grabCardLink.desc.part3'));

        cardLinkSetting.addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.markupStripping.grabTitleFromCardLink)
                .onChange(async (value) => {
                    this.plugin.settings.markupStripping.grabTitleFromCardLink = value;
                    this.plugin.debugLog('grabTitleFromCardLink', value);
                    await this.plugin.saveSettings();
                })
        );

        const newNoteDelaySetting = new Setting(this.containerEl)
            .setName(t('settings.miscellaneous.newNoteDelay.name'))
            .setDesc(t('settings.miscellaneous.newNoteDelay.desc'));

        const newNoteDelayContainer = newNoteDelaySetting.controlEl.createDiv({ cls: "flit-char-text-input-container" });

        const newNoteDelayRestoreButton = newNoteDelayContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": t('ariaLabels.restoreDefault') }
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
                    this.plugin.debugLog('newNoteDelay', value);
                    await this.plugin.saveSettings();
                });

            // Move slider to our custom container
            newNoteDelaySliderDiv.appendChild(slider.sliderEl);
        });

        newNoteDelayRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.core.newNoteDelay = DEFAULT_SETTINGS.core.newNoteDelay;
            this.plugin.debugLog('newNoteDelay', this.plugin.settings.core.newNoteDelay);
            await this.plugin.saveSettings();

            // Update the slider value by triggering a re-render or finding the slider element
            const sliderInput = newNoteDelaySliderDiv.querySelector('input[type="range"]') as HTMLInputElement;
            if (sliderInput) {
                sliderInput.value = String(DEFAULT_SETTINGS.core.newNoteDelay);
                sliderInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        const contentReadMethodSetting = new Setting(this.containerEl)
            .setName(t('settings.miscellaneous.contentReadMethod.name'))
            .setDesc(t('settings.miscellaneous.contentReadMethod.desc'));

        const contentReadContainer = contentReadMethodSetting.controlEl.createDiv({ cls: "flit-content-read-container flit-display-flex flit-gap-10" });

        const contentReadRestoreButton = contentReadContainer.createEl("button", {
            attr: { "aria-label": t('ariaLabels.restoreDefaultContentRead') },
            cls: "clickable-icon flit-restore-button"
        });
        setIcon(contentReadRestoreButton, "rotate-ccw");

        const dropdown = contentReadContainer.createEl("select", { cls: "dropdown" });
        dropdown.createEl("option", { value: "Editor", text: t('settings.miscellaneous.contentReadMethod.editor') });
        dropdown.createEl("option", { value: "Cache", text: t('settings.miscellaneous.contentReadMethod.cache') });
        dropdown.createEl("option", { value: "File", text: t('settings.miscellaneous.contentReadMethod.file') });
        dropdown.value = this.plugin.settings.core.fileReadMethod;

        contentReadRestoreButton.addEventListener('click', async () => {
            dropdown.value = DEFAULT_SETTINGS.core.fileReadMethod;
            this.plugin.settings.core.fileReadMethod = DEFAULT_SETTINGS.core.fileReadMethod;
            this.plugin.debugLog('fileReadMethod', this.plugin.settings.core.fileReadMethod);
            await this.plugin.saveSettings();
            this.updateAutomaticRenameVisibility();
        });

        dropdown.addEventListener('change', async (e) => {
            const newMode = (e.target as HTMLSelectElement).value as FileReadMethod;
            this.plugin.settings.core.fileReadMethod = newMode;
            this.plugin.debugLog('fileReadMethod', this.plugin.settings.core.fileReadMethod);
            await this.plugin.saveSettings();
            this.updateAutomaticRenameVisibility();
        });

        const contentReadSubSettingsContainer = this.containerEl.createDiv('flit-sub-settings');

        const checkIntervalSetting = new Setting(contentReadSubSettingsContainer)
            .setName(t('settings.miscellaneous.checkInterval.name'))
            .setDesc(t('settings.miscellaneous.checkInterval.desc'));

        const checkIntervalContainer = checkIntervalSetting.controlEl.createDiv({ cls: "flit-char-text-input-container" });

        const checkIntervalRestoreButton = checkIntervalContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": t('ariaLabels.restoreDefault') }
        });
        setIcon(checkIntervalRestoreButton, "rotate-ccw");

        const checkIntervalTextInput = checkIntervalContainer.createEl("input", { type: "text", cls: "flit-char-text-input flit-width-120" });
        checkIntervalTextInput.placeholder = t('settings.replaceCharacters.emptyPlaceholder');
        checkIntervalTextInput.value = String(this.plugin.settings.core.checkInterval);

        checkIntervalRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.core.checkInterval = DEFAULT_SETTINGS.core.checkInterval;
            checkIntervalTextInput.value = String(DEFAULT_SETTINGS.core.checkInterval);
            this.plugin.debugLog('checkInterval', this.plugin.settings.core.checkInterval);
            await this.plugin.saveSettings();

            // Reinitialize checking system with default interval
            this.plugin.editorLifecycle?.initializeCheckingSystem();
        });

        checkIntervalTextInput.addEventListener('input', async (e) => {
            const input = e.target as HTMLInputElement;
            let value = input.value;

            // Only allow digits
            value = value.replace(/\D/g, '');

            // Limit to 4 digits
            if (value.length > 4) {
                value = value.slice(0, 4);
            }

            // Handle empty input
            if (value === '') {
                input.value = '';
                this.plugin.settings.core.checkInterval = DEFAULT_SETTINGS.core.checkInterval;
                this.plugin.debugLog('checkInterval', this.plugin.settings.core.checkInterval);
                await this.plugin.saveSettings();
                this.plugin.editorLifecycle?.initializeCheckingSystem();
                return;
            }

            // Remove leading zeros (if all zeros, keeps one zero via parseInt)
            const numValue = parseInt(value);

            // Update input field
            input.value = String(numValue);

            // Save setting
            this.plugin.settings.core.checkInterval = numValue;
            this.plugin.debugLog('checkInterval', this.plugin.settings.core.checkInterval);
            await this.plugin.saveSettings();

            // Reinitialize checking system with new interval
            this.plugin.editorLifecycle?.initializeCheckingSystem();
        });

        this.conditionalSettings = [
            checkIntervalSetting
        ];

        let debugSubSettingsContainer: HTMLElement;

        const updateDebugSubOptionVisibility = () => {
            if (this.plugin.settings.core.verboseLogging) {
                debugSubSettingsContainer.removeClass('flit-display-none');
            } else {
                debugSubSettingsContainer.addClass('flit-display-none');
            }
        };

        new Setting(this.containerEl)
            .setName(t('settings.miscellaneous.debug.name'))
            .setDesc(t('settings.miscellaneous.debug.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.core.verboseLogging)
                    .onChange(async (value) => {
                        // Log BEFORE changing the value so we can see the OFF message
                        this.plugin.debugLog('verboseLogging', value);

                        this.plugin.settings.core.verboseLogging = value;
                        // Update debug enabled timestamp when turning ON
                        if (value) {
                            this.plugin.settings.core.debugEnabledTimestamp = this.plugin.getCurrentTimestamp?.() || '';
                        }
                        await this.plugin.saveSettings();
                        // Show/hide the sub-option based on debug state
                        updateDebugSubOptionVisibility();
                        // Output all settings when debug mode is turned ON
                        if (value) {
                            this.plugin.outputAllSettings?.();
                        }
                    })
            );

        debugSubSettingsContainer = this.containerEl.createDiv('flit-sub-settings');

        const debugContentSetting = new Setting(debugSubSettingsContainer)
            .setName(t('settings.miscellaneous.debugOutputContent.name'))
            .setDesc(t('settings.miscellaneous.debugOutputContent.desc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.core.debugOutputFullContent)
                    .onChange(async (value) => {
                        this.plugin.settings.core.debugOutputFullContent = value;
                        this.plugin.debugLog('debugOutputFullContent', value);
                        await this.plugin.saveSettings();
                    })
            );

        updateDebugSubOptionVisibility();

        new Setting(this.containerEl)
            .setName(t('settings.miscellaneous.clearSettings.name'))
            .setDesc(t('settings.miscellaneous.clearSettings.desc'))
            .addButton((button) => {
                button
                    .setButtonText(t('modals.buttons.clearSettings'))
                    .setWarning()
                    .onClick(async () => {
                        new ClearSettingsModal(this.plugin.app, this.plugin as any, async () => {
                            // Reset all settings to defaults with deep copy
                            this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

                            // Keep tracking that settings have been shown (don't show first-time notice again)
                            this.plugin.settings.core.hasShownFirstTimeNotice = true;
                            // Update last usage date to current date
                            this.plugin.settings.core.lastUsageDate = this.plugin.getTodayDateString?.() || '';

                            // Save the cleared settings
                            await this.plugin.saveSettings();

                            // Re-run first-time setup logic (enable defaults, detect template folders/excalidraw)
                            const pluginInitializer = new PluginInitializer(this.plugin as any);
                            await pluginInitializer.initializeFirstEnableLogic();
                            await pluginInitializer.checkFirstTimeExclusionsSetup();

                            // Show notification
                            verboseLog(this.plugin, `Showing notice: ${t('notifications.settingsCleared')}`);
                            new Notice(t('notifications.settingsCleared'));

                            // Force complete tab re-render by calling the parent's display method
                            // We need to get a reference to the parent settings tab
                            const settingsTab = (this.plugin as typeof this.plugin & { settingsTab?: { display(): void } }).settingsTab;
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

        const shouldShow = this.plugin.settings.core.renameNotes === "automatically";
        const isEditorMethod = this.plugin.settings.core.fileReadMethod === 'Editor';

        // Check interval should only show when BOTH conditions are true:
        // 1. renameNotes === "automatically"
        // 2. fileReadMethod === "Editor"
        this.conditionalSettings.forEach(setting => {
            if (shouldShow && isEditorMethod) {
                setting.settingEl.removeClass('flit-display-none');
            } else {
                setting.settingEl.addClass('flit-display-none');
            }
        });
    }
}