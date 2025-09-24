import { PluginSettingTab, Setting, App, setIcon, TFolder, Notice } from "obsidian";
import { PluginSettings, CustomReplacement, Safeword, ScopeStrategy, NotificationMode } from './types';
import { detectOS } from './utils';
import { OS_FORBIDDEN_CHARS, DEFAULT_SETTINGS } from './constants';
import { FolderSuggest, TagSuggest } from './suggests';
import { RenameAllFilesModal, ClearSettingsModal } from './modals';

interface FirstLineIsTitlePlugin {
    app: App;
    settings: PluginSettings;
    saveSettings(): Promise<void>;
}

export class FirstLineIsTitleSettings extends PluginSettingTab {
    plugin: FirstLineIsTitlePlugin;
    private settingsPage: HTMLDivElement | null = null;

    private readonly TABS = {
        GENERAL: { id: 'general', name: 'General' },
        INCLUDE_EXCLUDE: { id: 'include-exclude', name: 'Exclude notes' },
        PROPERTIES: { id: 'properties', name: 'Properties' },
        FORBIDDEN_CHARS: { id: 'forbidden-chars', name: 'Replace illegal characters' },
        CUSTOM_REPLACEMENTS: { id: 'custom-replacements', name: 'Custom replacements' },
        SAFEWORDS: { id: 'safewords', name: 'Safewords' },
        COMMANDS: { id: 'commands', name: 'Commands' },
        ADVANCED: { id: 'advanced', name: 'Miscellaneous' }
    };

    constructor(app: App, plugin: FirstLineIsTitlePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.containerEl.empty();

        // Create tab bar
        const tabBar = this.containerEl.createEl('nav', { cls: 'flit-settings-tab-bar' });

        for (const [tabKey, tabInfo] of Object.entries(this.TABS)) {
            const tabEl = tabBar.createEl('div', { cls: 'flit-settings-tab' });
            tabEl.setAttribute('data-tab-id', tabInfo.id);
            const tabNameEl = tabEl.createEl('div', { cls: 'flit-settings-tab-name' });
            tabNameEl.innerHTML = tabInfo.name; // Use innerHTML to support line breaks

            if (this.plugin.settings.currentSettingsTab === tabInfo.id) {
                tabEl.addClass('flit-settings-tab-active');
            }

            tabEl.addEventListener('click', () => {
                // Remove active class from all tabs
                for (const child of tabBar.children) {
                    child.removeClass('flit-settings-tab-active');
                }

                // Add active class to clicked tab
                tabEl.addClass('flit-settings-tab-active');

                // Update settings and render
                this.plugin.settings.currentSettingsTab = tabInfo.id;
                this.plugin.saveSettings();
                this.renderTab(tabInfo.id);
            });
        }


        // Create settings page container
        this.settingsPage = this.containerEl.createDiv({ cls: 'flit-settings-page' });

        // Render initial tab
        this.renderTab(this.plugin.settings.currentSettingsTab);
    }


    private renderTab(tabId: string): void {
        if (!this.settingsPage) return;

        this.settingsPage.empty();

        switch (tabId) {
            case 'general':
                this.renderGeneralTab();
                break;
            case 'include-exclude':
                this.renderIncludeExcludeTab();
                break;
            case 'properties':
                this.renderPropertiesTab();
                break;
            case 'forbidden-chars':
                this.renderForbiddenCharsTab();
                break;
            case 'custom-replacements':
                this.renderCustomReplacementsTab();
                break;
            case 'safewords':
                this.renderSafewordsTab();
                break;
            case 'commands':
                this.renderCommandsTab();
                break;
            case 'advanced':
                this.renderAdvancedTab();
                break;
            default:
                this.renderGeneralTab();
        }
    }

    private renderGeneralTab(): void {
        if (!this.settingsPage) return;

        // 1. rename notes
        new Setting(this.settingsPage)
            .setName("Rename notes")
            .setDesc("Choose when notes should be renamed if the first line differs from filename.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("automatically", "Automatically")
                    .addOption("manually", "Manually")
                    .setValue(this.plugin.settings.renameNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.renameNotes = value as "automatically" | "manually";
                        this.plugin.debugLog('renameNotes', value);
                        await this.plugin.saveSettings();
                        updateRenameOnFocusVisibility();
                    })
            );

