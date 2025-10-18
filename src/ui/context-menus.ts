import { Menu, TFile, TFolder, setIcon } from "obsidian";
import { verboseLog } from '../utils';
import { ProcessTagModal, RenameMultipleFoldersModal } from '../modals';
import FirstLineIsTitlePlugin from '../../main';
import { t, tp } from '../i18n';

/**
 * Manages all context menu operations for the First Line is Title plugin.
 * Handles folder/tag menu creation, bulk operations, and menu text generation.
 */
export class ContextMenuManager {
    private plugin: FirstLineIsTitlePlugin;

    constructor(plugin: FirstLineIsTitlePlugin) {
        this.plugin = plugin;
    }

    /**
     * Creates or retrieves a context menu for the given mouse event.
     * Uses Tag Wrangler's menuForEvent pattern.
     */
    menuForEvent(evt: MouseEvent): Menu {
        // Use Tag Wrangler's menuForEvent pattern
        let menu = evt.obsidian_contextmenu;
        if (!menu) {
            menu = evt.obsidian_contextmenu = new Menu();
            setTimeout(() => menu.showAtPosition({x: evt.pageX, y: evt.pageY}), 0);
        }
        return menu;
    }

    /**
     * Determines whether to show disable menu option for a folder based on scope strategy.
     */
    shouldShowDisableMenuForFolder(folderPath: string): boolean {
        const isInList = this.plugin.settings.excludedFolders.includes(folderPath);

        let result: boolean;
        if (this.plugin.settings.folderScopeStrategy === 'Only exclude...') {
            // Only exclude strategy: list contains DISABLED folders
            // folder in list (disabled) → show "enable" → return false
            // folder not in list (enabled) → show "disable" → return true
            result = !isInList;
        } else {
            // Exclude all except strategy: list contains ENABLED folders
            // folder in list (enabled) → show "disable" → return true
            // folder not in list (disabled) → show "enable" → return false
            result = isInList;
        }

        verboseLog(this.plugin, `shouldShowDisableMenuForFolder(${folderPath})`, {
            folderScopeStrategy: this.plugin.settings.folderScopeStrategy,
            isInList,
            result,
            willShow: result ? 'DISABLE menu' : 'ENABLE menu'
        });

        return result;
    }

    /**
     * Determines whether to show disable menu option for a tag based on scope strategy.
     */
    shouldShowDisableMenuForTag(tagName: string): boolean {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const isInList = this.plugin.settings.excludedTags.includes(tagToFind);

        let result: boolean;
        if (this.plugin.settings.tagScopeStrategy === 'Only exclude...') {
            // Only exclude strategy: list contains DISABLED tags
            // tag in list (disabled) → show "enable" → return false
            // tag not in list (enabled) → show "disable" → return true
            result = !isInList;
        } else {
            // Exclude all except strategy: list contains ENABLED tags
            // tag in list (enabled) → show "disable" → return true
            // tag not in list (disabled) → show "enable" → return false
            result = isInList;
        }

        verboseLog(this.plugin, `shouldShowDisableMenuForTag(${tagName})`, {
            folderScopeStrategy: this.plugin.settings.folderScopeStrategy,
            tagToFind,
            isInList,
            result,
            willShow: result ? 'DISABLE menu' : 'ENABLE menu'
        });

        return result;
    }

    /**
     * Gets the appropriate menu text for folder operations based on scope strategy.
     */
    getFolderMenuText(folderPath: string): { disable: string, enable: string } {
        if (this.plugin.settings.folderScopeStrategy === 'Only exclude...') {
            // Only exclude strategy: list contains DISABLED folders
            return {
                disable: t('commands.disableRenamingInFolder'),
                enable: t('commands.enableRenamingInFolder')
            };
        } else {
            // Exclude all except strategy: list contains ENABLED folders
            return {
                disable: t('commands.disableRenamingInFolder'),
                enable: t('commands.enableRenamingInFolder')
            };
        }
    }

    /**
     * Gets the appropriate menu text for tag operations based on scope strategy.
     */
    getTagMenuText(tagName: string): { disable: string, enable: string } {
        if (this.plugin.settings.tagScopeStrategy === 'Only exclude...') {
            // Only exclude strategy: list contains DISABLED tags
            return {
                disable: t('commands.disableRenamingForTag'),
                enable: t('commands.enableRenamingForTag')
            };
        } else {
            // Exclude all except strategy: list contains ENABLED tags
            return {
                disable: t('commands.disableRenamingForTag'),
                enable: t('commands.enableRenamingForTag')
            };
        }
    }

