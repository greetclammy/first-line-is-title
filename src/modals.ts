import { Modal, App, TFile, TFolder, Notice } from "obsidian";
import { PluginSettings } from './types';
import { verboseLog, shouldProcessFile, normalizeTag } from './utils';
import { t, getPluralForm, tpSplit } from './i18n';

interface FirstLineIsTitlePlugin {
    settings: PluginSettings;
    app: App;
    renameEngine?: {
        processFile(file: TFile, noDelay: boolean, showNotices: boolean, providedContent?: string, isBatchOperation?: boolean, exclusionOverrides?: any): Promise<any>;
    };
    cacheManager?: {
        clearReservedPaths(): void;
    };
    propertyManager?: {
        ensurePropertyTypeIsCheckbox(): Promise<void>;
    };
    saveSettings(): Promise<void>;
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

        this.setTitle(t('modals.caution'));

        // Count all markdown files
        const allFiles = this.app.vault.getMarkdownFiles();
        const count = allFiles.length;

        const messagePara = contentEl.createEl("p");
        const parts = tpSplit('modals.processNNotes', count);
        messagePara.appendText(parts.before);
        messagePara.createEl("strong", { text: `${count} ${parts.noun}` });
        messagePara.appendText(parts.after);

        const ensureList = contentEl.createEl("p", { text: t('modals.ensure'), cls: "flit-margin-top-10 flit-margin-bottom-10" });

        const ul = contentEl.createEl("ul", { cls: "flit-margin-0 flit-padding-left-20" });

        const li1 = ul.createEl("li");
        const backupText = t('modals.filesBackedUp');
        const backupParts = backupText.split(t('modals.backedUpLinkText'));
        li1.appendText(backupParts[0]);
        li1.createEl("a", { text: t('modals.backedUpLinkText'), href: "https://help.obsidian.md/backup" });
        if (backupParts[1]) li1.appendText(backupParts[1]);

