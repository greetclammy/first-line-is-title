import { Notice } from "obsidian";
import { MenuConfig } from "./menu-config";
import FirstLineIsTitlePlugin from "../../main";
import { ProcessTagModal, RenameFolderModal } from "../modals";
import { t } from "../i18n";

/**
 * Declarative Menu Definitions
 *
 * All context menu configurations defined as data structures.
 * Each menu type has its own configuration with visibility rules and actions.
 */

export class MenuDefinitions {
  constructor(private plugin: FirstLineIsTitlePlugin) {}

  /**
   * Tag context menu configuration
   */
  getTagMenuConfig(): MenuConfig {
    return {
      addSeparator: true,
      items: [
        {
          id: "tag-put-first-line-in-title",
          title: t("commands.putFirstLineInTitle"),
          icon: "file-pen",
          visible: (context) => {
            return (
              this.plugin.settings.core.enableTagCommands &&
              this.plugin.settings.core.commandVisibility.tagPutFirstLineInTitle
            );
          },
          onClick: async (context) => {
            new ProcessTagModal(
              this.plugin.app,
              this.plugin,
              context.tagName,
            ).open();
          },
        },
        {
          id: "tag-disable-renaming",
          title: (context) => {
            const menuText = this.plugin.contextMenuManager.getTagMenuText(
              context.tagName,
            );
            return menuText.disable;
          },
          icon: "square-x",
          visible: (context) => {
            if (!this.plugin.settings.core.enableTagCommands) return false;
            const shouldShowDisable =
              this.plugin.contextMenuManager.shouldShowDisableMenuForTag(
                context.tagName,
              );
            return (
              shouldShowDisable &&
              this.plugin.settings.core.commandVisibility.tagExclude
            );
          },
          onClick: async (context) => {
            await this.plugin.toggleTagExclusion(context.tagName);
          },
        },
        {
          id: "tag-enable-renaming",
          title: (context) => {
            const menuText = this.plugin.contextMenuManager.getTagMenuText(
              context.tagName,
            );
            return menuText.enable;
          },
          icon: "square-check",
          visible: (context) => {
            if (!this.plugin.settings.core.enableTagCommands) return false;
            const shouldShowDisable =
              this.plugin.contextMenuManager.shouldShowDisableMenuForTag(
                context.tagName,
              );
            return (
              !shouldShowDisable &&
              this.plugin.settings.core.commandVisibility.tagStopExcluding
            );
          },
          onClick: async (context) => {
            await this.plugin.toggleTagExclusion(context.tagName);
          },
        },
      ],
    };
  }

  /**
   * Folder context menu configuration
   */
  getFolderMenuConfig(): MenuConfig {
    return {
      addSeparator: true,
      items: [
        {
          id: "folder-put-first-line-in-title",
          title: t("commands.putFirstLineInTitle"),
          icon: "folder-pen",
          visible: (context) => {
            return (
              this.plugin.settings.core.enableFolderCommands &&
              this.plugin.settings.core.commandVisibility
                .folderPutFirstLineInTitle
            );
          },
          onClick: async (context) => {
            new RenameFolderModal(
              this.plugin.app,
              this.plugin,
              context.folder,
            ).open();
          },
        },
        {
          id: "folder-disable-renaming",
          title: (context) => {
            const menuText = this.plugin.contextMenuManager.getFolderMenuText(
              context.folder.path,
            );
            return menuText.disable;
          },
          icon: "square-x",
          visible: (context) => {
            if (!this.plugin.settings.core.enableFolderCommands) return false;
            const shouldShowDisable =
              this.plugin.contextMenuManager.shouldShowDisableMenuForFolder(
                context.folder.path,
              );
            return (
              shouldShowDisable &&
              this.plugin.settings.core.commandVisibility.folderExclude
            );
          },
          onClick: async (context) => {
            await this.plugin.toggleFolderExclusion(context.folder.path);
          },
        },
        {
          id: "folder-enable-renaming",
          title: (context) => {
            const menuText = this.plugin.contextMenuManager.getFolderMenuText(
              context.folder.path,
            );
            return menuText.enable;
          },
          icon: "square-check",
          visible: (context) => {
            if (!this.plugin.settings.core.enableFolderCommands) return false;
            const shouldShowDisable =
              this.plugin.contextMenuManager.shouldShowDisableMenuForFolder(
                context.folder.path,
              );
            return (
              !shouldShowDisable &&
              this.plugin.settings.core.commandVisibility.folderStopExcluding
            );
          },
          onClick: async (context) => {
            await this.plugin.toggleFolderExclusion(context.folder.path);
          },
        },
      ],
    };
  }

