import { Setting, setIcon } from "obsidian";
import { SettingsTabBase, FirstLineIsTitlePlugin } from './settings-base';

export class CommandsTab extends SettingsTabBase {
    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    render(): void {
        // Ribbon Section
        const ribbonHeaderSetting = new Setting(this.containerEl)
            .setName("Ribbon commands")
            .setDesc("Control which commands appear in the ribbon menu. Reload plugin or Obsidian to apply.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableRibbon)
                    .onChange(async (value) => {
                        this.plugin.settings.enableRibbon = value;
                        this.plugin.debugLog('enableRibbon', value);
                        await this.plugin.saveSettings();
                        updateRibbonUI();
                    });
            });
        ribbonHeaderSetting.settingEl.addClass('flit-master-toggle');
        this.containerEl.createEl("br");

        // Create container for ribbon settings
        const ribbonContainer = this.containerEl.createDiv();

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
        const commandPaletteHeaderSetting = new Setting(this.containerEl)
            .setName("Command palette commands")
            .setDesc("Control which commands appear in the Command palette (Ctrl/Cmd-P on desktop by default). Reload plugin or Obsidian to apply.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableCommandPalette)
                    .onChange(async (value) => {
                        this.plugin.settings.enableCommandPalette = value;
                        this.plugin.debugLog('enableCommandPalette', value);
                        await this.plugin.saveSettings();
                        updateCommandPaletteUI();
                    });
            });
        commandPaletteHeaderSetting.settingEl.addClass('flit-master-toggle');
        this.containerEl.createEl("br");

        // Create container for command palette settings
        const commandPaletteContainer = this.containerEl.createDiv();
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

        const setting6 = new Setting(commandPaletteContainer)
            .setName("Add safe internal link")
            .setDesc("Create internal link with forbidden characters handled according to plugin settings.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.addSafeInternalLink)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.addSafeInternalLink = value;
                        this.plugin.debugLog('commandVisibility.addSafeInternalLink', value);
                        await this.plugin.saveSettings();
                    })
            );

                const icon6 = setting6.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(icon6, "link");
        setting6.nameEl.insertBefore(icon6, setting6.nameEl.firstChild);

        const setting7 = new Setting(commandPaletteContainer)
            .setName("Add safe internal link with selection as caption")
            .setDesc("Create internal link with safe target and original text as caption.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.commandVisibility.addSafeInternalLinkWithCaption)
                    .onChange(async (value) => {
                        this.plugin.settings.commandVisibility.addSafeInternalLinkWithCaption = value;
                        this.plugin.debugLog('commandVisibility.addSafeInternalLinkWithCaption', value);
                        await this.plugin.saveSettings();
                    })
            );

                const icon7 = setting7.nameEl.createDiv({ cls: "setting-item-icon" });
        setIcon(icon7, "link");
        setting7.nameEl.insertBefore(icon7, setting7.nameEl.firstChild);

        // Initialize command palette UI state
        updateCommandPaletteUI();

        // Track individual subsection toggle states
        let fileCommandsExpanded = true;
        let folderCommandsExpanded = true;
        let tagCommandsExpanded = true;
        let vaultSearchCommandsExpanded = true;

        // File Section
        const fileHeaderSetting = new Setting(this.containerEl)
            .setName("File commands")
            .setDesc("Control which commands appear in the file context menu.")
            .addToggle((toggle) => {
                toggle.setValue(fileCommandsExpanded)
                    .onChange(async (value) => {
                        fileCommandsExpanded = value;
                        updateFileUI();
                    });
            });

        fileHeaderSetting.settingEl.addClass('flit-master-toggle');
        this.containerEl.createEl("br");

        const fileContainer = this.containerEl.createDiv();
        fileContainer.addClass('flit-master-disable-target');

        const updateFileUI = () => {
            if (fileCommandsExpanded) {
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
        const folderHeaderSetting = new Setting(this.containerEl)
            .setName("Folder commands")
            .setDesc("Control which commands appear in the folder context menu.")
            .addToggle((toggle) => {
                toggle.setValue(folderCommandsExpanded)
                    .onChange(async (value) => {
                        folderCommandsExpanded = value;
                        updateFolderUI();
                    });
            });

        folderHeaderSetting.settingEl.addClass('flit-master-toggle');
        this.containerEl.createEl("br");

        const folderContainer = this.containerEl.createDiv();
        folderContainer.addClass('flit-master-disable-target');

        const updateFolderUI = () => {
            if (folderCommandsExpanded) {
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
        const tagHeaderSetting = new Setting(this.containerEl)
            .setName("Tag commands")
            .setDesc("Control which commands appear in the tag context menu.")
            .addToggle((toggle) => {
                toggle.setValue(tagCommandsExpanded)
                    .onChange(async (value) => {
                        tagCommandsExpanded = value;
                        updateTagUI();
                    });
            });

        tagHeaderSetting.settingEl.addClass('flit-master-toggle');
        this.containerEl.createEl("br");

        const tagContainer = this.containerEl.createDiv();
        tagContainer.addClass('flit-master-disable-target');

        const updateTagUI = () => {
            if (tagCommandsExpanded) {
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
        const vaultSearchHeaderSetting = new Setting(this.containerEl)
            .setName("Vault search commands")
            .setDesc("Control which commands appear in the context menu for search results.")
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
        this.containerEl.createEl("br");

        // Create dedicated container for vault search content
        const vaultSearchContainer = this.containerEl.createDiv({ cls: 'flit-vault-search-container' });
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
}