import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';
import { detectOS } from '../utils';
import { DEFAULT_SETTINGS } from '../constants';

export class ForbiddenCharsTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        // Replace forbidden characters toggle as regular setting
        const headerToggleSetting = new Setting(this.containerEl)
            .setName("Replace forbidden characters")
            .setDesc("")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableForbiddenCharReplacements)
                    .onChange(async (value) => {
                        this.plugin.settings.enableForbiddenCharReplacements = value;
                        this.plugin.debugLog('enableForbiddenCharReplacements', value);

                        // On first enable, turn on all All OSes options
                        if (value && !this.plugin.settings.hasEnabledForbiddenChars) {
                            const allOSesKeys = ['leftBracket', 'rightBracket', 'hash', 'caret', 'pipe', 'slash', 'colon'];
                            allOSesKeys.forEach(key => {
                                this.plugin.settings.charReplacementEnabled[key as keyof typeof this.plugin.settings.charReplacementEnabled] = true;
                            });
                            this.plugin.settings.hasEnabledForbiddenChars = true;

                            // If OS is Windows or Android, also enable Windows/Android section
                            const currentOS = detectOS();
                            if (currentOS === 'Windows' && !this.plugin.settings.hasEnabledWindowsAndroid) {
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
                        updateWindowsAndroidUI();
                        // Update Windows/Android toggle disabled state
                        if (windowsAndroidToggleComponent) {
                            windowsAndroidToggleComponent.setDisabled(!value);
                            if (value) {
                                windowsAndroidToggleComponent.toggleEl.style.pointerEvents = '';
                                windowsAndroidToggleComponent.toggleEl.style.opacity = '';
                                windowsAndroidToggleComponent.toggleEl.tabIndex = 0;
                                windowsAndroidToggleComponent.toggleEl.removeAttribute('aria-disabled');
                            } else {
                                windowsAndroidToggleComponent.toggleEl.style.pointerEvents = 'none';
                                windowsAndroidToggleComponent.toggleEl.style.opacity = '0.5';
                                windowsAndroidToggleComponent.toggleEl.tabIndex = -1;
                                windowsAndroidToggleComponent.toggleEl.setAttribute('aria-disabled', 'true');
                            }
                        }
                    });
            });

        headerToggleSetting.settingEl.addClass('flit-master-toggle');
        headerToggleSetting.settingEl.addClass('flit-no-border');

        const charDescEl = this.containerEl.createEl("div", { cls: "setting-item-description" });

        const updateCharDescriptionContent = () => {
            charDescEl.setText("Configure replacements for illegal filename characters. Characters are omitted entirely if disabled.");
        };

        updateCharDescriptionContent();
        this.containerEl.createEl("br");
        this.containerEl.createEl("br");

        // Create char settings container after description and spacing
        const charSettingsContainer = this.containerEl.createDiv({ cls: "flit-char-settings-container" });

        const updateCharacterReplacementUI = () => {
            // Update master disable state for entire section
            this.updateInteractiveState(
                charSettingsContainer,
                this.plugin.settings.enableForbiddenCharReplacements
            );
            // Also update any disabled rows
            this.updateDisabledRowsAccessibility(charSettingsContainer);
        };

        // Define character arrays first (moved outside updateCharacterSettings)
        const primaryCharSettings: Array<{key: keyof typeof this.plugin.settings.charReplacements, name: string, char: string, description?: string}> = [
            { key: 'leftBracket', name: 'Left bracket [', char: '[' },
            { key: 'rightBracket', name: 'Right bracket ]', char: ']' },
            { key: 'hash', name: 'Hash #', char: '#' },
            { key: 'caret', name: 'Caret ^', char: '^' },
            { key: 'pipe', name: 'Pipe |', char: '|' },
            { key: 'backslash', name: 'Backslash \\', char: String.fromCharCode(92) },
            { key: 'slash', name: 'Forward slash /', char: '/' },
            { key: 'colon', name: 'Colon :', char: ':' },
            { key: 'dot', name: 'Dot .', char: '.', description: 'Note: the dot is forbidden at filename start only.' }
        ];

        const windowsAndroidChars: Array<{key: keyof typeof this.plugin.settings.charReplacements, name: string, char: string}> = [
            { key: 'asterisk', name: 'Asterisk *', char: '*' },
            { key: 'quote', name: 'Quote "', char: '"' },
            { key: 'lessThan', name: 'Less than <', char: '<' },
            { key: 'greaterThan', name: 'Greater than >', char: '>' },
            { key: 'question', name: 'Question mark ?', char: '?' }
        ];

        // Declare Windows/Android table container ref (will be set in updateCharacterSettings)
        let windowsAndroidTableContainer: HTMLElement;
        let windowsAndroidToggleComponent: any; // Store toggle component for disabling

        const updateCharacterSettings = () => {
            charSettingsContainer.empty();

            // Add All OSes subsection
            const allOSesHeaderSetting = new Setting(charSettingsContainer)
                .setName("All OSes")
                .setDesc("Replace characters that are forbidden in Obsidian filenames on all OSes.");
            allOSesHeaderSetting.settingEl.addClass('flit-master-toggle');
            charSettingsContainer.createEl("br");

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
                    toggle.setValue(this.plugin.settings.hasEnabledForbiddenChars ? this.plugin.settings.charReplacementEnabled[setting.key] : false)
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementEnabled[setting.key] = value;
                            this.plugin.debugLog(`charReplacementEnabled.${setting.key}`, value);
                            await this.plugin.saveSettings();
                            updateRowAppearance();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

                const updateRowAppearance = () => {
                    if (this.plugin.settings.charReplacementEnabled[setting.key]) {
                        rowEl.classList.remove('flit-row-disabled');
                    } else {
                        rowEl.classList.add('flit-row-disabled');
                    }
                };

                // Character name and description
                const nameContainer = rowEl.createEl("div", { cls: "flit-char-name-column" });
                const nameEl = nameContainer.createEl("div", { text: setting.name, cls: "setting-item-name" });
                if (setting.description) {
                    const descEl = nameContainer.createEl("div", { cls: "setting-item-description" });
                    descEl.innerHTML = setting.description;
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
                    this.plugin.debugLog(`charReplacements[${setting.key}]`, this.plugin.settings.charReplacements[setting.key]);
                    await this.plugin.saveSettings();
                });

                // Add forbidden character protection
                this.addForbiddenCharProtection(textInput);

                // Trim left toggle
                const trimLeftContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const trimLeftSetting = new Setting(document.createElement('div'));
                trimLeftSetting.addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.hasEnabledForbiddenChars ? this.plugin.settings.charReplacementTrimLeft[setting.key] : false)
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
                    toggle.setValue(this.plugin.settings.hasEnabledForbiddenChars ? this.plugin.settings.charReplacementTrimRight[setting.key] : false)
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementTrimRight[setting.key] = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    trimRightContainer.appendChild(toggle.toggleEl);
                });

                updateRowAppearance();
            });

            // Add Windows/Android subsection header
            const windowsAndroidHeaderSetting = new Setting(charSettingsContainer)
                .setName("Windows/Android")
                .setDesc("Replace characters that are forbidden in Obsidian filenames on Windows and Android only.")
                .addToggle((toggle) => {
                    windowsAndroidToggleComponent = toggle; // Store reference
                    toggle.setValue(this.plugin.settings.windowsAndroidEnabled)
                        .setDisabled(!this.plugin.settings.enableForbiddenCharReplacements)
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
                            updateWindowsAndroidUI();
                        });

                    // Make toggle completely non-interactive when disabled
                    if (!this.plugin.settings.enableForbiddenCharReplacements) {
                        toggle.toggleEl.style.pointerEvents = 'none';
                        toggle.toggleEl.style.opacity = '0.5';
                        toggle.toggleEl.tabIndex = -1;
                        toggle.toggleEl.setAttribute('aria-disabled', 'true');
                    }
                });
            windowsAndroidHeaderSetting.settingEl.addClass('flit-master-toggle');
            charSettingsContainer.createEl("br");

            // Create Windows/Android character table
            windowsAndroidTableContainer = charSettingsContainer.createEl('div', { cls: 'flit-table-container' });
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
                    toggle.setValue((this.plugin.settings.hasEnabledForbiddenChars && this.plugin.settings.hasEnabledWindowsAndroid) ? this.plugin.settings.charReplacementEnabled[setting.key] : false)
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementEnabled[setting.key] = value;
                            this.plugin.debugLog(`charReplacementEnabled.${setting.key}`, value);
                            await this.plugin.saveSettings();
                            updateRowAppearance();
                        });
                    toggle.toggleEl.style.margin = "0";
                    toggleContainer.appendChild(toggle.toggleEl);
                });

                const updateRowAppearance = () => {
                    if (this.plugin.settings.charReplacementEnabled[setting.key]) {
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
                    this.plugin.debugLog(`charReplacements[${setting.key}]`, this.plugin.settings.charReplacements[setting.key]);
                    await this.plugin.saveSettings();
                });

                // Add forbidden character protection (always block Windows/Android chars in this section)
                this.addForbiddenCharProtection(textInput, true);

                // Trim left toggle
                const trimLeftContainer = rowEl.createDiv({ cls: "flit-toggle-column center" });
                const trimLeftSetting = new Setting(document.createElement('div'));
                trimLeftSetting.addToggle((toggle) => {
                    toggle.setValue((this.plugin.settings.hasEnabledForbiddenChars && this.plugin.settings.hasEnabledWindowsAndroid) ? this.plugin.settings.charReplacementTrimLeft[setting.key] : false)
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
                    toggle.setValue((this.plugin.settings.hasEnabledForbiddenChars && this.plugin.settings.hasEnabledWindowsAndroid) ? this.plugin.settings.charReplacementTrimRight[setting.key] : false)
                        .onChange(async (value) => {
                            this.plugin.settings.charReplacementTrimRight[setting.key] = value;
                            await this.plugin.saveSettings();
                        });
                    toggle.toggleEl.style.margin = "0";
                    trimRightContainer.appendChild(toggle.toggleEl);
                });

                updateRowAppearance();
            });
        };

        const updateWindowsAndroidUI = () => {
            if (this.plugin.settings.windowsAndroidEnabled) {
                windowsAndroidTableContainer.show();
            } else {
                windowsAndroidTableContainer.hide();
            }
        };

        // Initialize all settings and UI
        updateCharacterSettings();
        updateCharacterReplacementUI();
        updateWindowsAndroidUI();
    }
}