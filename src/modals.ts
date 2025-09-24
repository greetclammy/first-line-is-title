import { Modal, App, TFile, TFolder, Notice } from "obsidian";
import { PluginSettings } from './types';
import { verboseLog, isFileExcluded, shouldProcessFile } from './utils';

// Need to declare these globals that are defined in main.ts
declare let renamedFileCount: number;
declare let tempNewPaths: string[];

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

        const heading = contentEl.createEl("h2", { text: "Warning", cls: "flit-modal-heading" });
        contentEl.createEl("p", {
            text: "This will edit all of your notes, respecting excluded folders/tags, and may introduce errors. Ensure you have backed up your notes."
        });

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

        renamedFileCount = 0;
        tempNewPaths = [];
        const pleaseWaitNotice = new Notice(`Processing ${filesToRename.length} notes...`, 0);

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
                `Renamed ${renamedFileCount}/${filesToRename.length} notes.`,
                0
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
            text: `This will edit all notes in ${this.folder.path}, and may introduce errors. Ensure you have backed up your files.`
        });

        // Add checkbox for subfolders (load saved state)
        const checkboxContainer = contentEl.createDiv({ cls: "flit-checkbox-container" });
        const subfolderCheckbox = checkboxContainer.createEl("input", { type: "checkbox" });
        subfolderCheckbox.id = "include-subfolders";
        subfolderCheckbox.checked = this.plugin.settings.includeSubfolders !== false; // Default to true

        const subfolderLabel = checkboxContainer.createEl("label");
        subfolderLabel.setAttribute("for", "include-subfolders");
        subfolderLabel.textContent = "Include notes in all subfolders";

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const renameButton = buttonContainer.createEl("button", { text: "Rename" });
        renameButton.addClass("mod-cta");
        renameButton.onclick = async () => {
            // Save checkbox state
            this.plugin.settings.includeSubfolders = subfolderCheckbox.checked;
            await this.plugin.saveSettings();

            this.close();
            await this.plugin.putFirstLineInTitleForFolder(this.folder);
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class ProcessTagModal extends Modal {
    plugin: FirstLineIsTitlePlugin;
    tag: string;
    private includeBodyTags: boolean = true;
    private includeNestedTags: boolean = true;

    constructor(app: App, plugin: FirstLineIsTitlePlugin, tag: string) {
        super(app);
        this.plugin = plugin;
        this.tag = tag;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const heading = contentEl.createEl("h2", { text: "Warning", cls: "flit-modal-heading" });
        contentEl.createEl("p", {
            text: `This will edit all notes with ${this.tag}, and may introduce errors. Ensure you have backed up your files.`
        });

        const optionsContainer = contentEl.createDiv({ cls: "flit-modal-options" });

        // Body tags checkbox (load saved state)
        const bodyContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const bodyCheckbox = bodyContainer.createEl("input", { type: "checkbox" });
        bodyCheckbox.id = "include-body-tags";
        bodyCheckbox.checked = this.plugin.settings.includeBodyTags !== false; // Default to true

        const bodyLabel = bodyContainer.createEl("label");
        bodyLabel.setAttribute("for", "include-body-tags");
        bodyLabel.textContent = `Include notes with ${this.tag} in note body`;

        // Nested tags checkbox (load saved state)
        const nestedContainer = optionsContainer.createDiv({ cls: "flit-checkbox-container" });
        const nestedCheckbox = nestedContainer.createEl("input", { type: "checkbox" });
        nestedCheckbox.id = "include-nested-tags";
        nestedCheckbox.checked = this.plugin.settings.includeNestedTags !== false; // Default to true

        const nestedLabel = nestedContainer.createEl("label");
        nestedLabel.setAttribute("for", "include-nested-tags");
        nestedLabel.textContent = "Include notes with nested tags (e.g. #parent/child)";

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container flit-modal-button-container" });

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const processButton = buttonContainer.createEl("button", { text: "Proceed" });
        processButton.addClass("mod-cta");
        processButton.onclick = async () => {
            this.close();
            await this.processTagFiles();
        };
    }

    async processTagFiles() {
        const filesToProcess: TFile[] = [];
        const allFiles = this.app.vault.getMarkdownFiles();

        for (const file of allFiles) {
            if (!shouldProcessFile(file, this.plugin.settings, this.app)) {
                continue;
            }

            let shouldProcess = false;
            let hasTagInBody = false;

            // Check YAML frontmatter tags
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.frontmatter?.tags) {
                const frontmatterTags = Array.isArray(cache.frontmatter.tags)
                    ? cache.frontmatter.tags
                    : [cache.frontmatter.tags];

                for (const tag of frontmatterTags) {
                    const normalizedTag = tag.startsWith('#') ? tag.slice(1) : tag;
                    if (normalizedTag === this.tag) {
                        shouldProcess = true;
                        break;
                    }
                    if (!this.omitNestedTags && normalizedTag.startsWith(`${this.tag}/`)) {
                        shouldProcess = true;
                        break;
                    }
                }
            }

            // Check metadata cache tags (includes body tags)
            if (!shouldProcess && cache?.tags) {
                for (const tagCache of cache.tags) {
                    const normalizedTag = tagCache.tag.startsWith('#') ? tagCache.tag.slice(1) : tagCache.tag;
                    if (normalizedTag === this.tag) {
                        shouldProcess = true;
                        // Check if tag is in body (not frontmatter)
                        if (cache.frontmatterPosition) {
                            if (tagCache.position.start.line > cache.frontmatterPosition.end.line) {
                                hasTagInBody = true;
                            }
                        } else {
                            // No frontmatter, so any tag after line 0 is in body
                            if (tagCache.position.start.line > 0) {
                                hasTagInBody = true;
                            }
                        }
                        break;
                    }
                    if (!this.omitNestedTags && normalizedTag.startsWith(`${this.tag}/`)) {
                        shouldProcess = true;
                        // Check if nested tag is in body
                        if (cache.frontmatterPosition) {
                            if (tagCache.position.start.line > cache.frontmatterPosition.end.line) {
                                hasTagInBody = true;
                            }
                        } else {
                            if (tagCache.position.start.line > 0) {
                                hasTagInBody = true;
                            }
                        }
                        break;
                    }
                }
            }

            // Apply omitBodyTags filter
            if (shouldProcess && this.omitBodyTags && hasTagInBody) {
                shouldProcess = false;
            }

            if (shouldProcess) {
                filesToProcess.push(file);
            }
        }

        if (filesToProcess.length === 0) {
            new Notice(`No files found with tag ${this.tag}`);
            return;
        }

        const pleaseWaitNotice = new Notice(`Processing ${filesToProcess.length} files with tag ${this.tag}...`, 0);
        let processedCount = 0;

        try {
            for (const file of filesToProcess) {
                try {
                    await this.plugin.renameFile(file, true);
                    processedCount++;
                } catch (error) {
                    verboseLog(this.plugin, `Error processing ${file.path}`, error);
                }
            }
        } finally {
            pleaseWaitNotice.hide();
            new Notice(`Processed ${processedCount}/${filesToProcess.length} files with tag ${this.tag}`);
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