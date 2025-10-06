import { Setting, Notice } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { ScopeStrategy, TagMatchingMode, ExcludedProperty } from '../types';
import { FolderSuggest, TagSuggest } from '../suggests';

export class IncludeExcludeTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        // First-time setup: Check for Excalidraw and add exclusion rule
        this.checkFirstTimeExclusionsSetup();

        // Strategy selection
        new Setting(this.containerEl)
            .setName("Exclusion mode")
            .setDesc("Configure how notes should be excluded from processing.")
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
        const foldersHeaderSetting = new Setting(this.containerEl)
            .setName("Folders")
            .setDesc("Configure folders to match.");
        foldersHeaderSetting.settingEl.addClass('flit-master-toggle');
        this.containerEl.createEl("br");

        // Add note above toggles
        const folderNote = this.containerEl.createEl("p", { cls: "setting-item-description" });
        folderNote.style.marginTop = "0px";
        folderNote.style.marginBottom = "15px";
        folderNote.innerHTML = "Note: renamed, moved or deleted folders are not reflected below. Update manually if paths change.";

        // Exclude subfolders setting
        const subfolderSetting = new Setting(this.containerEl)
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
        this.containerEl.createEl("hr", { cls: "flit-divider" });

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
            .setDesc("Configure tags to match.");
        tagsHeaderSetting.settingEl.addClass('flit-master-toggle');
        this.containerEl.createEl("br");

        // Add note above toggles if Tag Wrangler is enabled
        if (this.plugin.isTagWranglerEnabled()) {
            const tagNote = this.containerEl.createEl("p", { cls: "setting-item-description" });
            tagNote.style.marginTop = "0px";
            tagNote.style.marginBottom = "15px";
            tagNote.innerHTML = "Note: renamed tags are not reflected below. Update manually after renaming.";
        }

        // Tag matching mode setting under Tags heading
        const tagMatchingSetting = new Setting(this.containerEl)
            .setName("Match tags")
            .setDesc("Configure how tags should be matched.")
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

        // Remove any top border from the tag matching setting
        tagMatchingSetting.settingEl.style.borderTop = "none";
        tagMatchingSetting.settingEl.style.paddingTop = "0";

        // Exclude child tags setting
        const childTagsSetting = new Setting(this.containerEl)
            .setName("Apply to child tags")
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

        // Remove any top border from the child tags setting
        childTagsSetting.settingEl.style.borderTop = "none";
        childTagsSetting.settingEl.style.paddingTop = "0";

        // Add divider line right after nested tags option
        this.containerEl.createEl("hr", { cls: "flit-divider" });

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
            .setDesc("Configure properties to match.");
        propertiesHeaderSetting.settingEl.addClass('flit-master-toggle');
        this.containerEl.createEl("br");

        // Add divider line
        this.containerEl.createEl("hr", { cls: "flit-divider" });

        // Add tip as a separate description paragraph
        const propertyTip = this.containerEl.createEl("p", { cls: "setting-item-description" });
        propertyTip.style.marginTop = "0px";
        propertyTip.style.marginBottom = "15px";
        propertyTip.appendText('Tip: a property that cannot be overridden by any of the plugin\'s commands can be set in ');
        propertyTip.createEl('em', { text: 'Miscellaneous' });
        propertyTip.appendText(' settings.');

        // Add bullet list notes below divider
        const propertyNotes = this.containerEl.createEl("div", { cls: "setting-item-description" });
        propertyNotes.style.marginTop = "0px";
        propertyNotes.style.marginBottom = "15px";

        const ul = propertyNotes.createEl('ul');
        ul.style.margin = '0';
        ul.style.paddingLeft = '20px';

        ul.createEl('li', { text: 'Case-insensitive.' });

        const li2 = ul.createEl('li');
        li2.appendText('Leave ');
        li2.createEl('em', { text: 'value' });
        li2.appendText(' blank to match all notes with this property key.');

        ul.createEl('li', { text: 'Renamed property keys aren\'t reflected below. Update manually after renaming.' });

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
                propertyInputContainer.style.width = "100%";

                // Key input
                keyInput = propertyInputContainer.createEl("input", { type: "text", cls: "flit-property-key-input" });
                keyInput.placeholder = "key";
                keyInput.style.width = "120px";
                keyInput.value = property.key;

                // Colon separator
                const colonSpan = propertyInputContainer.createEl("span", { text: ":" });
                colonSpan.style.color = "var(--text-muted)";

                // Value input
                valueInput = propertyInputContainer.createEl("input", { type: "text", cls: "flit-property-value-input" });
                valueInput.placeholder = "value";
                valueInput.style.width = "120px";
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

        // Mark as setup complete
        this.plugin.settings.hasSetupExclusions = true;
        await this.plugin.saveSettings();
    }
}