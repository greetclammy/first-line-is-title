import { Notice, TFile, TFolder } from "obsidian";
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
            new Notice("No markdown files found in this folder.");
            return;
        }

        new Notice(`Processing ${files.length} files in "${folder.path}"...`);

        let processedCount = 0;
        let errorCount = 0;

        for (const file of files) {
            try {
                // Use the existing renameFile method with ignoreExclusions = true to force processing
                await this.renameEngine.renameFile(file, true, true, true);
                processedCount++;
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
                errorCount++;
            }
        }

        if (errorCount > 0) {
            new Notice(`Processed ${processedCount} files with ${errorCount} errors.`);
        } else {
            new Notice(`Successfully processed ${processedCount} files.`);
        }
    }

    async toggleFolderExclusion(folderPath: string): Promise<void> {
        const isExcluded = this.settings.excludedFolders.includes(folderPath);

        if (isExcluded) {
            // Remove from excluded folders
            this.settings.excludedFolders = this.settings.excludedFolders.filter(path => path !== folderPath);
            // Ensure there's always at least one entry (even if empty)
            if (this.settings.excludedFolders.length === 0) {
                this.settings.excludedFolders.push("");
            }
            new Notice(`Renaming enabled for folder: ${folderPath}`);
        } else {
            // If there's only an empty entry, replace it; otherwise add
            if (this.settings.excludedFolders.length === 1 && this.settings.excludedFolders[0] === "") {
                this.settings.excludedFolders[0] = folderPath;
            } else {
                this.settings.excludedFolders.push(folderPath);
            }
            new Notice(`Renaming disabled for folder: ${folderPath}`);
        }

        this.debugLog('excludedFolders', this.settings.excludedFolders);
        await this.saveSettings();
        verboseLog(this, `Folder exclusion toggled for: ${folderPath}`, { isNowExcluded: !isExcluded });
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
            new Notice("No markdown files found in selected folders.");
            return;
        }

        if (action === 'rename') {
            new Notice(`Processing ${allFiles.length} files from ${folders.length} folders...`);

            // Use the existing file processing logic
            await this.processMultipleFiles(allFiles, 'rename');
        } else {
            // For folder exclusion, we work with folder paths directly
            new Notice(`Processing ${folders.length} folders...`);

            for (const folder of folders) {
                try {
                    const isCurrentlyExcluded = this.settings.excludedFolders.includes(folder.path);

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
            const actionText = action === 'disable' ? 'disabled renaming for' : 'enabled renaming for';
            if (errors > 0) {
                new Notice(`${actionText} ${processed} folders. ${skipped} already in desired state. ${errors} errors occurred.`);
            } else if (skipped > 0) {
                new Notice(`${actionText} ${processed} folders. ${skipped} already in desired state.`);
            } else {
                new Notice(`Successfully ${actionText} ${processed} folders.`);
            }
        }
    }
}