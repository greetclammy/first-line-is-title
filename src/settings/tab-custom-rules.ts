import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { t, getCurrentLocale } from '../i18n';
import { TIMING } from '../constants/timing';

export class CustomReplacementsTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        const customHeaderToggleSetting = new Setting(this.containerEl)
            .setName(t('settings.customRules.name'))
            .setDesc(t('settings.customRules.desc'))
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.customRules.enableCustomReplacements)
                    .onChange(async (value) => {
                        this.plugin.settings.customRules.enableCustomReplacements = value;
                        this.plugin.debugLog('enableCustomReplacements', value);

                        // On first enable, turn on all leftmost (enabled) toggles in custom replacements
                        if (value && !this.plugin.settings.core.hasEnabledCustomReplacements) {
                            this.plugin.settings.customRules.customReplacements.forEach(replacement => {
                                replacement.enabled = true;
                            });
                            this.plugin.settings.core.hasEnabledCustomReplacements = true;
                        }

                        // Auto-toggle OFF dependent settings when disabling
                        if (!value) {
                            if (this.plugin.settings.markupStripping.applyCustomRulesInAlias) {
                                this.plugin.settings.markupStripping.applyCustomRulesInAlias = false;
                            }
                        }

                        await this.plugin.saveSettings();
                        updateCustomReplacementUI();
                        renderCustomReplacements();
                        (this.plugin as typeof this.plugin & { updateAliasConditionalSettings?: () => Promise<void> }).updateAliasConditionalSettings?.();
                    });
            });

        customHeaderToggleSetting.settingEl.addClass('flit-master-toggle');
        customHeaderToggleSetting.settingEl.addClass('flit-no-border');

        const customBulletListEl = this.containerEl.createEl("div", { cls: "setting-item-description flit-margin-top-12" });

        const updateCustomDescriptionContent = () => {
            customBulletListEl.empty();

            const ul = customBulletListEl.createEl('ul', { cls: "flit-margin-0 flit-padding-left-20" });

            const li1 = ul.createEl('li', { text: t('settings.customRules.rulesAppliedSequentially') });
            const li3 = ul.createEl('li', { text: t('settings.customRules.whitespacePreserved') });

            const li4 = ul.createEl('li');
            li4.appendText(t('settings.customRules.leaveBlank.part1'));
            if (getCurrentLocale() === 'ru') {
                li4.appendText('«' + t('settings.customRules.leaveBlank.replaceWith') + '»');
            } else {
                li4.createEl("em", { text: t('settings.customRules.leaveBlank.replaceWith') });
            }
            li4.appendText(t('settings.customRules.leaveBlank.part2'));

            const li5 = ul.createEl('li');
            li5.appendText(t('settings.customRules.untitledWarning.part1'));
            if (getCurrentLocale() === 'ru') {
                li5.appendText('«' + t('settings.customRules.untitledWarning.replaceWith') + '»');
            } else {
                li5.createEl("em", { text: t('settings.customRules.untitledWarning.replaceWith') });
            }
            li5.appendText(t('settings.customRules.untitledWarning.part2'));
            if (getCurrentLocale() === 'ru') {
                li5.appendText('«' + t('settings.customRules.untitledWarning.textToReplace') + '»');
            } else {
                li5.createEl("em", { text: t('settings.customRules.untitledWarning.textToReplace') });
            }
            li5.appendText(t('settings.customRules.untitledWarning.part3'));
            if (getCurrentLocale() === 'ru') {
                li5.appendText('«' + t('settings.customRules.untitledWarning.untitled') + '»');
            } else {
                li5.createEl("em", { text: t('settings.customRules.untitledWarning.untitled') });
            }
            li5.appendText(t('settings.customRules.untitledWarning.part4'));
        };

        updateCustomDescriptionContent();
        this.containerEl.createEl("br");

        const customReplacementsContainer = this.containerEl.createDiv({ cls: 'flit-custom-replacements-container' });

        let processingOrderContainer: HTMLElement;
        let globalProcessingHeaderSetting: Setting;
        let markupToggleContainer: HTMLElement;
        let markupToggleSetting: Setting;
        let markupToggle: any;

        const updateCustomReplacementUI = () => {
            const enabled = this.plugin.settings.customRules.enableCustomReplacements;
            this.updateInteractiveState(customBulletListEl, enabled);
            this.updateInteractiveState(customReplacementsContainer, enabled);
            if (processingOrderContainer) {
                this.updateInteractiveState(processingOrderContainer, enabled);
            }
            if (globalProcessingHeaderSetting) {
                if (enabled) {
                    globalProcessingHeaderSetting.settingEl.classList.remove('flit-master-disabled');
                } else {
                    globalProcessingHeaderSetting.settingEl.classList.add('flit-master-disabled');
                }
            }
            if (markupToggleContainer) {
                markupToggleContainer.classList.remove('flit-state-disabled');
                markupToggleContainer.classList.remove('flit-opacity-half');
            }
            if (markupToggleSetting) {
                updateMarkupToggleVisibility();
            }

            this.updateDisabledRowsAccessibility(customReplacementsContainer);
            const tableContainers = customReplacementsContainer.querySelectorAll('.flit-table-container');
            tableContainers.forEach((container: HTMLElement) => {
                if (enabled) {
                    container.classList.remove('flit-master-disabled');
                } else {
                    container.classList.add('flit-master-disabled');
                }
            });
        };

        const renderCustomReplacements = () => {
            customReplacementsContainer.empty();

            const existingAddButton = this.containerEl.querySelector('.flit-add-replacement-button');
            if (existingAddButton) existingAddButton.remove();

            const tableContainer = customReplacementsContainer.createEl('div', { cls: 'flit-table-container flit-custom-table-container' });
            const tableWrapper = tableContainer.createEl('div', { cls: 'flit-table-wrapper' });

            const headerRow = tableWrapper.createEl('div', { cls: 'flit-custom-replacement-header' });

            const enableHeader = headerRow.createDiv({ cls: "flit-enable-column" });
            enableHeader.textContent = t('settings.customRules.headers.enable');

            const textToReplaceHeader = headerRow.createDiv({ cls: "flit-text-column" });
            textToReplaceHeader.textContent = t('settings.customRules.headers.textToReplace');

            const replaceWithHeader = headerRow.createDiv({ cls: "flit-text-column" });
            replaceWithHeader.textContent = t('settings.customRules.headers.replaceWith');

            const startOnlyHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const startLine1 = startOnlyHeader.createDiv();
            startLine1.textContent = t('settings.customRules.headers.onlyMatchLineStart').split('\n')[0];
            const startLine2 = startOnlyHeader.createDiv();
            startLine2.textContent = t('settings.customRules.headers.onlyMatchLineStart').split('\n')[1] || '';

            const wholeLineHeader = headerRow.createDiv({ cls: "flit-toggle-column" });
            const wholeLine1 = wholeLineHeader.createDiv();
            wholeLine1.textContent = t('settings.customRules.headers.onlyMatchWholeLine').split('\n')[0];
            const wholeLine2 = wholeLineHeader.createDiv();
            wholeLine2.textContent = t('settings.customRules.headers.onlyMatchWholeLine').split('\n')[1] || '';

            const actionsHeader = headerRow.createDiv({ cls: "flit-actions-column" });
            actionsHeader.textContent = "";

            this.plugin.settings.customRules.customReplacements.forEach((replacement, index) => {
                const rowEl = tableWrapper.createEl('div', { cls: 'flit-custom-replacement-setting' });
                let deleteButton: any;

                let updateButtonState: () => void;

                const toggleContainer = rowEl.createDiv({ cls: "flit-enable-column" });

                const individualToggleSetting = new Setting(document.createElement('div'));
                individualToggleSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.core.hasEnabledCustomReplacements ? replacement.enabled : false)
                        .onChange(async (value) => {
                            this.plugin.settings.customRules.customReplacements[index].enabled = value;
                            this.plugin.debugLog(`customReplacements[${index}].enabled`, value);
                            await this.plugin.saveSettings();
                            updateRowAppearance();
                        });
                    toggle.toggleEl.classList.add('flit-margin-0');
                    toggleContainer.appendChild(toggle.toggleEl);
                });

                const updateRowAppearance = () => {
                    const isRowEnabled = this.plugin.settings.customRules.customReplacements[index].enabled;
                    const masterEnabled = this.plugin.settings.customRules.enableCustomReplacements;
                    const shouldApplyInlineOpacity = masterEnabled;

                    if (isRowEnabled) {
                        rowEl.classList.remove('flit-row-disabled');
                        input1.classList.remove('flit-state-disabled');
                        input1.disabled = false;
                        input1.tabIndex = 0;
                        input1.removeAttribute('aria-disabled');
                        input2.classList.remove('flit-state-disabled');
                        input2.disabled = false;
                        input2.tabIndex = 0;
                        input2.removeAttribute('aria-disabled');
                        startToggleContainer.classList.remove('flit-state-disabled');
                        wholeToggleContainer.classList.remove('flit-state-disabled');
                        [startToggleContainer, wholeToggleContainer].forEach(container => {
                            const toggleEls = container.querySelectorAll('input[type="checkbox"]');
                            toggleEls.forEach((el: HTMLElement) => {
                                el.tabIndex = 0;
                                el.removeAttribute('aria-disabled');
                            });
                        });
                    } else {
                        rowEl.classList.add('flit-row-disabled');
                        if (shouldApplyInlineOpacity) {
                            input1.classList.add('flit-state-disabled');
                            input2.classList.add('flit-state-disabled');
                            startToggleContainer.classList.add('flit-state-disabled');
                            wholeToggleContainer.classList.add('flit-state-disabled');
                        }
                        input1.disabled = true;
                        input1.tabIndex = -1;
                        input1.setAttribute('aria-disabled', 'true');
                        input2.disabled = true;
                        input2.tabIndex = -1;
                        input2.setAttribute('aria-disabled', 'true');
                        [startToggleContainer, wholeToggleContainer].forEach(container => {
                            const toggleEls = container.querySelectorAll('input[type="checkbox"]');
                            toggleEls.forEach((el: HTMLElement) => {
                                el.tabIndex = -1;
                                el.setAttribute('aria-disabled', 'true');
                            });
                        });
                    }
                };

                const input1Container = rowEl.createDiv({ cls: "flit-text-column" });
                const input1 = input1Container.createEl("input", { type: "text" });
                input1.placeholder = t('settings.replaceCharacters.emptyPlaceholder');
                input1.value = replacement.searchText;
                input1.addEventListener('input', async (e) => {
                    this.plugin.settings.customRules.customReplacements[index].searchText = (e.target as HTMLInputElement).value;
                    this.plugin.debugLog(`customReplacements[${index}].searchText`, this.plugin.settings.customRules.customReplacements[index].searchText);
                    await this.plugin.saveSettings();
                    updateButtonState();
                });

                this.addForbiddenCharProtection(input1);

                const input2Container = rowEl.createDiv({ cls: "flit-text-column" });
                const input2 = input2Container.createEl("input", { type: "text" });
                input2.placeholder = t('settings.replaceCharacters.emptyPlaceholder');
                input2.value = replacement.replaceText;
                input2.addEventListener('input', async (e) => {
                    this.plugin.settings.customRules.customReplacements[index].replaceText = (e.target as HTMLInputElement).value;
                    this.plugin.debugLog(`customReplacements[${index}].replaceText`, this.plugin.settings.customRules.customReplacements[index].replaceText);
                    await this.plugin.saveSettings();
                    updateButtonState();
                });

                this.addForbiddenCharProtection(input2);

                const startToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const startToggleSetting = new Setting(document.createElement('div'));
                startToggleSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.core.hasEnabledCustomReplacements ? replacement.onlyAtStart : false)
                        .onChange(async (value) => {
                            this.plugin.settings.customRules.customReplacements[index].onlyAtStart = value;
                            this.plugin.debugLog(`customReplacements[${index}].onlyAtStart`, value);
                            if (value) {
                                this.plugin.settings.customRules.customReplacements[index].onlyWholeLine = false;
                            }
                            await this.plugin.saveSettings();
                            renderCustomReplacements();
                        });
                    toggle.toggleEl.classList.add('flit-margin-0');
                    if (replacement.onlyWholeLine) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.classList.add('flit-state-disabled');
                    }
                    startToggleContainer.appendChild(toggle.toggleEl);
                });

                const wholeToggleContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const wholeToggleSetting = new Setting(document.createElement('div'));
                wholeToggleSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.core.hasEnabledCustomReplacements ? replacement.onlyWholeLine : false)
                        .onChange(async (value) => {
                            this.plugin.settings.customRules.customReplacements[index].onlyWholeLine = value;
                            this.plugin.debugLog(`customReplacements[${index}].onlyWholeLine`, value);
                            if (value) {
                                this.plugin.settings.customRules.customReplacements[index].onlyAtStart = false;
                            }
                            await this.plugin.saveSettings();
                            renderCustomReplacements();
                        });
                    toggle.toggleEl.classList.add('flit-margin-0');
                    if (replacement.onlyAtStart) {
                        toggle.setDisabled(true);
                        toggle.toggleEl.classList.add('flit-state-disabled');
                    }
                    wholeToggleContainer.appendChild(toggle.toggleEl);
                });

                const buttonContainer = rowEl.createDiv({ cls: "flit-actions-column flit-button-container" });

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
                        const temp = this.plugin.settings.customRules.customReplacements[index];
                        this.plugin.settings.customRules.customReplacements[index] = this.plugin.settings.customRules.customReplacements[index - 1];
                        this.plugin.settings.customRules.customReplacements[index - 1] = temp;
                        await this.plugin.saveSettings();
                        renderCustomReplacements();
                    });
                }

                const downButton = buttonContainer.createEl("button", {
                    cls: "clickable-icon flit-nav-button",
                    attr: { "aria-label": t('settings.customRules.moveDown') }
                });
                if (index === this.plugin.settings.customRules.customReplacements.length - 1) {
                    downButton.classList.add('disabled');
                }
                setIcon(downButton, "chevron-down");

                if (index < this.plugin.settings.customRules.customReplacements.length - 1) {
                    downButton.addEventListener('click', async () => {
                        const temp = this.plugin.settings.customRules.customReplacements[index];
                        this.plugin.settings.customRules.customReplacements[index] = this.plugin.settings.customRules.customReplacements[index + 1];
                        this.plugin.settings.customRules.customReplacements[index + 1] = temp;
                        await this.plugin.saveSettings();
                        renderCustomReplacements();
                    });
                }

                deleteButton = buttonContainer.createEl("button", {
                    cls: "clickable-icon flit-delete-button",
                    attr: { "aria-label": t('settings.customRules.delete'), "type": "button" }
                });
                setIcon(deleteButton, "x");

                deleteButton.addEventListener('click', async () => {
                    if (this.plugin.settings.customRules.customReplacements.length === 1) {
                        // If it's the last entry, replace with empty one instead of removing
                        this.plugin.settings.customRules.customReplacements[0] = {
                            searchText: "",
                            replaceText: "",
                            enabled: true,
                            onlyAtStart: false,
                            onlyWholeLine: false
                        };
                    } else {
                        this.plugin.settings.customRules.customReplacements.splice(index, 1);
                    }
                    await this.plugin.saveSettings();
                    renderCustomReplacements();
                });

                updateButtonState = () => {
                    const isLastEmptyEntry = this.plugin.settings.customRules.customReplacements.length === 1 &&
                                              this.plugin.settings.customRules.customReplacements[0].searchText.trim() === "" &&
                                              this.plugin.settings.customRules.customReplacements[0].replaceText.trim() === "";

                    if (isLastEmptyEntry) {
                        deleteButton.classList.add('disabled');
                        deleteButton.removeAttribute('aria-label');
                        deleteButton.title = "";
                    } else {
                        deleteButton.classList.remove('disabled');
                        deleteButton.setAttribute('aria-label', 'Remove');
                        deleteButton.title = "Remove";
                    }

                    if (index === 0 || isLastEmptyEntry) {
                        upButton.classList.add('disabled');
                    } else {
                        upButton.classList.remove('disabled');
                    }

                    if (index === this.plugin.settings.customRules.customReplacements.length - 1 || isLastEmptyEntry) {
                        downButton.classList.add('disabled');
                    } else {
                        downButton.classList.remove('disabled');
                    }
                };

                updateButtonState();

                updateRowAppearance();
            });

            const addButtonSetting = new Setting(customReplacementsContainer)
                .addButton((button) => {
                    button.setButtonText(t('settings.customRules.addReplacement'))
                        .onClick(async () => {
                            const lastIndex = this.plugin.settings.customRules.customReplacements.length - 1;
                            const lastEntry = this.plugin.settings.customRules.customReplacements[lastIndex];
                            if (lastEntry.searchText.trim() === "" && lastEntry.replaceText.trim() === "") {
                                if (!lastEntry.enabled) {
                                    this.plugin.settings.customRules.customReplacements[lastIndex].enabled = true;
                                    await this.plugin.saveSettings();
                                    renderCustomReplacements();
                                    setTimeout(() => {
                                        const textInputs = customReplacementsContainer.querySelectorAll('input[type="text"]:not([disabled])');
                                        if (textInputs.length >= 2) {
                                            (textInputs[textInputs.length - 2] as HTMLInputElement).focus();
                                        }
                                    }, TIMING.INPUT_FOCUS_DELAY_MS);
                                } else {
                                    const textInputs = customReplacementsContainer.querySelectorAll('input[type="text"]:not([disabled])');
                                    if (textInputs.length >= 2) {
                                        (textInputs[textInputs.length - 2] as HTMLInputElement).focus();
                                    }
                                }
                                return;
                            }

                            this.plugin.settings.customRules.customReplacements.push({
                                searchText: "",
                                replaceText: "",
                                onlyAtStart: false,
                                onlyWholeLine: false,
                                enabled: true
                            });
                            await this.plugin.saveSettings();
                            renderCustomReplacements();

                            setTimeout(() => {
                                const textInputs = customReplacementsContainer.querySelectorAll('input[type="text"]:not([disabled])');
                                if (textInputs.length >= 2) {
                                    (textInputs[textInputs.length - 2] as HTMLInputElement).focus();
                                }
                            }, TIMING.INPUT_FOCUS_DELAY_MS);
                        });
                });
            addButtonSetting.settingEl.addClass('flit-add-replacement-button');
            addButtonSetting.settingEl.addClass('flit-master-disable-target');

            updateCustomReplacementUI();
        };

        renderCustomReplacements();

        this.containerEl.createEl("br");

        globalProcessingHeaderSetting = new Setting(this.containerEl)
            .setName(t('settings.customRules.processingOrder.title'))
            .setDesc("");

        globalProcessingHeaderSetting.settingEl.addClass('flit-section-header');

        processingOrderContainer = this.containerEl.createDiv({ cls: 'flit-processing-order-container' });
        const applyAfterForbiddenSetting = new Setting(processingOrderContainer)
            .setName(t('settings.customRules.processingOrder.applyAfterForbidden'))
            .setDesc("");

        const applyAfterForbiddenDesc = applyAfterForbiddenSetting.descEl;
        applyAfterForbiddenDesc.appendText(t('settings.customRules.processingOrder.asSetInReplace.part1'));
        if (getCurrentLocale() === 'ru') {
            applyAfterForbiddenDesc.appendText('«' + t('settings.customRules.processingOrder.asSetInReplace.replaceCharacters') + '»');
        } else {
            applyAfterForbiddenDesc.createEl("em", { text: t('settings.customRules.processingOrder.asSetInReplace.replaceCharacters') });
        }
        applyAfterForbiddenDesc.appendText(t('settings.customRules.processingOrder.asSetInReplace.part2'));

        applyAfterForbiddenSetting
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.customRules.applyCustomRulesAfterForbiddenChars)
                    .onChange(async (value) => {
                        this.plugin.settings.customRules.applyCustomRulesAfterForbiddenChars = value;
                        this.plugin.debugLog('applyCustomRulesAfterForbiddenChars', value);
                        await this.plugin.saveSettings();
                    })
            );

        const updateMarkupToggleVisibility = () => {
            if (this.plugin.settings.markupStripping.enableStripMarkup) {
                markupToggleContainer.classList.remove('flit-state-disabled');
                markupToggleContainer.classList.remove('flit-opacity-half');
                markupToggleContainer.classList.remove('flit-pointer-none');
                markupToggleSetting.setDisabled(false);
                if (markupToggle) {
                    markupToggle.toggleEl.tabIndex = 0;
                    markupToggle.toggleEl.removeAttribute('aria-disabled');
                    markupToggle.toggleEl.classList.remove('flit-pointer-none');
                }
            } else {
                if (!processingOrderContainer.classList.contains('flit-master-disabled')) {
                    markupToggleContainer.classList.add('flit-opacity-half');
                }
                markupToggleContainer.classList.add('flit-pointer-none');
                markupToggleSetting.setDisabled(true);
                if (markupToggle) {
                    markupToggle.toggleEl.tabIndex = -1;
                    markupToggle.toggleEl.setAttribute('aria-disabled', 'true');
                    markupToggle.toggleEl.classList.add('flit-pointer-none');
                }
            }
        };

        markupToggleSetting = new Setting(processingOrderContainer)
            .setName(t('settings.customRules.processingOrder.applyAfterMarkup'))
            .setDesc("");

        const applyAfterMarkupDesc = markupToggleSetting.descEl;
        applyAfterMarkupDesc.appendText(t('settings.customRules.processingOrder.asSetInStrip.part1'));
        if (getCurrentLocale() === 'ru') {
            applyAfterMarkupDesc.appendText('«' + t('settings.customRules.processingOrder.asSetInStrip.stripMarkup') + '»');
        } else {
            applyAfterMarkupDesc.createEl("em", { text: t('settings.customRules.processingOrder.asSetInStrip.stripMarkup') });
        }
        applyAfterMarkupDesc.appendText(t('settings.customRules.processingOrder.asSetInStrip.part2'));

        markupToggleSetting
            .addToggle((toggle) => {
                markupToggle = toggle;
                toggle
                    .setValue(this.plugin.settings.markupStripping.applyCustomRulesAfterMarkupStripping)
                    .onChange(async (value) => {
                        this.plugin.settings.markupStripping.applyCustomRulesAfterMarkupStripping = value;
                        this.plugin.debugLog('applyCustomRulesAfterMarkupStripping', value);
                        await this.plugin.saveSettings();
                    });

                if (!this.plugin.settings.markupStripping.enableStripMarkup) {
                    toggle.toggleEl.tabIndex = -1;
                    toggle.toggleEl.setAttribute('aria-disabled', 'true');
                    toggle.toggleEl.classList.add('flit-pointer-none');
                }
            });

        markupToggleContainer = markupToggleSetting.settingEl;

        updateMarkupToggleVisibility();

        updateCustomReplacementUI();
    }
}