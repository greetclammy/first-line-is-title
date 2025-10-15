import { Notice, TFile, TFolder, normalizePath } from "obsidian";
import { verboseLog } from '../utils';
import { PluginSettings } from '../types';
import { RenameEngine } from '../core/rename-engine';

export class FolderOperations {
    constructor(
        private app: any,
        private settings: PluginSettings,
        private renameEngine: RenameEngine,
        private saveSettings: () => Promise<void>,
        private debugLog: (settingName: string, value: any) => void,
        private processMultipleFiles: (files: TFile[], action: 'rename') => Promise<void>
    ) {}

    async putFirstLineInTitleForFolder(folder: TFolder): Promise<void> {
        const files = this.app.vault.getAllLoadedFiles()
            .filter((file): file is TFile => file instanceof TFile && file.extension === 'md')
            .filter(file => {
                // Check if file is in the target folder or its subfolders
                return file.path.startsWith(folder.path + "/") || file.parent?.path === folder.path;
            });

        if (files.length === 0) {
            verboseLog(this, `Showing notice: No markdown files found in this folder.`);
            new Notice(`No notes found in: ${folder.name}`);
            return;
        }

        verboseLog(this, `Showing notice: Renaming ${files.length} files in "${folder.path}"...`);
        new Notice(`Renaming ${files.length} notes...`);

        let processedCount = 0;
        let errorCount = 0;

        const exclusionOverrides = { ignoreFolder: true, ignoreTag: true, ignoreProperty: true };

        for (const file of files) {
            try {
                await this.renameEngine.processFile(file, true, false, undefined, true, exclusionOverrides);
                processedCount++;
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
                errorCount++;
            }
        }

        if (errorCount > 0) {
            verboseLog(this, `Showing notice: Renamed ${processedCount}/${files.length} notes with ${errorCount} errors. Check console for details.`);
            new Notice(`Renamed ${processedCount}/${files.length} notes with ${errorCount} errors. Check console for details.`, 0);
        } else {
            verboseLog(this, `Showing notice: Successfully processed ${processedCount} files.`);
            new Notice(`Renamed ${processedCount}/${files.length} notes.`, 0);
        }
    }

    async toggleFolderExclusion(folderPath: string): Promise<void> {
        // Normalize folder path to handle cross-platform differences and user typos
        folderPath = normalizePath(folderPath);

        const isInList = this.settings.excludedFolders.includes(folderPath);
        const isInverted = this.settings.folderScopeStrategy === 'Exclude all except...';

        if (isInList) {
            // Remove from list
            this.settings.excludedFolders = this.settings.excludedFolders.filter(path => path !== folderPath);
            // Ensure there's always at least one entry (even if empty)
            if (this.settings.excludedFolders.length === 0) {
                this.settings.excludedFolders.push("");
            }

            // Determine action based on scope strategy
            if (isInverted) {
                // In inverted mode, removing from list = disabling renaming
                verboseLog(this, `Showing notice: Renaming disabled for folder: ${folderPath}`);
                new Notice(`Disabled renaming in: ${folderPath}`);
            } else {
                // In normal mode, removing from list = enabling renaming
                verboseLog(this, `Showing notice: Renaming enabled for folder: ${folderPath}`);
                new Notice(`Enabled renaming in: ${folderPath}`);
            }
        } else {
            // Add to list
            if (this.settings.excludedFolders.length === 1 && this.settings.excludedFolders[0] === "") {
                this.settings.excludedFolders[0] = folderPath;
            } else {
                this.settings.excludedFolders.push(folderPath);
            }

            // Determine action based on scope strategy
            if (isInverted) {
                // In inverted mode, adding to list = enabling renaming
                verboseLog(this, `Showing notice: Renaming enabled for folder: ${folderPath}`);
                new Notice(`Enabled renaming in: ${folderPath}`);
            } else {
                // In normal mode, adding to list = disabling renaming
                verboseLog(this, `Showing notice: Renaming disabled for folder: ${folderPath}`);
                new Notice(`Disabled renaming in: ${folderPath}`);
            }
        }

        this.debugLog('excludedFolders', this.settings.excludedFolders);
        await this.saveSettings();
        verboseLog(this, `Folder exclusion toggled for: ${folderPath}`, { isNowInList: !isInList });
    }

