import { Notice, MarkdownView } from "obsidian";
import { verboseLog, reverseCharacterReplacements } from '../utils';
import { RenameAllFilesModal } from '../modals';
import FirstLineIsTitle from '../../main';
import { t } from '../i18n';

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
        if (!this.settings.core.enableCommandPalette) {
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
        this.registerInsertFilenameCommand();
    }

    /**
     * Register command: Put first line in title
     * Note: This command ignores folder/tag/property exclusions but ALWAYS respects disable property
     */
    private registerRenameCurrentFileCommand(): void {
        if (!this.settings.core.commandPaletteVisibility.renameCurrentFile) {
            return;
        }

        this.plugin.addCommand({
            id: 'rename-current-file',
            name: t('commands.putFirstLineInTitle'),
            icon: 'file-pen',
            editorCheckCallback: (checking: boolean, editor, view) => {
                const activeFile = view.file;
                if (!activeFile || activeFile.extension !== 'md') {
                    return false;
                }

                if (checking) {
                    return true;
                }

                verboseLog(this.plugin, `Manual rename command triggered for ${activeFile.path} (ignoring folder/tag/property exclusions, respecting disable property)`);
                const exclusionOverrides = { ignoreFolder: true, ignoreTag: true, ignoreProperty: true };
                this.plugin.renameEngine.processFile(activeFile, true, true, undefined, false, exclusionOverrides, true, editor);
                return true;
            }
        });
    }

    /**
     * Register command: Put first line in title (unless excluded)
     */
    private registerRenameCurrentFileUnlessExcludedCommand(): void {
        if (!this.settings.core.commandPaletteVisibility.renameCurrentFileUnlessExcluded) {
            return;
        }

        this.plugin.addCommand({
            id: 'rename-current-file-unless-excluded',
            name: t('commands.putFirstLineInTitleUnlessExcluded'),
            icon: 'file-pen',
            editorCheckCallback: (checking: boolean, editor, view) => {
                const activeFile = view.file;
                if (!activeFile || activeFile.extension !== 'md') {
                    return false;
                }

                if (checking) {
                    return true;
                }

                verboseLog(this.plugin, `Manual rename command triggered for ${activeFile.path} (unless excluded)`);
                this.plugin.renameEngine.processFile(activeFile, true, true, undefined, false, undefined, true, editor);
                return true;
            }
        });
    }

    /**
     * Register command: Put first line in title in all notes
     */
    private registerRenameAllFilesCommand(): void {
        if (!this.settings.core.commandPaletteVisibility.renameAllFiles) {
            return;
        }

        this.plugin.addCommand({
            id: 'rename-all-files',
            name: t('commands.putFirstLineInTitleAllNotes'),
            icon: 'file-stack',
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
        if (!this.settings.core.commandVisibility.addSafeInternalLink) {
            return;
        }

        this.plugin.addCommand({
            id: 'add-safe-internal-link',
            name: t('commands.addSafeInternalLink'),
            icon: 'link',
            editorCallback: async (editor, view) => {
                await this.plugin.addSafeInternalLink();
            }
        });
    }

    /**
     * Register command: Add safe internal link with selection as caption
     */
    private registerSafeInternalLinkWithCaptionCommand(): void {
        if (!this.settings.core.commandVisibility.addSafeInternalLinkWithCaption) {
            return;
        }

        this.plugin.addCommand({
            id: 'add-safe-internal-link-with-caption',
            name: t('commands.addSafeInternalLinkWithCaption'),
            icon: 'link',
            editorCallback: async (editor, view) => {
                await this.plugin.addSafeInternalLinkWithCaption();
            }
        });
    }

    /**
     * Register command: Toggle automatic renaming
     */
    private registerToggleAutomaticRenamingCommand(): void {
        if (!this.settings.core.commandPaletteVisibility.toggleAutomaticRenaming) {
            return;
        }

        this.plugin.addCommand({
            id: 'toggle-automatic-renaming',
            name: t('commands.toggleAutomaticRenaming'),
            icon: 'file-cog',
            callback: async () => {
                const newValue = this.settings.core.renameNotes === "automatically" ? "manually" : "automatically";
                this.settings.core.renameNotes = newValue;
                await this.plugin.saveSettings();
                const notificationKey = newValue === "automatically" ? 'notifications.automaticRenamingEnabled' : 'notifications.automaticRenamingDisabled';
                new Notice(t(notificationKey));
            }
        });
    }

    /**
     * Execute rename current file command (public method for ribbon/external use)
     */
    async executeRenameCurrentFile(): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView?.file || activeView.file.extension !== 'md') {
            verboseLog(this.plugin, `Showing notice: ${t('notifications.errorNoActiveNote')}`);
            new Notice(t('notifications.errorNoActiveNote'));
            return;
        }
        verboseLog(this.plugin, `Manual rename command triggered for ${activeView.file.path} (ignoring folder/tag/property exclusions, respecting disable property)`);
        const exclusionOverrides = { ignoreFolder: true, ignoreTag: true, ignoreProperty: true };
        await this.plugin.renameEngine.processFile(activeView.file, true, true, undefined, false, exclusionOverrides, true, activeView.editor);
    }

    /**
     * Execute rename unless excluded command (public method for ribbon/external use)
     */
    async executeRenameUnlessExcluded(): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView?.file || activeView.file.extension !== 'md') {
            verboseLog(this.plugin, `Showing notice: ${t('notifications.errorNoActiveNote')}`);
            new Notice(t('notifications.errorNoActiveNote'));
            return;
        }
        verboseLog(this.plugin, `Manual rename command triggered for ${activeView.file.path} (unless excluded)`);
        await this.plugin.renameEngine.processFile(activeView.file, true, true, undefined, false, undefined, true, activeView.editor);
    }

    /**
     * Execute toggle automatic renaming command (public method for ribbon/external use)
     */
    async executeToggleAutomaticRenaming(): Promise<void> {
        const newValue = this.settings.core.renameNotes === "automatically" ? "manually" : "automatically";
        this.settings.core.renameNotes = newValue;
        await this.plugin.saveSettings();
        const notificationKey = newValue === "automatically" ? 'notifications.automaticRenamingEnabled' : 'notifications.automaticRenamingDisabled';
        new Notice(t(notificationKey));
    }

    /**
     * Register command: Disable renaming for current note
     * Uses checkCallback to only show when disable property doesn't exist
     */
    private registerDisableRenamingCommand(): void {
        if (!this.settings.core.commandPaletteVisibility.disableRenaming) {
            return;
        }

        this.plugin.addCommand({
            id: 'disable-renaming-for-note',
            name: t('commands.disableRenamingForNote'),
            icon: 'square-x',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile || activeFile.extension !== 'md') {
                    return false;
                }

                // Check if property exists (synchronously using cache)
                const fileCache = this.app.metadataCache.getFileCache(activeFile);
                const hasProperty = fileCache?.frontmatter?.[this.settings.exclusions.disableRenamingKey] !== undefined;

                if (checking) {
                    // Only show command if property doesn't exist
                    return !hasProperty;
                }

                // Execute command
                this.plugin.disableRenamingForNote();
                return true;
            }
        });
    }

    /**
     * Register command: Enable renaming for current note
     * Uses checkCallback to only show when disable property exists
     */
    private registerEnableRenamingCommand(): void {
        if (!this.settings.core.commandPaletteVisibility.enableRenaming) {
            return;
        }

        this.plugin.addCommand({
            id: 'enable-renaming-for-note',
            name: t('commands.enableRenamingForNote'),
            icon: 'square-check',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile || activeFile.extension !== 'md') {
                    return false;
                }

                // Check if property exists (synchronously using cache)
                const fileCache = this.app.metadataCache.getFileCache(activeFile);
                const hasProperty = fileCache?.frontmatter?.[this.settings.exclusions.disableRenamingKey] !== undefined;

                if (checking) {
                    // Only show command if property exists
                    return hasProperty;
                }

                // Execute command
                this.plugin.enableRenamingForNote();
                return true;
            }
        });
    }

    /**
     * Register command: Insert filename
     * Inserts current filename at cursor position with character reversal
     */
    private registerInsertFilenameCommand(): void {
        if (!this.settings.core.commandPaletteVisibility.insertFilename) {
            return;
        }

        this.plugin.addCommand({
            id: 'insert-filename',
            name: t('commands.insertFilename'),
            icon: 'clipboard-type',
            editorCheckCallback: (checking: boolean, editor, view) => {
                const file = view.file;
                if (!file || file.extension !== 'md') {
                    return false;
                }

                if (checking) {
                    return true;
                }

                // Get filename with optional character reversal
                const filename = reverseCharacterReplacements(file.basename, this.settings);

                // Insert filename at cursor
                editor.replaceSelection(filename);
                return true;
            }
        });
    }
}