  /**
   * File context menu configuration
   */
  getFileMenuConfig(): MenuConfig {
    return {
      addSeparator: true,
      items: [
        {
          id: "file-put-first-line-in-title",
          title: t("commands.putFirstLineInTitle"),
          icon: "file-pen",
          visible: (context) => {
            return (
              this.plugin.settings.core.enableFileCommands &&
              this.plugin.settings.core.commandVisibility
                .filePutFirstLineInTitle
            );
          },
          onClick: async (context) => {
            const exclusionOverrides = {
              ignoreFolder: true,
              ignoreTag: true,
              ignoreProperty: true,
            };
            await this.plugin.renameEngine.processFile(
              context.file,
              true,
              true,
              undefined,
              false,
              exclusionOverrides,
            );
          },
        },
        {
          id: "file-disable-renaming",
          title: t("commands.disableRenamingForNote"),
          icon: "square-x",
          visible: (context) => {
            if (!this.plugin.settings.core.enableFileCommands) return false;
            if (!this.plugin.settings.core.commandVisibility.fileExclude)
              return false;

            const fileCache = this.plugin.app.metadataCache.getFileCache(
              context.file,
            );
            if (!fileCache || !fileCache.frontmatter) return true;

            const value =
              fileCache.frontmatter[
                this.plugin.settings.exclusions.disableRenamingKey
              ];
            if (value === undefined) return true;

            const valueStr = String(value).toLowerCase();
            const expectedValue = String(
              this.plugin.settings.exclusions.disableRenamingValue,
            ).toLowerCase();
            return valueStr !== expectedValue; // Show disable if property doesn't match
          },
          onClick: async (context) => {
            try {
              await this.plugin.propertyManager.ensurePropertyTypeIsCheckbox();
              await this.plugin.app.fileManager.processFrontMatter(
                context.file,
                (frontmatter) => {
                  frontmatter[
                    this.plugin.settings.exclusions.disableRenamingKey
                  ] = this.plugin.parsePropertyValue(
                    this.plugin.settings.exclusions.disableRenamingValue,
                  );
                },
              );
              new Notice(
                t("notifications.disabledRenamingFor", {
                  filename: context.file.basename,
                }),
              );
            } catch (error) {
              console.error("Failed to disable renaming:", error);
              new Notice(t("notifications.failedToDisable"));
            }
          },
        },
        {
          id: "file-enable-renaming",
          title: t("commands.enableRenamingForNote"),
          icon: "square-check",
          visible: (context) => {
            if (!this.plugin.settings.core.enableFileCommands) return false;
            if (!this.plugin.settings.core.commandVisibility.fileStopExcluding)
              return false;

            const fileCache = this.plugin.app.metadataCache.getFileCache(
              context.file,
            );
            if (!fileCache || !fileCache.frontmatter) return false;

            const value =
              fileCache.frontmatter[
                this.plugin.settings.exclusions.disableRenamingKey
              ];
            if (value === undefined) return false;

            const valueStr = String(value).toLowerCase();
            const expectedValue = String(
              this.plugin.settings.exclusions.disableRenamingValue,
            ).toLowerCase();
            return valueStr === expectedValue; // Show enable if property matches
          },
          onClick: async (context) => {
            try {
              await this.plugin.app.fileManager.processFrontMatter(
                context.file,
                (frontmatter) => {
                  delete frontmatter[
                    this.plugin.settings.exclusions.disableRenamingKey
                  ];
                },
              );
              new Notice(
                t("notifications.enabledRenamingFor", {
                  filename: context.file.basename,
                }),
              );
            } catch (error) {
              console.error("Failed to enable renaming:", error);
              new Notice(t("notifications.failedToEnable"));
            }
          },
        },
      ],
    };
  }
}
