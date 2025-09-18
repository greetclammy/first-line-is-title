import { PluginSettingTab, Setting, App, setIcon, TFolder } from "obsidian";
import { PluginSettings, CustomReplacement, Safeword } from './types';
import { detectOS } from './utils';
import { OS_FORBIDDEN_CHARS } from './constants';
import { FolderSuggest, TagSuggest } from './suggests';

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
        EXCLUSIONS: { id: 'exclusions', name: 'Exclusions' },
        FORBIDDEN_CHARS: { id: 'forbidden-chars', name: 'Forbidden character replacements' },
        CUSTOM_REPLACEMENTS: { id: 'custom-replacements', name: 'Custom replacements' },
        SAFEWORDS: { id: 'safewords', name: 'Safewords' },
        COMMANDS: { id: 'commands', name: 'Commands' },
        PLUGIN_SUPPORT: { id: 'plugin-support', name: 'Support for other plugins' },
        ADVANCED: { id: 'advanced', name: 'Advanced' }
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
            case 'exclusions':
                this.renderExclusionsTab();
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
            case 'plugin-support':
                this.renderPluginSupportTab();
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

        new Setting(this.settingsPage)
            .setName("Rename automatically")
            .setDesc("Renames files automatically when the first line changes. If disabled, files will only be renamed when invoking a command manually.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameAutomatically)
                    .onChange(async (value) => {
                        this.plugin.settings.renameAutomatically = value;
                        await this.plugin.saveSettings();
                    })
            );


        new Setting(this.settingsPage)
            .setName("Rename on focus")
            .setDesc(createFragment(fragment => {
                fragment.createSpan({ text: "Automatically rename files when they become focused/active. " });
                fragment.createEl("br");
                const noteSpan = fragment.createSpan({ text: "Note: may cause errors when using " });
                noteSpan.createEl("em", { text: "Web Clipper" });
                noteSpan.createSpan({ text: " or if " });
                noteSpan.createEl("em", { text: "Templater" });
                noteSpan.createSpan({ text: " is set to trigger on file creation." });
            }))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.renameOnFocus)
                    .onChange(async (value) => {
                        this.plugin.settings.renameOnFocus = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.settingsPage)
            .setName("Show notification when renaming manually")
            .setDesc("Controls when to show notifications for the 'Put first line in title' command.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('Always', 'Always')
                    .addOption('On title change', 'On title change')
                    .addOption('Never', 'Never')
                    .setValue(this.plugin.settings.manualNotificationMode)
                    .onChange(async (value: NotificationMode) => {
                        this.plugin.settings.manualNotificationMode = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.settingsPage)
            .setName("Rename all files")
            .setDesc("Rename all files except those in excluded folders. Can also be run from the Command palette.")
            .addButton((button) =>
                button.setButtonText("Rename").onClick(() => {
                    new RenameAllFilesModal(this.app, this.plugin).open();
                })
            );

        const propertyDisableSetting = new Setting(this.settingsPage)
            .setName("Property to disable renaming")
            .setDesc("Define the key:property pair that will disable renaming for files that contain it. Case-insensetive.");
        
        const propertyContainer = propertyDisableSetting.controlEl.createDiv({ cls: "flit-property-disable-container" });
        propertyContainer.style.display = "flex";
        propertyContainer.style.gap = "10px";
        
        const keyInput = propertyContainer.createEl("input", { type: "text" });
        keyInput.placeholder = "key";
        keyInput.style.width = "120px";
        keyInput.value = this.plugin.settings.disableRenamingKey;
        keyInput.addEventListener('input', async (e) => {
            this.plugin.settings.disableRenamingKey = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
        });
        
        const valueInput = propertyContainer.createEl("input", { type: "text" });
        valueInput.placeholder = "value";
        valueInput.style.width = "120px";
        valueInput.value = this.plugin.settings.disableRenamingValue;
        valueInput.addEventListener('input', async (e) => {
            this.plugin.settings.disableRenamingValue = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
        });

        new Setting(this.settingsPage)
            .setName("Character count")
            .setDesc(createFragment(fragment => {
                fragment.createSpan({ text: "The maximum number of characters to put in title. Up to 255 characters." });
                fragment.createEl("br");
                fragment.createEl("small").createEl("strong", { text: "Default: 100" });
            }))
            .addText((text) =>
                text
                    .setPlaceholder("Empty")
                    .setValue(String(this.plugin.settings.charCount))
                    .onChange(async (value) => {
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
                    })
            );
    }

    private renderExclusionsTab(): void {
        if (!this.settingsPage) return;

        // Folders subsection
        this.settingsPage.createEl("h4", { text: "Folders" });

        // Exclude subfolders setting under Folders heading
        const subfolderSetting = new Setting(this.settingsPage)
            .setName("Exclude subfolders")
            .setDesc("Exclude all subfolders of excluded folders.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.excludeSubfolders)
                    .onChange(async (value) => {
                        this.plugin.settings.excludeSubfolders = value;
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
                            this.plugin.settings.excludedFolders.push("");
                            await this.plugin.saveSettings();
                            renderExcludedFolders();
                        });
                });
            addButtonSetting.settingEl.addClass('flit-add-folder-button');
        };

        renderExcludedFolders();

        // Tags subsection
        this.settingsPage.createEl("h4", { text: "Tags" });

        // Create a container for tag settings that will stay in place
        const tagContainer = this.settingsPage.createDiv();

        const renderExcludedTags = () => {
            // Clear only the tag container
            tagContainer.empty();

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
                            this.plugin.settings.excludedTags.push("");
                            await this.plugin.saveSettings();
                            renderExcludedTags();
                        });
                });
            addTagButtonSetting.settingEl.addClass('flit-add-folder-button');
        };

        renderExcludedTags();
    }

    private renderCommandsTab(): void {
        if (!this.settingsPage) return;

        this.settingsPage.createEl("p", {
            text: "Control which commands appear in context menus for files and folders.",
            cls: "setting-item-description"
        });

        new Setting(this.settingsPage)
            .setName("Put first line in title (note)")
            .setDesc("Show command to process individual note.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.filePutFirstLineInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.filePutFirstLineInTitle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.settingsPage)
            .setName("Put first line in title (folder)")
            .setDesc("Show command to process all notes in folder.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.folderPutFirstLineInTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.folderPutFirstLineInTitle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.settingsPage)
            .setName("Disable renaming in folder")
            .setDesc("Show command to exclude folder.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.folderExclude)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.folderExclude = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(this.settingsPage)
            .setName("Enable renaming in folder")
            .setDesc("Show command to remove folder from excluded folders.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.folderStopExcluding)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.folderStopExcluding = value;
                        await this.plugin.saveSettings();
                    })
            );
    }

    private renderPluginSupportTab(): void {
        if (!this.settingsPage) return;

        new Setting(this.settingsPage)
            .setName("Don't rename Excalidraw files")
            .setDesc("Files that have the property `excalidraw-plugin: parsed` won't be renamed.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.skipExcalidrawFiles)
                    .onChange(async (value) => {
                        this.plugin.settings.skipExcalidrawFiles = value;
                        await this.plugin.saveSettings();
                    })
            );

        const cardLinkSetting = new Setting(this.settingsPage)
            .setName("Grab title from card link");
            
        const cardLinkDesc = cardLinkSetting.descEl;
        cardLinkDesc.appendText("If a note starts with a card link created with ");
        cardLinkDesc.createEl("em", { text: "Link Embed" });
        cardLinkDesc.appendText(" or ");
        cardLinkDesc.createEl("em", { text: "Auto Card Link" });
        cardLinkDesc.appendText(", the card link title will be put it in filename.");
        
        cardLinkSetting.addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.grabTitleFromCardLink)
                .onChange(async (value) => {
                    this.plugin.settings.grabTitleFromCardLink = value;
                    await this.plugin.saveSettings();
                })
        );
    }

    private renderForbiddenCharsTab(): void {
        if (!this.settingsPage) return;

        // Replace forbidden characters toggle as regular setting
        const headerToggleSetting = new Setting(this.settingsPage)
            .setName("Replace forbidden characters")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableForbiddenCharReplacements)
                    .onChange(async (value) => {
                        this.plugin.settings.enableForbiddenCharReplacements = value;

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

        const charDescEl = this.settingsPage.createEl("div", { cls: "setting-item-description" });

        const updateCharDescriptionContent = () => {
            charDescEl.setText("Define replacements for forbidden filename characters. Characters are omitted entirely if disabled.");
        };

        updateCharDescriptionContent();
        this.settingsPage.createEl("br");
        this.settingsPage.createEl("br");

        // Create char settings container after description and spacing
        const charSettingsContainer = this.settingsPage.createDiv({ cls: "flit-char-settings-container" });

        const updateCharacterReplacementUI = () => {
            // Character settings container is always visible - no longer hide/show based on master toggle
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
                text: 'The following characters are forbidden in Obsidian filenames on all OSes.',
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
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

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
                text: 'Replace characters which are forbidden in Obsidian filenames on Windows and Android only.',
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
                                await this.plugin.saveSettings();
                            });
                        toggle.toggleEl.style.margin = "0";
                        toggleContainer.appendChild(toggle.toggleEl);
                    });

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
                        await this.plugin.saveSettings();
                        updateCustomReplacementUI();
                    });
            });

        customHeaderToggleSetting.settingEl.addClass('flit-master-toggle');

        const customDescEl = this.settingsPage.createEl("div", { cls: "setting-item-description" });

        const updateCustomDescriptionContent = () => {
            customDescEl.empty();

            customDescEl.createEl('span', { text: 'Define custom text replacements.' });
            customDescEl.createEl('br');
            customDescEl.createEl('br');

            const ul = customDescEl.createEl('ul');
            ul.style.margin = '0';
            ul.style.paddingLeft = '20px';

            ul.createEl('li', { text: 'Whitespace preserved.' });
            ul.createEl('li', { text: 'Rules are applied before forbidden character replacements.' });
            ul.createEl('li', { text: 'Rules are applied sequentially from top to bottom.' });

            const li3 = ul.createEl('li');
            li3.appendText('Leave ');
            li3.createEl('em', { text: 'Replace with' });
            li3.appendText(' blank to omit text entirely.');

            const li4 = ul.createEl('li');
            li4.appendText('If ');
            li4.createEl('em', { text: 'Replace with' });
            li4.appendText(' is blank and ');
            li4.createEl('em', { text: 'Text to replace' });
            li4.appendText(' matches whole line, the filename becomes ');
            li4.createEl('em', { text: 'Untitled' });
            li4.appendText('.');
        };

        updateCustomDescriptionContent();
        this.settingsPage.createEl("br");

        // Create dedicated container for custom replacements table
        const customReplacementsContainer = this.settingsPage.createDiv({ cls: 'flit-custom-replacements-container' });

        const updateCustomReplacementUI = () => {
            // Custom replacement elements are always visible - no longer hide/show based on master toggle
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

                const updateButtonState = () => {
                    const isLastEmptyEntry = this.plugin.settings.customReplacements.length === 1 &&
                                              this.plugin.settings.customReplacements[0].searchText.trim() === "" &&
                                              this.plugin.settings.customReplacements[0].replaceText.trim() === "";
                    if (isLastEmptyEntry) {
                        deleteButton.style.opacity = "0.5";
                        deleteButton.style.pointerEvents = "none";
                        deleteButton.removeAttribute('aria-label');
                        deleteButton.title = "";
                    } else {
                        deleteButton.style.opacity = "";
                        deleteButton.style.pointerEvents = "";
                        deleteButton.setAttribute('aria-label', 'Remove');
                        deleteButton.title = "Remove";
                    }
                };

                // Create toggle container with fixed width
                const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });

                // Create individual toggle
                const individualToggleSetting = new Setting(document.createElement('div'));
                individualToggleSetting.addToggle((toggle) => {
                    toggle.setValue(replacement.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.customReplacements[index].enabled = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

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

                // Initial button state
                updateButtonState();
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

                        // On first enable, add default "Title" safeword (disabled)
                        if (value && !this.plugin.settings.hasEnabledSafewords) {
                            if (this.plugin.settings.safewords.length === 0) {
                                this.plugin.settings.safewords.push({
                                    text: 'Title',
                                    onlyAtStart: false,
                                    onlyWholeLine: false,
                                    enabled: false,
                                    caseSensitive: false
                                });
                            }
                            this.plugin.settings.hasEnabledSafewords = true;
                        }

                        await this.plugin.saveSettings();
                        updateSafewordsUI();
                    });
            });

        safewordsHeaderToggleSetting.settingEl.addClass('flit-master-toggle');

        const safewordsDescEl = this.settingsPage.createEl("div", { cls: "setting-item-description" });

        const updateSafewordsDescriptionContent = () => {
            safewordsDescEl.empty();
            safewordsDescEl.createEl('span', { text: 'Specify text that prevents renaming if found in filename.' });
        };

        updateSafewordsDescriptionContent();
        this.settingsPage.createEl("br");

        const updateSafewordsUI = () => {
            // Safeword elements are always visible - no longer hide/show based on master toggle
        };

        const renderSafewords = () => {
            // Clear existing safeword settings and containers
            const existingSafewordSettings = this.settingsPage.querySelectorAll('.flit-safeword-setting, .flit-safeword-header, .flit-safeword-table-container');
            existingSafewordSettings.forEach(el => el.remove());

            // Clear existing add button
            const existingAddButton = this.settingsPage.querySelector('.flit-add-safeword-button');
            if (existingAddButton) existingAddButton.remove();

            // Create table container
            const tableContainer = this.settingsPage.createEl('div', { cls: 'flit-table-container flit-safeword-table-container' });
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

                const updateButtonState = () => {
                    const isLastEmptyEntry = this.plugin.settings.safewords.length === 1 &&
                                              this.plugin.settings.safewords[0].text.trim() === "";
                    if (isLastEmptyEntry) {
                        deleteButton.style.opacity = "0.5";
                        deleteButton.style.pointerEvents = "none";
                        deleteButton.removeAttribute('aria-label');
                        deleteButton.title = "";
                    } else {
                        deleteButton.style.opacity = "";
                        deleteButton.style.pointerEvents = "";
                        deleteButton.setAttribute('aria-label', 'Remove');
                        deleteButton.title = "Remove";
                    }
                };

                // Create toggle container with fixed width
                const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });

                // Create individual toggle
                const individualToggleSetting = new Setting(document.createElement('div'));
                individualToggleSetting.addToggle((toggle) => {
                    toggle.setValue(safeword.enabled)
                        .onChange(async (value) => {
                            this.plugin.settings.safewords[index].enabled = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

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

                // Initial button state
                updateButtonState();
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

            // Update UI state after rendering
            updateSafewordsUI();
        };

        renderSafewords();

    }

    private renderAdvancedTab(): void {
        if (!this.settingsPage) return;

        // Check interval setting
        new Setting(this.settingsPage)
            .setName("Check interval")
            .setDesc(createFragment(fragment => {
                fragment.createSpan({ text: "Interval in milliseconds of how often to rename files while editing. Increase in case of issues. " });
                fragment.createEl("br");
                const noteSpan = fragment.createSpan({ text: "Note: lower values may cause errors when using " });
                noteSpan.createEl("em", { text: "Web Clipper" });
                noteSpan.createSpan({ text: " or " });
                noteSpan.createEl("em", { text: "Templater" });
                noteSpan.createSpan({ text: " plugins." });
                fragment.createEl("br");
                fragment.createEl("small").createEl("strong", { text: "Default: 600" });
            }))
            .addText((text) =>
                text
                    .setPlaceholder("Empty")
                    .setValue(String(this.plugin.settings.checkInterval))
                    .onChange(async (value) => {
                        if (value === '') {
                            this.plugin.settings.checkInterval = DEFAULT_SETTINGS.checkInterval;
                        } else if (!isNaN(Number(value))) {
                            this.plugin.settings.checkInterval = Number(value);
                        }
                        await this.plugin.saveSettings();
                    })
            );

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
            .setDesc("Omit HTML tags from the title.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.omitHtmlTags)
                    .onChange(async (value) => {
                        this.plugin.settings.omitHtmlTags = value;
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

        // Verbose logging setting
        new Setting(this.settingsPage)
            .setName("Verbose logging")
            .setDesc("Log all of the plugin's activity to the developer console.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.verboseLogging)
                    .onChange(async (value) => {
                        this.plugin.settings.verboseLogging = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
