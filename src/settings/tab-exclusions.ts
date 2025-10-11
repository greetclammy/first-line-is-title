import { Setting, Notice, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { ExclusionStrategy, TagPropertyExclusionStrategy, TagMatchingMode, ExcludedProperty } from '../types';
import { FolderSuggest, TagSuggest } from '../suggests';
import { DEFAULT_SETTINGS } from '../constants';

export class IncludeExcludeTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    async render(): Promise<void> {
        // Tab description
        const tabDesc = this.containerEl.createEl("div", { cls: "setting-item-description" });
        tabDesc.createEl("strong", { text: "Set how notes should be excluded from processing." });
        tabDesc.style.marginBottom = "15px";

        // Important note about rules
        const importantNote = this.containerEl.createEl("p", { cls: "setting-item-description" });
        importantNote.appendText("Note: rules don't override other rules. For example, a note in excluded folder but with included tag will not be processed.");
        importantNote.style.marginBottom = "15px";

        // First-time setup: Check for Excalidraw and add exclusion rule
        await this.checkFirstTimeExclusionsSetup();

        // Folders subsection
        const foldersHeaderSetting = new Setting(this.containerEl)
            .setName("Folders")
            .setDesc("Set folders to match.");
        foldersHeaderSetting.settingEl.addClass('flit-master-toggle');

        // Add note above folder exclusion mode
        const folderNote = this.containerEl.createEl("p", { cls: "setting-item-description" });
        folderNote.style.marginTop = "15px";
        folderNote.style.marginBottom = "15px";
        folderNote.textContent = "Renamed, moved or deleted folders are not reflected below. Update manually if paths change.";

        // Exclude subfolders setting
        const subfolderSetting = new Setting(this.containerEl)
            .setName("Match subfolders")
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
        subfolderSetting.settingEl.style.borderTop = "none";

        // Folder exclusion mode
        const folderModeSetting = new Setting(this.containerEl)
            .setName("Exclusion mode")
            .setDesc("Set how folders should be excluded.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('Only exclude...', 'Only exclude...')
                    .addOption('Exclude all except...', 'Exclude all except...')
                    .setValue(this.plugin.settings.folderScopeStrategy)
                    .onChange(async (value: ExclusionStrategy) => {
                        this.plugin.settings.folderScopeStrategy = value;
                        this.plugin.debugLog('folderScopeStrategy', value);
                        await this.plugin.saveSettings();
                    })
            );


        // Create a container for folder settings that will stay in place
        const folderContainer = this.containerEl.createDiv();

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
                            this.plugin.debugLog('excludedFolders', this.plugin.settings.excludedFolders);
                            await this.plugin.saveSettings();
                            updateButtonState(); // Update button state when text changes
                        });
                    text.inputEl.style.width = "100%";

                    // Add folder suggestion functionality
                    try {
                        new FolderSuggest(this.plugin.app, text.inputEl, async (selectedPath: string) => {
                            // Update the settings when a folder is selected
                            this.plugin.settings.excludedFolders[index] = selectedPath;
                            this.plugin.debugLog('excludedFolders', this.plugin.settings.excludedFolders);
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
        const tagsHeaderSetting = new Setting(this.containerEl)
            .setName("Tags")
            .setDesc("Set tags to match.");
        tagsHeaderSetting.settingEl.addClass('flit-master-toggle');

        // Add bullet list notes for Tags
        const tagNotes = this.containerEl.createEl("div", { cls: "setting-item-description" });
        tagNotes.style.marginTop = "15px";
        tagNotes.style.marginBottom = "15px";

        const tagUl = tagNotes.createEl('ul');
        tagUl.style.margin = '0';
        tagUl.style.paddingLeft = '20px';

        const tagLi1 = tagUl.createEl('li');
        tagLi1.createEl('em', { text: 'Exclude all except...' });
        tagLi1.appendText(' also excludes notes with no tags.');

        const tagLi2 = tagUl.createEl('li');
        tagLi2.appendText('Tags renamed with ');
        tagLi2.createEl("a", {
            text: "Tag Wrangler",
            href: "obsidian://show-plugin?id=tag-wrangler"
        });
        tagLi2.appendText(' are not reflected below. Update manually after renaming.');

        // Tag matching mode setting under Tags heading
        const tagMatchingSetting = new Setting(this.containerEl)
            .setName("Match tags")
            .setDesc("Set where tags should be matched.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('In Properties and note body', 'In Properties and note body')
                    .addOption('In Properties only', 'In Properties only')
                    .addOption('In note body only', 'In note body only')
                    .setValue(this.plugin.settings.tagMatchingMode)
                    .onChange(async (value: TagMatchingMode) => {
                        this.plugin.settings.tagMatchingMode = value;
                        this.plugin.debugLog('tagMatchingMode', value);
                        await this.plugin.saveSettings();
                    })
            );
        tagMatchingSetting.settingEl.style.borderTop = "none";

        // Exclude child tags setting
        const childTagsSetting = new Setting(this.containerEl)
            .setName("Match child tags")
            .setDesc("For example, also match #parent/child if #parent is listed below.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.excludeChildTags)
                    .onChange(async (value) => {
                        this.plugin.settings.excludeChildTags = value;
                        this.plugin.debugLog('excludeChildTags', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Tag exclusion mode
        const tagModeSetting = new Setting(this.containerEl)
            .setName("Exclusion mode")
            .setDesc("Set how tags should be excluded.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('Only exclude...', 'Only exclude...')
                    .addOption('Exclude all except...', 'Exclude all except...')
                    .setValue(this.plugin.settings.tagScopeStrategy)
                    .onChange(async (value: TagPropertyExclusionStrategy) => {
                        this.plugin.settings.tagScopeStrategy = value;
                        this.plugin.debugLog('tagScopeStrategy', value);
                        await this.plugin.saveSettings();
                    })
            );


        // Create a container for tag settings that will stay in place
        const tagContainer = this.containerEl.createDiv();

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
                            this.plugin.debugLog('excludedTags', this.plugin.settings.excludedTags);
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

        // Properties subsection
        const propertiesHeaderSetting = new Setting(this.containerEl)
            .setName("Properties")
            .setDesc("Set properties to match.");
        propertiesHeaderSetting.settingEl.addClass('flit-master-toggle');

        // Add bullet list notes
        const propertyNotes = this.containerEl.createEl("div", { cls: "setting-item-description" });
        propertyNotes.style.marginTop = "15px";
        propertyNotes.style.marginBottom = "15px";

        const ul = propertyNotes.createEl('ul');
        ul.style.margin = '0';
        ul.style.paddingLeft = '20px';

        const li2 = ul.createEl('li');
        li2.appendText('Leave ');
        li2.createEl('em', { text: 'value' });
        li2.appendText(' blank to match all notes with this property key.');

        ul.createEl('li', { text: 'Case-insensitive.' });

        const li3 = ul.createEl('li');
        li3.createEl('em', { text: 'Exclude all except...' });
        li3.appendText(' also excludes notes with no properties.');

        ul.createEl('li', { text: 'Renamed property keys aren\'t reflected below. Update manually after renaming.' });

        // Property exclusion mode
        const propertyModeSetting = new Setting(this.containerEl)
            .setName("Exclusion mode")
            .setDesc("Set how properties should be excluded.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('Only exclude...', 'Only exclude...')
                    .addOption('Exclude all except...', 'Exclude all except...')
                    .setValue(this.plugin.settings.propertyScopeStrategy)
                    .onChange(async (value: TagPropertyExclusionStrategy) => {
                        this.plugin.settings.propertyScopeStrategy = value;
                        this.plugin.debugLog('propertyScopeStrategy', value);
                        await this.plugin.saveSettings();
                    })
            );
        propertyModeSetting.settingEl.style.borderTop = "none";


        // Create a container for property settings that will stay in place
        const propertyContainer = this.containerEl.createDiv();

        const renderExcludedProperties = () => {
            // Clear only the property container
            propertyContainer.empty();

            // Ensure there's always at least one entry
            if (this.plugin.settings.excludedProperties.length === 0) {
                this.plugin.settings.excludedProperties.push({ key: "", value: "" });
            }

            // Variable to store the add button reference for state updates
            let addPropertyButton: any;

            // Render each property setting
            this.plugin.settings.excludedProperties.forEach((property, index) => {
                const propertySetting = new Setting(propertyContainer);
                let keyInput: any;
                let valueInput: any;
                let removeButton: any;

                const updateButtonState = () => {
                    const isLastEmptyEntry = this.plugin.settings.excludedProperties.length === 1 &&
                                              this.plugin.settings.excludedProperties[0].key.trim() === "" &&
                                              this.plugin.settings.excludedProperties[0].value.trim() === "";

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

                // Create container for key:value inputs
                const propertyInputContainer = propertySetting.controlEl.createDiv({ cls: "flit-property-container" });
                propertyInputContainer.style.display = "flex";
                propertyInputContainer.style.gap = "10px";
                propertyInputContainer.style.alignItems = "center";

                // Key input
                keyInput = propertyInputContainer.createEl("input", { type: "text", cls: "flit-property-key-input" });
                keyInput.placeholder = "key";
                keyInput.value = property.key;

                // Colon separator
                const colonSpan = propertyInputContainer.createEl("span", { text: ":", cls: "flit-colon-separator" });

                // Value input
                valueInput = propertyInputContainer.createEl("input", { type: "text", cls: "flit-property-value-input" });
                valueInput.placeholder = "value";
                valueInput.value = property.value;

                // Event listeners for inputs
                keyInput.addEventListener('input', async (e: any) => {
                    this.plugin.settings.excludedProperties[index].key = e.target.value;
                    this.plugin.debugLog('excludedProperties', this.plugin.settings.excludedProperties);
                    await this.plugin.saveSettings();
                    updateButtonState();
                });

                valueInput.addEventListener('input', async (e: any) => {
                    this.plugin.settings.excludedProperties[index].value = e.target.value;
                    this.plugin.debugLog('excludedProperties', this.plugin.settings.excludedProperties);
                    await this.plugin.saveSettings();
                    updateButtonState();
                });

                // Add remove button
                propertySetting.addExtraButton(button => {
                    removeButton = button;
                    button.setIcon("x");

                    button.onClick(async () => {
                        // If this is the only entry, clear it instead of deleting
                        if (this.plugin.settings.excludedProperties.length === 1) {
                            this.plugin.settings.excludedProperties[0] = { key: "", value: "" };
                        } else {
                            this.plugin.settings.excludedProperties.splice(index, 1);
                        }

                        await this.plugin.saveSettings();
                        renderExcludedProperties();
                    });

                    // Initial button state
                    updateButtonState();
                });

                propertySetting.settingEl.addClass('flit-excluded-folder-setting');
            });

            // Always add the "Add property" button at the end
            const addPropertyButtonSetting = new Setting(propertyContainer)
                .addButton(button => {
                    button.setButtonText("Add property")
                        .onClick(async () => {
                            const lastProperty = this.plugin.settings.excludedProperties[this.plugin.settings.excludedProperties.length - 1];
                            const isBottomEntryEmpty = this.plugin.settings.excludedProperties.length > 0 &&
                                                       lastProperty.key.trim() === "" && lastProperty.value.trim() === "";

                            if (isBottomEntryEmpty) {
                                // Focus the bottom empty key input instead of adding a new one
                                const keyInputs = propertyContainer.querySelectorAll('.flit-property-key-input');
                                if (keyInputs.length > 0) {
                                    const lastInput = keyInputs[keyInputs.length - 1] as HTMLInputElement;
                                    lastInput.focus();
                                }
                            } else {
                                // Add new entry and focus it
                                this.plugin.settings.excludedProperties.push({ key: "", value: "" });
                                await this.plugin.saveSettings();
                                renderExcludedProperties();

                                // Focus the newly created key input
                                setTimeout(() => {
                                    const keyInputs = propertyContainer.querySelectorAll('.flit-property-key-input');
                                    if (keyInputs.length > 0) {
                                        const lastInput = keyInputs[keyInputs.length - 1] as HTMLInputElement;
                                        lastInput.focus();
                                    }
                                }, 0);
                            }
                        });
                });
            addPropertyButtonSetting.settingEl.addClass('flit-add-folder-button');
        };

        renderExcludedProperties();

        // Property to disable renaming section
        const propertyDisableSetting = new Setting(this.containerEl)
            .setName("Property to disable renaming")
            .setDesc("");

        propertyDisableSetting.settingEl.addClass('flit-master-toggle');

        // Create main description paragraph
        const propertyDesc = propertyDisableSetting.descEl;
        propertyDesc.appendText("Set the property to exclude notes from processing.");

        // Add notes above the inputs (like Properties section has its notes above)
        const propertyDisableNotes = this.containerEl.createEl("div", { cls: "setting-item-description" });
        propertyDisableNotes.style.marginTop = "15px";
        propertyDisableNotes.style.marginBottom = "15px";

        const disableUl = propertyDisableNotes.createEl('ul');
        disableUl.style.margin = '0';
        disableUl.style.paddingLeft = '20px';

        disableUl.createEl('li', { text: 'Always respected — cannot get overridden by any command.' });
        disableUl.createEl('li', { text: 'Case-insensitive.' });

        const disableLi3 = disableUl.createEl('li');
        disableLi3.appendText('Changing this will not automatically update properties that have been previously added. Update manually after change.');

        // Create a Setting container for the inputs (like Properties section)
        const propertyInputSetting = new Setting(this.containerEl);
        propertyInputSetting.settingEl.addClass('flit-excluded-folder-setting');
        propertyInputSetting.settingEl.style.borderTop = "none";

        // Create a wrapper container for button and inputs
        const propertyControlWrapper = propertyInputSetting.controlEl.createDiv({
            cls: "flit-property-control-wrapper"
        });
        propertyControlWrapper.style.display = "flex";
        propertyControlWrapper.style.alignItems = "center";
        propertyControlWrapper.style.gap = "8px";
        propertyControlWrapper.style.width = "100%";

        // Create reset button container (matches tab-alias.ts structure)
        const propertyRestoreButtonContainer = propertyControlWrapper.createDiv({
            cls: "flit-restore-button-container"
        });

        // Create reset button inside container
        const propertyRestoreButton = propertyRestoreButtonContainer.createEl("button", {
            cls: "clickable-icon flit-restore-icon",
            attr: { "aria-label": "Restore default" }
        });
        setIcon(propertyRestoreButton, "rotate-ccw");

        // Create input container next to button container
        const propertyInputContainer = propertyControlWrapper.createDiv({ cls: "flit-property-container" });
        propertyInputContainer.style.display = "flex";
        propertyInputContainer.style.gap = "10px";
        propertyInputContainer.style.alignItems = "center";

        // Key input (similar to Properties)
        const keyInput = propertyInputContainer.createEl("input", { type: "text", cls: "flit-property-key-input" });
        keyInput.placeholder = "key";
        keyInput.value = this.plugin.settings.disableRenamingKey;

        // Colon separator
        const colonSpan = propertyInputContainer.createEl("span", { text: ":", cls: "flit-colon-separator" });

        // Value input
        const valueInput = propertyInputContainer.createEl("input", { type: "text", cls: "flit-property-value-input" });
        valueInput.placeholder = "value";
        valueInput.value = this.plugin.settings.disableRenamingValue;

        // Add event listeners
        keyInput.addEventListener('input', async (e) => {
            this.plugin.settings.disableRenamingKey = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
            // Update property type when key changes
            await this.plugin.propertyManager.updatePropertyTypeFromSettings();
        });

        valueInput.addEventListener('input', async (e) => {
            this.plugin.settings.disableRenamingValue = (e.target as HTMLInputElement).value;
            await this.plugin.saveSettings();
            // Update property type when value changes
            await this.plugin.propertyManager.updatePropertyTypeFromSettings();
        });

        propertyRestoreButton.addEventListener('click', async () => {
            this.plugin.settings.disableRenamingKey = DEFAULT_SETTINGS.disableRenamingKey;
            this.plugin.settings.disableRenamingValue = DEFAULT_SETTINGS.disableRenamingValue;
            keyInput.value = this.plugin.settings.disableRenamingKey;
            valueInput.value = this.plugin.settings.disableRenamingValue;
            await this.plugin.saveSettings();
            // Update property type when restored to default
            await this.plugin.propertyManager.updatePropertyTypeFromSettings();
        });

        // Add default text below the inputs
        const defaultTextContainer = this.containerEl.createEl("div", { cls: "setting-item-description" });
        defaultTextContainer.createEl("small").createEl("strong", { text: "Default: no rename:true" });
        defaultTextContainer.style.marginTop = "5px";
        defaultTextContainer.style.marginBottom = "20px";

        // Add bottom margin to this setting
        propertyDisableSetting.settingEl.style.marginBottom = "20px";
    }

    private async checkFirstTimeExclusionsSetup(): Promise<void> {
        // Skip if already done
        if (this.plugin.settings.hasSetupExclusions) {
            return;
        }

        // Check if Excalidraw plugin is installed and enabled
        const excalidrawPlugin = this.plugin.app.plugins.getPlugin('obsidian-excalidraw-plugin');
        if (excalidrawPlugin && excalidrawPlugin._loaded) {
            // Check if excalidraw-plugin property already exists
            const hasExcalidrawProperty = this.plugin.settings.excludedProperties.some(
                prop => prop.key === 'excalidraw-plugin' && prop.value === 'parsed'
            );

            if (!hasExcalidrawProperty) {
                // Add Excalidraw exclusion
                this.plugin.settings.excludedProperties.push({
                    key: 'excalidraw-plugin',
                    value: 'parsed'
                });
                await this.plugin.saveSettings();
            }
        }

        // Check for Templates and Templater folders
        console.debug('Checking for template plugin folders to auto-exclude');
        const adapter = this.plugin.app.vault.adapter;
        const configDir = this.plugin.app.vault.configDir;
        console.debug('Vault config directory is:', configDir);
        let templatesFolder: string | null = null;
        let templaterFolder: string | null = null;

        // Check core Templates plugin - only if enabled
        try {
            const corePluginsPath = `${configDir}/core-plugins.json`;
            console.debug('Reading core plugins configuration from:', corePluginsPath);
            const corePluginsData = await adapter.read(corePluginsPath);
            const corePlugins = JSON.parse(corePluginsData);
            console.debug('Core Templates plugin enabled status:', corePlugins.templates);

            if (corePlugins.templates === true) {
                console.debug('Core Templates plugin is enabled, checking for templates folder');
                const templatesDataPath = `${configDir}/templates.json`;
                console.debug('Reading templates configuration from:', templatesDataPath);
                const templatesData = await adapter.read(templatesDataPath);
                const templatesConfig = JSON.parse(templatesData);
                templatesFolder = templatesConfig.folder;
                console.debug('Core Templates folder configured as:', templatesFolder);
            } else {
                console.debug('Core Templates plugin is disabled, skipping');
            }
        } catch (error) {
            console.debug('Could not read core Templates plugin configuration:', error);
        }

        // Check Templater plugin
        console.debug('Checking for Templater community plugin');
        const templaterPlugin = this.plugin.app.plugins.getPlugin('templater-obsidian');
        console.debug('Templater plugin found:', !!templaterPlugin, '| loaded:', templaterPlugin?._loaded);
        if (templaterPlugin && templaterPlugin._loaded) {
            try {
                const templaterDataPath = `${configDir}/plugins/templater-obsidian/data.json`;
                console.debug('Reading Templater configuration from:', templaterDataPath);
                const templaterData = await adapter.read(templaterDataPath);
                const templaterConfig = JSON.parse(templaterData);
                templaterFolder = templaterConfig.templates_folder;
                console.debug('Templater folder configured as:', templaterFolder);
            } catch (error) {
                console.debug('Could not read Templater plugin configuration:', error);
            }
        } else {
            console.debug('Templater plugin not loaded, skipping');
        }

        // Collect folders to add
        const foldersToAdd: string[] = [];

        if (templatesFolder && templatesFolder.trim() !== "") {
            foldersToAdd.push(templatesFolder);
            console.debug('Queued core Templates folder for exclusion:', templatesFolder);
        } else {
            console.debug('No valid core Templates folder to add');
        }

        // Only add templater folder if it differs from templates folder
        if (templaterFolder && templaterFolder.trim() !== "") {
            if (templaterFolder !== templatesFolder) {
                foldersToAdd.push(templaterFolder);
                console.debug('Queued Templater folder for exclusion:', templaterFolder);
            } else {
                console.debug('Templater folder matches core Templates folder (' + templaterFolder + '), will not add duplicate');
            }
        } else {
            console.debug('No valid Templater folder to add');
        }

        console.debug('Total folders to add to exclusions:', foldersToAdd);
        console.debug('Current excluded folders before processing:', this.plugin.settings.excludedFolders);

        // Add folders if they don't already exist
        for (const folder of foldersToAdd) {
            const hasFolderExcluded = this.plugin.settings.excludedFolders.some(
                existingFolder => existingFolder === folder
            );

            if (!hasFolderExcluded) {
                // Remove empty string if it's the only entry
                if (this.plugin.settings.excludedFolders.length === 1 &&
                    this.plugin.settings.excludedFolders[0].trim() === "") {
                    this.plugin.settings.excludedFolders = [];
                    console.debug('Removed default empty string entry from excluded folders');
                }

                this.plugin.settings.excludedFolders.push(folder);
                console.debug('Successfully added folder to exclusions:', folder);
            } else {
                console.debug('Folder already in exclusions list, skipping:', folder);
            }
        }

        // Save if any folders were added
        if (foldersToAdd.length > 0) {
            await this.plugin.saveSettings();
            console.debug('Saved settings after adding template folders to exclusions');
        } else {
            console.debug('No folders were added, skipping settings save');
        }
        console.debug('Final excluded folders after processing:', this.plugin.settings.excludedFolders);

        // Mark as setup complete
        this.plugin.settings.hasSetupExclusions = true;
        await this.plugin.saveSettings();
    }
}