    /**
     * Adds tag-related menu items to a context menu.
     */
    addTagMenuItems(menu: Menu, tagName: string): void {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const shouldShowDisable = this.shouldShowDisableMenuForTag(tagName);
        const menuText = this.getTagMenuText(tagName);

        // Count visible items to determine if we need a separator
        let visibleItemCount = 0;
        if (this.plugin.settings.commandVisibility.tagPutFirstLineInTitle) visibleItemCount++;
        if (shouldShowDisable && this.plugin.settings.commandVisibility.tagExclude) visibleItemCount++;
        if (!shouldShowDisable && this.plugin.settings.commandVisibility.tagStopExcluding) visibleItemCount++;

        // Add separator if we have any items to show
        if (visibleItemCount > 0) {
            menu.addSeparator();
        }

        // Add "Put first line in title" command for tag
        if (this.plugin.settings.commandVisibility.tagPutFirstLineInTitle) {
            menu.addItem((item) => {
                item
                    .setTitle(t('commands.putFirstLineInTitle'))
                    .setIcon("file-pen")
                    .onClick(() => {
                        new ProcessTagModal(this.plugin.app, this.plugin, tagName).open();
                    });
            });
        }

        // Add tag exclusion commands with dynamic text
        if (shouldShowDisable && this.plugin.settings.commandVisibility.tagExclude) {
            menu.addItem((item) => {
                item
                    .setTitle(menuText.disable)
                    .setIcon("square-x")
                    .onClick(async () => {
                        await this.plugin.toggleTagExclusion(tagName);
                    });
            });
        }

        if (!shouldShowDisable && this.plugin.settings.commandVisibility.tagStopExcluding) {
            menu.addItem((item) => {
                item
                    .setTitle(menuText.enable)
                    .setIcon("square-check")
                    .onClick(async () => {
                        await this.plugin.toggleTagExclusion(tagName);
                    });
            });
        }
    }

    /**
     * Adds tag-related menu items directly to a DOM element.
     * Used for custom menu implementations.
     */
    addTagMenuItemsToDOM(menuEl: HTMLElement, tagName: string): void {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const shouldShowDisable = this.shouldShowDisableMenuForTag(tagName);
        const menuText = this.getTagMenuText(tagName);

        // Add "Put first line in title" command for tag
        if (this.plugin.settings.commandVisibility.tagPutFirstLineInTitle) {
            const menuItem = menuEl.createEl('div', { cls: 'menu-item' });
            const iconEl = menuItem.createEl('div', { cls: 'menu-item-icon' });
            setIcon(iconEl, 'file-pen');
            menuItem.createEl('div', { cls: 'menu-item-title', text: t('commands.putFirstLineInTitle') });

            menuItem.addEventListener('click', () => {
                new ProcessTagModal(this.plugin.app, this.plugin, tagName).open();
                menuEl.remove();
            });
        }

        // Add tag exclusion commands with dynamic text
        if (shouldShowDisable && this.plugin.settings.commandVisibility.tagExclude) {
            const menuItem = menuEl.createEl('div', { cls: 'menu-item' });
            const iconEl = menuItem.createEl('div', { cls: 'menu-item-icon' });
            setIcon(iconEl, 'square-x');
            menuItem.createEl('div', { cls: 'menu-item-title', text: menuText.disable });

            menuItem.addEventListener('click', async () => {
                await this.plugin.toggleTagExclusion(tagName);
                menuEl.remove();
            });
        }

        if (!shouldShowDisable && this.plugin.settings.commandVisibility.tagStopExcluding) {
            const menuItem = menuEl.createEl('div', { cls: 'menu-item' });
            const iconEl = menuItem.createEl('div', { cls: 'menu-item-icon' });
            setIcon(iconEl, 'square-check');
            menuItem.createEl('div', { cls: 'menu-item-title', text: menuText.enable });

            menuItem.addEventListener('click', async () => {
                await this.plugin.toggleTagExclusion(tagName);
                menuEl.remove();
            });
        }
    }

    /**
     * Adds menu items for bulk operations on multiple folders.
     */
    addMultiFolderMenuItems(menu: Menu, folders: TFolder[]): void {
        // Count total markdown files across all folders
        let totalFiles = 0;
        folders.forEach(folder => {
            const files = this.plugin.getAllMarkdownFilesInFolder(folder);
            totalFiles += files.length;
        });

        // Check if any commands should be visible
        const hasRenameCommand = this.plugin.settings.commandVisibility.folderPutFirstLineInTitle && totalFiles > 0;
        const hasDisableCommand = this.plugin.settings.commandVisibility.folderExclude;
        const hasEnableCommand = this.plugin.settings.commandVisibility.folderStopExcluding;

        if (!hasRenameCommand && !hasDisableCommand && !hasEnableCommand) return;

        // Add separator before our items
        menu.addSeparator();

        // Add "Put first line in title" command for multiple folders (only if there are files)
        if (hasRenameCommand) {
            menu.addItem((item) => {
                item
                    .setTitle(tp('commands.putFirstLineInTitleNFolders', folders.length))
                    .setIcon("folder-pen")
                    .onClick(() => {
                        new RenameMultipleFoldersModal(this.plugin.app, this.plugin, folders).open();
                    });
            });
        }

        // Add "Disable renaming" command for multiple folders
        if (hasDisableCommand) {
            menu.addItem((item) => {
                item
                    .setTitle(tp('commands.disableRenamingNFolders', folders.length))
                    .setIcon("square-x")
                    .onClick(async () => {
                        await this.plugin.processMultipleFolders(folders, 'disable');
                    });
            });
        }

        // Add "Enable renaming" command for multiple folders
        if (hasEnableCommand) {
            menu.addItem((item) => {
                item
                    .setTitle(tp('commands.enableRenamingNFolders', folders.length))
                    .setIcon("square-check")
                    .onClick(async () => {
                        await this.plugin.processMultipleFolders(folders, 'enable');
                    });
            });
        }
    }
}