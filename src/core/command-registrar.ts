import { Notice } from "obsidian";
import { verboseLog } from '../utils';
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

        // Dynamic commands that depend on current file state
        this.plugin.registerDynamicCommands();
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
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile || activeFile.extension !== 'md') {
                    verboseLog(this.plugin, `Showing notice: Error: no active note.`);
                    new Notice("Error: no active note.");
                    return;
                }
                verboseLog(this.plugin, `Manual rename command triggered for ${activeFile.path} (ignoring folder/tag/property exclusions, respecting disable property)`);
                const exclusionOverrides = { ignoreFolder: true, ignoreTag: true, ignoreProperty: true };
                await this.plugin.renameEngine.processFile(activeFile, true, false, undefined, false, exclusionOverrides);
            }
        });
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
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile || activeFile.extension !== 'md') {
                    verboseLog(this.plugin, `Showing notice: Error: no active note.`);
                    new Notice("Error: no active note.");
                    return;
                }
                verboseLog(this.plugin, `Manual rename command triggered for ${activeFile.path} (unless excluded)`);
                await this.plugin.renameEngine.processFile(activeFile, true);
            }
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
            callback: async () => {
                const newValue = this.settings.renameNotes === "automatically" ? "manually" : "automatically";
                this.settings.renameNotes = newValue;
                await this.plugin.saveSettings();
                new Notice(`Automatic renaming ${newValue === "automatically" ? "enabled" : "disabled"}.`);
            }
        });
    }
}