        // 2. rename on focus (conditional)
        const renameOnFocusSetting = new Setting(this.settingsPage)
            .setName("Rename on focus")
            .setDesc(createFragment(fragment => {
                fragment.createSpan({ text: "Automatically rename notes when they become focused/active. " });
                fragment.createEl("br");
                const noteSpan = fragment.createSpan({ text: "Note: may cause errors when using " });
                noteSpan.createEl("em", { text: "Web Clipper" });
                noteSpan.createSpan({ text: " or if " });
                noteSpan.createEl("em", { text: "Templater" });
                noteSpan.createSpan({ text: " is set to trigger on note creation." });
            }))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameOnFocus)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnFocus = value;
                        this.plugin.debugLog('renameOnFocus', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Create container for rename on focus sub-option (notebook-navigator approach)
        const renameOnFocusContainer = this.settingsPage.createDiv('flit-sub-settings');
        renameOnFocusContainer.appendChild(renameOnFocusSetting.settingEl);

        const updateRenameOnFocusVisibility = () => {
            if (this.plugin.settings.renameNotes === "automatically") {
                renameOnFocusContainer.show();
            } else {
                renameOnFocusContainer.hide();
            }
        };

        // Set initial visibility
        updateRenameOnFocusVisibility();

        // 3. rename on save
        new Setting(this.settingsPage)
            .setName("Rename on save")
            .setDesc("Rename notes on manual save (Ctrl/Cmd-S by default).")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameOnSave)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnSave = value;
                        this.plugin.debugLog('renameOnSave', value);
                        await this.plugin.saveSettings();
                    })
            );

        // 4. show notif
        new Setting(this.settingsPage)
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

        // 5. rename all
        new Setting(this.settingsPage)
            .setName("Rename all notes")
            .setDesc("Unless in excluded folder or with excluded tag. Can also be run from the Command palette.")
            .addButton((button) =>
                button.setButtonText("Rename").onClick(() => {
                    new RenameAllFilesModal(this.app, this.plugin).open();
                })
            );

        // 6. char count
        const charCountSetting = new Setting(this.settingsPage)
            .setName("Character count")
            .setDesc(createFragment(fragment => {
                fragment.createSpan({ text: "The maximum number of characters to put in filename. Up to 255 characters." });
                fragment.createEl("br");
                fragment.createEl("small").createEl("strong", { text: "Default: 100" });
            }));

        // Create input container for character count with restore button
        const charCountContainer = charCountSetting.controlEl.createDiv({ cls: "flit-char-text-input-container" });

        const charCountRestoreButton = charCountContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": "Restore default" }
        });
        setIcon(charCountRestoreButton, "rotate-ccw");

        const charCountTextInput = charCountContainer.createEl("input", { type: "text", cls: "flit-char-text-input" });
        charCountTextInput.placeholder = "Empty";
        charCountTextInput.style.width = "120px";
        charCountTextInput.value = String(this.plugin.settings.charCount);

        charCountRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.charCount = DEFAULT_SETTINGS.charCount;
            charCountTextInput.value = String(DEFAULT_SETTINGS.charCount);
            await this.plugin.saveSettings();
        });

        charCountTextInput.addEventListener('input', async (e) => {
            const value = (e.target as HTMLInputElement).value;
            if (value === '') {
                this.plugin.settings.charCount = DEFAULT_SETTINGS.charCount;
                // Don't update the field value immediately
            } else {
                const numVal = Number(value);
                if (numVal >= 1 && numVal <= 255) {
                    this.plugin.settings.charCount = numVal;
                }
            }
            await this.plugin.saveSettings();
        });

        // 7. what to put in title
        new Setting(this.settingsPage)
            .setName("What to put in title")
            .setDesc("Choose what should be put in filename.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("any_first_line_content", "Any first line content")
                    .addOption("headings_only", "Headings only")
                    .setValue(this.plugin.settings.whatToPutInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.whatToPutInTitle = value as "any_first_line_content" | "headings_only";
                        this.plugin.debugLog('whatToPutInTitle', value);
                        await this.plugin.saveSettings();
                    })
            );

        // 8. move cursor
        new Setting(this.settingsPage)
            .setName("Move cursor to first line")
            .setDesc("Automatically move the cursor to the first line when creating new notes.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.moveCursorToFirstLine)
                    .onChange(async (value) => {
                        this.plugin.settings.moveCursorToFirstLine = value;
                        this.plugin.debugLog('moveCursorToFirstLine', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Feedback link
        const feedbackContainer = this.settingsPage.createEl("div");
        feedbackContainer.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            margin: 20px 0;
        `;

        const button = feedbackContainer.createEl("button", {
            cls: "mod-cta"
        });
        button.style.display = "flex";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.gap = "8px";
        button.addEventListener('click', () => {
            window.open("https://github.com/greetclammy/first-line-is-title/issues", "_blank");
        });

        // Add icon div
        const iconDiv = button.createEl("div");
        iconDiv.style.alignSelf = "flex-end";
        setIcon(iconDiv, "message-square-reply");

        // Add text (no wrapper needed, just text)
        button.appendText("Leave feedback");
    }

    private renderPropertiesTab(): void {
        if (!this.settingsPage) return;

        // Property to disable renaming
        const propertyDisableSetting = new Setting(this.settingsPage)
            .setName("Property to disable renaming")
            .setDesc(createFragment(fragment => {
                fragment.createSpan({ text: "Configure the key:property pair that will disable renaming for notes that contain it. Case-insensitive. Always respected." });
                fragment.createEl("br");
                fragment.createEl("small").createEl("strong", { text: "Default: 'rename:off'" });
            }));

        const propertyContainer = propertyDisableSetting.controlEl.createDiv({ cls: "flit-property-disable-container" });
        propertyContainer.style.display = "flex";
        propertyContainer.style.gap = "10px";

        // Create container for key input with reset button
        const keyInputContainer = propertyContainer.createDiv({ cls: "flit-char-text-input-container" });

        const keyRestoreButton = keyInputContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": "Restore default" }
        });
        setIcon(keyRestoreButton, "rotate-ccw");

        const keyInput = keyInputContainer.createEl("input", { type: "text", cls: "flit-char-text-input" });
        keyInput.placeholder = "key";
        keyInput.style.width = "120px";
        keyInput.value = this.plugin.settings.disableRenamingKey;

        const valueInput = propertyContainer.createEl("input", { type: "text" });
        valueInput.placeholder = "value";
        valueInput.style.width = "120px";
        valueInput.value = this.plugin.settings.disableRenamingValue;

        keyRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.disableRenamingKey = DEFAULT_SETTINGS.disableRenamingKey;
            this.plugin.settings.disableRenamingValue = DEFAULT_SETTINGS.disableRenamingValue;
            keyInput.value = DEFAULT_SETTINGS.disableRenamingKey;
            valueInput.value = DEFAULT_SETTINGS.disableRenamingValue;
            await this.plugin.saveSettings();
        });

        keyInput.addEventListener('input', async (e) => {
            this.plugin.settings.disableRenamingKey = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
        });

        valueInput.addEventListener('input', async (e) => {
            this.plugin.settings.disableRenamingValue = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
        });

        // Add alias setting
        const aliasToggleSetting = new Setting(this.settingsPage)
            .setName("Add alias")
            .setDesc("Always copy the first line to a property. Allows to make forbidden characters searchable.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAliases)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAliases = value;
                        this.plugin.debugLog('enableAliases', value);
                        await this.plugin.saveSettings();
                        renderAliasSubSettings();
                    })
            );


        // Sub-options that are shown/hidden based on main toggle
        const aliasPropertyKeySetting = new Setting(this.settingsPage)
            .setName("Alias property name")
            .setDesc(createFragment(fragment => {
                fragment.createSpan({ text: "Configure the property key in which to isnert the alias. Use the default to make it searchable in the Quick switcher. You can also set this property as note title in " });
                fragment.createEl("em", { text: "Omnisearch" });
                fragment.createSpan({ text: " settings." });
                fragment.createEl("br");
                fragment.createEl("small").createEl("strong", { text: "Default: aliases" });
            }));

        // Create input container for alias property key with restore button
        const aliasPropertyKeyContainer = aliasPropertyKeySetting.controlEl.createDiv({ cls: "flit-char-text-input-container" });

        const aliasPropertyKeyRestoreButton = aliasPropertyKeyContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": "Restore default" }
        });
        setIcon(aliasPropertyKeyRestoreButton, "rotate-ccw");

        const aliasPropertyKeyTextInput = aliasPropertyKeyContainer.createEl("input", { type: "text", cls: "flit-char-text-input" });
        aliasPropertyKeyTextInput.placeholder = "Empty";
        aliasPropertyKeyTextInput.style.width = "120px";
        aliasPropertyKeyTextInput.value = this.plugin.settings.aliasPropertyKey;

        aliasPropertyKeyRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.aliasPropertyKey = DEFAULT_SETTINGS.aliasPropertyKey;
            aliasPropertyKeyTextInput.value = DEFAULT_SETTINGS.aliasPropertyKey;
            await this.plugin.saveSettings();
        });

        aliasPropertyKeyTextInput.addEventListener('input', async (e) => {
            const value = (e.target as HTMLInputElement).value;
            this.plugin.settings.aliasPropertyKey = value.trim() || 'aliases';
            await this.plugin.saveSettings();
        });

        const addAliasConditionalSetting = new Setting(this.settingsPage)
            .setName("Only add alias if first line differs from title")
            .setDesc("For example, if the filename was truncated, or some characters have been omitted or replaced.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.addAliasOnlyIfFirstLineDiffers)
                    .onChange(async (value) => {
                        this.plugin.settings.addAliasOnlyIfFirstLineDiffers = value;
                        this.plugin.debugLog('addAliasOnlyIfFirstLineDiffers', value);
                        await this.plugin.saveSettings();
                    })
            );

        const truncateAliasSetting = new Setting(this.settingsPage)
            .setName("Truncate alias")
            .setDesc(createFragment(fragment => {
                fragment.createSpan({ text: "In accordance with the " });
                fragment.createEl("em", { text: "Character count" });
                fragment.createSpan({ text: " value in General settings." });
            }))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.truncateAlias)
                    .onChange(async (value) => {
                        this.plugin.settings.truncateAlias = value;
                        this.plugin.debugLog('truncateAlias', value);
                        await this.plugin.saveSettings();
                    })
            );

        const keepEmptyAliasPropertySetting = new Setting(this.settingsPage)
            .setName("Keep empty alias property")
            .setDesc("When the plugin removes the first line alias and no other aliases remain, keep the empty property rather than delete it.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.keepEmptyAliasProperty)
                    .onChange(async (value) => {
                        this.plugin.settings.keepEmptyAliasProperty = value;
                        this.plugin.debugLog('keepEmptyAliasProperty', value);
                        await this.plugin.saveSettings();
                    })
            );

        const hideAliasPropertySetting = new Setting(this.settingsPage)
            .setName("Hide alias property")
            .setDesc("Hide the alias property in Reading view and Live Preview. Will always remain visible in Source view.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('never', 'Never')
                    .addOption('when_empty', 'Only when empty')
                    .addOption('always', 'Always')
                    .setValue(this.plugin.settings.hideAliasProperty)
                    .onChange(async (value) => {
                        this.plugin.settings.hideAliasProperty = value as any;
                        this.plugin.debugLog('hideAliasProperty', value);
                        await this.plugin.saveSettings();
                        this.updatePropertyVisibility();
                        showInSidebarSetting.settingEl.style.display = (value === 'when_empty' || value === 'always') ? '' : 'none';
                    })
            );

        const showInSidebarSetting = new Setting(this.settingsPage)
            .setName("Show in sidebar")
            .setDesc("Show the property in the file properties sidebar.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showAliasInSidebar)
                    .onChange(async (value) => {
                        this.plugin.settings.showAliasInSidebar = value;
                        this.plugin.debugLog('showAliasInSidebar', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Initially hide/show the sidebar setting based on current hideAliasProperty value
        showInSidebarSetting.settingEl.style.display = (this.plugin.settings.hideAliasProperty === 'when_empty' || this.plugin.settings.hideAliasProperty === 'always') ? '' : 'none';

        const suppressMergeNotificationsSetting = new Setting(this.settingsPage)
            .setName("Hide merge notifications")
            .setDesc("Suppress notifications about files being modified externally and merged automatically.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.suppressMergeNotifications)
                    .onChange(async (value) => {
                        this.plugin.settings.suppressMergeNotifications = value;
                        this.plugin.debugLog('suppressMergeNotifications', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Create container for alias sub-options (notebook-navigator approach)
        const aliasSubSettingsContainer = this.settingsPage.createDiv('flit-sub-settings');

        // Move alias sub-options into the container
        aliasSubSettingsContainer.appendChild(aliasPropertyKeySetting.settingEl);
        aliasSubSettingsContainer.appendChild(addAliasConditionalSetting.settingEl);
        aliasSubSettingsContainer.appendChild(truncateAliasSetting.settingEl);
        aliasSubSettingsContainer.appendChild(keepEmptyAliasPropertySetting.settingEl);
        aliasSubSettingsContainer.appendChild(hideAliasPropertySetting.settingEl);
        aliasSubSettingsContainer.appendChild(showInSidebarSetting.settingEl);
        aliasSubSettingsContainer.appendChild(suppressMergeNotificationsSetting.settingEl);

        const renderAliasSubSettings = () => {
            // Show/hide entire alias sub-options container based on enableAliases toggle
            if (this.plugin.settings.enableAliases) {
                aliasSubSettingsContainer.show();
            } else {
                aliasSubSettingsContainer.hide();
            }
        };

        renderAliasSubSettings();
    }

    private updatePropertyVisibility(): void {
        // Get reference to main plugin for property visibility update
        (this.plugin as any).updatePropertyVisibility?.();
    }

    private renderIncludeExcludeTab(): void {
        if (!this.settingsPage) return;

        // Strategy selection
        new Setting(this.settingsPage)
            .setName("Exclusion behavior")
            .setDesc("Configure how folders and tags are excluded from renaming.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('Enable in all notes except below', 'Enable in all notes except below')
                    .addOption('Disable in all notes except below', 'Disable in all notes except below')
                    .setValue(this.plugin.settings.scopeStrategy)
                    .onChange(async (value: ScopeStrategy) => {
                        this.plugin.settings.scopeStrategy = value;
                        this.plugin.debugLog('scopeStrategy', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Folders subsection
        this.settingsPage.createEl("h3", { text: "Folders" });

        // Exclude subfolders setting under Folders heading
        const subfolderSetting = new Setting(this.settingsPage)
            .setName("Apply to subfolders")
            .setDesc("Also apply to all subfolders of folders listed below.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.excludeSubfolders)
                    .onChange(async (value) => {
                        this.plugin.settings.excludeSubfolders = value;
                        this.plugin.debugLog('excludeSubfolders', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Remove any top border from the subfolder setting
        subfolderSetting.settingEl.style.borderTop = "none";
        subfolderSetting.settingEl.style.paddingTop = "0";

        // Add divider line right after subfolder option
        this.settingsPage.createEl("hr", { cls: "flit-divider" });

        // Create a container for folder settings that will stay in place
        const folderContainer = this.settingsPage.createDiv();

        const renderExcludedFolders = () => {
            // Clear only the folder container
            folderContainer.empty();

            // Variable to store the add button reference for state updates
            let addButton: any;

            // No need for add button state management anymore - buttons are always enabled

            // Render each folder setting
            this.plugin.settings.excludedFolders.forEach((folder, index) => {
                const folderSetting = new Setting(folderContainer);
                let textInput: any;
                let removeButton: any;

                const updateButtonState = () => {
                    const isLastEmptyEntry = this.plugin.settings.excludedFolders.length === 1 &&
                                              this.plugin.settings.excludedFolders[0].trim() === "";

                    if (isLastEmptyEntry) {
                        // Don't set any tooltip, disable button
                        removeButton.setDisabled(true);
                        removeButton.extraSettingsEl.style.opacity = "0.5";
                        removeButton.extraSettingsEl.style.pointerEvents = "none";
                        removeButton.extraSettingsEl.removeAttribute('aria-label');
                        removeButton.extraSettingsEl.title = "";
                    } else {
                        removeButton.setDisabled(false);
                        removeButton.extraSettingsEl.style.opacity = "1";
                        removeButton.extraSettingsEl.style.pointerEvents = "auto";
                        removeButton.setTooltip("Remove");
                    }
                };

                folderSetting.addText(text => {
                    textInput = text;
                    text.setPlaceholder("Folder name")
                        .setValue(folder)
                        .onChange(async (value) => {
                            this.plugin.settings.excludedFolders[index] = value;
                            await this.plugin.saveSettings();
                            updateButtonState(); // Update button state when text changes
                        });
                    text.inputEl.style.width = "100%";

                    // Add folder suggestion functionality
                    try {
                        new FolderSuggest(this.plugin.app, text.inputEl, async (selectedPath: string) => {
                            // Update the settings when a folder is selected
                            this.plugin.settings.excludedFolders[index] = selectedPath;
                            await this.plugin.saveSettings();
                            updateButtonState(); // Update button state when suggestion is selected
                        });
                    } catch (error) {
                        console.error('Failed to create FolderSuggest:', error);
                    }
                })
                .addExtraButton(button => {
                    removeButton = button;
                    button.setIcon("x");

                    button.onClick(async () => {
                        // Only execute if not disabled
                        const isLastEmptyEntry = this.plugin.settings.excludedFolders.length === 1 &&
                                                  this.plugin.settings.excludedFolders[0].trim() === "";

                        if (!isLastEmptyEntry) {
                            this.plugin.settings.excludedFolders.splice(index, 1);

                            // If this was the last entry, add a new empty one
                            if (this.plugin.settings.excludedFolders.length === 0) {
                                this.plugin.settings.excludedFolders.push("");
                            }

                            await this.plugin.saveSettings();
                            renderExcludedFolders();
                        }
                    });

                    // Initial button state
                    updateButtonState();
                });

                folderSetting.settingEl.addClass('flit-excluded-folder-setting');
            });

            // Always add the "Add folder" button at the end
            const addButtonSetting = new Setting(folderContainer)
                .addButton(button => {
                    button.setButtonText("Add folder")
                        .onClick(async () => {
                            const isBottomEntryEmpty = this.plugin.settings.excludedFolders.length > 0 &&
                                                       this.plugin.settings.excludedFolders[this.plugin.settings.excludedFolders.length - 1].trim() === "";

                            if (isBottomEntryEmpty) {
                                // Focus the bottom empty text input instead of adding a new one
                                const textInputs = folderContainer.querySelectorAll('input[type="text"]');
                                if (textInputs.length > 0) {
                                    const lastInput = textInputs[textInputs.length - 1] as HTMLInputElement;
                                    lastInput.focus();
                                }
                            } else {
                                // Add new entry and focus it
                                this.plugin.settings.excludedFolders.push("");
                                await this.plugin.saveSettings();
                                renderExcludedFolders();

                                // Focus the newly created text input
                                setTimeout(() => {
                                    const textInputs = folderContainer.querySelectorAll('input[type="text"]');
                                    if (textInputs.length > 0) {
                                        const lastInput = textInputs[textInputs.length - 1] as HTMLInputElement;
                                        lastInput.focus();
                                    }
                                }, 0);
                            }
                        });
                });
            addButtonSetting.settingEl.addClass('flit-add-folder-button');
        };

        renderExcludedFolders();

        // Tags subsection
        this.settingsPage.createEl("h3", { text: "Tags" });

        // Exclude inline tags setting under Tags heading
        const inlineTagsSetting = new Setting(this.settingsPage)
            .setName("Apply to inline tags")
            .setDesc("Also apply to notes with tags listed below in note body.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.excludeInlineTags)
                    .onChange(async (value) => {
                        this.plugin.settings.excludeInlineTags = value;
                        this.plugin.debugLog('excludeInlineTags', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Remove any top border from the inline tags setting
        inlineTagsSetting.settingEl.style.borderTop = "none";
        inlineTagsSetting.settingEl.style.paddingTop = "0";

        // Exclude child tags setting
        const childTagsSetting = new Setting(this.settingsPage)
            .setName("Apply to child tags")
            .setDesc("For example, also apply to #parent/child if #parent is listed below.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.excludeChildTags)
                    .onChange(async (value) => {
                        this.plugin.settings.excludeChildTags = value;
                        this.plugin.debugLog('excludeChildTags', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Remove any top border from the child tags setting
        childTagsSetting.settingEl.style.borderTop = "none";
        childTagsSetting.settingEl.style.paddingTop = "0";

        // Add divider line right after nested tags option
        this.settingsPage.createEl("hr", { cls: "flit-divider" });

        // Create a container for tag settings that will stay in place
        const tagContainer = this.settingsPage.createDiv();

        const renderExcludedTags = () => {
            // Clear only the tag container
            tagContainer.empty();

            // Variable to store the add button reference for state updates
            let addTagButton: any;

            // No need for add button state management anymore - buttons are always enabled

            // Render each tag setting
            this.plugin.settings.excludedTags.forEach((tag, index) => {
                const tagSetting = new Setting(tagContainer);
                let textInput: any;
                let removeButton: any;

                const updateButtonState = () => {
                    const isLastEmptyEntry = this.plugin.settings.excludedTags.length === 1 &&
                                              this.plugin.settings.excludedTags[0].trim() === "";

                    if (isLastEmptyEntry) {
                        // Don't set any tooltip, disable button
                        removeButton.setDisabled(true);
                        removeButton.extraSettingsEl.style.opacity = "0.5";
                        removeButton.extraSettingsEl.style.pointerEvents = "none";
                        removeButton.extraSettingsEl.removeAttribute('aria-label');
                        removeButton.extraSettingsEl.title = "";
                    } else {
                        removeButton.setDisabled(false);
                        removeButton.extraSettingsEl.style.opacity = "1";
                        removeButton.extraSettingsEl.style.pointerEvents = "auto";
                        removeButton.setTooltip("Remove");
                    }
                };

                tagSetting.addText(text => {
                    textInput = text;
                    text.setPlaceholder("Tag name")
                        .setValue(tag)
                        .onChange(async (value) => {
                            this.plugin.settings.excludedTags[index] = value;
                            this.plugin.debugLog('excludedTags', this.plugin.settings.excludedTags);
                            await this.plugin.saveSettings();
                            updateButtonState(); // Update button state when text changes
                        });
                    text.inputEl.style.width = "100%";

                    // Add tag suggestion functionality
                    try {
                        new TagSuggest(this.plugin.app, text.inputEl, async (selectedTag: string) => {
                            // Update the settings when a tag is selected
                            this.plugin.settings.excludedTags[index] = selectedTag;
                            await this.plugin.saveSettings();
                            updateButtonState(); // Update button state when suggestion is selected
                        });
                    } catch (error) {
                        console.error('Failed to create TagSuggest:', error);
                    }
                })
                .addExtraButton(button => {
                    removeButton = button;
                    button.setIcon("x");

                    button.onClick(async () => {
                        // Only execute if not disabled
                        const isLastEmptyEntry = this.plugin.settings.excludedTags.length === 1 &&
                                                  this.plugin.settings.excludedTags[0].trim() === "";

                        if (!isLastEmptyEntry) {
                            this.plugin.settings.excludedTags.splice(index, 1);

                            // If this was the last entry, add a new empty one
                            if (this.plugin.settings.excludedTags.length === 0) {
                                this.plugin.settings.excludedTags.push("");
                            }

                            await this.plugin.saveSettings();
                            renderExcludedTags();
                        }
                    });

                    // Initial button state
                    updateButtonState();
                });

                tagSetting.settingEl.addClass('flit-excluded-folder-setting');
            });

            // Always add the "Add tag" button at the end
            const addTagButtonSetting = new Setting(tagContainer)
                .addButton(button => {
                    button.setButtonText("Add tag")
                        .onClick(async () => {
                            const isBottomEntryEmpty = this.plugin.settings.excludedTags.length > 0 &&
                                                       this.plugin.settings.excludedTags[this.plugin.settings.excludedTags.length - 1].trim() === "";

                            if (isBottomEntryEmpty) {
                                // Focus the bottom empty text input instead of adding a new one
                                const textInputs = tagContainer.querySelectorAll('input[type="text"]');
                                if (textInputs.length > 0) {
                                    const lastInput = textInputs[textInputs.length - 1] as HTMLInputElement;
                                    lastInput.focus();
                                }
                            } else {
                                // Add new entry and focus it
                                this.plugin.settings.excludedTags.push("");
                                await this.plugin.saveSettings();
                                renderExcludedTags();

                                // Focus the newly created text input
                                setTimeout(() => {
                                    const textInputs = tagContainer.querySelectorAll('input[type="text"]');
                                    if (textInputs.length > 0) {
                                        const lastInput = textInputs[textInputs.length - 1] as HTMLInputElement;
                                        lastInput.focus();
                                    }
                                }, 0);
                            }
                        });
                });
            addTagButtonSetting.settingEl.addClass('flit-add-folder-button');
        };

        renderExcludedTags();
    }

    private renderCommandsTab(): void {
        if (!this.settingsPage) return;

        // Ribbon Section
        this.settingsPage.createEl("h3", { text: "Ribbon" });

        this.settingsPage.createEl("p", {
            text: "Control which commands appear in the ribbon menu. Reload plugin or Obsidian to apply.",
            cls: "setting-item-description"
        });

        const ribbonHeaderToggleSetting = new Setting(this.settingsPage)
            .setName("Enable")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableRibbon)
                    .onChange(async (value) => {
                        this.plugin.settings.enableRibbon = value;
                        this.plugin.debugLog('enableRibbon', value);
                        await this.plugin.saveSettings();
                        updateRibbonUI();
                    });
            });

        ribbonHeaderToggleSetting.settingEl.addClass('flit-master-toggle');

                this.settingsPage.createEl("br");

        // Create container for ribbon settings
        const ribbonContainer = this.settingsPage.createDiv();

        const updateRibbonUI = () => {
            if (this.plugin.settings.enableRibbon) {
                ribbonContainer.show();
            } else {
                ribbonContainer.hide();
            }
        };

        const ribbonCurrentSetting = new Setting(ribbonContainer)
            .setName("Put first line in title")
            .setDesc("Rename active note, even if in excluded folder or with excluded tag.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.ribbonVisibility.renameCurrentFile)
                    .onChange(async (value) => {
                        this.plugin.settings.ribbonVisibility.renameCurrentFile = value;
                        this.plugin.debugLog('ribbonVisibility.renameCurrentFile', value);
                        await this.plugin.saveSettings();
                    });
            });
                const ribbonCurrentIcon = ribbonCurrentSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(ribbonCurrentIcon, "file-pen");
        ribbonCurrentSetting.nameEl.insertBefore(ribbonCurrentIcon, ribbonCurrentSetting.nameEl.firstChild);

        const ribbonBulkSetting = new Setting(ribbonContainer)
            .setName("Put first line in title in all notes")
            .setDesc("Rename all notes in vault except if in excluded folder or with excluded tag.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.ribbonVisibility.renameAllNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.ribbonVisibility.renameAllNotes = value;
                        this.plugin.debugLog('ribbonVisibility.renameAllNotes', value);
                        await this.plugin.saveSettings();
                    });
            });
                const ribbonBulkIcon = ribbonBulkSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(ribbonBulkIcon, "files");
        ribbonBulkSetting.nameEl.insertBefore(ribbonBulkIcon, ribbonBulkSetting.nameEl.firstChild);

        // Initialize ribbon UI
        updateRibbonUI();

        // Command Palette Section
        this.settingsPage.createEl("h3", { text: "Command palette" });

        this.settingsPage.createEl("p", {
            text: "Control which commands appear in the Command palette (Ctrl/Cmd-P by default). Reload plugin or Obsidian to apply.",
            cls: "setting-item-description"
        });

        const commandPaletteHeaderToggleSetting = new Setting(this.settingsPage)
            .setName("Enable")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableCommandPalette)
                    .onChange(async (value) => {
                        this.plugin.settings.enableCommandPalette = value;
                        this.plugin.debugLog('enableCommandPalette', value);
                        await this.plugin.saveSettings();
                        updateCommandPaletteUI();
                    });
            });

        commandPaletteHeaderToggleSetting.settingEl.addClass('flit-master-toggle');

                this.settingsPage.createEl("br");

        // Create container for command palette settings
        const commandPaletteContainer = this.settingsPage.createDiv();
        commandPaletteContainer.addClass('flit-master-disable-target');

        const updateCommandPaletteUI = () => {
            if (this.plugin.settings.enableCommandPalette) {
                commandPaletteContainer.show();
            } else {
                commandPaletteContainer.hide();
            }
        };

        const setting1 = new Setting(commandPaletteContainer)
            .setName("Put first line in title")
            .setDesc("Rename active note, even if in excluded folder or with excluded tag.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandPaletteVisibility.renameCurrentFile)
                    .onChange(async (value) => {
                        this.plugin.settings.commandPaletteVisibility.renameCurrentFile = value;
                        this.plugin.debugLog('commandPaletteVisibility.renameCurrentFile', value);
                        await this.plugin.saveSettings();
                    })
            );

                const icon1 = setting1.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(icon1, "file-pen");
        setting1.nameEl.insertBefore(icon1, setting1.nameEl.firstChild);

        const setting2 = new Setting(commandPaletteContainer)
            .setName("Put first line in title (unless excluded)")
            .setDesc("Rename active note except if in excluded folder or with excluded tag.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandPaletteVisibility.renameCurrentFileUnlessExcluded)
                    .onChange(async (value) => {
                        this.plugin.settings.commandPaletteVisibility.renameCurrentFileUnlessExcluded = value;
                        this.plugin.debugLog('commandPaletteVisibility.renameCurrentFileUnlessExcluded', value);
                        await this.plugin.saveSettings();
                    })
            );

                const icon2 = setting2.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(icon2, "file-pen");
        setting2.nameEl.insertBefore(icon2, setting2.nameEl.firstChild);

        const setting3 = new Setting(commandPaletteContainer)
            .setName("Put first line in title in all notes")
            .setDesc("Rename all notes in vault except if in excluded folder or with excluded tag.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandPaletteVisibility.renameAllFiles)
                    .onChange(async (value) => {
                        this.plugin.settings.commandPaletteVisibility.renameAllFiles = value;
                        this.plugin.debugLog('commandPaletteVisibility.renameAllFiles', value);
                        await this.plugin.saveSettings();
                    })
            );

                const icon3 = setting3.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(icon3, "files");
        setting3.nameEl.insertBefore(icon3, setting3.nameEl.firstChild);

        const setting4 = new Setting(commandPaletteContainer)
            .setName("Disable renaming for note")
            .setDesc("Exclude active note from renaming.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandPaletteVisibility.disableRenaming)
                    .onChange(async (value) => {
                        this.plugin.settings.commandPaletteVisibility.disableRenaming = value;
                        this.plugin.debugLog('commandPaletteVisibility.disableRenaming', value);
                        await this.plugin.saveSettings();
                    })
            );

                const icon4 = setting4.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(icon4, "square-x");
        setting4.nameEl.insertBefore(icon4, setting4.nameEl.firstChild);

        const setting5 = new Setting(commandPaletteContainer)
            .setName("Enable renaming for note")
            .setDesc("Stop excluding active note from renaming.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandPaletteVisibility.enableRenaming)
                    .onChange(async (value) => {
                        this.plugin.settings.commandPaletteVisibility.enableRenaming = value;
                        this.plugin.debugLog('commandPaletteVisibility.enableRenaming', value);
                        await this.plugin.saveSettings();
                    })
            );

                const icon5 = setting5.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(icon5, "square-check");
        setting5.nameEl.insertBefore(icon5, setting5.nameEl.firstChild);

        // Initialize command palette UI state
        updateCommandPaletteUI();

        // Context Menus Section
        this.settingsPage.createEl("h3", { text: "Context menus" });

        this.settingsPage.createEl("p", {
            text: "Control which commands appear in context menus.",
            cls: "setting-item-description"
        });

        const contextMenuHeaderToggleSetting = new Setting(this.settingsPage)
            .setName("Enable file commands")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableContextMenus)
                    .onChange(async (value) => {
                        this.plugin.settings.enableContextMenus = value;
                        this.plugin.debugLog('enableContextMenus', value);
                        await this.plugin.saveSettings();
                        updateFileUI();
                        updateFolderUI();
                        updateTagUI();
                    });
            });

        contextMenuHeaderToggleSetting.settingEl.addClass('flit-master-toggle');

                this.settingsPage.createEl("br");

        const fileContainer = this.settingsPage.createDiv();
        fileContainer.addClass('flit-master-disable-target');

        const updateFileUI = () => {
            if (this.plugin.settings.enableContextMenus) {
                fileContainer.show();
            } else {
                fileContainer.hide();
            }
        };

        const filePutFirstLineSetting = new Setting(fileContainer)
            .setName("Put first line in title")
            .setDesc("Rename note, even if in excluded folder or with excluded tag.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.filePutFirstLineInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.filePutFirstLineInTitle = value;
                        this.plugin.debugLog('commandVisibility.filePutFirstLineInTitle', value);
                        await this.plugin.saveSettings();
                    })
            );
                const fileIcon = filePutFirstLineSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(fileIcon, "file-pen");
        filePutFirstLineSetting.nameEl.insertBefore(fileIcon, filePutFirstLineSetting.nameEl.firstChild);

        const fileDisableSetting = new Setting(fileContainer)
            .setName("Disable renaming for note")
            .setDesc("Exclude note from renaming.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.fileExclude)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.fileExclude = value;
                        this.plugin.debugLog('commandVisibility.fileExclude', value);
                        await this.plugin.saveSettings();
                    })
            );
                const fileDisableIcon = fileDisableSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(fileDisableIcon, "square-x");
        fileDisableSetting.nameEl.insertBefore(fileDisableIcon, fileDisableSetting.nameEl.firstChild);

        const fileEnableSetting = new Setting(fileContainer)
            .setName("Enable renaming for note")
            .setDesc("Stop excluding note from renaming.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.fileStopExcluding)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.fileStopExcluding = value;
                        this.plugin.debugLog('commandVisibility.fileStopExcluding', value);
                        await this.plugin.saveSettings();
                    })
            );
                const fileEnableIcon = fileEnableSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(fileEnableIcon, "square-check");
        fileEnableSetting.nameEl.insertBefore(fileEnableIcon, fileEnableSetting.nameEl.firstChild);

        // Folder Section
        const folderHeaderSetting = new Setting(this.settingsPage)
            .setName("Enable folder commands")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableContextMenus)
                    .onChange(async (value) => {
                        this.plugin.settings.enableContextMenus = value;
                        await this.plugin.saveSettings();
                        updateFolderUI();
                    });
            });

        folderHeaderSetting.settingEl.addClass('flit-master-toggle');

                this.settingsPage.createEl("br");

        const folderContainer = this.settingsPage.createDiv();
        folderContainer.addClass('flit-master-disable-target');

        const updateFolderUI = () => {
            if (this.plugin.settings.enableContextMenus) {
                folderContainer.show();
            } else {
                folderContainer.hide();
            }
        };

        const folderPutFirstLineSetting = new Setting(folderContainer)
            .setName("Put first line in title")
            .setDesc("Rename all notes in folder.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.folderPutFirstLineInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.folderPutFirstLineInTitle = value;
                        this.plugin.debugLog('commandVisibility.folderPutFirstLineInTitle', value);
                        await this.plugin.saveSettings();
                    })
            );
                const folderIcon = folderPutFirstLineSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(folderIcon, "folder-pen");
        folderPutFirstLineSetting.nameEl.insertBefore(folderIcon, folderPutFirstLineSetting.nameEl.firstChild);

        const folderDisableSetting = new Setting(folderContainer)
            .setName("Disable renaming in folder")
            .setDesc("Exclude folder from renaming.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.folderExclude)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.folderExclude = value;
                        this.plugin.debugLog('commandVisibility.folderExclude', value);
                        await this.plugin.saveSettings();
                    })
            );
                const folderDisableIcon = folderDisableSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(folderDisableIcon, "square-x");
        folderDisableSetting.nameEl.insertBefore(folderDisableIcon, folderDisableSetting.nameEl.firstChild);

        const folderEnableSetting = new Setting(folderContainer)
            .setName("Enable renaming in folder")
            .setDesc("Stop excluding folder from renaming.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.folderStopExcluding)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.folderStopExcluding = value;
                        this.plugin.debugLog('commandVisibility.folderStopExcluding', value);
                        await this.plugin.saveSettings();
                    })
            );
                const folderEnableIcon = folderEnableSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(folderEnableIcon, "square-check");
        folderEnableSetting.nameEl.insertBefore(folderEnableIcon, folderEnableSetting.nameEl.firstChild);

        // Tag Section
        const tagHeaderSetting = new Setting(this.settingsPage)
            .setName("Enable tag commands")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableContextMenus)
                    .onChange(async (value) => {
                        this.plugin.settings.enableContextMenus = value;
                        await this.plugin.saveSettings();
                        updateTagUI();
                    });
            });

        tagHeaderSetting.settingEl.addClass('flit-master-toggle');

                this.settingsPage.createEl("br");

        const tagContainer = this.settingsPage.createDiv();
        tagContainer.addClass('flit-master-disable-target');

        const updateTagUI = () => {
            if (this.plugin.settings.enableContextMenus) {
                tagContainer.show();
            } else {
                tagContainer.hide();
            }
        };

        const tagPutFirstLineSetting = new Setting(tagContainer)
            .setName("Put first line in title")
            .setDesc("Rename all notes with tag.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.tagPutFirstLineInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.tagPutFirstLineInTitle = value;
                        this.plugin.debugLog('commandVisibility.tagPutFirstLineInTitle', value);
                        await this.plugin.saveSettings();
                    })
            );
                const tagIcon = tagPutFirstLineSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(tagIcon, "file-pen");
        tagPutFirstLineSetting.nameEl.insertBefore(tagIcon, tagPutFirstLineSetting.nameEl.firstChild);

        const tagDisableSetting = new Setting(tagContainer)
            .setName("Disable renaming for tag")
            .setDesc("Exclude tag from renaming.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.tagExclude)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.tagExclude = value;
                        this.plugin.debugLog('commandVisibility.tagExclude', value);
                        await this.plugin.saveSettings();
                    })
            );
                const tagDisableIcon = tagDisableSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(tagDisableIcon, "square-x");
        tagDisableSetting.nameEl.insertBefore(tagDisableIcon, tagDisableSetting.nameEl.firstChild);

        const tagEnableSetting = new Setting(tagContainer)
            .setName("Enable renaming for tag")
            .setDesc("Stop excluding tag from renaming.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.tagStopExcluding)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.tagStopExcluding = value;
                        this.plugin.debugLog('commandVisibility.tagStopExcluding', value);
                        await this.plugin.saveSettings();
                    })
            );
                const tagEnableIcon = tagEnableSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(tagEnableIcon, "square-check");
        tagEnableSetting.nameEl.insertBefore(tagEnableIcon, tagEnableSetting.nameEl.firstChild);

        // Vault Search Section
        const vaultSearchHeaderSetting = new Setting(this.settingsPage)
            .setName("Enable vault search commands")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableVaultSearchContextMenu)
                    .onChange(async (value) => {
                        this.plugin.settings.enableVaultSearchContextMenu = value;
                        this.plugin.debugLog('enableVaultSearchContextMenu', value);
                        await this.plugin.saveSettings();
                        updateVaultSearchUI();
                    });
            });

        vaultSearchHeaderSetting.settingEl.addClass('flit-master-toggle');
        vaultSearchHeaderSetting.settingEl.addClass('flit-no-border');

                this.settingsPage.createEl("br");

        // Create dedicated container for vault search content
        const vaultSearchContainer = this.settingsPage.createDiv({ cls: 'flit-vault-search-container' });
        vaultSearchContainer.addClass('flit-master-disable-target');

        const updateVaultSearchUI = () => {
            if (this.plugin.settings.enableVaultSearchContextMenu) {
                vaultSearchContainer.show();
            } else {
                vaultSearchContainer.hide();
            }
        };

        const vaultSearchPutFirstLineSetting = new Setting(vaultSearchContainer)
            .setName("Put first line in title")
            .setDesc("Rename all notes in search results.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.vaultSearchContextMenuVisibility.putFirstLineInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.vaultSearchContextMenuVisibility.putFirstLineInTitle = value;
                        this.plugin.debugLog('vaultSearchContextMenuVisibility.putFirstLineInTitle', value);
                        await this.plugin.saveSettings();
                    })
            );
                const vaultSearchIcon = vaultSearchPutFirstLineSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(vaultSearchIcon, "file-pen");
        vaultSearchPutFirstLineSetting.nameEl.insertBefore(vaultSearchIcon, vaultSearchPutFirstLineSetting.nameEl.firstChild);

        const vaultSearchDisableSetting = new Setting(vaultSearchContainer)
            .setName("Disable renaming for notes")
            .setDesc("Exclude all notes in search results.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.vaultSearchContextMenuVisibility.disable)
                    .onChange(async (value) => {
                        this.plugin.settings.vaultSearchContextMenuVisibility.disable = value;
                        this.plugin.debugLog('vaultSearchContextMenuVisibility.disable', value);
                        await this.plugin.saveSettings();
                    })
            );
                const vaultSearchDisableIcon = vaultSearchDisableSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(vaultSearchDisableIcon, "square-x");
        vaultSearchDisableSetting.nameEl.insertBefore(vaultSearchDisableIcon, vaultSearchDisableSetting.nameEl.firstChild);

        const vaultSearchEnableSetting = new Setting(vaultSearchContainer)
            .setName("Enable renaming for notes")
            .setDesc("Stop excluding all notes in search results from renaming.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.vaultSearchContextMenuVisibility.enable)
                    .onChange(async (value) => {
                        this.plugin.settings.vaultSearchContextMenuVisibility.enable = value;
                        this.plugin.debugLog('vaultSearchContextMenuVisibility.enable', value);
                        await this.plugin.saveSettings();
                    })
            );
                const vaultSearchEnableIcon = vaultSearchEnableSetting.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(vaultSearchEnableIcon, "square-check");
        vaultSearchEnableSetting.nameEl.insertBefore(vaultSearchEnableIcon, vaultSearchEnableSetting.nameEl.firstChild);

        // Initialize all UI states
        updateFileUI();
        updateFolderUI();
        updateTagUI();
        updateVaultSearchUI();
    }

    private renderForbiddenCharsTab(): void {
        if (!this.settingsPage) return;

        // Replace forbidden characters toggle as regular setting
        const headerToggleSetting = new Setting(this.settingsPage)
            .setName("Replace illegal characters")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableForbiddenCharReplacements)
                    .onChange(async (value) => {
                        this.plugin.settings.enableForbiddenCharReplacements = value;
                        this.plugin.debugLog('enableForbiddenCharReplacements', value);

                        // On first enable, turn on all All OSes options
                        if (value && !this.plugin.settings.hasEnabledForbiddenChars) {
                            const allOSesKeys = ['leftBracket', 'rightBracket', 'hash', 'caret', 'pipe', 'backslash', 'slash', 'colon', 'dot'];
                            allOSesKeys.forEach(key => {
                                this.plugin.settings.charReplacementEnabled[key as keyof typeof this.plugin.settings.charReplacementEnabled] = true;
                            });
                            this.plugin.settings.hasEnabledForbiddenChars = true;

                            // If OS is Windows or Android, also enable Windows/Android section
                            const currentOS = detectOS();
                            if ((currentOS === 'Windows' || currentOS === 'Linux') && !this.plugin.settings.hasEnabledWindowsAndroid) {
                                this.plugin.settings.windowsAndroidEnabled = true;
                                const windowsAndroidKeys = ['asterisk', 'quote', 'lessThan', 'greaterThan', 'question'];
                                windowsAndroidKeys.forEach(key => {
                                    this.plugin.settings.charReplacementEnabled[key as keyof typeof this.plugin.settings.charReplacementEnabled] = true;
                                });
                                this.plugin.settings.hasEnabledWindowsAndroid = true;
                            }
                        }

                        await this.plugin.saveSettings();
                        updateCharacterSettings(); // Rebuild to show new toggle states
                        updateCharacterReplacementUI();
                    });
            });

        headerToggleSetting.settingEl.addClass('flit-master-toggle');
        headerToggleSetting.settingEl.addClass('flit-no-border');

        const charDescEl = this.settingsPage.createEl("div", { cls: "setting-item-description" });

        const updateCharDescriptionContent = () => {
            charDescEl.setText("Configure replacements for forbidden filename characters. Characters are omitted entirely if disabled.");
        };

        updateCharDescriptionContent();
        this.settingsPage.createEl("br");
        this.settingsPage.createEl("br");

        // Create char settings container after description and spacing
        const charSettingsContainer = this.settingsPage.createDiv({ cls: "flit-char-settings-container" });

        const updateCharacterReplacementUI = () => {
            // Update master disable state for entire section
            if (this.plugin.settings.enableForbiddenCharReplacements) {
                charSettingsContainer.classList.remove('flit-master-disabled');
            } else {
                charSettingsContainer.classList.add('flit-master-disabled');
            }
        };

        const updateCharacterSettings = () => {
            charSettingsContainer.empty();

            // Define character arrays first
            const primaryCharSettings: Array<{key: keyof typeof this.plugin.settings.charReplacements, name: string, char: string, description?: string}> = [
                { key: 'leftBracket', name: 'Left bracket [', char: '[' },
                { key: 'rightBracket', name: 'Right bracket ]', char: ']' },
                { key: 'hash', name: 'Hash #', char: '#' },
                { key: 'caret', name: 'Caret ^', char: '^' },
                { key: 'pipe', name: 'Pipe |', char: '|' },
                { key: 'backslash', name: 'Backslash \\', char: String.fromCharCode(92), description: 'Note: replacing the backslash disables its use as an escape character for overriding the omission of markdown syntax and HTML tags (if enabled).' },
                { key: 'slash', name: 'Forward slash /', char: '/' },
                { key: 'colon', name: 'Colon :', char: ':' },
                { key: 'dot', name: 'Dot .', char: '.', description: 'Note: the dot is only forbidden at filename start.' }
            ];

            const windowsAndroidChars: Array<{key: keyof typeof this.plugin.settings.charReplacements, name: string, char: string}> = [
                { key: 'asterisk', name: 'Asterisk *', char: '*' },
                { key: 'quote', name: 'Quote "', char: '"' },
                { key: 'lessThan', name: 'Less than <', char: '<' },
                { key: 'greaterThan', name: 'Greater than >', char: '>' },
                { key: 'question', name: 'Question mark ?', char: '?' }
            ];

            // Add All OSes subsection
            const allOSesHeader = charSettingsContainer.createEl('div', { cls: 'flit-char-replacement-section-header' });
            const allOSesTitle = allOSesHeader.createEl('h3', { text: 'All OSes', cls: 'flit-section-title' });

            const allOSesDescContainer = charSettingsContainer.createEl('div');
            const allOSesDesc = allOSesDescContainer.createEl('div', {
                text: 'Replace characters that are forbidden in Obsidian filenames on all OSes.',
                cls: 'setting-item-description'
            });
            allOSesDesc.style.marginBottom = "10px";

            // Create table container for All OSes
            const allOSesTableContainer = charSettingsContainer.createEl('div', { cls: 'flit-table-container' });
            const allOSesTableWrapper = allOSesTableContainer.createEl('div', { cls: 'flit-table-wrapper' });

            // Create header row
            const headerRow = allOSesTableWrapper.createEl('div', { cls: 'flit-char-replacement-header' });

            // Header columns
            const enableHeader = headerRow.createDiv({ cls: "flit-enable-column" });
            enableHeader.textContent = "Enable";

            const charNameHeader = headerRow.createDiv({ cls: "flit-char-name-column" });
            charNameHeader.textContent = "Character";

            const inputHeader = headerRow.createDiv({ cls: "flit-char-text-input-container" });
            inputHeader.textContent = "Replace with";

            const trimLeftHeader = headerRow.createDiv({ cls: "flit-toggle-column center" });
            const trimLeftLine1 = trimLeftHeader.createDiv();
            trimLeftLine1.textContent = "Trim left";

            const trimRightHeader = headerRow.createDiv({ cls: "flit-toggle-column center" });
            const trimRightLine1 = trimRightHeader.createDiv();
            trimRightLine1.textContent = "Trim right";

            // Create rows for each primary character
            primaryCharSettings.forEach(setting => {
                const rowEl = allOSesTableWrapper.createEl('div', { cls: 'flit-char-replacement-setting' });

                // Enable toggle
                const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });
                const toggleSetting = new Setting(document.createElement('div'));
                toggleSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.charReplacementEnabled[setting.key])
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementEnabled[setting.key] = value;
                            this.plugin.debugLog(`charReplacementEnabled.${setting.key}`, value);
                            await this.plugin.saveSettings();
                            // Update row styling based on enabled state
                            updateRowAppearance();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

                // Function to update row appearance based on enabled state
                const updateRowAppearance = () => {
                    const isEnabled = this.plugin.settings.charReplacementEnabled[setting.key];
                    if (isEnabled) {
                        rowEl.classList.remove('flit-row-disabled');
                    } else {
                        rowEl.classList.add('flit-row-disabled');
                    }
                };

                // Character name and description
                const nameContainer = rowEl.createEl("div", { cls: "flit-char-name-column" });
                const nameEl = nameContainer.createEl("div", { text: setting.name, cls: "setting-item-name" });
                if (setting.description) {
                    nameContainer.createEl("div", { text: setting.description, cls: "setting-item-description" });
                }

                // Text input with restore icon
                const inputContainer = rowEl.createDiv({ cls: "flit-char-text-input-container" });

                const restoreButton = inputContainer.createEl("button", {
                    cls: "clickable-icon flit-restore-icon",
                    attr: { "aria-label": "Restore default" }
                });
                setIcon(restoreButton, "rotate-ccw");
                restoreButton.addEventListener('click', async () => {
                    this.plugin.settings.charReplacements[setting.key] = DEFAULT_SETTINGS.charReplacements[setting.key];
                    textInput.value = DEFAULT_SETTINGS.charReplacements[setting.key];
                    await this.plugin.saveSettings();
                });

                const textInput = inputContainer.createEl("input", { type: "text", cls: "flit-char-text-input" });
                textInput.placeholder = "Empty";
                textInput.value = this.plugin.settings.charReplacements[setting.key];
                textInput.style.width = "120px";
                textInput.addEventListener('input', async (e) => {
                    this.plugin.settings.charReplacements[setting.key] = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                });

                // Trim left toggle
                const trimLeftContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const trimLeftSetting = new Setting(document.createElement('div'));
                trimLeftSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.charReplacementTrimLeft[setting.key])
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementTrimLeft[setting.key] = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    trimLeftContainer.appendChild(toggle.toggleEl);
                });

                // Trim right toggle
                const trimRightContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const trimRightSetting = new Setting(document.createElement('div'));
                trimRightSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.charReplacementTrimRight[setting.key])
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementTrimRight[setting.key] = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    trimRightContainer.appendChild(toggle.toggleEl);
                });

                // Initialize row appearance
                updateRowAppearance();
            });

            // Add Windows/Android subsection header
            const windowsAndroidHeader = charSettingsContainer.createEl('div', { cls: 'flit-char-replacement-section-header windows-android' });

            const sectionTitle = windowsAndroidHeader.createEl('h3', { text: 'Windows/Android', cls: 'flit-section-title' });

            // Add toggle for Windows/Android
            const windowsAndroidToggleSetting = new Setting(document.createElement('div'));
            windowsAndroidToggleSetting.addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.windowsAndroidEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.windowsAndroidEnabled = value;
                        this.plugin.debugLog('windowsAndroidEnabled', value);

                        // On first enable, turn on all Windows/Android options
                        if (value && !this.plugin.settings.hasEnabledWindowsAndroid) {
                            windowsAndroidChars.forEach(setting => {
                                this.plugin.settings.charReplacementEnabled[setting.key] = true;
                            });
                            this.plugin.settings.hasEnabledWindowsAndroid = true;
                        }

                        await this.plugin.saveSettings();
                        updateCharacterSettings();
                    });
                toggle.toggleEl.style.margin = "0";
                windowsAndroidHeader.appendChild(toggle.toggleEl);
            });

            const sectionDescContainer = charSettingsContainer.createEl('div');
            const sectionDesc = sectionDescContainer.createEl('div', {
                text: 'Replace characters that are forbidden in Obsidian filenames on Windows and Android only.',
                cls: 'setting-item-description'
            });
            sectionDesc.style.marginBottom = "10px";

            // Create Windows/Android character table
            if (this.plugin.settings.windowsAndroidEnabled) {
                const windowsAndroidTableContainer = charSettingsContainer.createEl('div', { cls: 'flit-table-container' });
                const windowsAndroidTableWrapper = windowsAndroidTableContainer.createEl('div', { cls: 'flit-table-wrapper' });

                // Create header row
                const winAndroidHeaderRow = windowsAndroidTableWrapper.createEl('div', { cls: 'flit-char-replacement-header' });

                // Header columns
                const winEnableHeader = winAndroidHeaderRow.createDiv({ cls: "flit-enable-column" });
                winEnableHeader.textContent = "Enable";

                const winCharNameHeader = winAndroidHeaderRow.createDiv({ cls: "flit-char-name-column" });
                winCharNameHeader.textContent = "Character";

                const winInputHeader = winAndroidHeaderRow.createDiv({ cls: "flit-char-text-input-container" });
                winInputHeader.textContent = "Replace with";

                const winTrimLeftHeader = winAndroidHeaderRow.createDiv({ cls: "flit-toggle-column center" });
                const winTrimLeftLine1 = winTrimLeftHeader.createDiv();
                winTrimLeftLine1.textContent = "Trim left";

                const winTrimRightHeader = winAndroidHeaderRow.createDiv({ cls: "flit-toggle-column center" });
                const winTrimRightLine1 = winTrimRightHeader.createDiv();
                winTrimRightLine1.textContent = "Trim right";

                // Create rows for each Windows/Android character
                windowsAndroidChars.forEach(setting => {
                    const rowEl = windowsAndroidTableWrapper.createEl('div', { cls: 'flit-char-replacement-setting' });

                    // Enable toggle
                    const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });
                    const toggleSetting = new Setting(document.createElement('div'));
                    toggleSetting.addToggle((toggle) => {
                        toggle.setValue(this.plugin.settings.charReplacementEnabled[setting.key])
                            .onChange(async (value) => {
                                this.plugin.settings.charReplacementEnabled[setting.key] = value;
                                this.plugin.debugLog(`charReplacementEnabled.${setting.key}`, value);
                                await this.plugin.saveSettings();
                                // Update row styling based on enabled state
                                updateRowAppearance();
                            });
                        toggle.toggleEl.style.margin = "0";
                        toggleContainer.appendChild(toggle.toggleEl);
                    });

                    // Function to update row appearance based on enabled state
                    const updateRowAppearance = () => {
                        const isEnabled = this.plugin.settings.charReplacementEnabled[setting.key];
                        if (isEnabled) {
                            rowEl.classList.remove('flit-row-disabled');
                        } else {
                            rowEl.classList.add('flit-row-disabled');
                        }
                    };

                    // Character name and description
                    const nameContainer = rowEl.createEl("div", { cls: "flit-char-name-column" });
                    const nameEl = nameContainer.createEl("div", { text: setting.name, cls: "setting-item-name" });

                    // Text input with restore icon
                    const inputContainer = rowEl.createDiv({ cls: "flit-char-text-input-container" });

                    const restoreButton = inputContainer.createEl("button", {
                        cls: "clickable-icon flit-restore-icon",
                        attr: { "aria-label": "Restore default" }
                    });
                    setIcon(restoreButton, "rotate-ccw");
                    restoreButton.addEventListener('click', async () => {
                        this.plugin.settings.charReplacements[setting.key] = DEFAULT_SETTINGS.charReplacements[setting.key];
                        textInput.value = DEFAULT_SETTINGS.charReplacements[setting.key];
                        await this.plugin.saveSettings();
                    });

                    const textInput = inputContainer.createEl("input", { type: "text", cls: "flit-char-text-input" });
                    textInput.placeholder = "Empty";
                    textInput.value = this.plugin.settings.charReplacements[setting.key];
                    textInput.style.width = "120px";
                    textInput.addEventListener('input', async (e) => {
                        this.plugin.settings.charReplacements[setting.key] = (e.target as HTMLInputElement).value;
                        await this.plugin.saveSettings();
                    });

                    // Trim left toggle
                    const trimLeftContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                    const trimLeftSetting = new Setting(document.createElement('div'));
                    trimLeftSetting.addToggle((toggle) => {
                        toggle.setValue(this.plugin.settings.charReplacementTrimLeft[setting.key])
                            .onChange(async (value) => {
                                this.plugin.settings.charReplacementTrimLeft[setting.key] = value;
                                await this.plugin.saveSettings();
                            });
                        toggle.toggleEl.style.margin = "0";
                        trimLeftContainer.appendChild(toggle.toggleEl);
                    });

                    // Trim right toggle
                    const trimRightContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                    const trimRightSetting = new Setting(document.createElement('div'));
                    trimRightSetting.addToggle((toggle) => {
                        toggle.setValue(this.plugin.settings.charReplacementTrimRight[setting.key])
                            .onChange(async (value) => {
                                this.plugin.settings.charReplacementTrimRight[setting.key] = value;
                                await this.plugin.saveSettings();
                            });
                        toggle.toggleEl.style.margin = "0";
                        trimRightContainer.appendChild(toggle.toggleEl);
                    });

                    // Initialize row appearance
                    updateRowAppearance();
                });
            }
        };

        // Initialize character settings and UI
        updateCharacterSettings();
        updateCharacterReplacementUI();


    }

    private renderCustomReplacementsTab(): void {
        if (!this.settingsPage) return;

        // Enable custom replacements toggle as regular setting
        const customHeaderToggleSetting = new Setting(this.settingsPage)
            .setName("Enable custom replacements")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableCustomReplacements)
                    .onChange(async (value) => {
                        this.plugin.settings.enableCustomReplacements = value;
                        this.plugin.debugLog('enableCustomReplacements', value);

                        // On first enable, turn on all leftmost (enabled) toggles in custom replacements
                        if (value && !this.plugin.settings.hasEnabledCustomReplacements) {
                            this.plugin.settings.customReplacements.forEach(replacement => {
                                replacement.enabled = true;
                            });
                            this.plugin.settings.hasEnabledCustomReplacements = true;
                        }

                        await this.plugin.saveSettings();
                        updateCustomReplacementUI();
                        renderCustomReplacements();
                    });
            });

        customHeaderToggleSetting.settingEl.addClass('flit-master-toggle');
        customHeaderToggleSetting.settingEl.addClass('flit-no-border');

        const customDescEl = this.settingsPage.createEl("div", { cls: "setting-item-description" });

        const updateCustomDescriptionContent = () => {
            customDescEl.empty();

            customDescEl.createEl('span', { text: 'Configure custom text replacements.' });
            customDescEl.createEl('br');
            customDescEl.createEl('br');

            const ul = customDescEl.createEl('ul');
            ul.style.margin = '0';
            ul.style.paddingLeft = '20px';

            ul.createEl('li', { text: 'Rules are applied sequentially from top to bottom.' });
            ul.createEl('li', { text: 'Rules are applied before illegal character replacements.' });
            ul.createEl('li', { text: 'Whitespace preserved.' });

            const li3 = ul.createEl('li');
            li3.appendText('Leave ');
            li3.createEl('em', { text: 'Replace with' });
            li3.appendText(' blank to omit text entirely.');

            const li4 = ul.createEl('li');
            li4.appendText('If ');
            li4.createEl('em', { text: 'Replace with' });
            li4.appendText(' is blank and ');
            li4.createEl('em', { text: 'Text to replace' });
            li4.appendText(' matches whole line, filename becomes ');
            li4.createEl('em', { text: 'Untitled' });
            li4.appendText('.');
        };

        updateCustomDescriptionContent();
        this.settingsPage.createEl("br");

        // Create dedicated container for custom replacements table
        const customReplacementsContainer = this.settingsPage.createDiv({ cls: 'flit-custom-replacements-container' });

        const updateCustomReplacementUI = () => {
            // Update master disable state for entire section
            if (this.plugin.settings.enableCustomReplacements) {
                customReplacementsContainer.classList.remove('flit-master-disabled');
            } else {
                customReplacementsContainer.classList.add('flit-master-disabled');
            }
        };

        const renderCustomReplacements = () => {
            // Clear existing custom replacement settings in the dedicated container
            customReplacementsContainer.empty();

            // Clear existing add button
            const existingAddButton = this.settingsPage.querySelector('.flit-add-replacement-button');
            if (existingAddButton) existingAddButton.remove();

            // Create table container
            const tableContainer = customReplacementsContainer.createEl('div', { cls: 'flit-table-container flit-custom-table-container' });
            const tableWrapper = tableContainer.createEl('div', { cls: 'flit-table-wrapper' });

            // Create header row with column titles
            const headerRow = tableWrapper.createEl('div', { cls: 'flit-custom-replacement-header' });

            // Header for toggle
            const enableHeader = headerRow.createDiv({ cls: "flit-enable-column" });
            enableHeader.textContent = "Enable";

            // Headers for input fields
            const textToReplaceHeader = headerRow.createDiv({ cls: "flit-text-column" });
            textToReplaceHeader.textContent = "Text to replace";

            const replaceWithHeader = headerRow.createDiv({ cls: "flit-text-column" });
            replaceWithHeader.textContent = "Replace with";

            // Headers for toggle switches
            const startOnlyHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const startLine1 = startOnlyHeader.createDiv();
            startLine1.textContent = "Only match";
            const startLine2 = startOnlyHeader.createDiv();
            startLine2.textContent = "line start";

            const wholeLineHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const wholeLine1 = wholeLineHeader.createDiv();
            wholeLine1.textContent = "Only match";
            const wholeLine2 = wholeLineHeader.createDiv();
            wholeLine2.textContent = "whole line";

            // Empty header for action buttons
            const actionsHeader = headerRow.createDiv({ cls: "flit-actions-column" });
            actionsHeader.textContent = "";

            this.plugin.settings.customReplacements.forEach((replacement, index) => {
                const rowEl = tableWrapper.createEl('div', { cls: 'flit-custom-replacement-setting' });
                let deleteButton: any;

                let updateButtonState: () => void; // Declare function to be defined later

                // Create toggle container with fixed width
                const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });

                // Create individual toggle
                const individualToggleSetting = new Setting(document.createElement('div'));
                individualToggleSetting.addToggle((toggle) => {
                    toggle.setValue(replacement.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.customReplacements[index].enabled = value;
                            this.plugin.debugLog(`customReplacements[${index}].enabled`, value);
                            await this.plugin.saveSettings();
                            // Update row styling based on enabled state
                            updateRowAppearance();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

                // Function to update row appearance based on enabled state
                const updateRowAppearance = () => {
                    const isEnabled = this.plugin.settings.customReplacements[index].enabled;
                    // Grey out and disable inputs and toggles but not reorder/delete buttons
                    if (isEnabled) {
                        input1.style.opacity = "1";
                        input1.style.pointerEvents = "auto";
                        input1.disabled = false;
                        input2.style.opacity = "1";
                        input2.style.pointerEvents = "auto";
                        input2.disabled = false;
                        startToggleContainer.style.opacity = "1";
                        startToggleContainer.style.pointerEvents = "auto";
                        wholeToggleContainer.style.opacity = "1";
                        wholeToggleContainer.style.pointerEvents = "auto";
                    } else {
                        input1.style.opacity = "0.5";
                        input1.style.pointerEvents = "none";
                        input1.disabled = true;
                        input2.style.opacity = "0.5";
                        input2.style.pointerEvents = "none";
                        input2.disabled = true;
                        startToggleContainer.style.opacity = "0.5";
                        startToggleContainer.style.pointerEvents = "none";
                        wholeToggleContainer.style.opacity = "0.5";
                        wholeToggleContainer.style.pointerEvents = "none";
                    }
                };

                // Create text input 1 container and input
                const input1Container = rowEl.createDiv({ cls: "flit-text-column" });
                const input1 = input1Container.createEl("input", { type: "text" });
                input1.placeholder = "Empty";
                input1.value = replacement.searchText;
                input1.addEventListener('input', async (e) => {
                    this.plugin.settings.customReplacements[index].searchText = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                    updateButtonState();
                });

                // Create text input 2 container and input
                const input2Container = rowEl.createDiv({ cls: "flit-text-column" });
                const input2 = input2Container.createEl("input", { type: "text" });
                input2.placeholder = "Empty";
                input2.value = replacement.replaceText;
                input2.addEventListener('input', async (e) => {
                    this.plugin.settings.customReplacements[index].replaceText = (e.target as HTMLInputElement).value;
                    await this.plugin.saveSettings();
                    updateButtonState();
                });

                // Create toggle for "Match at line start only"
                const startToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const startToggleSetting = new Setting(document.createElement('div'));
                startToggleSetting.addToggle((toggle) => {
                    toggle.setValue(replacement.onlyAtStart)
                        .onChange(async (value) => {
                            this.plugin.settings.customReplacements[index].onlyAtStart = value;
                            if (value) {
                                this.plugin.settings.customReplacements[index].onlyWholeLine = false;
                            }
                            await this.plugin.saveSettings();
                            renderCustomReplacements();
                        });
                    toggle.toggleEl.style.margin = "0";
                    // Disable if whole line is checked
                    if (replacement.onlyWholeLine) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.style.opacity = "0.5";
                        toggle.toggleEl.style.pointerEvents = "none";
                    }
                    startToggleContainer.appendChild(toggle.toggleEl);
                });

                // Create toggle for "Match whole line only"
                const wholeToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const wholeToggleSetting = new Setting(document.createElement('div'));
                wholeToggleSetting.addToggle((toggle) => {
                    toggle.setValue(replacement.onlyWholeLine)
                        .onChange(async (value) => {
                            this.plugin.settings.customReplacements[index].onlyWholeLine = value;
                            if (value) {
                                this.plugin.settings.customReplacements[index].onlyAtStart = false;
                            }
                            await this.plugin.saveSettings();
                            renderCustomReplacements();
                        });
                    toggle.toggleEl.style.margin = "0";
                    // Disable if start only is checked
                    if (replacement.onlyAtStart) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.style.opacity = "0.5";
                        toggle.toggleEl.style.pointerEvents = "none";
                    }
                    wholeToggleContainer.appendChild(toggle.toggleEl);
                });

                // Create button container for action buttons
                const buttonContainer = rowEl.createDiv({ cls: "flit-actions-column flit-button-container" });

                // Create up arrow button
                const upButton = buttonContainer.createEl("button", {
                    cls: "clickable-icon flit-nav-button",
                    attr: { "aria-label": "Move up" }
                });
                if (index === 0) {
                    upButton.classList.add('disabled');
                }
                setIcon(upButton, "chevron-up");

                if (index > 0) {
                    upButton.addEventListener('click', async () => {
                        const temp = this.plugin.settings.customReplacements[index];
                        this.plugin.settings.customReplacements[index] = this.plugin.settings.customReplacements[index - 1];
                        this.plugin.settings.customReplacements[index - 1] = temp;
                        await this.plugin.saveSettings();
                        renderCustomReplacements();
                    });
                }

                // Create down arrow button
                const downButton = buttonContainer.createEl("button", {
                    cls: "clickable-icon flit-nav-button",
                    attr: { "aria-label": "Move down" }
                });
                if (index === this.plugin.settings.customReplacements.length - 1) {
                    downButton.classList.add('disabled');
                }
                setIcon(downButton, "chevron-down");

                if (index < this.plugin.settings.customReplacements.length - 1) {
                    downButton.addEventListener('click', async () => {
                        const temp = this.plugin.settings.customReplacements[index];
                        this.plugin.settings.customReplacements[index] = this.plugin.settings.customReplacements[index + 1];
                        this.plugin.settings.customReplacements[index + 1] = temp;
                        await this.plugin.saveSettings();
                        renderCustomReplacements();
                    });
                }

                // Create delete button matching ExtraButton structure
                deleteButton = buttonContainer.createEl("button", {
                    cls: "flit-delete-button",
                    attr: { "aria-label": "Delete", "type": "button" }
                });
                setIcon(deleteButton, "x");

                deleteButton.addEventListener('click', async () => {
                    if (this.plugin.settings.customReplacements.length === 1) {
                        // If it's the last entry, replace with empty one instead of removing
                        this.plugin.settings.customReplacements[0] = {
                            searchText: "",
                            replaceText: "",
                            enabled: true,
                            onlyAtStart: false,
                            onlyWholeLine: false
                        };
                    } else {
                        this.plugin.settings.customReplacements.splice(index, 1);
                    }
                    await this.plugin.saveSettings();
                    renderCustomReplacements();
                });

                // Define updateButtonState function now that all buttons are created
                updateButtonState = () => {
                    const isLastEmptyEntry = this.plugin.settings.customReplacements.length === 1 &&
                                              this.plugin.settings.customReplacements[0].searchText.trim() === "" &&
                                              this.plugin.settings.customReplacements[0].replaceText.trim() === "";

                    // Update delete button state
                    if (isLastEmptyEntry) {
                        deleteButton.classList.add('disabled');
                        deleteButton.removeAttribute('aria-label');
                        deleteButton.title = "";
                    } else {
                        deleteButton.classList.remove('disabled');
                        deleteButton.setAttribute('aria-label', 'Remove');
                        deleteButton.title = "Remove";
                    }

                    // Update up button state
                    if (index === 0 || isLastEmptyEntry) {
                        upButton.classList.add('disabled');
                    } else {
                        upButton.classList.remove('disabled');
                    }

                    // Update down button state
                    if (index === this.plugin.settings.customReplacements.length - 1 || isLastEmptyEntry) {
                        downButton.classList.add('disabled');
                    } else {
                        downButton.classList.remove('disabled');
                    }
                };

                // Initial button state
                updateButtonState();

                // Initialize row appearance
                updateRowAppearance();
            });

            // Always add the "Add replacement" button at the end
            const addButtonSetting = new Setting(customReplacementsContainer)
                .addButton((button) =>
                    button.setButtonText("Add replacement").onClick(async () => {
                        this.plugin.settings.customReplacements.push({
                            searchText: "",
                            replaceText: "",
                            onlyAtStart: false,
                            onlyWholeLine: false,
                            enabled: true
                        });
                        await this.plugin.saveSettings();
                        renderCustomReplacements();
                    })
                );
            addButtonSetting.settingEl.addClass('flit-add-replacement-button');
            addButtonSetting.settingEl.addClass('flit-master-disable-target');

            // Update UI state after rendering
            updateCustomReplacementUI();
        };

        renderCustomReplacements();

    }

    private renderSafewordsTab(): void {
        if (!this.settingsPage) return;

        // Enable safewords toggle as regular setting
        const safewordsHeaderToggleSetting = new Setting(this.settingsPage)
            .setName("Enable safewords")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableSafewords)
                    .onChange(async (value) => {
                        this.plugin.settings.enableSafewords = value;
                        this.plugin.debugLog('enableSafewords', value);

                        // On first enable, turn on all leftmost (enabled) toggles in safewords
                        if (value && !this.plugin.settings.hasEnabledSafewords) {
                            this.plugin.settings.safewords.forEach(safeword => {
                                safeword.enabled = true;
                            });
                            this.plugin.settings.hasEnabledSafewords = true;
                        }

                        await this.plugin.saveSettings();
                        updateSafewordsUI();
                        renderSafewords();
                    });
            });

        safewordsHeaderToggleSetting.settingEl.addClass('flit-master-toggle');
        safewordsHeaderToggleSetting.settingEl.addClass('flit-no-border');

        const safewordsDescEl = this.settingsPage.createEl("div", { cls: "setting-item-description" });

        const updateSafewordsDescriptionContent = () => {
            safewordsDescEl.empty();
            safewordsDescEl.createEl('span', { text: 'Specify text that prevents renaming if matched in filename.' });
        };

        updateSafewordsDescriptionContent();
        this.settingsPage.createEl("br");

        // Create dedicated container for safewords content
        const safewordsContainer = this.settingsPage.createDiv({ cls: 'flit-safewords-container' });

        const updateSafewordsUI = () => {
            // Update master disable state for entire section
            if (this.plugin.settings.enableSafewords) {
                safewordsContainer.classList.remove('flit-master-disabled');
            } else {
                safewordsContainer.classList.add('flit-master-disabled');
            }
        };

        const renderSafewords = () => {
            // Clear the safewords container content
            safewordsContainer.empty();

            // Clear existing add button
            const existingAddButton = this.settingsPage.querySelector('.flit-add-safeword-button');
            if (existingAddButton) existingAddButton.remove();

            // Create table container
            const tableContainer = safewordsContainer.createEl('div', { cls: 'flit-table-container flit-safeword-table-container' });
            const tableWrapper = tableContainer.createEl('div', { cls: 'flit-table-wrapper' });

            // Create header row with column titles
            const headerRow = tableWrapper.createEl('div', { cls: 'flit-safeword-header' });

            // Header for toggle
            const enableHeader = headerRow.createDiv({ cls: "flit-enable-column" });
            enableHeader.textContent = "Enable";

            // Header for input field
            const safewordHeader = headerRow.createDiv({ cls: "flit-text-column flit-safeword-input" });
            safewordHeader.textContent = "Safeword";

            // Headers for toggle switches
            const startOnlyHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const startLine1 = startOnlyHeader.createDiv();
            startLine1.textContent = "Only match";
            const startLine2 = startOnlyHeader.createDiv();
            startLine2.textContent = "filename start";

            const wholeLineHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const wholeLine1 = wholeLineHeader.createDiv();
            wholeLine1.textContent = "Only match";
            const wholeLine2 = wholeLineHeader.createDiv();
            wholeLine2.textContent = "whole";
            const wholeLine3 = wholeLineHeader.createDiv();
            wholeLine3.textContent = "filename";

            const caseSensitiveHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const caseLine1 = caseSensitiveHeader.createDiv();
            caseLine1.textContent = "Case-";
            const caseLine2 = caseSensitiveHeader.createDiv();
            caseLine2.textContent = "sensitive";

            // Empty header for action buttons
            const actionsHeader = headerRow.createDiv({ cls: "flit-actions-column" });
            actionsHeader.textContent = "";

            this.plugin.settings.safewords.forEach((safeword, index) => {
                const rowEl = tableWrapper.createEl('div', { cls: 'flit-safeword-setting' });
                let deleteButton: any;

                let updateButtonState: () => void; // Declare function to be defined later

                // Create toggle container with fixed width
                const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });

                // Create individual toggle
                const individualToggleSetting = new Setting(document.createElement('div'));
                individualToggleSetting.addToggle((toggle) => {
                    toggle.setValue(safeword.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.safewords[index].enabled = value;
                            this.plugin.debugLog(`safewords[${index}].enabled`, value);
                            await this.plugin.saveSettings();
                            // Update row styling based on enabled state
                            updateRowAppearance();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

                // Function to update row appearance based on enabled state
                const updateRowAppearance = () => {
                    const isEnabled = this.plugin.settings.safewords[index].enabled;
                    // Grey out and disable inputs and toggles but not reorder/delete buttons
                    if (isEnabled) {
                        input.style.opacity = "1";
                        input.style.pointerEvents = "auto";
                        input.disabled = false;
                        startToggleContainer.style.opacity = "1";
                        startToggleContainer.style.pointerEvents = "auto";
                        wholeToggleContainer.style.opacity = "1";
                        wholeToggleContainer.style.pointerEvents = "auto";
                        caseToggleContainer.style.opacity = "1";
                        caseToggleContainer.style.pointerEvents = "auto";
                    } else {
                        input.style.opacity = "0.5";
                        input.style.pointerEvents = "none";
                        input.disabled = true;
                        startToggleContainer.style.opacity = "0.5";
                        startToggleContainer.style.pointerEvents = "none";
                        wholeToggleContainer.style.opacity = "0.5";
                        wholeToggleContainer.style.pointerEvents = "none";
                        caseToggleContainer.style.opacity = "0.5";
                        caseToggleContainer.style.pointerEvents = "none";
                    }
                };

                // Create text input container and input
                const inputContainer = rowEl.createDiv({ cls: "flit-text-column flit-safeword-input" });
                const input = inputContainer.createEl("input", { type: "text" });
                input.placeholder = "Empty";
                input.value = safeword.text;
                input.addEventListener('input', async (e) => {
                    const inputEl = e.target as HTMLInputElement;
                    let value = inputEl.value;

                    // Define forbidden characters
                    const universalForbidden = ['/', ':', '|', String.fromCharCode(92), '#', '[', ']', '^'];
                    const windowsAndroidForbidden = ['*', '?', '<', '>', '"'];

                    let forbiddenChars = [...universalForbidden];
                    if (this.plugin.settings.osPreset === 'Windows' || this.plugin.settings.osPreset === 'Linux') {
                        forbiddenChars.push(...windowsAndroidForbidden);
                    }

                    // Filter out forbidden characters
                    let filteredValue = '';
                    for (let i = 0; i < value.length; i++) {
                        const char = value[i];

                        // Special case for dot: forbidden only at start
                        if (char === '.' && i === 0) {
                            continue; // Skip dot at start
                        }

                        // Skip other forbidden characters
                        if (forbiddenChars.includes(char)) {
                            continue;
                        }

                        filteredValue += char;
                    }

                    // Update input if value changed
                    if (filteredValue !== value) {
                        inputEl.value = filteredValue;
                        // Restore cursor position
                        const cursorPos = Math.min(inputEl.selectionStart || 0, filteredValue.length);
                        inputEl.setSelectionRange(cursorPos, cursorPos);
                    }

                    this.plugin.settings.safewords[index].text = filteredValue;
                    await this.plugin.saveSettings();
                    updateButtonState();
                });

                // Create toggle for "Match at line start only"
                const startToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const startToggleSetting = new Setting(document.createElement('div'));
                startToggleSetting.addToggle((toggle) => {
                    toggle.setValue(safeword.onlyAtStart)
                        .onChange(async (value) => {
                            this.plugin.settings.safewords[index].onlyAtStart = value;
                            if (value) {
                                this.plugin.settings.safewords[index].onlyWholeLine = false;
                            }
                            await this.plugin.saveSettings();
                            renderSafewords();
                        });
                    toggle.toggleEl.style.margin = "0";
                    // Disable if whole line is checked
                    if (safeword.onlyWholeLine) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.style.opacity = "0.5";
                        toggle.toggleEl.style.pointerEvents = "none";
                    }
                    startToggleContainer.appendChild(toggle.toggleEl);
                });

                // Create toggle for "Match whole line only"
                const wholeToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const wholeToggleSetting = new Setting(document.createElement('div'));
                wholeToggleSetting.addToggle((toggle) => {
                    toggle.setValue(safeword.onlyWholeLine)
                        .onChange(async (value) => {
                            this.plugin.settings.safewords[index].onlyWholeLine = value;
                            if (value) {
                                this.plugin.settings.safewords[index].onlyAtStart = false;
                            }
                            await this.plugin.saveSettings();
                            renderSafewords();
                        });
                    toggle.toggleEl.style.margin = "0";
                    // Disable if start only is checked
                    if (safeword.onlyAtStart) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.style.opacity = "0.5";
                        toggle.toggleEl.style.pointerEvents = "none";
                    }
                    wholeToggleContainer.appendChild(toggle.toggleEl);
                });

                // Create toggle for "Case sensitive"
                const caseToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const caseToggleSetting = new Setting(document.createElement('div'));
                caseToggleSetting.addToggle((toggle) => {
                    toggle.setValue(safeword.caseSensitive)
                        .onChange(async (value) => {
                            this.plugin.settings.safewords[index].caseSensitive = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    caseToggleContainer.appendChild(toggle.toggleEl);
                });

                // Create button container for action buttons
                const buttonContainer = rowEl.createDiv({ cls: "flit-actions-column flit-button-container" });

                // Create up arrow button
                const upButton = buttonContainer.createEl("button", {
                    cls: "clickable-icon flit-nav-button",
                    attr: { "aria-label": "Move up" }
                });
                if (index === 0) {
                    upButton.classList.add('disabled');
                }
                setIcon(upButton, "chevron-up");

                if (index > 0) {
                    upButton.addEventListener('click', async () => {
                        const temp = this.plugin.settings.safewords[index];
                        this.plugin.settings.safewords[index] = this.plugin.settings.safewords[index - 1];
                        this.plugin.settings.safewords[index - 1] = temp;
                        await this.plugin.saveSettings();
                        renderSafewords();
                    });
                }

                // Create down arrow button
                const downButton = buttonContainer.createEl("button", {
                    cls: "clickable-icon flit-nav-button",
                    attr: { "aria-label": "Move down" }
                });
                if (index === this.plugin.settings.safewords.length - 1) {
                    downButton.classList.add('disabled');
                }
                setIcon(downButton, "chevron-down");

                if (index < this.plugin.settings.safewords.length - 1) {
                    downButton.addEventListener('click', async () => {
                        const temp = this.plugin.settings.safewords[index];
                        this.plugin.settings.safewords[index] = this.plugin.settings.safewords[index + 1];
                        this.plugin.settings.safewords[index + 1] = temp;
                        await this.plugin.saveSettings();
                        renderSafewords();
                    });
                }

                // Create delete button matching ExtraButton structure
                deleteButton = buttonContainer.createEl("button", {
                    cls: "flit-delete-button",
                    attr: { "aria-label": "Delete", "type": "button" }
                });
                setIcon(deleteButton, "x");

                deleteButton.addEventListener('click', async () => {
                    if (this.plugin.settings.safewords.length === 1) {
                        // If it's the last entry, replace with empty one instead of removing
                        this.plugin.settings.safewords[0] = {
                            text: "",
                            enabled: true,
                            onlyAtStart: false,
                            onlyWholeLine: false,
                            caseSensitive: false
                        };
                    } else {
                        this.plugin.settings.safewords.splice(index, 1);
                    }
                    await this.plugin.saveSettings();
                    renderSafewords();
                });

                // Define updateButtonState function now that all buttons are created
                updateButtonState = () => {
                    const isLastEmptyEntry = this.plugin.settings.safewords.length === 1 &&
                                              this.plugin.settings.safewords[0].text.trim() === "";

                    // Update delete button state
                    if (isLastEmptyEntry) {
                        deleteButton.classList.add('disabled');
                        deleteButton.removeAttribute('aria-label');
                        deleteButton.title = "";
                    } else {
                        deleteButton.classList.remove('disabled');
                        deleteButton.setAttribute('aria-label', 'Remove');
                        deleteButton.title = "Remove";
                    }

                    // Update up button state
                    if (index === 0 || isLastEmptyEntry) {
                        upButton.classList.add('disabled');
                    } else {
                        upButton.classList.remove('disabled');
                    }

                    // Update down button state
                    if (index === this.plugin.settings.safewords.length - 1 || isLastEmptyEntry) {
                        downButton.classList.add('disabled');
                    } else {
                        downButton.classList.remove('disabled');
                    }
                };

                // Initial button state
                updateButtonState();

                // Initialize row appearance
                updateRowAppearance();
            });

            // Always add the "Add safeword" button at the end
            const addButtonSetting = new Setting(this.settingsPage)
                .addButton((button) =>
                    button.setButtonText("Add safeword").onClick(async () => {
                        this.plugin.settings.safewords.push({
                            text: "",
                            onlyAtStart: false,
                            onlyWholeLine: false,
                            enabled: true,
                            caseSensitive: false
                        });
                        await this.plugin.saveSettings();
                        renderSafewords();
                    })
                );
            addButtonSetting.settingEl.addClass('flit-add-safeword-button');
            addButtonSetting.settingEl.addClass('flit-master-disable-target');

            // Update UI state after rendering
            updateSafewordsUI();
        };

        renderSafewords();

    }

    private renderAdvancedTab(): void {
        if (!this.settingsPage) return;

        // Omit comments setting
        new Setting(this.settingsPage)
            .setName("Omit comments")
            .setDesc("Omit %%markdown%% and <!--HTML--> comments in title.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.omitComments)
                    .onChange(async (value) => {
                        this.plugin.settings.omitComments = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Omit HTML tags setting
        new Setting(this.settingsPage)
            .setName("Omit HTML tags")
            .setDesc("Omit HTML tags like <u> in title.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.omitHtmlTags)
                    .onChange(async (value) => {
                        this.plugin.settings.omitHtmlTags = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Don't rename Excalidraw files setting
        new Setting(this.settingsPage)
            .setName("Don't rename Excalidraw files")
            .setDesc("Notes with the property 'excalidraw-plugin: parsed' won't be renamed.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.skipExcalidrawFiles)
                    .onChange(async (value) => {
                        this.plugin.settings.skipExcalidrawFiles = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Grab title from card link setting
        const cardLinkSetting = new Setting(this.settingsPage)
            .setName("Grab title from card link");

        const cardLinkDesc = cardLinkSetting.descEl;
        cardLinkDesc.appendText("If a note starts with a card link created with ");
        cardLinkDesc.createEl("em", { text: "Link Embed" });
        cardLinkDesc.appendText(" or ");
        cardLinkDesc.createEl("em", { text: "Auto Card Link" });
        cardLinkDesc.appendText("plugins, the card link title will be put in title.");

        cardLinkSetting.addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.grabTitleFromCardLink)
                .onChange(async (value) => {
                    this.plugin.settings.grabTitleFromCardLink = value;
                    await this.plugin.saveSettings();
                })
        );

        // File read method setting
        new Setting(this.settingsPage)
            .setName("Use direct file read")
            .setDesc("Read directly from disk instead of file cache. Can resolve issues with other plugins but may be slower.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.useDirectFileRead)
                    .onChange(async (value) => {
                        this.plugin.settings.useDirectFileRead = value;
                        await this.plugin.saveSettings();
                    })
            );

        // Check interval setting
        const checkIntervalSetting = new Setting(this.settingsPage)
            .setName("Check interval")
            .setDesc(createFragment(fragment => {
                fragment.createSpan({ text: "Interval in milliseconds of how often to rename notes while editing. Increase in case of issues. " });
                fragment.createEl("br");
                const noteSpan = fragment.createSpan({ text: "Note: lower values may cause errors when using " });
                noteSpan.createEl("em", { text: "Web Clipper" });
                noteSpan.createSpan({ text: " or if " });
                noteSpan.createEl("em", { text: "Templater" });
                noteSpan.createSpan({ text: " is set to trigger on note creation." });
                fragment.createEl("br");
                fragment.createEl("small").createEl("strong", { text: "Default: 600" });
            }));

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
            await this.plugin.saveSettings();
        });

        checkIntervalTextInput.addEventListener('input', async (e) => {
            const value = (e.target as HTMLInputElement).value;
            if (value === '') {
                this.plugin.settings.checkInterval = DEFAULT_SETTINGS.checkInterval;
            } else if (!isNaN(Number(value))) {
                this.plugin.settings.checkInterval = Number(value);
            }
            await this.plugin.saveSettings();
        });

        // Debug setting
        new Setting(this.settingsPage)
            .setName("Debug")
            .setDesc("Log all of the plugin's activity to the developer console.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.verboseLogging)
                    .onChange(async (value) => {
                        this.plugin.settings.verboseLogging = value;
                        this.plugin.debugLog('verboseLogging', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Clear all settings
        new Setting(this.settingsPage)
            .setName("Clear settings")
            .setDesc("Reset all plugin settings to their default values.")
            .addButton((button) => {
                button
                    .setButtonText("Clear")
                    .setWarning()
                    .onClick(async () => {
                        new ClearSettingsModal(this.app, this.plugin, async () => {
                            // Reset all settings to defaults with deep copy
                            this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

                            // Ensure scope strategy is explicitly set to default
                            this.plugin.settings.scopeStrategy = 'Enable in all notes except below';

                            // Save the cleared settings
                            await this.plugin.saveSettings();

                            // Show notification
                            new Notice("Settings have been cleared.");

                            // Force complete UI rebuild with multiple refreshes
                            this.containerEl.empty();
                            this.display();

                            // Additional refresh with delay to ensure UI elements are properly initialized
                            setTimeout(() => {
                                this.containerEl.empty();
                                this.display();
                            }, 50);
                        }).open();
                    });
            });
    }
}
