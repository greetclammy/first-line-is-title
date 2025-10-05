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

        // Sort files by creation time (oldest first) to give chronological priority
        // Older files get clean names, newer files get numbered versions
        filesToRename.sort((a, b) => a.stat.ctime - b.stat.ctime);

        getGlobals()?.setRenamedFileCount(0);
        // No longer need tempNewPaths - each file checks disk state when processed
        verboseLog(this.plugin, `Showing notice: Processing ${filesToRename.length} notes...`);
        const pleaseWaitNotice = new Notice(`Processing ${filesToRename.length} notes...`, 0);

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
                verboseLog(this.plugin, `Showing notice: Completed with ${errors.length} errors. Check console for details.`);
                new Notice(`Completed with ${errors.length} errors. Check console for details.`);
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
    private omitBodyTags: boolean = false;
    private omitNestedTags: boolean = false;

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
            // Save checkbox states
            this.plugin.settings.includeBodyTags = bodyCheckbox.checked;
            this.plugin.settings.includeNestedTags = nestedCheckbox.checked;
            await this.plugin.saveSettings();

            // Set omit flags based on checkbox states
            this.omitBodyTags = !bodyCheckbox.checked;
            this.omitNestedTags = !nestedCheckbox.checked;

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
            verboseLog(this.plugin, `Showing notice: No files found with tag ${this.tag}`);
            new Notice(`No files found with tag ${this.tag}`);
            return;
        }

        verboseLog(this.plugin, `Showing notice: Processing ${filesToProcess.length} files with tag ${this.tag}...`);
        const pleaseWaitNotice = new Notice(`Processing ${filesToProcess.length} files with tag ${this.tag}...`, 0);
        let processedCount = 0;

        try {
            for (const file of filesToProcess) {
                try {
                    await this.plugin.renameEngine.processFile(file, true, true, true, undefined, true);
                    processedCount++;
                } catch (error) {
                    console.error(`Error processing ${file.path}`, error);
                }
            }
        } finally {
            pleaseWaitNotice.hide();
            verboseLog(this.plugin, `Showing notice: Processed ${processedCount}/${filesToProcess.length} files with tag ${this.tag}`);
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