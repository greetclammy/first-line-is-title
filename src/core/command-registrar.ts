import { Notice } from "obsidian";
import { verboseLog, hasDisablePropertyInFile } from '../utils';
import { RenameAllFilesModal } from '../modals';
import FirstLineIsTitle from '../../main';

/**
 * CommandRegistrar
 *
 * Handles registration of all command palette commands for the plugin.
 *
 * Responsibilities:
 * - Register rename commands (current file, unless excluded, all files)
 * - Register link commands (safe internal link, with caption)
 * - Handle conditional registration based on settings
 */
export class CommandRegistrar {
    constructor(private plugin: FirstLineIsTitle) {}

    get app() {
        return this.plugin.app;
    }

    get settings() {
        return this.plugin.settings;
    }

    /**
     * Register all command palette commands based on settings
     */
    registerCommands(): void {
        if (!this.settings.enableCommandPalette) {
            return;
        }

        this.registerRenameCurrentFileCommand();
        this.registerRenameCurrentFileUnlessExcludedCommand();
        this.registerRenameAllFilesCommand();
        this.registerSafeInternalLinkCommand();
        this.registerSafeInternalLinkWithCaptionCommand();
        this.registerToggleAutomaticRenamingCommand();
        this.registerDisableRenamingCommand();
        this.registerEnableRenamingCommand();
    }

