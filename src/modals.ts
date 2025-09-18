import { Modal, App, TFile, TFolder, Notice } from "obsidian";
import { PluginSettings } from './types';
import { verboseLog, isFileExcluded } from './utils';

// Need to declare these globals that are defined in main.ts
declare let renamedFileCount: number;
declare let tempNewPaths: string[];

interface FirstLineIsTitlePlugin {
    settings: PluginSettings;
    app: App;
    renameFile(file: TFile, noDelay?: boolean, ignoreExclusions?: boolean): Promise<void>;
    putFirstLineInTitleForFolder(folder: TFolder): Promise<void>;
}

export class RenameAllFilesModal extends Modal {
    plugin: FirstLineIsTitlePlugin;

    constructor(app: App, plugin: FirstLineIsTitlePlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const heading = contentEl.createEl("h2", { text: "Warning", cls: "flit-modal-heading" });
        contentEl.createEl("p", {
            text: "This will edit all of your files except those in excluded folders, and may introduce errors. Make sure you have backed up your files."
        });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: "Rename all files" });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            this.close();
            await this.renameAllFiles();
        };
    }

    async renameAllFiles() {
        let filesToRename: TFile[] = [];
        this.app.vault.getMarkdownFiles().forEach((file) => {
            if (!isFileExcluded(file, this.plugin.settings, this.app)) {
                filesToRename.push(file);
            }
        });

        renamedFileCount = 0;
        tempNewPaths = [];
        const pleaseWaitNotice = new Notice(`Renaming files, please wait...`, 0);

        verboseLog(this.plugin, `Starting bulk rename of ${filesToRename.length} files`);

        try {
            const errors: string[] = [];

            for (const file of filesToRename) {
                try {
                    await this.plugin.renameFile(file, true);
                } catch (error) {
                    errors.push(`Failed to rename ${file.path}: ${error}`);
                    verboseLog(this.plugin, `Error renaming ${file.path}`, error);
                }
            }

            if (errors.length > 0) {
                new Notice(`Completed with ${errors.length} errors. Check console for details.`, 5000);
                console.error('Rename errors:', errors);
            }
        } finally {
            pleaseWaitNotice.hide();
            new Notice(
                `Renamed ${renamedFileCount}/${filesToRename.length} files.`,
                5000
            );
            verboseLog(this.plugin, `Bulk rename completed: ${renamedFileCount}/${filesToRename.length} files renamed`);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class RenameFolderModal extends Modal {
    plugin: FirstLineIsTitlePlugin;
    folder: TFolder;

    constructor(app: App, plugin: FirstLineIsTitlePlugin, folder: TFolder) {
        super(app);
        this.plugin = plugin;
        this.folder = folder;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const heading = contentEl.createEl("h2", { text: "Warning", cls: "flit-modal-heading" });
        contentEl.createEl("p", {
            text: `This will edit all of your files in ${this.folder.path}, and may introduce errors. Make sure you have backed up your files.`
        });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: "Rename all files" });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            this.close();
            await this.plugin.putFirstLineInTitleForFolder(this.folder);
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}