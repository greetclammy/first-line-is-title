import { Notice, setIcon } from "obsidian";
import { PluginSettings } from '../types';
import { verboseLog, generateSafeLinkTarget } from '../utils';
import { InternalLinkModal } from '../modals';
import FirstLineIsTitle from '../../main';

export class CommandSetup {
    private commandPaletteObserver: MutationObserver | null = null;

    constructor(private plugin: FirstLineIsTitle) {}

    get app() {
        return this.plugin.app;
    }

    get settings(): PluginSettings {
        return this.plugin.settings;
    }

    /**
     * Sets up command palette icons for plugin commands
     */
    setupCommandPaletteIcons(): void {
        // Create a map of command names to their icons
        const commandIcons = new Map([
            ['Put first line in title', 'file-pen'],
            ['Put first line in title (unless excluded)', 'file-pen'],
            ['Put first line in title in all notes', 'files'],
            ['Disable renaming for note', 'square-x'],
            ['Enable renaming for note', 'square-check'],
            ['Toggle automatic renaming', 'file-cog']
        ]);

        // Observer to watch for command palette suggestions
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        // Look for suggestion items in the command palette
                        const suggestionItems = node.querySelectorAll('.suggestion-item, [class*="suggestion"]');

                        suggestionItems.forEach((item) => {
                            if (item instanceof HTMLElement) {
                                const titleElement = item.querySelector('.suggestion-title, [class*="title"]');
                                if (titleElement) {
                                    const commandName = titleElement.textContent?.trim();
                                    if (commandName && commandIcons.has(commandName)) {
                                        // Check if icon already exists
                                        if (!item.querySelector('.flit-command-icon')) {
                                            const iconName = commandIcons.get(commandName);

                                            // Create icon element
                                            const iconElement = document.createElement('div');
                                            iconElement.classList.add('flit-command-icon');

                                            // Use Obsidian's setIcon function to add the icon
                                            setIcon(iconElement, iconName);

                                            // Insert icon at the beginning of the suggestion item
                                            item.insertBefore(iconElement, item.firstChild);
                                        }
                                    }
                                }
                            }
                        });
                    }
                });
            });
        });

        // Start observing the document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Store the observer for cleanup
        this.commandPaletteObserver = observer;
    }

    /**
     * Registers ribbon icons based on settings
     */
    registerRibbonIcons(): void {
        // Register ribbon icons in order according to settings
        // This method is called with a delay to ensure icons are placed last

        // Create array of ribbon actions to add in settings order
        const ribbonActions: Array<{
            condition: boolean;
            icon: string;
            title: string;
            callback: () => void | Promise<void>;
        }> = [
            {
                condition: this.settings.ribbonVisibility.renameCurrentFile,
                icon: 'file-pen',
                title: 'Put first line in title',
                callback: async () => {
                    const activeFile = this.app.workspace.getActiveFile();
                    if (!activeFile || activeFile.extension !== 'md') {
                        verboseLog(this.plugin, `Showing notice: Error: no active note.`);
                        new Notice("Error: no active note.");
                        return;
                    }
                    verboseLog(this.plugin, `Ribbon command triggered for ${activeFile.path} (ignoring folder/tag/property exclusions)`);
                    const exclusionOverrides = { ignoreFolder: true, ignoreTag: true, ignoreProperty: true };
                    await this.plugin.renameEngine.processFile(activeFile, true, true, undefined, false, exclusionOverrides);
                }
            },
            {
                condition: this.settings.ribbonVisibility.renameAllNotes,
                icon: 'files',
                title: 'Put first line in title in all notes',
                callback: () => {
                    const { RenameAllFilesModal } = require('../modals');
                    new RenameAllFilesModal(this.app, this.plugin).open();
                }
            },
            {
                condition: this.settings.ribbonVisibility.toggleAutomaticRenaming,
                icon: 'file-cog',
                title: 'Toggle automatic renaming',
                callback: async () => {
                    const newValue = this.settings.renameNotes === "automatically" ? "manually" : "automatically";
                    this.settings.renameNotes = newValue;
                    await this.plugin.saveSettings();
                    new Notice(`Automatic renaming ${newValue === "automatically" ? "enabled" : "disabled"}.`);
                }
            }
        ];

        // Add ribbon icons in order, only if enabled
        ribbonActions.forEach(action => {
            if (action.condition) {
                this.plugin.addRibbonIcon(action.icon, action.title, action.callback);
            }
        });
    }

    /**
     * Registers dynamic commands that depend on current file state
     * (Currently empty - dynamic commands removed)
     */
    async registerDynamicCommands(): Promise<void> {
        // Dynamic commands removed - disable/enable renaming functionality has been removed
    }

    /**
     * Adds a safe internal link at the cursor position
     */
    async addSafeInternalLink(): Promise<void> {
        // Try to get active editor from any view type (markdown, canvas, etc.)
        const activeEditor = this.app.workspace.activeEditor?.editor;
        if (!activeEditor) {
            verboseLog(this.plugin, `Showing notice: Error: no active note.`);
            new Notice("Error: no active note.");
            return;
        }

        const selection = activeEditor.getSelection();

        if (selection.trim()) {
            // Selection exists - process directly
            const safeLinkTarget = generateSafeLinkTarget(selection, this.settings);
            const wikiLink = `[[${safeLinkTarget}]]`;
            activeEditor.replaceSelection(wikiLink);
        } else {
            // No selection - show modal
            const modal = new InternalLinkModal(this.app, this.plugin, (inputText: string) => {
                const safeLinkTarget = generateSafeLinkTarget(inputText, this.settings);
                const wikiLink = `[[${safeLinkTarget}]]`;
                activeEditor.replaceSelection(wikiLink);
            }, false);
            modal.open();
        }
    }

    /**
     * Adds a safe internal link with caption at the cursor position
     */
    async addSafeInternalLinkWithCaption(): Promise<void> {
        // Try to get active editor from any view type (markdown, canvas, etc.)
        const activeEditor = this.app.workspace.activeEditor?.editor;
        if (!activeEditor) {
            verboseLog(this.plugin, `Showing notice: Error: no active note.`);
            new Notice("Error: no active note.");
            return;
        }

        const selection = activeEditor.getSelection();

        if (selection.trim()) {
            // Selection exists - use selection as caption and create safe target
            const safeLinkTarget = generateSafeLinkTarget(selection, this.settings);
            const wikiLink = `[[${safeLinkTarget}|${selection}]]`;
            activeEditor.replaceSelection(wikiLink);
        } else {
            // No selection - show modal to get text
            const modal = new InternalLinkModal(this.app, this.plugin, (inputText: string) => {
                const safeLinkTarget = generateSafeLinkTarget(inputText, this.settings);
                const wikiLink = `[[${safeLinkTarget}|${inputText}]]`;
                activeEditor.replaceSelection(wikiLink);
            }, true);
            modal.open();
        }
    }

    /**
     * Cleans up command palette observer
     */
    cleanup(): void {
        if (this.commandPaletteObserver) {
            this.commandPaletteObserver.disconnect();
            this.commandPaletteObserver = null;
        }
    }
}