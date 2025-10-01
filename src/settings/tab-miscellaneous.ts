import { Setting, setIcon, Notice } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { NotificationMode, FileReadMethod } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { ClearSettingsModal } from '../modals';

export class AdvancedTab extends SettingsTabBase {
    private conditionalSettings: Setting[] = [];

    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
        // Register visibility update function on plugin
        (this.plugin as any).updateAutomaticRenameVisibility = this.updateAutomaticRenameVisibility.bind(this);
    }

    render(): void {

        // Content read method setting (top-most setting)
        const contentReadMethodSetting = new Setting(this.containerEl)
            .setName("Content read method")
            .setDesc("");

        // Create styled description
        const contentReadDesc = contentReadMethodSetting.descEl;
        contentReadDesc.appendText("Cache or file read may resolve issues but will be slower.");
        contentReadDesc.createEl("br");
        contentReadDesc.createEl("small").createEl("strong", { text: "Default: Editor" });

        // Create container for dropdown with reset button
        const contentReadContainer = contentReadMethodSetting.controlEl.createDiv({ cls: "flit-content-read-container" });
        contentReadContainer.style.display = "flex";
        contentReadContainer.style.gap = "10px";

        // Reset button (to the left)
        const contentReadRestoreButton = contentReadContainer.createEl("button", {
            attr: { "aria-label": "Restore default content read method" },
            cls: "clickable-icon flit-restore-button"
        });
        setIcon(contentReadRestoreButton, "rotate-ccw");

        // Dropdown
        const dropdown = contentReadContainer.createEl("select", { cls: "dropdown" });
        dropdown.createEl("option", { value: "Editor", text: "Editor" });
        dropdown.createEl("option", { value: "Cache", text: "Cache" });
        dropdown.createEl("option", { value: "File", text: "File" });
        dropdown.value = this.plugin.settings.fileReadMethod;

        // Reset button click handler
        contentReadRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.fileReadMethod = DEFAULT_SETTINGS.fileReadMethod;
            dropdown.value = DEFAULT_SETTINGS.fileReadMethod;
            this.plugin.debugLog('fileReadMethod', this.plugin.settings.fileReadMethod);
            await this.plugin.saveSettings();
            updateCheckIntervalVisibility();
        });

        // Dropdown change handler
        dropdown.addEventListener('change', async (e) => {
            this.plugin.settings.fileReadMethod = (e.target as HTMLSelectElement).value as FileReadMethod;
            this.plugin.debugLog('fileReadMethod', this.plugin.settings.fileReadMethod);
            await this.plugin.saveSettings();
            updateCheckIntervalVisibility();
        });

        // Create container for content read method sub-options
        const contentReadSubSettingsContainer = this.containerEl.createDiv('flit-sub-settings');

        // Function to update check interval visibility
        const updateCheckIntervalVisibility = () => {
            const isEditorMethod = this.plugin.settings.fileReadMethod === 'Editor';
            contentReadSubSettingsContainer.style.display = isEditorMethod ? '' : 'none';
        };

        // 1. Check interval setting (conditional sub-option for Editor method only)
        const checkIntervalSetting = new Setting(contentReadSubSettingsContainer)
            .setName("Check interval")
            .setDesc("");

        // Create styled description for check interval
        const delayDesc = checkIntervalSetting.descEl;
        delayDesc.appendText("Set how often to check the first line for changes. Increase in case of issues.");
        delayDesc.createEl("br");
        delayDesc.createEl("small").createEl("strong", { text: "Default: 0" });

        // Create input container for check interval with restore button
        const checkIntervalContainer = checkIntervalSetting.controlEl.createDiv({ cls: "flit-char-text-input-container" });

        const checkIntervalRestoreButton = checkIntervalContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": "Restore default" }
        });
        setIcon(checkIntervalRestoreButton, "rotate-ccw");

        const checkIntervalTextInput = checkIntervalContainer.createEl("input", { type: "text", cls: "flit-char-text-input" });
        checkIntervalTextInput.placeholder = "Empty";
        checkIntervalTextInput.style.width = "120px";
        checkIntervalTextInput.value = String(this.plugin.settings.checkInterval);

        checkIntervalRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.checkInterval = DEFAULT_SETTINGS.checkInterval;
            checkIntervalTextInput.value = String(DEFAULT_SETTINGS.checkInterval);
            this.plugin.debugLog('checkInterval', this.plugin.settings.checkInterval);
            await this.plugin.saveSettings();

            // Reinitialize checking system with default interval
            (this.plugin as any).initializeCheckingSystem?.();
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
                this.plugin.settings.checkInterval = DEFAULT_SETTINGS.checkInterval;
                this.plugin.debugLog('checkInterval', this.plugin.settings.checkInterval);
                await this.plugin.saveSettings();
                (this.plugin as any).initializeCheckingSystem?.();
                return;
            }

            // Remove leading zeros (if all zeros, keeps one zero via parseInt)
            const numValue = parseInt(value);

            // Update input field
            input.value = String(numValue);

            // Save setting
            this.plugin.settings.checkInterval = numValue;
            this.plugin.debugLog('checkInterval', this.plugin.settings.checkInterval);
            await this.plugin.saveSettings();

            // Reinitialize checking system with new interval
            (this.plugin as any).initializeCheckingSystem?.();
        });

        // Initialize check interval visibility
        updateCheckIntervalVisibility();

        // 2. Rename on focus (conditional on automatic mode)
        const renameOnFocusSetting = new Setting(this.containerEl)
            .setName("Rename on focus")
            .setDesc("");

        // Create styled description for rename on focus
        const renameOnFocusDesc = renameOnFocusSetting.descEl;
        renameOnFocusDesc.appendText("Automatically rename notes when they become focused/active. May cause errors when using ");
        const webClipperLink1 = renameOnFocusDesc.createEl("a", { text: "Web Clipper", href: "https://obsidian.md/clipper" });
        webClipperLink1.style.color = "var(--link-color)";
        renameOnFocusDesc.appendText(" or if ");
        const templaterLink1 = renameOnFocusDesc.createEl("a", { text: "Templater", href: "obsidian://show-plugin?id=templater-obsidian" });
        templaterLink1.style.color = "var(--link-color)";
        renameOnFocusDesc.appendText(" is set to trigger on note creation.");

        renameOnFocusSetting
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameOnFocus)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnFocus = value;
                        this.plugin.debugLog('renameOnFocus', value);
                        await this.plugin.saveSettings();
                    })
            );

        // 3. Delay new note rename (conditional on automatic mode)
        const fileCreationDelaySetting = new Setting(this.containerEl)
            .setName("Delay new note rename")
            .setDesc("");

        // Create styled description for delay renaming
        const fileCreationDelayDesc = fileCreationDelaySetting.descEl;
        fileCreationDelayDesc.appendText("Delay renaming new notes by a few seconds. Prevents errors when using ");
        const webClipperLink2 = fileCreationDelayDesc.createEl("a", { text: "Web Clipper", href: "https://obsidian.md/clipper" });
        webClipperLink2.style.color = "var(--link-color)";
        fileCreationDelayDesc.appendText(" or if ");
        const templaterLink2 = fileCreationDelayDesc.createEl("a", { text: "Templater", href: "obsidian://show-plugin?id=templater-obsidian" });
        templaterLink2.style.color = "var(--link-color)";
        fileCreationDelayDesc.appendText(" is set to trigger on note creation.");

        fileCreationDelaySetting.addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.fileCreationDelay > 0)
                .onChange(async (value) => {
                    // Set to 2000ms when enabled, 0 when disabled
                    this.plugin.settings.fileCreationDelay = value ? 2000 : 0;
                    this.plugin.debugLog('fileCreationDelay', this.plugin.settings.fileCreationDelay);
                    await this.plugin.saveSettings();
                })
        );

        // 4. Rename in background (conditional on automatic mode)
        const renameInBackgroundSetting = new Setting(this.containerEl)
            .setName("Rename in background")
            .setDesc("Rename notes when their first line changes even if not open in editor.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameInBackground)
                    .onChange(async (value) => {
                        this.plugin.settings.renameInBackground = value;
                        this.plugin.debugLog('renameInBackground', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Store references to conditional settings for visibility control
        this.conditionalSettings = [
            checkIntervalSetting,
            renameOnFocusSetting,
            fileCreationDelaySetting,
            renameInBackgroundSetting
        ];

        // Grab title from card link setting
        const cardLinkSetting = new Setting(this.containerEl)
            .setName("Grab title from card link");

        const cardLinkDesc = cardLinkSetting.descEl;
        cardLinkDesc.appendText("If a note starts with a card link created with ");
        cardLinkDesc.createEl("a", {
            text: "Auto Card Link",
            href: "obsidian://show-plugin?id=auto-card-link"
        });
        cardLinkDesc.appendText(" or ");
        cardLinkDesc.createEl("a", {
            text: "Link Embed",
            href: "obsidian://show-plugin?id=obsidian-link-embed"
        });
        cardLinkDesc.appendText(", the card link title will be put in title.");

        cardLinkSetting.addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.grabTitleFromCardLink)
                .onChange(async (value) => {
                    this.plugin.settings.grabTitleFromCardLink = value;
                    await this.plugin.saveSettings();
                })
        );


        // Show notification setting (moved from General)
        new Setting(this.containerEl)
            .setName("Show notification when renaming manually")
            .setDesc("Controls when to show notifications for the 'Put first line in title' commands.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('Always', 'Always')
                    .addOption('On title change', 'On title change')
                    .addOption('Never', 'Never')
                    .setValue(this.plugin.settings.manualNotificationMode)
                    .onChange(async (value: NotificationMode) => {
                        this.plugin.settings.manualNotificationMode = value;
                        this.plugin.debugLog('manualNotificationMode', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Define debug function and container first
        let debugSubSettingsContainer: HTMLElement;

        const updateDebugSubOptionVisibility = () => {
            if (this.plugin.settings.verboseLogging) {
                debugSubSettingsContainer.style.display = '';
            } else {
                debugSubSettingsContainer.style.display = 'none';
            }
        };

        // Debug setting
        new Setting(this.containerEl)
            .setName("Debug")
            .setDesc("Log all of the plugin's activity to the developer console.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.verboseLogging)
                    .onChange(async (value) => {
                        this.plugin.settings.verboseLogging = value;
                        this.plugin.debugLog('verboseLogging', value);
                        await this.plugin.saveSettings();
                        // Show/hide the sub-option based on debug state
                        updateDebugSubOptionVisibility();
                        // Output all settings when debug mode is turned ON
                        if (value) {
                            (this.plugin as any).outputAllSettings();
                        }
                    })
            );

        // Create container for debug sub-settings
        debugSubSettingsContainer = this.containerEl.createDiv('flit-sub-settings');

        // Debug sub-option: Output full file content
        const debugContentSetting = new Setting(debugSubSettingsContainer)
            .setName("Output full file content in console")
            .setDesc("Log the complete content of files (including YAML frontmatter) whenever they are modified.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.debugOutputFullContent)
                    .onChange(async (value) => {
                        this.plugin.settings.debugOutputFullContent = value;
                        this.plugin.debugLog('debugOutputFullContent', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Initialize visibility
        updateDebugSubOptionVisibility();

        // Clear all settings
        new Setting(this.containerEl)
            .setName("Clear settings")
            .setDesc("Reset all plugin settings to their default values.")
            .addButton((button) => {
                button
                    .setButtonText("Clear")
                    .setWarning()
                    .onClick(async () => {
                        new ClearSettingsModal(this.plugin.app, this.plugin, async () => {
                            // Reset all settings to defaults with deep copy
                            this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

                            // Ensure scope strategy is explicitly set to default
                            this.plugin.settings.scopeStrategy = 'Enable in all notes except below';

                            // Keep tracking that settings have been shown (don't show first-time notice again)
                            this.plugin.settings.hasShownFirstTimeNotice = true;
                            // Update last usage date to current date
                            this.plugin.settings.lastUsageDate = this.plugin.getTodayDateString();

                            // Save the cleared settings
                            await this.plugin.saveSettings();

                            // Show notification
                            new Notice("Settings have been cleared.");

                            // Force complete tab re-render by calling the parent's display method
                            // We need to get a reference to the parent settings tab
                            const settingsTab = (this.plugin as any).settingsTab;
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

        // Set initial visibility based on current setting (after all settings are created)
        this.updateAutomaticRenameVisibility();
    }

    private updateAutomaticRenameVisibility(): void {
        if (this.conditionalSettings.length === 0) return;

        const shouldShow = this.plugin.settings.renameNotes === "automatically";

        this.conditionalSettings.forEach(setting => {
            if (shouldShow) {
                setting.settingEl.style.display = '';
            } else {
                setting.settingEl.style.display = 'none';
            }
        });
    }
}