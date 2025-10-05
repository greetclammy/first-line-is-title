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

        // Dynamic commands that depend on current file state
        this.plugin.registerDynamicCommands();
    }

    /**
     * Register command: Put first line in title
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
                    verboseLog(this.plugin, `Showing notice: No active editor`);
                    new Notice("No active editor");
                    return;
                }
                verboseLog(this.plugin, `Manual rename command triggered for ${activeFile.path} (ignoring exclusions)`);
                await this.plugin.renameEngine.processFile(activeFile, true, true);
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
                    verboseLog(this.plugin, `Showing notice: No active editor`);
                    new Notice("No active editor");
                    return;
                }
                verboseLog(this.plugin, `Manual rename command triggered for ${activeFile.path} (unless excluded)`);
                await this.plugin.renameEngine.processFile(activeFile, true, false);
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
}