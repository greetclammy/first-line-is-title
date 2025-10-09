import { Modal, App, TFile, TFolder, Notice } from "obsidian";
import { PluginSettings } from './types';
import { verboseLog, isFileExcluded, shouldProcessFile } from './utils';

// Access global variables through globalThis - fetch dynamically to avoid module load order issues
const getGlobals = () => (globalThis as any).flitGlobals;

interface FirstLineIsTitlePlugin {
    settings: PluginSettings;
    app: App;
    renameFile(file: TFile, noDelay?: boolean, ignoreExclusions?: boolean): Promise<void>;
    putFirstLineInTitleForFolder(folder: TFolder): Promise<void>;
    putFirstLineInTitleForTag(tagName: string, omitBodyTags?: boolean, omitNestedTags?: boolean): Promise<void>;
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

        const heading = contentEl.createEl("h2", { text: "Caution", cls: "flit-modal-heading" });

        // Count all markdown files
        const allFiles = this.app.vault.getMarkdownFiles();
        const count = allFiles.length;

        const messagePara = contentEl.createEl("p");
        messagePara.innerHTML = `This will process <strong>${count} ${count === 1 ? 'note' : 'notes'}</strong>, and may introduce errors.`;

        const ensureList = contentEl.createEl("p", { text: "Ensure:" });
        ensureList.style.marginTop = "10px";
        ensureList.style.marginBottom = "10px";

        const ul = contentEl.createEl("ul");
        ul.style.marginTop = "0";
        ul.style.paddingLeft = "20px";

        const li1 = ul.createEl("li");
        li1.appendText("Your files are ");
        li1.createEl("a", { text: "backed up", href: "https://help.obsidian.md/backup" });
        li1.appendText(".");