    /**
     * Execute rename current file (shared logic for command, ribbon, context menu)
     * Note: This command ignores folder/tag/property exclusions but ALWAYS respects disable property
     */
    async executeRenameCurrentFile(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            verboseLog(this.plugin, `Showing notice: Error: no active note.`);
            new Notice("Error: no active note.");
            return;
        }
        verboseLog(this.plugin, `Manual rename command triggered for ${activeFile.path} (ignoring folder/tag/property exclusions, respecting disable property)`);
        const exclusionOverrides = { ignoreFolder: true, ignoreTag: true, ignoreProperty: true };
        await this.plugin.renameEngine.processFile(activeFile, true, true, undefined, false, exclusionOverrides);
    }

    /**
     * Register command: Put first line in title
     * Note: This command ignores folder/tag/property exclusions but ALWAYS respects disable property
     */
    private registerRenameCurrentFileCommand(): void {
        if (!this.settings.commandPaletteVisibility.renameCurrentFile) {
            return;
        }

        this.plugin.addCommand({
            id: 'rename-current-file',
            name: 'Put first line in title',
            icon: 'file-pen',
            callback: () => this.executeRenameCurrentFile()
        });
    }

    /**
     * Execute rename unless excluded (shared logic for command and save hook)
     */
    async executeRenameUnlessExcluded(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            verboseLog(this.plugin, `Showing notice: Error: no active note.`);
            new Notice("Error: no active note.");
            return;
        }
        verboseLog(this.plugin, `Manual rename command triggered for ${activeFile.path} (unless excluded)`);
        await this.plugin.renameEngine.processFile(activeFile, true, true, undefined, false);
    }

    /**
     * Register command: Put first line in title (unless excluded)
     */
    private registerRenameCurrentFileUnlessExcludedCommand(): void {
        if (!this.settings.commandPaletteVisibility.renameCurrentFileUnlessExcluded) {
            return;
        }

        this.plugin.addCommand({
            id: 'rename-current-file-unless-excluded',
            name: 'Put first line in title (unless excluded)',
            icon: 'file-pen',
            callback: () => this.executeRenameUnlessExcluded()
        });
    }

    /**
     * Register command: Put first line in title in all notes
     */
    private registerRenameAllFilesCommand(): void {
        if (!this.settings.commandPaletteVisibility.renameAllFiles) {
            return;
        }

        this.plugin.addCommand({
            id: 'rename-all-files',
            name: 'Put first line in title in all notes',
            icon: 'file-pen',
            callback: () => {
                verboseLog(this.plugin, 'Bulk rename command triggered');
                new RenameAllFilesModal(this.app, this.plugin).open();
            }
        });
    }

    /**
     * Register command: Add safe internal link
     */
    private registerSafeInternalLinkCommand(): void {
        if (!this.settings.commandVisibility.addSafeInternalLink) {
            return;
        }

        this.plugin.addCommand({
            id: 'add-safe-internal-link',
            name: 'Add safe internal link',
            icon: 'link',
            callback: async () => {
                await this.plugin.addSafeInternalLink();
            }
        });
    }

    /**
     * Register command: Add safe internal link with selection as caption
     */
    private registerSafeInternalLinkWithCaptionCommand(): void {
        if (!this.settings.commandVisibility.addSafeInternalLinkWithCaption) {
            return;
        }

        this.plugin.addCommand({
            id: 'add-safe-internal-link-with-caption',
            name: 'Add safe internal link with selection as caption',
            icon: 'link',
            callback: async () => {
                await this.plugin.addSafeInternalLinkWithCaption();
            }
        });
    }

    /**
     * Register command: Disable renaming for note
     * Uses checkCallback to only show when file doesn't have disable property
     */
    private registerDisableRenamingCommand(): void {
        if (!this.settings.commandPaletteVisibility.disableRenaming) {
            return;
        }

        this.plugin.addCommand({
            id: 'disable-renaming-for-note',
            name: 'Disable renaming for note',
            icon: 'square-x',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile || activeFile.extension !== 'md') {
                    return false;
                }

                // Check if property already exists (synchronously via metadata cache)
                const fileCache = this.app.metadataCache.getFileCache(activeFile);
                let hasProperty = false;
                if (fileCache && fileCache.frontmatter) {
                    const value = fileCache.frontmatter[this.settings.disableRenamingKey];
                    if (value !== undefined) {
                        const valueStr = String(value).toLowerCase();
                        const expectedValue = String(this.settings.disableRenamingValue).toLowerCase();
                        hasProperty = valueStr === expectedValue;
                    }
                }

                // Only show command if property doesn't exist
                if (hasProperty) {
                    return false;
                }

                if (!checking) {
                    this.executeDisableRenaming();
                }
                return true;
            }
        });
    }

    /**
     * Register command: Enable renaming for note
     * Uses checkCallback to only show when file has disable property
     */
    private registerEnableRenamingCommand(): void {
        if (!this.settings.commandPaletteVisibility.enableRenaming) {
            return;
        }

        this.plugin.addCommand({
            id: 'enable-renaming-for-note',
            name: 'Enable renaming for note',
            icon: 'square-check',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile || activeFile.extension !== 'md') {
                    return false;
                }

                // Check if property exists (synchronously via metadata cache)
                const fileCache = this.app.metadataCache.getFileCache(activeFile);
                let hasProperty = false;
                if (fileCache && fileCache.frontmatter) {
                    const value = fileCache.frontmatter[this.settings.disableRenamingKey];
                    if (value !== undefined) {
                        const valueStr = String(value).toLowerCase();
                        const expectedValue = String(this.settings.disableRenamingValue).toLowerCase();
                        hasProperty = valueStr === expectedValue;
                    }
                }

                // Only show command if property exists
                if (!hasProperty) {
                    return false;
                }

                if (!checking) {
                    this.executeEnableRenaming();
                }
                return true;
            }
        });
    }

    /**
     * Execute disable renaming (shared logic for command and context menu)
     */
    async executeDisableRenaming(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice("Error: no active note.");
            return;
        }

        // Ensure property type is set to checkbox before adding property
        await this.plugin.propertyManager.ensurePropertyTypeIsCheckbox();

        // Check if property already exists
        const hasProperty = await hasDisablePropertyInFile(activeFile, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue);

        try {
            if (!hasProperty) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    // Normalize boolean values to actual boolean type
                    const value = this.settings.disableRenamingValue;
                    if (value === 'true') {
                        frontmatter[this.settings.disableRenamingKey] = true;
                    } else if (value === 'false') {
                        frontmatter[this.settings.disableRenamingKey] = false;
                    } else {
                        frontmatter[this.settings.disableRenamingKey] = value;
                    }
                });
            }

            new Notice(`Disabled renaming for: ${activeFile.basename}`);
        } catch (error) {
            console.error('Failed to disable renaming:', error);
            new Notice(`Failed to disable renaming. Check console for details.`);
        }
    }

    /**
     * Execute enable renaming (shared logic for command and context menu)
     */
    async executeEnableRenaming(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice("Error: no active note.");
            return;
        }

        // Check if property exists
        const hasProperty = await hasDisablePropertyInFile(activeFile, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue);

        try {
            if (hasProperty) {
                await this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                    delete frontmatter[this.settings.disableRenamingKey];
                });
            }

            new Notice(`Enabled renaming for: ${activeFile.basename}`);
        } catch (error) {
            console.error('Failed to enable renaming:', error);
            new Notice(`Failed to enable renaming. Check console for details.`);
        }
    }

    /**
     * Execute toggle automatic renaming (shared logic for command and ribbon)
     */
    async executeToggleAutomaticRenaming(): Promise<void> {
        const newValue = this.settings.renameNotes === "automatically" ? "manually" : "automatically";
        this.settings.renameNotes = newValue;
        this.plugin.debugLog('renameNotes', newValue);
        await this.plugin.saveSettings();
        verboseLog(this.plugin, `Showing notice: Automatic renaming ${newValue === "automatically" ? "enabled" : "disabled"}.`);
        new Notice(`Automatic renaming ${newValue === "automatically" ? "enabled" : "disabled"}.`);
    }

    /**
     * Register command: Toggle automatic renaming
     */
    private registerToggleAutomaticRenamingCommand(): void {
        if (!this.settings.commandPaletteVisibility.toggleAutomaticRenaming) {
            return;
        }

        this.plugin.addCommand({
            id: 'toggle-automatic-renaming',
            name: 'Toggle automatic renaming',
            icon: 'file-cog',
            callback: () => this.executeToggleAutomaticRenaming()
        });
    }
}