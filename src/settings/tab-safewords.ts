import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from '../constants';
import { t } from '../i18n';

export class SafewordsTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        // Enable safewords toggle as regular setting
        const safewordsHeaderToggleSetting = new Setting(this.containerEl)
            .setName(t('settings.safewords.enableSafewords.name'))
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

        const safewordsDescEl = this.containerEl.createEl("div", { cls: "setting-item-description" });

        const updateSafewordsDescriptionContent = () => {
            safewordsDescEl.empty();
            safewordsDescEl.createEl('span', { text: t('settings.safewords.enableSafewords.desc') });
        };

        updateSafewordsDescriptionContent();
        this.containerEl.createEl("br");

        // Create dedicated container for safewords content
        const safewordsContainer = this.containerEl.createDiv({ cls: 'flit-safewords-container' });

        const updateSafewordsUI = () => {
            // Update master disable state for entire section
            this.updateInteractiveState(safewordsContainer, this.plugin.settings.enableSafewords);
            // Also update any disabled rows
            this.updateDisabledRowsAccessibility(safewordsContainer);

            // Update table containers scrollbar visibility
            const tableContainers = safewordsContainer.querySelectorAll('.flit-table-container');
            tableContainers.forEach((container: HTMLElement) => {
                if (this.plugin.settings.enableSafewords) {
                    container.classList.remove('flit-master-disabled');
                } else {
                    container.classList.add('flit-master-disabled');
                }
            });
        };

        const renderSafewords = () => {
            // Clear the safewords container content
            safewordsContainer.empty();

            // Clear existing add button
            const existingAddButton = this.containerEl.querySelector('.flit-add-safeword-button');
            if (existingAddButton) existingAddButton.remove();

            // Create table container
            const tableContainer = safewordsContainer.createEl('div', { cls: 'flit-table-container flit-safeword-table-container' });
            const tableWrapper = tableContainer.createEl('div', { cls: 'flit-table-wrapper' });

            // Create header row with column titles
            const headerRow = tableWrapper.createEl('div', { cls: 'flit-safeword-header' });

            // Header for toggle
            const enableHeader = headerRow.createDiv({ cls: "flit-enable-column" });
            enableHeader.textContent = t('settings.safewords.headers.enable');

            // Header for input field
            const safewordHeader = headerRow.createDiv({ cls: "flit-text-column flit-safeword-input" });
            safewordHeader.textContent = t('settings.safewords.headers.safeword');

            // Headers for toggle switches
            const startOnlyHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            startOnlyHeader.textContent = t('settings.safewords.headers.onlyMatchStart');

            const wholeLineHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            wholeLineHeader.textContent = t('settings.safewords.headers.onlyMatchWhole');

            const caseSensitiveHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            caseSensitiveHeader.textContent = t('settings.safewords.headers.caseSensitive');

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
                    const masterEnabled = this.plugin.settings.enableSafewords;
                    const shouldApplyInlineOpacity = masterEnabled;

                    if (isEnabled) {
                        rowEl.classList.remove('flit-row-disabled');
                        // Clear inline styles to let CSS handle it naturally
                        input.style.opacity = "";
                        input.style.pointerEvents = "";
                        input.disabled = false;
                        input.tabIndex = 0;
                        input.removeAttribute('aria-disabled');
                        startToggleContainer.style.opacity = "";
                        startToggleContainer.style.pointerEvents = "";
                        wholeToggleContainer.style.opacity = "";
                        wholeToggleContainer.style.pointerEvents = "";
                        caseToggleContainer.style.opacity = "";
                        caseToggleContainer.style.pointerEvents = "";

                        // Re-enable toggles in containers
                        [startToggleContainer, wholeToggleContainer, caseToggleContainer].forEach(container => {
                            const toggleEls = container.querySelectorAll('input[type="checkbox"]');
                            toggleEls.forEach((el: HTMLElement) => {
                                el.tabIndex = 0;
                                el.removeAttribute('aria-disabled');
                            });
                        });
                    } else {
                        rowEl.classList.add('flit-row-disabled');
                        input.style.opacity = shouldApplyInlineOpacity ? "0.5" : "";
                        input.style.pointerEvents = "none";
                        input.disabled = true;
                        input.tabIndex = -1;
                        input.setAttribute('aria-disabled', 'true');
                        startToggleContainer.style.opacity = shouldApplyInlineOpacity ? "0.5" : "";
                        startToggleContainer.style.pointerEvents = "none";
                        wholeToggleContainer.style.opacity = shouldApplyInlineOpacity ? "0.5" : "";
                        wholeToggleContainer.style.pointerEvents = "none";
                        caseToggleContainer.style.opacity = shouldApplyInlineOpacity ? "0.5" : "";
                        caseToggleContainer.style.pointerEvents = "none";

                        // Disable toggles in containers
                        [startToggleContainer, wholeToggleContainer, caseToggleContainer].forEach(container => {
                            const toggleEls = container.querySelectorAll('input[type="checkbox"]');
                            toggleEls.forEach((el: HTMLElement) => {
                                el.tabIndex = -1;
                                el.setAttribute('aria-disabled', 'true');
                            });
                        });
                    }
                };

                // Create text input container and input
                const inputContainer = rowEl.createDiv({ cls: "flit-text-column flit-safeword-input" });
                const input = inputContainer.createEl("input", { type: "text" });
                input.placeholder = t('settings.replaceCharacters.emptyPlaceholder');
                input.value = safeword.text;
                input.addEventListener('input', async (e) => {
                    const inputEl = e.target as HTMLInputElement;
                    let value = inputEl.value;

                    // Define forbidden characters
                    const universalForbidden = UNIVERSAL_FORBIDDEN_CHARS;
                    const windowsAndroidForbidden = WINDOWS_ANDROID_CHARS;

                    let forbiddenChars = [...universalForbidden];
                    if (this.plugin.settings.osPreset === 'Windows') {
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
                    this.plugin.debugLog(`safewords[${index}].text`, this.plugin.settings.safewords[index].text);
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
                            this.plugin.debugLog(`safewords[${index}].onlyAtStart`, value);
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
                            this.plugin.debugLog(`safewords[${index}].onlyWholeLine`, value);
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
                            this.plugin.debugLog(`safewords[${index}].caseSensitive`, value);
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
                    attr: { "aria-label": t('settings.customRules.moveUp') }
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
                    attr: { "aria-label": t('settings.customRules.moveDown') }
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
                    cls: "clickable-icon flit-delete-button",
                    attr: { "aria-label": t('settings.customRules.delete'), "type": "button" }
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
                        deleteButton.setAttribute('aria-label', t('ariaLabels.remove'));
                        deleteButton.title = t('ariaLabels.remove');
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
            const addButtonSetting = new Setting(safewordsContainer)
                .addButton((button) =>
                    button.setButtonText(t('settings.safewords.addButton')).onClick(async () => {
                        // Check if last entry is empty
                        const lastIndex = this.plugin.settings.safewords.length - 1;
                        const lastEntry = this.plugin.settings.safewords[lastIndex];
                        if (lastEntry.text.trim() === "") {
                            // Enable the last entry if it's disabled
                            if (!lastEntry.enabled) {
                                this.plugin.settings.safewords[lastIndex].enabled = true;
                                await this.plugin.saveSettings();
                                renderSafewords();
                                // Focus after re-render
                                setTimeout(() => {
                                    const textInputs = safewordsContainer.querySelectorAll('input[type="text"]');
                                    if (textInputs.length > 0) {
                                        (textInputs[textInputs.length - 1] as HTMLInputElement).focus();
                                    }
                                }, 0);
                            } else {
                                // Just focus if already enabled
                                const textInputs = safewordsContainer.querySelectorAll('input[type="text"]');
                                if (textInputs.length > 0) {
                                    (textInputs[textInputs.length - 1] as HTMLInputElement).focus();
                                }
                            }
                            return;
                        }

                        // Add a new entry when "Add safeword" is clicked
                        this.plugin.settings.safewords.push({
                            text: "",
                            onlyAtStart: false,
                            onlyWholeLine: false,
                            enabled: true,
                            caseSensitive: false
                        });
                        await this.plugin.saveSettings();
                        renderSafewords();

                        // Focus the newly created safeword input after DOM updates
                        setTimeout(() => {
                            const textInputs = safewordsContainer.querySelectorAll('input[type="text"]');
                            if (textInputs.length > 0) {
                                (textInputs[textInputs.length - 1] as HTMLInputElement).focus();
                            }
                        }, 0);
                    })
                );
            addButtonSetting.settingEl.addClass('flit-add-safeword-button');

            // Update UI state after rendering
            updateSafewordsUI();
        };

        renderSafewords();
    }
}