        ul.createEl("li", { text: t('modals.exclusionsConfigured') });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: t('modals.buttons.cancel') });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: t('modals.buttons.rename') });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            this.close();
            await this.renameAllFiles();
        };
    }

    async renameAllFiles() {
        let filesToRename: TFile[] = [];
        this.app.vault.getMarkdownFiles().forEach((file) => {
            if (shouldProcessFile(file, this.plugin.settings, this.app, undefined, undefined, this.plugin)) {
                filesToRename.push(file);
            }
        });

        filesToRename.sort((a, b) => a.stat.ctime - b.stat.ctime);

        const renamingMsg = t('notifications.renamingNNotes').replace('{{count}}', String(filesToRename.length));
        verboseLog(this.plugin, `Showing notice: ${renamingMsg}`);
        const pleaseWaitNotice = new Notice(renamingMsg, 0);

        verboseLog(this.plugin, `Starting bulk rename of ${filesToRename.length} files`);

        const exclusionOverrides = {
            ignoreFolder: true,
            ignoreTag: true,
            ignoreProperty: true
        };

        let renamedFileCount = 0;
        try {
            const errors: string[] = [];

            for (const file of filesToRename) {
                try {
                    const result = await this.plugin.renameEngine?.processFile(file, true, true, undefined, true, exclusionOverrides);
                    if (result?.success) {
                        renamedFileCount++;
                    }
                } catch (error) {
                    errors.push(`Failed to rename ${file.path}: ${error}`);
                    console.error(`Error renaming ${file.path}`, error);
                }
            }

            if (errors.length > 0) {
                const errorMsg = t('notifications.renamedNotesWithErrors')
                    .replace('{{renamed}}', String(renamedFileCount))
                    .replace('{{total}}', String(filesToRename.length))
                    .replace('{{errors}}', String(errors.length));
                verboseLog(this.plugin, `Showing notice: ${errorMsg}`);
                new Notice(errorMsg, 0);
                console.error('Rename errors:', errors);
            }
        } finally {
            if (this.plugin.cacheManager) {
                this.plugin.cacheManager.clearReservedPaths();
                verboseLog(this.plugin, 'Cache cleaned up immediately after batch operation');
            }

            pleaseWaitNotice.hide();
            const renamedMsg = t('notifications.renamedNotes')
                .replace('{{renamed}}', String(renamedFileCount))
                .replace('{{total}}', String(filesToRename.length));
            verboseLog(this.plugin, `Showing notice: ${renamedMsg}`);
            new Notice(renamedMsg, 0);
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

        this.setTitle(t('modals.caution'));

        const folderFiles = this.app.vault.getAllLoadedFiles()
            .filter((f: any) => f instanceof TFile && f.extension === 'md')
            .filter((f: any) => f.path.startsWith(this.folder.path + "/") || f.parent?.path === this.folder.path);
        const count = folderFiles.length;

        const messagePara = contentEl.createEl("p");
        const parts = tpSplit('modals.processNNotes', count);
        messagePara.appendText(parts.before);
        messagePara.createEl("strong", { text: `${count} ${parts.noun}` });
        messagePara.appendText(parts.after);
        messagePara.createEl("br");
        messagePara.createEl("br");
        const backupText = t('modals.ensureFilesBackedUp');
        const backupParts = backupText.split(t('modals.backedUpLinkText'));
        messagePara.appendText(backupParts[0]);
        messagePara.createEl("a", { text: t('modals.backedUpLinkText'), href: "https://help.obsidian.md/backup" });
        if (backupParts[1]) messagePara.appendText(backupParts[1]);

        const optionsContainer = contentEl.createDiv({ cls: "flit-modal-options" });

        // Checkboxes
        const subfoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const subfoldersCheckbox = subfoldersContainer.createEl("input", { type: "checkbox" });
        subfoldersCheckbox.id = "rename-subfolders";
        subfoldersCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.folderRename.includeSubfolders;

        const subfoldersLabel = subfoldersContainer.createEl("label");
        subfoldersLabel.setAttribute("for", "rename-subfolders");
        subfoldersLabel.textContent = t('modals.renameInAllSubfolders');

        const excludedFoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedFoldersCheckbox = excludedFoldersContainer.createEl("input", { type: "checkbox" });
        excludedFoldersCheckbox.id = "rename-excluded-folders";
        excludedFoldersCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedFolders;

        const excludedFoldersLabel = excludedFoldersContainer.createEl("label");
        excludedFoldersLabel.setAttribute("for", "rename-excluded-folders");
        excludedFoldersLabel.textContent = t('modals.renameInExcludedFolders');

        // Rename excluded tags checkbox
        const excludedTagsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedTagsCheckbox = excludedTagsContainer.createEl("input", { type: "checkbox" });
        excludedTagsCheckbox.id = "rename-excluded-tags";
        excludedTagsCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedTags;

        const excludedTagsLabel = excludedTagsContainer.createEl("label");
        excludedTagsLabel.setAttribute("for", "rename-excluded-tags");
        excludedTagsLabel.textContent = t('modals.renameWithExcludedTags');

        // Rename excluded properties checkbox
        const excludedPropsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedPropsCheckbox = excludedPropsContainer.createEl("input", { type: "checkbox" });
        excludedPropsCheckbox.id = "rename-excluded-properties";
        excludedPropsCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedProperties;

        const excludedPropsLabel = excludedPropsContainer.createEl("label");
        excludedPropsLabel.setAttribute("for", "rename-excluded-properties");
        excludedPropsLabel.textContent = t('modals.renameWithExcludedProperties');

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: t('modals.buttons.cancel') });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: t('modals.buttons.rename') });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            this.plugin.settings.core.modalCheckboxStates.folderRename.includeSubfolders = subfoldersCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedFolders = excludedFoldersCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedTags = excludedTagsCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedProperties = excludedPropsCheckbox.checked;
            await this.plugin.saveSettings();

            this.close();
            await this.renameFolderFiles(
                subfoldersCheckbox.checked,
                excludedFoldersCheckbox.checked,
                excludedTagsCheckbox.checked,
                excludedPropsCheckbox.checked
            );
        };
    }

    async renameFolderFiles(
        includeSubfolders: boolean,
        renameExcludedFolders: boolean,
        renameExcludedTags: boolean,
        renameExcludedProperties: boolean
    ) {
        const allFiles = this.app.vault.getMarkdownFiles();
        const directFolderFiles: TFile[] = [];
        const subfolderFiles: TFile[] = [];

        for (const file of allFiles) {
            const isInFolder = file.parent?.path === this.folder.path;
            const isInSubfolder = file.path.startsWith(this.folder.path + "/") && file.parent?.path !== this.folder.path;

            if (isInFolder) {
                directFolderFiles.push(file);
            } else if (includeSubfolders && isInSubfolder) {
                subfolderFiles.push(file);
            }
        }

        // Calculate total files in folder (including all subfolders, regardless of checkbox)
        const totalFiles = allFiles.filter(file =>
            file.path.startsWith(this.folder.path + "/") || file.parent?.path === this.folder.path
        ).length;
        directFolderFiles.sort((a, b) => a.stat.ctime - b.stat.ctime);
        subfolderFiles.sort((a, b) => a.stat.ctime - b.stat.ctime);

        const renamingMsg = t('notifications.renamingNNotes').replace('{{count}}', String(totalFiles));
        verboseLog(this.plugin, renamingMsg);
        const pleaseWaitNotice = new Notice(renamingMsg, 0);

        let renamedFileCount = 0;
        try {
            // Process direct folder files - always ignore folder exclusion for selected folder
            const directFolderOverrides = {
                ignoreFolder: true,
                ignoreTag: renameExcludedTags,
                ignoreProperty: renameExcludedProperties
            };

            for (const file of directFolderFiles) {
                try {
                    const result = await this.plugin.renameEngine?.processFile(file, true, true, undefined, true, directFolderOverrides);
                    if (result?.success) {
                        renamedFileCount++;
                    }
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }

            // Process subfolder files - respect renameExcludedFolders checkbox for subfolders
            const subfolderOverrides = {
                ignoreFolder: renameExcludedFolders,
                ignoreTag: renameExcludedTags,
                ignoreProperty: renameExcludedProperties
            };

            for (const file of subfolderFiles) {
                try {
                    const result = await this.plugin.renameEngine?.processFile(file, true, true, undefined, true, subfolderOverrides);
                    if (result?.success) {
                        renamedFileCount++;
                    }
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }
        } finally {
            if (this.plugin.cacheManager) {
                this.plugin.cacheManager.clearReservedPaths();
            }

            pleaseWaitNotice.hide();
            verboseLog(this.plugin, `Renamed ${renamedFileCount}/${totalFiles} notes.`);
            const renamedMsg = t('notifications.renamedNotes')
                .replace('{{renamed}}', String(renamedFileCount))
                .replace('{{total}}', String(totalFiles));
            new Notice(renamedMsg, 0);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class RenameMultipleFoldersModal extends Modal {
    plugin: FirstLineIsTitlePlugin;
    folders: TFolder[];

    constructor(app: App, plugin: FirstLineIsTitlePlugin, folders: TFolder[]) {
        super(app);
        this.plugin = plugin;
        this.folders = folders;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.setTitle(t('modals.caution'));

        // Count all files from all folders
        let totalFiles = 0;
        this.folders.forEach(folder => {
            const folderFiles = this.app.vault.getAllLoadedFiles()
                .filter((f: any) => f instanceof TFile && f.extension === 'md')
                .filter((f: any) => f.path.startsWith(folder.path + "/") || f.parent?.path === folder.path);
            totalFiles += folderFiles.length;
        });

        const messagePara = contentEl.createEl("p");
        const parts = tpSplit('modals.processNNotes', totalFiles);
        messagePara.appendText(parts.before);
        messagePara.createEl("strong", { text: `${totalFiles} ${parts.noun}` });
        messagePara.appendText(parts.after);
        messagePara.createEl("br");
        messagePara.createEl("br");
        const backupText = t('modals.ensureFilesBackedUp');
        const backupParts = backupText.split(t('modals.backedUpLinkText'));
        messagePara.appendText(backupParts[0]);
        messagePara.createEl("a", { text: t('modals.backedUpLinkText'), href: "https://help.obsidian.md/backup" });
        if (backupParts[1]) messagePara.appendText(backupParts[1]);

        const optionsContainer = contentEl.createDiv({ cls: "flit-modal-options" });

        // Checkboxes
        const subfoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const subfoldersCheckbox = subfoldersContainer.createEl("input", { type: "checkbox" });
        subfoldersCheckbox.id = "rename-subfolders";
        subfoldersCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.folderRename.includeSubfolders;

        const subfoldersLabel = subfoldersContainer.createEl("label");
        subfoldersLabel.setAttribute("for", "rename-subfolders");
        subfoldersLabel.textContent = t('modals.renameInAllSubfolders');

        const excludedFoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedFoldersCheckbox = excludedFoldersContainer.createEl("input", { type: "checkbox" });
        excludedFoldersCheckbox.id = "rename-excluded-folders";
        excludedFoldersCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedFolders;

        const excludedFoldersLabel = excludedFoldersContainer.createEl("label");
        excludedFoldersLabel.setAttribute("for", "rename-excluded-folders");
        excludedFoldersLabel.textContent = t('modals.renameInExcludedFolders');

        const excludedTagsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedTagsCheckbox = excludedTagsContainer.createEl("input", { type: "checkbox" });
        excludedTagsCheckbox.id = "rename-excluded-tags";
        excludedTagsCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedTags;

        const excludedTagsLabel = excludedTagsContainer.createEl("label");
        excludedTagsLabel.setAttribute("for", "rename-excluded-tags");
        excludedTagsLabel.textContent = t('modals.renameWithExcludedTags');

        const excludedPropsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedPropsCheckbox = excludedPropsContainer.createEl("input", { type: "checkbox" });
        excludedPropsCheckbox.id = "rename-excluded-properties";
        excludedPropsCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedProperties;

        const excludedPropsLabel = excludedPropsContainer.createEl("label");
        excludedPropsLabel.setAttribute("for", "rename-excluded-properties");
        excludedPropsLabel.textContent = t('modals.renameWithExcludedProperties');

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: t('modals.buttons.cancel') });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: t('modals.buttons.rename') });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            this.plugin.settings.core.modalCheckboxStates.folderRename.includeSubfolders = subfoldersCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedFolders = excludedFoldersCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedTags = excludedTagsCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.folderRename.renameExcludedProperties = excludedPropsCheckbox.checked;
            await this.plugin.saveSettings();

            this.close();
            await this.renameMultipleFolders(
                subfoldersCheckbox.checked,
                excludedFoldersCheckbox.checked,
                excludedTagsCheckbox.checked,
                excludedPropsCheckbox.checked
            );
        };
    }

    async renameMultipleFolders(
        includeSubfolders: boolean,
        renameExcludedFolders: boolean,
        renameExcludedTags: boolean,
        renameExcludedProperties: boolean
    ) {
        const allFiles = this.app.vault.getMarkdownFiles();
        const directFolderFiles: TFile[] = [];
        const subfolderFiles: TFile[] = [];

        for (const folder of this.folders) {
            for (const file of allFiles) {
                const isInFolder = file.parent?.path === folder.path;
                const isInSubfolder = file.path.startsWith(folder.path + "/") && file.parent?.path !== folder.path;

                if (isInFolder && !directFolderFiles.includes(file)) {
                    directFolderFiles.push(file);
                } else if (includeSubfolders && isInSubfolder && !subfolderFiles.includes(file)) {
                    subfolderFiles.push(file);
                }
            }
        }

        // Calculate total files in all folders (including all subfolders, regardless of checkbox)
        const totalFilesSet = new Set<string>();
        for (const folder of this.folders) {
            allFiles.forEach(file => {
                if (file.path.startsWith(folder.path + "/") || file.parent?.path === folder.path) {
                    totalFilesSet.add(file.path);
                }
            });
        }
        const totalFiles = totalFilesSet.size;
        directFolderFiles.sort((a, b) => a.stat.ctime - b.stat.ctime);
        subfolderFiles.sort((a, b) => a.stat.ctime - b.stat.ctime);

        const renamingMsg = t('notifications.renamingNNotes').replace('{{count}}', String(totalFiles));
        verboseLog(this.plugin, renamingMsg);
        const pleaseWaitNotice = new Notice(renamingMsg, 0);

        let renamedFileCount = 0;
        try {
            // Process direct folder files - always ignore folder exclusion for selected folders
            const directFolderOverrides = {
                ignoreFolder: true,
                ignoreTag: renameExcludedTags,
                ignoreProperty: renameExcludedProperties
            };

            for (const file of directFolderFiles) {
                try {
                    const result = await this.plugin.renameEngine?.processFile(file, true, true, undefined, true, directFolderOverrides);
                    if (result?.success) {
                        renamedFileCount++;
                    }
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }

            // Process subfolder files - respect renameExcludedFolders checkbox for subfolders
            const subfolderOverrides = {
                ignoreFolder: renameExcludedFolders,
                ignoreTag: renameExcludedTags,
                ignoreProperty: renameExcludedProperties
            };

            for (const file of subfolderFiles) {
                try {
                    const result = await this.plugin.renameEngine?.processFile(file, true, true, undefined, true, subfolderOverrides);
                    if (result?.success) {
                        renamedFileCount++;
                    }
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }
        } finally {
            if (this.plugin.cacheManager) {
                this.plugin.cacheManager.clearReservedPaths();
            }

            pleaseWaitNotice.hide();
            verboseLog(this.plugin, `Renamed ${renamedFileCount}/${totalFiles} notes.`);
            const renamedMsg = t('notifications.renamedNotes')
                .replace('{{renamed}}', String(renamedFileCount))
                .replace('{{total}}', String(totalFiles));
            new Notice(renamedMsg, 0);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class ProcessTagModal extends Modal {
    plugin: FirstLineIsTitlePlugin;
    tag: string;

    constructor(app: App, plugin: FirstLineIsTitlePlugin, tag: string) {
        super(app);
        this.plugin = plugin;
        this.tag = tag;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.setTitle(t('modals.caution'));

        // Count files with tag
        const allFiles = this.app.vault.getMarkdownFiles();
        let count = 0;
        for (const file of allFiles) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter?.tags) {
                const frontmatterTags = Array.isArray(cache.frontmatter.tags)
                    ? cache.frontmatter.tags
                    : [cache.frontmatter.tags];
                for (const tag of frontmatterTags) {
                    const normalizedTag = normalizeTag(tag);
                    if (normalizedTag === this.tag || normalizedTag.startsWith(`${this.tag}/`)) {
                        count++;
                        break;
                    }
                }
            }
            if (cache?.tags) {
                for (const tagCache of cache.tags) {
                    const normalizedTag = normalizeTag(tagCache.tag);
                    if (normalizedTag === this.tag || normalizedTag.startsWith(`${this.tag}/`)) {
                        count++;
                        break;
                    }
                }
            }
        }

        const messagePara = contentEl.createEl("p");
        const parts = tpSplit('modals.processNotesMessage', count);
        messagePara.appendText(parts.before);
        messagePara.createEl("strong", { text: `${count} ${parts.noun}` });
        messagePara.appendText(parts.after);
        messagePara.createEl("br");
        messagePara.createEl("br");
        const backupText = t('modals.ensureFilesBackedUp');
        const backupParts = backupText.split(t('modals.backedUpLinkText'));
        messagePara.appendText(backupParts[0]);
        messagePara.createEl("a", { text: t('modals.backedUpLinkText'), href: "https://help.obsidian.md/backup" });
        if (backupParts[1]) messagePara.appendText(backupParts[1]);

        const optionsContainer = contentEl.createDiv({ cls: "flit-modal-options" });

        // Rename notes with child tags checkbox
        const childTagsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const childTagsCheckbox = childTagsContainer.createEl("input", { type: "checkbox" });
        childTagsCheckbox.id = "rename-child-tags";
        childTagsCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.tagRename.includeChildTags;

        const childTagsLabel = childTagsContainer.createEl("label");
        childTagsLabel.setAttribute("for", "rename-child-tags");
        childTagsLabel.textContent = t('modals.renameWithChildTags');

        // Rename excluded folders checkbox
        const excludedFoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedFoldersCheckbox = excludedFoldersContainer.createEl("input", { type: "checkbox" });
        excludedFoldersCheckbox.id = "rename-excluded-folders";
        excludedFoldersCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.tagRename.renameExcludedFolders;

        const excludedFoldersLabel = excludedFoldersContainer.createEl("label");
        excludedFoldersLabel.setAttribute("for", "rename-excluded-folders");
        excludedFoldersLabel.textContent = t('modals.renameInExcludedFolders');

        // Rename excluded tags checkbox
        const excludedTagsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedTagsCheckbox = excludedTagsContainer.createEl("input", { type: "checkbox" });
        excludedTagsCheckbox.id = "rename-excluded-tags";
        excludedTagsCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.tagRename.renameExcludedTags;

        const excludedTagsLabel = excludedTagsContainer.createEl("label");
        excludedTagsLabel.setAttribute("for", "rename-excluded-tags");
        excludedTagsLabel.textContent = t('modals.renameWithExcludedTags');

        // Rename excluded properties checkbox
        const excludedPropsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedPropsCheckbox = excludedPropsContainer.createEl("input", { type: "checkbox" });
        excludedPropsCheckbox.id = "rename-excluded-properties";
        excludedPropsCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.tagRename.renameExcludedProperties;

        const excludedPropsLabel = excludedPropsContainer.createEl("label");
        excludedPropsLabel.setAttribute("for", "rename-excluded-properties");
        excludedPropsLabel.textContent = t('modals.renameWithExcludedProperties');

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: t('modals.buttons.cancel') });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: t('modals.buttons.rename') });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            // Save checkbox states only when command is run
            this.plugin.settings.core.modalCheckboxStates.tagRename.includeChildTags = childTagsCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.tagRename.renameExcludedFolders = excludedFoldersCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.tagRename.renameExcludedTags = excludedTagsCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.tagRename.renameExcludedProperties = excludedPropsCheckbox.checked;
            await this.plugin.saveSettings();

            this.close();
            await this.processTagFiles(
                childTagsCheckbox.checked,
                excludedFoldersCheckbox.checked,
                excludedTagsCheckbox.checked,
                excludedPropsCheckbox.checked
            );
        };
    }

    async processTagFiles(
        includeChildTags: boolean,
        renameExcludedFolders: boolean,
        renameExcludedTags: boolean,
        renameExcludedProperties: boolean
    ) {
        const filesToProcess: TFile[] = [];
        const allFiles = this.app.vault.getMarkdownFiles();

        for (const file of allFiles) {
            let hasMatchingTag = false;

            // Check YAML frontmatter tags
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter?.tags) {
                const frontmatterTags = Array.isArray(cache.frontmatter.tags)
                    ? cache.frontmatter.tags
                    : [cache.frontmatter.tags];

                for (const tag of frontmatterTags) {
                    const normalizedTag = normalizeTag(tag);
                    if (normalizedTag === this.tag) {
                        hasMatchingTag = true;
                        break;
                    }
                    if (includeChildTags && normalizedTag.startsWith(`${this.tag}/`)) {
                        hasMatchingTag = true;
                        break;
                    }
                }
            }

            // Check metadata cache tags (includes body tags)
            if (!hasMatchingTag && cache?.tags) {
                for (const tagCache of cache.tags) {
                    const normalizedTag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag;
                    if (normalizedTag === this.tag) {
                        hasMatchingTag = true;
                        break;
                    }
                    if (includeChildTags && normalizedTag.startsWith(`${this.tag}/`)) {
                        hasMatchingTag = true;
                        break;
                    }
                }
            }

            if (!hasMatchingTag) {
                continue;
            }

            filesToProcess.push(file);
        }

        if (filesToProcess.length === 0) {
            verboseLog(this.plugin, `No notes found with ${this.tag}`);
            new Notice(t('notifications.noNotesFoundWithTag').replace('{{tag}}', this.tag));
            return;
        }

        filesToProcess.sort((a, b) => a.stat.ctime - b.stat.ctime);

        verboseLog(this.plugin, `Renaming ${filesToProcess.length} files with tag ${this.tag}...`);
        const renamingMsg = t('notifications.renamingNNotes').replace('{{count}}', String(filesToProcess.length));
        const pleaseWaitNotice = new Notice(renamingMsg, 0);
        let renamedCount = 0;

        const exclusionOverrides = {
            ignoreFolder: renameExcludedFolders,
            ignoreTag: renameExcludedTags,
            ignoreProperty: renameExcludedProperties
        };

        try {
            for (const file of filesToProcess) {
                try {
                    const result = await this.plugin.renameEngine?.processFile(file, true, true, undefined, true, exclusionOverrides);
                    if (result?.success) {
                        renamedCount++;
                    }
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }
        } finally {
            if (this.plugin.cacheManager) {
                this.plugin.cacheManager.clearReservedPaths();
            }

            pleaseWaitNotice.hide();
            verboseLog(this.plugin, `Renamed ${renamedCount}/${filesToProcess.length} files with tag ${this.tag}`);
            const renamedMsg = t('notifications.renamedNotes')
                .replace('{{renamed}}', String(renamedCount))
                .replace('{{total}}', String(filesToProcess.length));
            new Notice(renamedMsg, 0);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class ClearSettingsModal extends Modal {
    plugin: FirstLineIsTitlePlugin;
    onConfirm: () => Promise<void>;

    constructor(app: App, plugin: FirstLineIsTitlePlugin, onConfirm: () => Promise<void>) {
        super(app);
        this.plugin = plugin;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.setTitle(t('modals.caution'));
        contentEl.createEl("p", {
            text: t('modals.resetAllSettings')
        });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: t('modals.buttons.cancel') });
        cancelButton.onclick = () => this.close();

        const clearButton = buttonContainer.createEl("button", { text: t('settings.other.clearSettings.modalButton') });
        clearButton.addClass("mod-warning");
        clearButton.onclick = async () => {
            this.close();
            await this.onConfirm();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class RenameModal extends Modal {
    plugin: FirstLineIsTitlePlugin;
    files: TFile[];

    constructor(app: App, plugin: FirstLineIsTitlePlugin, files: TFile[]) {
        super(app);
        this.plugin = plugin;
        this.files = files;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.setTitle(t('modals.caution'));

        const count = this.files.length;
        const messagePara = contentEl.createEl("p");
        const parts = tpSplit('modals.processNotesMessage', count);
        messagePara.appendText(parts.before);
        messagePara.createEl("strong", { text: `${count} ${parts.noun}` });
        messagePara.appendText(parts.after);
        messagePara.createEl("br");
        messagePara.createEl("br");
        const backupText = t('modals.ensureFilesBackedUp');
        const backupParts = backupText.split(t('modals.backedUpLinkText'));
        messagePara.appendText(backupParts[0]);
        messagePara.createEl("a", { text: t('modals.backedUpLinkText'), href: "https://help.obsidian.md/backup" });
        if (backupParts[1]) messagePara.appendText(backupParts[1]);

        // Checkbox container
        const optionsContainer = contentEl.createDiv({ cls: "flit-modal-options" });

        // Rename excluded folders checkbox
        const excludedFoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedFoldersCheckbox = excludedFoldersContainer.createEl("input", { type: "checkbox" });
        excludedFoldersCheckbox.id = "rename-excluded-folders";
        excludedFoldersCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.searchRename.renameExcludedFolders;

        const excludedFoldersLabel = excludedFoldersContainer.createEl("label");
        excludedFoldersLabel.setAttribute("for", "rename-excluded-folders");
        excludedFoldersLabel.textContent = t('modals.renameInExcludedFolders');

        // Rename excluded tags checkbox
        const excludedTagsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedTagsCheckbox = excludedTagsContainer.createEl("input", { type: "checkbox" });
        excludedTagsCheckbox.id = "rename-excluded-tags";
        excludedTagsCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.searchRename.renameExcludedTags;

        const excludedTagsLabel = excludedTagsContainer.createEl("label");
        excludedTagsLabel.setAttribute("for", "rename-excluded-tags");
        excludedTagsLabel.textContent = t('modals.renameWithExcludedTags');

        // Rename excluded properties checkbox
        const excludedPropsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedPropsCheckbox = excludedPropsContainer.createEl("input", { type: "checkbox" });
        excludedPropsCheckbox.id = "rename-excluded-properties";
        excludedPropsCheckbox.checked = this.plugin.settings.core.modalCheckboxStates.searchRename.renameExcludedProperties;

        const excludedPropsLabel = excludedPropsContainer.createEl("label");
        excludedPropsLabel.setAttribute("for", "rename-excluded-properties");
        excludedPropsLabel.textContent = t('modals.renameWithExcludedProperties');

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: t('modals.buttons.cancel') });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: t('modals.buttons.rename') });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            // Save checkbox states only when command is run
            this.plugin.settings.core.modalCheckboxStates.searchRename.renameExcludedFolders = excludedFoldersCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.searchRename.renameExcludedTags = excludedTagsCheckbox.checked;
            this.plugin.settings.core.modalCheckboxStates.searchRename.renameExcludedProperties = excludedPropsCheckbox.checked;
            await this.plugin.saveSettings();

            this.close();
            await this.renameFiles(
                excludedFoldersCheckbox.checked,
                excludedTagsCheckbox.checked,
                excludedPropsCheckbox.checked
            );
        };
    }

    async renameFiles(
        renameExcludedFolders: boolean,
        renameExcludedTags: boolean,
        renameExcludedProperties: boolean
    ) {
        const filesToProcess = [...this.files];
        filesToProcess.sort((a, b) => a.stat.ctime - b.stat.ctime);

        verboseLog(this.plugin, `Renaming ${filesToProcess.length} notes...`);
        const renamingMsg = t('notifications.renamingNNotes').replace('{{count}}', String(filesToProcess.length));
        const pleaseWaitNotice = new Notice(renamingMsg, 0);

        const exclusionOverrides = {
            ignoreFolder: renameExcludedFolders,
            ignoreTag: renameExcludedTags,
            ignoreProperty: renameExcludedProperties
        };

        let renamedFileCount = 0;
        try {
            for (const file of filesToProcess) {
                try {
                    const result = await this.plugin.renameEngine?.processFile(file, true, true, undefined, true, exclusionOverrides);
                    if (result?.success) {
                        renamedFileCount++;
                    }
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }
        } finally {
            if (this.plugin.cacheManager) {
                this.plugin.cacheManager.clearReservedPaths();
            }

            pleaseWaitNotice.hide();
            verboseLog(this.plugin, `Renamed ${renamedFileCount}/${filesToProcess.length} notes.`);
            const renamedMsg = t('notifications.renamedNotes')
                .replace('{{renamed}}', String(renamedFileCount))
                .replace('{{total}}', String(filesToProcess.length));
            new Notice(renamedMsg, 0);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class DisableEnableModal extends Modal {
    plugin: FirstLineIsTitlePlugin;
    files: TFile[];
    action: 'disable' | 'enable';

    constructor(app: App, plugin: FirstLineIsTitlePlugin, files: TFile[], action: 'disable' | 'enable') {
        super(app);
        this.plugin = plugin;
        this.files = files;
        this.action = action;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        this.setTitle(t('modals.caution'));

        const key = this.plugin.settings.exclusions.disableRenamingKey;
        const value = this.plugin.settings.exclusions.disableRenamingValue;
        const count = this.files.length;

        const messagePara = contentEl.createEl("p");
        messagePara.appendText(this.action === 'disable' ? t('modals.disableEnableAddProperty') : t('modals.disableEnableRemoveProperty'));
        messagePara.createEl("strong", { text: `${key}:${value}` });
        messagePara.appendText(this.action === 'disable' ? t('modals.propertyTo') : t('modals.propertyFrom'));
        const nounForm = this.action === 'disable'
            ? getPluralForm(count, t('modals.note'), t('modals.noteFew'), t('modals.notes'))
            : (count === 1 ? t('modals.note') : t('modals.notesPrepositional'));
        messagePara.createEl("strong", { text: `${count} ${nounForm}` });
        messagePara.appendText(".");
        messagePara.createEl("br");
        messagePara.createEl("br");
        const backupText = t('modals.ensureFilesBackedUp');
        const backupParts = backupText.split(t('modals.backedUpLinkText'));
        messagePara.appendText(backupParts[0]);
        messagePara.createEl("a", { text: t('modals.backedUpLinkText'), href: "https://help.obsidian.md/backup" });
        if (backupParts[1]) messagePara.appendText(backupParts[1]);

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: t('modals.buttons.cancel') });
        cancelButton.onclick = () => this.close();

        const actionButton = buttonContainer.createEl("button", { text: this.action === 'disable' ? t('modals.buttons.disable') : t('modals.buttons.enable') });
        actionButton.addClass("mod-cta");
        actionButton.onclick = async () => {
            this.close();
            await this.processFiles();
        };
    }

    async processFiles() {
        const filesToProcess = [...this.files];
        filesToProcess.sort((a, b) => a.stat.ctime - b.stat.ctime);

        // Ensure property type is set to checkbox before adding properties
        if (this.action === 'disable') {
            await this.plugin.propertyManager?.ensurePropertyTypeIsCheckbox();
        }

        verboseLog(this.plugin, `Renaming ${filesToProcess.length} notes...`);
        const renamingMsg = t('notifications.renamingNNotes').replace('{{count}}', String(filesToProcess.length));
        const pleaseWaitNotice = new Notice(renamingMsg, 0);

        let processedCount = 0;
        const key = this.plugin.settings.exclusions.disableRenamingKey;
        const value = this.plugin.settings.exclusions.disableRenamingValue;

        try {
            for (const file of filesToProcess) {
                try {
                    const originalMtime = this.plugin.settings.core.preserveModificationDate ? file.stat.mtime : undefined;
                    await this.app.fileManager.processFrontMatter(file, (frontmatter: any) => {
                        if (this.action === 'disable') {
                            frontmatter[key] = value;
                        } else {
                            delete frontmatter[key];
                        }
                    }, originalMtime !== undefined ? { mtime: originalMtime } : undefined);
                    processedCount++;
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }
        } finally {
            pleaseWaitNotice.hide();
            const notificationKey = this.action === 'disable' ? 'notifications.disabledRenamingForNNotes' : 'notifications.enabledRenamingForNNotes';
            const actionPast = this.action === 'disable' ? 'Disabled' : 'Enabled';
            verboseLog(this.plugin, `${actionPast} renaming in ${processedCount} notes.`);
            new Notice(t(notificationKey).replace('{{count}}', String(processedCount)));
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class InternalLinkModal extends Modal {
    plugin: FirstLineIsTitlePlugin;
    onSubmit: (linkTarget: string, linkCaption?: string) => void;
    withCaption: boolean;

    constructor(app: App, plugin: FirstLineIsTitlePlugin, onSubmit: (linkTarget: string, linkCaption?: string) => void, withCaption: boolean = false) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.withCaption = withCaption;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h3", { text: t('modals.internalLink'), cls: "flit-modal-heading-left" });

        // Single text input - always just one field
        const inputContainer = contentEl.createDiv({ cls: "flit-input-container" });
        const textInput = inputContainer.createEl("input", {
            type: "text",
            placeholder: t('modals.enterText'),
            cls: "flit-link-input-full"
        });
        textInput.focus();

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const addButton = buttonContainer.createEl("button", { text: t('modals.buttons.add') });
        addButton.addClass("mod-cta");

        const cancelButton = buttonContainer.createEl("button", { text: t('modals.buttons.cancel') });
        cancelButton.onclick = () => this.close();

        const handleSubmit = () => {
            const inputText = textInput.value.trim();
            if (inputText) {
                this.close();
                this.onSubmit(inputText, this.withCaption ? inputText : undefined);
            }
        };

        addButton.onclick = handleSubmit;

        // Handle Enter key
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
            }
        });

        // Handle Escape key
        contentEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}