    getSelectedFolders(): TFolder[] {
        const selectedFolders: TFolder[] = [];

        // Try multiple selection patterns that Obsidian might use
        const selectors = [
            '.nav-folder.is-selected',
            '.nav-folder.is-active',
            '.nav-folder-title.is-selected',
            '.nav-folder-title.is-active',
            '.tree-item.is-selected .nav-folder-title',
            '.tree-item.is-active .nav-folder-title'
        ];

        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                // Try to get folder path from various attributes/parents
                let folderPath = element.getAttribute('data-path');

                if (!folderPath) {
                    // Check parent elements
                    const parent = element.closest('.nav-folder, .tree-item');
                    if (parent) {
                        folderPath = parent.getAttribute('data-path');
                    }
                }

                if (folderPath) {
                    const folder = this.app.vault.getAbstractFileByPath(folderPath);
                    if (folder instanceof TFolder && !selectedFolders.includes(folder)) {
                        selectedFolders.push(folder);
                    }
                }
            });
        });

        return selectedFolders;
    }

    getSelectedFiles(): TFile[] {
        const selectedFiles: TFile[] = [];

        const selectors = [
            '.nav-file.is-selected',
            '.nav-file.is-active',
            '.nav-file-title.is-selected',
            '.nav-file-title.is-active',
            '.tree-item.is-selected .nav-file-title',
            '.tree-item.is-active .nav-file-title'
        ];

        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                let filePath = element.getAttribute('data-path');

                if (!filePath) {
                    const parent = element.closest('.nav-file, .tree-item');
                    if (parent) {
                        filePath = parent.getAttribute('data-path');
                    }
                }

                if (filePath) {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file instanceof TFile && file.extension === 'md' && !selectedFiles.includes(file)) {
                        selectedFiles.push(file);
                    }
                }
            });
        });

        return selectedFiles;
    }

    getAllMarkdownFilesInFolder(folder: TFolder): TFile[] {
        const files: TFile[] = [];

        const processFolder = (currentFolder: TFolder) => {
            currentFolder.children.forEach(child => {
                if (child instanceof TFile && child.extension === 'md') {
                    files.push(child);
                } else if (child instanceof TFolder && this.settings.includeSubfolders) {
                    processFolder(child);
                }
            });
        };

        processFolder(folder);
        return files;
    }

    async processMultipleFolders(folders: TFolder[], action: 'rename' | 'disable' | 'enable'): Promise<void> {
        if (folders.length === 0) return;

        let processed = 0;
        let skipped = 0;
        let errors = 0;

        // Collect all files from all folders
        const allFiles: TFile[] = [];
        folders.forEach(folder => {
            const folderFiles = this.getAllMarkdownFilesInFolder(folder);
            allFiles.push(...folderFiles);
        });

        if (allFiles.length === 0) {
            verboseLog(this, `Showing notice: No markdown files found in selected folders.`);
            new Notice("No notes found in selected folders.");
            return;
        }

        if (action === 'rename') {
            verboseLog(this, `Showing notice: Renaming ${allFiles.length} files from ${folders.length} folders...`);
            new Notice(`Renaming ${allFiles.length} notes...`);

            // Use the existing file processing logic
            await this.processMultipleFiles(allFiles, 'rename');
        } else {
            // For folder exclusion, we work with folder paths directly
            verboseLog(this, `Showing notice: Renaming ${folders.length} folders...`);
            new Notice(`Renaming ${folders.length} notes...`);

            for (const folder of folders) {
                try {
                    const normalizedFolderPath = normalizePath(folder.path);
                    const isCurrentlyExcluded = this.settings.excludedFolders.includes(normalizedFolderPath);

                    if (action === 'disable' && !isCurrentlyExcluded) {
                        // Only toggle if not already excluded
                        await this.toggleFolderExclusion(folder.path);
                        processed++;
                    } else if (action === 'enable' && isCurrentlyExcluded) {
                        // Only toggle if currently excluded
                        await this.toggleFolderExclusion(folder.path);
                        processed++;
                    } else {
                        // Already in desired state
                        skipped++;
                    }
                } catch (error) {
                    console.error(`Error processing folder ${folder.path}:`, error);
                    errors++;
                }
            }

            // Show completion notice
            const actionText = action === 'disable' ? 'Disabled' : 'Enabled';
            verboseLog(this, `Showing notice: ${actionText} renaming for ${processed} folders.`);
            new Notice(`${actionText} renaming in ${processed} folders.`);
        }
    }
}