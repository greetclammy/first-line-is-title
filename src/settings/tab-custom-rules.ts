import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';

export class CustomReplacementsTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        // Enable custom replacements toggle as regular setting
        const customHeaderToggleSetting = new Setting(this.containerEl)
            .setName("Enable custom rules")
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

        const customDescEl = this.containerEl.createEl("div", { cls: "setting-item-description" });
        const customBulletListEl = this.containerEl.createEl("div", { cls: "setting-item-description" });

        const updateCustomDescriptionContent = () => {
            customDescEl.empty();
            customBulletListEl.empty();

            // Main description (always visible)
            customDescEl.createEl('span', { text: 'Configure custom text replacements.' });
            customDescEl.createEl('br');
            customDescEl.createEl('br');

            // Bullet list (can be greyed out)
            const ul = customBulletListEl.createEl('ul');
            ul.style.margin = '0';
            ul.style.paddingLeft = '20px';

            const li1 = ul.createEl('li', { text: 'Rules are applied sequentially from top to bottom.' });
            const li3 = ul.createEl('li', { text: 'Whitespace preserved.' });

            const li4 = ul.createEl('li');
            li4.appendText('Leave ');
            li4.createEl('em', { text: 'Replace with' });
            li4.appendText(' blank to omit text entirely.');

            const li5 = ul.createEl('li');
            li5.appendText('If ');
            li5.createEl('em', { text: 'Replace with' });
            li5.appendText(' is blank and ');
            li5.createEl('em', { text: 'Text to replace' });
            li5.appendText(' matches whole line, filename becomes ');
            li5.createEl('em', { text: 'Untitled' });
            li5.appendText('.');
        };

        updateCustomDescriptionContent();
        this.containerEl.createEl("br");

        // Create dedicated container for custom replacements table
        const customReplacementsContainer = this.containerEl.createDiv({ cls: 'flit-custom-replacements-container' });

        // Declare processing order container and header setting (will be created later)
        let processingOrderContainer: HTMLElement;
        let globalProcessingHeaderSetting: Setting;
        let markupToggleContainer: HTMLElement;
        let markupToggleSetting: Setting;

        const updateCustomReplacementUI = () => {
            // Update master disable state for entire section
            if (this.plugin.settings.enableCustomReplacements) {
                customBulletListEl.classList.remove('flit-master-disabled');
                customReplacementsContainer.classList.remove('flit-master-disabled');
                if (processingOrderContainer) {
                    processingOrderContainer.classList.remove('flit-master-disabled');
                }
                if (globalProcessingHeaderSetting) {
                    globalProcessingHeaderSetting.settingEl.classList.remove('flit-master-disabled');
                }
                // Clear any inline opacity from previous disable state
                if (markupToggleContainer) {
                    markupToggleContainer.style.opacity = "";
                }
                // Update markup toggle visibility based on strip markup setting
                if (markupToggleSetting) {
                    updateMarkupToggleVisibility();
                }
            } else {
                customBulletListEl.classList.add('flit-master-disabled');
                customReplacementsContainer.classList.add('flit-master-disabled');
                if (processingOrderContainer) {
                    processingOrderContainer.classList.add('flit-master-disabled');
                }
                if (globalProcessingHeaderSetting) {
                    globalProcessingHeaderSetting.settingEl.classList.add('flit-master-disabled');
                }
                // Update markup toggle to handle opacity properly
                if (markupToggleSetting) {
                    updateMarkupToggleVisibility();
                }
            }
        };

        const renderCustomReplacements = () => {
            // Clear existing custom replacement settings in the dedicated container
            customReplacementsContainer.empty();

            // Clear existing add button
            const existingAddButton = this.containerEl.querySelector('.flit-add-replacement-button');
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
                    toggle.setValue(this.plugin.settings.hasEnabledCustomReplacements ? replacement.enabled : false)
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
                    const isRowEnabled = this.plugin.settings.customReplacements[index].enabled;

                    // Grey out and disable inputs and toggles but not reorder/delete buttons based on row enabled state
                    if (isRowEnabled) {
                        // Clear inline styles to let CSS handle it naturally
                        input1.style.opacity = "";
                        input1.style.pointerEvents = "";
                        input1.disabled = false;
                        input2.style.opacity = "";
                        input2.style.pointerEvents = "";
                        input2.disabled = false;
                        startToggleContainer.style.opacity = "";
                        startToggleContainer.style.pointerEvents = "";
                        wholeToggleContainer.style.opacity = "";
                        wholeToggleContainer.style.pointerEvents = "";
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
                    this.plugin.debugLog(`customReplacements[${index}].searchText`, this.plugin.settings.customReplacements[index].searchText);
                    await this.plugin.saveSettings();
                    updateButtonState();
                });

                // Add forbidden character protection to search text input
                this.addForbiddenCharProtection(input1);

                // Create text input 2 container and input
                const input2Container = rowEl.createDiv({ cls: "flit-text-column" });
                const input2 = input2Container.createEl("input", { type: "text" });
                input2.placeholder = "Empty";
                input2.value = replacement.replaceText;
                input2.addEventListener('input', async (e) => {
                    this.plugin.settings.customReplacements[index].replaceText = (e.target as HTMLInputElement).value;
                    this.plugin.debugLog(`customReplacements[${index}].replaceText`, this.plugin.settings.customReplacements[index].replaceText);
                    await this.plugin.saveSettings();
                    updateButtonState();
                });

                // Add forbidden character protection to replace text input
                this.addForbiddenCharProtection(input2);

                // Create toggle for "Match at line start only"
                const startToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const startToggleSetting = new Setting(document.createElement('div'));
                startToggleSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.hasEnabledCustomReplacements ? replacement.onlyAtStart : false)
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
                    toggle.setValue(this.plugin.settings.hasEnabledCustomReplacements ? replacement.onlyWholeLine : false)
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
                .addButton((button) => {
                    button.setButtonText("Add replacement")
                        .onClick(async () => {
                            // Check if last entry is empty
                            const lastIndex = this.plugin.settings.customReplacements.length - 1;
                            const lastEntry = this.plugin.settings.customReplacements[lastIndex];
                            if (lastEntry.searchText.trim() === "" && lastEntry.replaceText.trim() === "") {
                                // Enable the last entry if it's disabled
                                if (!lastEntry.enabled) {
                                    this.plugin.settings.customReplacements[lastIndex].enabled = true;
                                    await this.plugin.saveSettings();
                                    renderCustomReplacements();
                                    // Focus after re-render
                                    setTimeout(() => {
                                        const textInputs = customReplacementsContainer.querySelectorAll('input[type="text"]:not([disabled])');
                                        if (textInputs.length >= 2) {
                                            (textInputs[textInputs.length - 2] as HTMLInputElement).focus();
                                        }
                                    }, 50);
                                } else {
                                    // Just focus if already enabled
                                    const textInputs = customReplacementsContainer.querySelectorAll('input[type="text"]:not([disabled])');
                                    if (textInputs.length >= 2) {
                                        (textInputs[textInputs.length - 2] as HTMLInputElement).focus();
                                    }
                                }
                                return;
                            }

                            // Add a new entry when "Add replacement" is clicked
                            this.plugin.settings.customReplacements.push({
                                searchText: "",
                                replaceText: "",
                                onlyAtStart: false,
                                onlyWholeLine: false,
                                enabled: true
                            });
                            await this.plugin.saveSettings();
                            renderCustomReplacements();

                            // Focus the newly created "Text to replace" input after DOM updates
                            setTimeout(() => {
                                const textInputs = customReplacementsContainer.querySelectorAll('input[type="text"]:not([disabled])');
                                if (textInputs.length >= 2) {
                                    // Focus the last "Text to replace" field (first input of the last pair)
                                    (textInputs[textInputs.length - 2] as HTMLInputElement).focus();
                                }
                            }, 50);
                        });
                });
            addButtonSetting.settingEl.addClass('flit-add-replacement-button');
            addButtonSetting.settingEl.addClass('flit-master-disable-target');

            // Update UI state after rendering - this must be done AFTER all elements are created
            // to properly override any disable states set during element creation
            updateCustomReplacementUI();
        };

        renderCustomReplacements();

        // Add spacing before global processing toggles
        this.containerEl.createEl("br");

        // Processing order section
        globalProcessingHeaderSetting = new Setting(this.containerEl)
            .setName("Processing order")
            .setDesc("");

        globalProcessingHeaderSetting.settingEl.addClass('flit-section-header');

        // Create container for processing order settings
        processingOrderContainer = this.containerEl.createDiv({ cls: 'flit-processing-order-container' });

        // Apply after stripping or replacing forbidden characters
        new Setting(processingOrderContainer)
            .setName("Apply after stripping or replacing forbidden characters")
            .setDesc("When enabled, custom rules are applied after forbidden character replacements. When disabled, custom rules are applied before forbidden character replacements.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.applyCustomRulesAfterForbiddenChars)
                    .onChange(async (value) => {
                        this.plugin.settings.applyCustomRulesAfterForbiddenChars = value;
                        this.plugin.debugLog('applyCustomRulesAfterForbiddenChars', value);
                        await this.plugin.saveSettings();
                    })
            );

        // Create container for markup stripping toggle and function to update its state
        const updateMarkupToggleVisibility = () => {
            if (this.plugin.settings.enableStripMarkup) {
                markupToggleContainer.style.opacity = "";
                markupToggleContainer.style.pointerEvents = "auto";
                markupToggleSetting.setDisabled(false);
            } else {
                // Only set inline opacity if parent doesn't already have flit-master-disabled
                // to prevent opacity stacking (0.5 × 0.5 = 0.25)
                if (!processingOrderContainer.classList.contains('flit-master-disabled')) {
                    markupToggleContainer.style.opacity = "0.5";
                } else {
                    markupToggleContainer.style.opacity = "";
                }
                markupToggleContainer.style.pointerEvents = "none";
                markupToggleSetting.setDisabled(true);
            }
        };

        // Apply after markup stripping
        markupToggleSetting = new Setting(processingOrderContainer)
            .setName("Apply after markup stripping")
            .setDesc("When enabled, custom rules are applied after markup stripping. When disabled, custom rules are applied before markup stripping. This option is only available when 'Strip markup' is enabled.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.applyCustomRulesAfterMarkupStripping)
                    .onChange(async (value) => {
                        this.plugin.settings.applyCustomRulesAfterMarkupStripping = value;
                        this.plugin.debugLog('applyCustomRulesAfterMarkupStripping', value);
                        await this.plugin.saveSettings();
                    })
            );

        markupToggleContainer = markupToggleSetting.settingEl;

        // Set initial state based on enableStripMarkup
        updateMarkupToggleVisibility();

        // Initialize custom replacement UI state (including processing order section)
        updateCustomReplacementUI();

        // Note: The markup toggle visibility will be updated when this tab is rendered/displayed
        // Cross-tab communication for real-time updates would require a more complex event system
    }
}