        ul.createEl("li", { text: "Excluded folders, tags and properties are configured correctly in plugin settings." });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: "Rename" });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            this.close();
            await this.renameAllFiles();
        };
    }

    async renameAllFiles() {
        let filesToRename: TFile[] = [];
        this.app.vault.getMarkdownFiles().forEach((file) => {
            if (shouldProcessFile(file, this.plugin.settings, this.app)) {
                filesToRename.push(file);
            }
        });

        // Sort files by creation time (oldest first) to give chronological priority
        // Older files get clean names, newer files get numbered versions
        filesToRename.sort((a, b) => a.stat.ctime - b.stat.ctime);

        getGlobals()?.setRenamedFileCount(0);
        // No longer need tempNewPaths - each file checks disk state when processed
        verboseLog(this.plugin, `Showing notice: Renaming ${filesToRename.length} notes...`);
        const pleaseWaitNotice = new Notice(`Renaming ${filesToRename.length} notes...`, 0);

        verboseLog(this.plugin, `Starting bulk rename of ${filesToRename.length} files`);

        let renamedFileCount = 0;
        try {
            const errors: string[] = [];

            for (const file of filesToRename) {
                try {
                    await this.plugin.renameEngine.processFile(file, true, true, true, undefined, true);
                    renamedFileCount++;
                } catch (error) {
                    errors.push(`Failed to rename ${file.path}: ${error}`);
                    console.error(`Error renaming ${file.path}`, error);
                }
            }

            if (errors.length > 0) {
                verboseLog(this.plugin, `Showing notice: Renamed ${renamedFileCount}/${filesToRename.length} notes with ${errors.length} errors. Check console for details.`);
                new Notice(`Renamed ${renamedFileCount}/${filesToRename.length} notes with ${errors.length} errors. Check console for details.`, 0);
                console.error('Rename errors:', errors);
            }
        } finally {
            // Immediate cleanup after batch operation
            if (this.plugin.cacheManager) {
                this.plugin.cacheManager.clearReservedPaths();
                verboseLog(this.plugin, 'Cache cleaned up immediately after batch operation');
            }

            pleaseWaitNotice.hide();
            verboseLog(this.plugin, `Showing notice: Renamed ${renamedFileCount}/${filesToRename.length} notes.`);
            new Notice(`Renamed ${renamedFileCount}/${filesToRename.length} notes.`, 0);
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

        const heading = contentEl.createEl("h2", { text: "Caution", cls: "flit-modal-heading" });

        // Count files in folder (for message)
        const folderFiles = this.app.vault.getAllLoadedFiles()
            .filter((f: any) => f instanceof TFile && f.extension === 'md')
            .filter((f: any) => f.path.startsWith(this.folder.path + "/") || f.parent?.path === this.folder.path);
        const count = folderFiles.length;

        const messagePara = contentEl.createEl("p");
        messagePara.innerHTML = `This will process <strong>${count} ${count === 1 ? 'note' : 'notes'}</strong>, and may introduce errors.<br><br>Ensure your files are <a href="https://help.obsidian.md/backup">backed up</a>.`;

        // Checkbox container
        const optionsContainer = contentEl.createDiv({ cls: "flit-modal-options" });

        // Rename notes in subfolders checkbox
        const subfoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const subfoldersCheckbox = subfoldersContainer.createEl("input", { type: "checkbox" });
        subfoldersCheckbox.id = "rename-subfolders";
        subfoldersCheckbox.checked = this.plugin.settings.modalCheckboxStates.folderRename.includeSubfolders;

        const subfoldersLabel = subfoldersContainer.createEl("label");
        subfoldersLabel.setAttribute("for", "rename-subfolders");
        subfoldersLabel.textContent = "Rename notes in subfolders";

        // Rename excluded folders checkbox
        const excludedFoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedFoldersCheckbox = excludedFoldersContainer.createEl("input", { type: "checkbox" });
        excludedFoldersCheckbox.id = "rename-excluded-folders";
        excludedFoldersCheckbox.checked = this.plugin.settings.modalCheckboxStates.folderRename.renameExcludedFolders;

        const excludedFoldersLabel = excludedFoldersContainer.createEl("label");
        excludedFoldersLabel.setAttribute("for", "rename-excluded-folders");
        excludedFoldersLabel.textContent = "Rename notes in excluded folders";

        // Rename excluded tags checkbox
        const excludedTagsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedTagsCheckbox = excludedTagsContainer.createEl("input", { type: "checkbox" });
        excludedTagsCheckbox.id = "rename-excluded-tags";
        excludedTagsCheckbox.checked = this.plugin.settings.modalCheckboxStates.folderRename.renameExcludedTags;

        const excludedTagsLabel = excludedTagsContainer.createEl("label");
        excludedTagsLabel.setAttribute("for", "rename-excluded-tags");
        excludedTagsLabel.textContent = "Rename notes with excluded tags";

        // Rename excluded properties checkbox
        const excludedPropsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedPropsCheckbox = excludedPropsContainer.createEl("input", { type: "checkbox" });
        excludedPropsCheckbox.id = "rename-excluded-properties";
        excludedPropsCheckbox.checked = this.plugin.settings.modalCheckboxStates.folderRename.renameExcludedProperties;

        const excludedPropsLabel = excludedPropsContainer.createEl("label");
        excludedPropsLabel.setAttribute("for", "rename-excluded-properties");
        excludedPropsLabel.textContent = "Rename notes with excluded properties";

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: "Rename" });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            // Save checkbox states only when command is run
            this.plugin.settings.modalCheckboxStates.folderRename.includeSubfolders = subfoldersCheckbox.checked;
            this.plugin.settings.modalCheckboxStates.folderRename.renameExcludedFolders = excludedFoldersCheckbox.checked;
            this.plugin.settings.modalCheckboxStates.folderRename.renameExcludedTags = excludedTagsCheckbox.checked;
            this.plugin.settings.modalCheckboxStates.folderRename.renameExcludedProperties = excludedPropsCheckbox.checked;
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
        const filesToRename: TFile[] = [];

        for (const file of allFiles) {
            // Check if file is in folder or subfolders
            const isInFolder = file.parent?.path === this.folder.path;
            const isInSubfolder = file.path.startsWith(this.folder.path + "/") && file.parent?.path !== this.folder.path;

            if (!isInFolder && (!includeSubfolders || !isInSubfolder)) {
                continue;
            }

            // Apply exclusion logic based on checkboxes
            if (!renameExcludedFolders || !renameExcludedTags || !renameExcludedProperties) {
                if (!shouldProcessFile(file, this.plugin.settings, this.app, {
                    ignoreFolder: renameExcludedFolders,
                    ignoreTag: renameExcludedTags,
                    ignoreProperty: renameExcludedProperties
                })) {
                    continue;
                }
            }

            filesToRename.push(file);
        }

        filesToRename.sort((a, b) => a.stat.ctime - b.stat.ctime);

        verboseLog(this.plugin, `Renaming ${filesToRename.length} notes...`);
        const pleaseWaitNotice = new Notice(`Renaming ${filesToRename.length} notes...`, 0);

        let renamedFileCount = 0;
        try {
            for (const file of filesToRename) {
                try {
                    await this.plugin.renameEngine.processFile(file, true, true, true, undefined, true);
                    renamedFileCount++;
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }
        } finally {
            if (this.plugin.cacheManager) {
                this.plugin.cacheManager.clearReservedPaths();
            }

            pleaseWaitNotice.hide();
            verboseLog(this.plugin, `Renamed ${renamedFileCount}/${filesToRename.length} notes.`);
            new Notice(`Renamed ${renamedFileCount}/${filesToRename.length} notes.`, 0);
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

        const heading = contentEl.createEl("h2", { text: "Caution", cls: "flit-modal-heading" });

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
                    const normalizedTag = tag.startsWith('#') ? tag.slice(1) : tag;
                    if (normalizedTag === this.tag || normalizedTag.startsWith(`${this.tag}/`)) {
                        count++;
                        break;
                    }
                }
            }
            if (cache?.tags) {
                for (const tagCache of cache.tags) {
                    const normalizedTag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag;
                    if (normalizedTag === this.tag || normalizedTag.startsWith(`${this.tag}/`)) {
                        count++;
                        break;
                    }
                }
            }
        }

        const messagePara = contentEl.createEl("p");
        messagePara.innerHTML = `This will edit <strong>${count} ${count === 1 ? 'note' : 'notes'}</strong>, and may introduce errors.<br><br>Ensure your files are <a href="https://help.obsidian.md/backup">backed up</a>.`;

        const optionsContainer = contentEl.createDiv({ cls: "flit-modal-options" });

        // Rename notes with child tags checkbox
        const childTagsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const childTagsCheckbox = childTagsContainer.createEl("input", { type: "checkbox" });
        childTagsCheckbox.id = "rename-child-tags";
        childTagsCheckbox.checked = this.plugin.settings.modalCheckboxStates.tagRename.includeChildTags;

        const childTagsLabel = childTagsContainer.createEl("label");
        childTagsLabel.setAttribute("for", "rename-child-tags");
        childTagsLabel.textContent = "Rename notes with child tags (e.g., #parent/child)";

        // Rename excluded folders checkbox
        const excludedFoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedFoldersCheckbox = excludedFoldersContainer.createEl("input", { type: "checkbox" });
        excludedFoldersCheckbox.id = "rename-excluded-folders";
        excludedFoldersCheckbox.checked = this.plugin.settings.modalCheckboxStates.tagRename.renameExcludedFolders;

        const excludedFoldersLabel = excludedFoldersContainer.createEl("label");
        excludedFoldersLabel.setAttribute("for", "rename-excluded-folders");
        excludedFoldersLabel.textContent = "Rename notes in excluded folders";

        // Rename excluded tags checkbox
        const excludedTagsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedTagsCheckbox = excludedTagsContainer.createEl("input", { type: "checkbox" });
        excludedTagsCheckbox.id = "rename-excluded-tags";
        excludedTagsCheckbox.checked = this.plugin.settings.modalCheckboxStates.tagRename.renameExcludedTags;

        const excludedTagsLabel = excludedTagsContainer.createEl("label");
        excludedTagsLabel.setAttribute("for", "rename-excluded-tags");
        excludedTagsLabel.textContent = "Rename notes with excluded tags";

        // Rename excluded properties checkbox
        const excludedPropsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedPropsCheckbox = excludedPropsContainer.createEl("input", { type: "checkbox" });
        excludedPropsCheckbox.id = "rename-excluded-properties";
        excludedPropsCheckbox.checked = this.plugin.settings.modalCheckboxStates.tagRename.renameExcludedProperties;

        const excludedPropsLabel = excludedPropsContainer.createEl("label");
        excludedPropsLabel.setAttribute("for", "rename-excluded-properties");
        excludedPropsLabel.textContent = "Rename notes with excluded properties";

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: "Rename" });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            // Save checkbox states only when command is run
            this.plugin.settings.modalCheckboxStates.tagRename.includeChildTags = childTagsCheckbox.checked;
            this.plugin.settings.modalCheckboxStates.tagRename.renameExcludedFolders = excludedFoldersCheckbox.checked;
            this.plugin.settings.modalCheckboxStates.tagRename.renameExcludedTags = excludedTagsCheckbox.checked;
            this.plugin.settings.modalCheckboxStates.tagRename.renameExcludedProperties = excludedPropsCheckbox.checked;
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
                    const normalizedTag = tag.startsWith('#') ? tag.slice(1) : tag;
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

            // Apply exclusion logic based on checkboxes
            if (!renameExcludedFolders || !renameExcludedTags || !renameExcludedProperties) {
                if (!shouldProcessFile(file, this.plugin.settings, this.app, {
                    ignoreFolder: renameExcludedFolders,
                    ignoreTag: renameExcludedTags,
                    ignoreProperty: renameExcludedProperties
                })) {
                    continue;
                }
            }

            filesToProcess.push(file);
        }

        if (filesToProcess.length === 0) {
            verboseLog(this.plugin, `No notes found with ${this.tag}`);
            new Notice(`No notes found with #${this.tag}.`);
            return;
        }

        filesToProcess.sort((a, b) => a.stat.ctime - b.stat.ctime);

        verboseLog(this.plugin, `Renaming ${filesToProcess.length} files with tag ${this.tag}...`);
        const pleaseWaitNotice = new Notice(`Renaming ${filesToProcess.length} notes...`, 0);
        let renamedCount = 0;

        try {
            for (const file of filesToProcess) {
                try {
                    await this.plugin.renameEngine.processFile(file, true, true, true, undefined, true);
                    renamedCount++;
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
            new Notice(`Renamed ${renamedCount}/${filesToProcess.length} notes.`, 0);
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

        const heading = contentEl.createEl("h2", { text: "Warning", cls: "flit-modal-heading" });
        contentEl.createEl("p", {
            text: "This will reset all plugin settings to their default values and delete all custom rules. This cannot be undone."
        });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const clearButton = buttonContainer.createEl("button", { text: "Clear settings" });
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

        const heading = contentEl.createEl("h2", { text: "Caution", cls: "flit-modal-heading" });

        const count = this.files.length;
        const messagePara = contentEl.createEl("p");
        messagePara.innerHTML = `This will edit <strong>${count} ${count === 1 ? 'note' : 'notes'}</strong>, and may introduce errors.<br><br>Ensure your files are <a href="https://help.obsidian.md/backup">backed up</a>.`;

        // Checkbox container
        const optionsContainer = contentEl.createDiv({ cls: "flit-modal-options" });

        // Rename excluded folders checkbox
        const excludedFoldersContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedFoldersCheckbox = excludedFoldersContainer.createEl("input", { type: "checkbox" });
        excludedFoldersCheckbox.id = "rename-excluded-folders";
        excludedFoldersCheckbox.checked = this.plugin.settings.modalCheckboxStates.searchRename.renameExcludedFolders;

        const excludedFoldersLabel = excludedFoldersContainer.createEl("label");
        excludedFoldersLabel.setAttribute("for", "rename-excluded-folders");
        excludedFoldersLabel.textContent = "Rename notes in excluded folders";

        // Rename excluded tags checkbox
        const excludedTagsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedTagsCheckbox = excludedTagsContainer.createEl("input", { type: "checkbox" });
        excludedTagsCheckbox.id = "rename-excluded-tags";
        excludedTagsCheckbox.checked = this.plugin.settings.modalCheckboxStates.searchRename.renameExcludedTags;

        const excludedTagsLabel = excludedTagsContainer.createEl("label");
        excludedTagsLabel.setAttribute("for", "rename-excluded-tags");
        excludedTagsLabel.textContent = "Rename notes with excluded tags";

        // Rename excluded properties checkbox
        const excludedPropsContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const excludedPropsCheckbox = excludedPropsContainer.createEl("input", { type: "checkbox" });
        excludedPropsCheckbox.id = "rename-excluded-properties";
        excludedPropsCheckbox.checked = this.plugin.settings.modalCheckboxStates.searchRename.renameExcludedProperties;

        const excludedPropsLabel = excludedPropsContainer.createEl("label");
        excludedPropsLabel.setAttribute("for", "rename-excluded-properties");
        excludedPropsLabel.textContent = "Rename notes with excluded properties";

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: "Rename" });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            // Save checkbox states only when command is run
            this.plugin.settings.modalCheckboxStates.searchRename.renameExcludedFolders = excludedFoldersCheckbox.checked;
            this.plugin.settings.modalCheckboxStates.searchRename.renameExcludedTags = excludedTagsCheckbox.checked;
            this.plugin.settings.modalCheckboxStates.searchRename.renameExcludedProperties = excludedPropsCheckbox.checked;
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

        // Apply exclusion filters
        const filteredFiles: TFile[] = [];
        for (const file of filesToProcess) {
            if (!renameExcludedFolders || !renameExcludedTags || !renameExcludedProperties) {
                if (!shouldProcessFile(file, this.plugin.settings, this.app, {
                    ignoreFolder: renameExcludedFolders,
                    ignoreTag: renameExcludedTags,
                    ignoreProperty: renameExcludedProperties
                })) {
                    continue;
                }
            }
            filteredFiles.push(file);
        }

        verboseLog(this.plugin, `Renaming ${filteredFiles.length} notes...`);
        const pleaseWaitNotice = new Notice(`Renaming ${filteredFiles.length} notes...`, 0);

        let renamedFileCount = 0;
        try {
            for (const file of filteredFiles) {
                try {
                    await this.plugin.renameEngine.processFile(file, true, true, true, undefined, true);
                    renamedFileCount++;
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }
        } finally {
            if (this.plugin.cacheManager) {
                this.plugin.cacheManager.clearReservedPaths();
            }

            pleaseWaitNotice.hide();
            verboseLog(this.plugin, `Renamed ${renamedFileCount}/${filteredFiles.length} notes.`);
            new Notice(`Renamed ${renamedFileCount}/${filteredFiles.length} notes.`, 0);
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

        const heading = contentEl.createEl("h2", { text: "Caution", cls: "flit-modal-heading" });

        const key = this.plugin.settings.disableRenamingKey;
        const value = this.plugin.settings.disableRenamingValue;
        const count = this.files.length;
        const actionText = this.action === 'disable' ? 'add' : 'remove';

        const messagePara = contentEl.createEl("p");
        messagePara.innerHTML = `This will ${actionText} the <strong>${key}:${value}</strong> property in <strong>${count} ${count === 1 ? 'note' : 'notes'}</strong>, and may introduce errors.<br><br>Ensure your files are <a href="https://help.obsidian.md/backup">backed up</a>.`;

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const actionButton = buttonContainer.createEl("button", { text: this.action === 'disable' ? 'Disable' : 'Enable' });
        actionButton.addClass("mod-cta");
        actionButton.onclick = async () => {
            this.close();
            await this.processFiles();
        };
    }

    async processFiles() {
        const filesToProcess = [...this.files];
        filesToProcess.sort((a, b) => a.stat.ctime - b.stat.ctime);

        verboseLog(this.plugin, `Renaming ${filesToProcess.length} notes...`);
        const pleaseWaitNotice = new Notice(`Renaming ${filesToProcess.length} notes...`, 0);

        let processedCount = 0;
        const key = this.plugin.settings.disableRenamingKey;
        const value = this.plugin.settings.disableRenamingValue;

        try {
            for (const file of filesToProcess) {
                try {
                    await this.app.fileManager.processFrontMatter(file, (frontmatter: any) => {
                        if (this.action === 'disable') {
                            frontmatter[key] = value;
                        } else {
                            delete frontmatter[key];
                        }
                    });
                    processedCount++;
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }
        } finally {
            pleaseWaitNotice.hide();
            const actionPast = this.action === 'disable' ? 'Disabled' : 'Enabled';
            verboseLog(this.plugin, `${actionPast} renaming in ${processedCount} notes.`);
            new Notice(`${actionPast} renaming for ${processedCount} notes`);
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

        contentEl.createEl("h3", { text: "Internal link", cls: "flit-modal-heading-left" });

        // Single text input - always just one field
        const inputContainer = contentEl.createDiv({ cls: "flit-input-container" });
        const textInput = inputContainer.createEl("input", {
            type: "text",
            placeholder: "Enter text...",
            cls: "flit-link-input-full"
        });
        textInput.focus();

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const addButton = buttonContainer.createEl("button", { text: "Add" });
        addButton.addClass("mod-cta");

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
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