import { TFile, MarkdownView } from "obsidian";
import { NodeError } from './obsidian-ex';
import { PluginSettings } from '../types';
import { verboseLog, shouldProcessFile, extractTitle, hasDisablePropertyInFile } from '../utils';
import FirstLineIsTitle from '../../main';

// Global variables for alias management
let aliasUpdateInProgress: Set<string> = new Set();

export class AliasManager {
    constructor(private plugin: FirstLineIsTitle) {}

    get app() {
        return this.plugin.app;
    }

    get settings(): PluginSettings {
        return this.plugin.settings;
    }

    isAliasUpdateInProgress(filePath: string): boolean {
        return aliasUpdateInProgress.has(filePath);
    }

    private getAliasPropertyKeys(): string[] {
        const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';
        return aliasPropertyKey
            .split(',')
            .map(key => key.trim())
            .filter(key => key.length > 0);
    }

    async updateAliasIfNeeded(file: TFile, providedContent?: string, targetFileName?: string): Promise<void> {
        // Track plugin usage
        this.plugin.trackUsage();

        try {
            const currentFile = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFile || !(currentFile instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias update - file no longer exists: ${file.path}`);
                return;
            }

            file = currentFile;
            const fileKey = file.path;

            if (aliasUpdateInProgress.has(fileKey)) {
                verboseLog(this.plugin, `Skipping alias update for ${file.path} - update already in progress`);
                return;
            }

            // Check disable property FIRST - this cannot be overridden by any command
            if (await hasDisablePropertyInFile(file, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue)) {
                verboseLog(this.plugin, `Skipping alias update - file has disable property: ${file.path}`);
                return;
            }

            if (!shouldProcessFile(file, this.settings, this.app)) {
                return;
            }
            let content: string;
            if (providedContent !== undefined) {
                content = providedContent;
                verboseLog(this.plugin, `Using provided content for alias update in ${file.path} (${content.length} chars)`);
            } else if (this.settings.fileReadMethod === 'File') {
                content = await this.app.vault.read(file);
            } else {
                content = await this.app.vault.cachedRead(file);
            }

            if (!content || content.trim() === '') {
                return;
            }

            const contentWithoutFrontmatter = this.plugin.renameEngine.stripFrontmatterFromContent(content, file);
            const lines = contentWithoutFrontmatter.split('\n');
            const firstLine = lines.length > 0 ? lines[0] : '';

            if (!firstLine || firstLine.trim() === '') {
                if (this.settings.enableAliases) {
                    await this.removePluginAliasesFromFile(file);
                }
                return;
            }

            if (!this.settings.enableAliases) {
                return;
            }

            const metadata = this.app.metadataCache.getFileCache(file);
            const frontmatter = metadata?.frontmatter;

            const processedFirstLine = extractTitle(firstLine, this.settings);
            const fileNameToCompare = targetFileName !== undefined ? targetFileName.trim() : file.basename.trim();
            const processedLineMatchesFilename = (processedFirstLine.trim() === fileNameToCompare);

            const shouldHaveAlias = !this.settings.addAliasOnlyIfFirstLineDiffers || !processedLineMatchesFilename;

            if (!shouldHaveAlias) {
                await this.removePluginAliasesFromFile(file);
                return;
            }
            const aliasPropertyKeys = this.getAliasPropertyKeys();
            const zwspMarker = String.fromCharCode(8203);
            const expectedAlias = this.settings.stripMarkupInAlias ?
                extractTitle(firstLine, this.settings) : firstLine;
            const expectedAliasWithMarker = expectedAlias + zwspMarker;

            let allPropertiesHaveCorrectAlias = true;
            for (const aliasPropertyKey of aliasPropertyKeys) {
                let existingAliases: string[] = [];
                if (frontmatter && frontmatter[aliasPropertyKey]) {
                    if (Array.isArray(frontmatter[aliasPropertyKey])) {
                        existingAliases = frontmatter[aliasPropertyKey];
                    } else {
                        existingAliases = [frontmatter[aliasPropertyKey]];
                    }
                }

                const hasCorrectAlias = existingAliases.some(alias =>
                    alias === expectedAliasWithMarker || alias === expectedAlias
                );

                if (!hasCorrectAlias) {
                    allPropertiesHaveCorrectAlias = false;
                    break;
                }
            }

            if (allPropertiesHaveCorrectAlias) {
                verboseLog(this.plugin, `File ${file.path} already has correct alias in all properties`);
                return;
            }

            aliasUpdateInProgress.add(fileKey);

            try {
                verboseLog(this.plugin, `Adding alias to ${file.path} - no correct alias found`);
                await this.addAliasToFile(file, firstLine, fileNameToCompare, content);
            } finally {
                aliasUpdateInProgress.delete(fileKey);
            }

        } catch (error) {
            console.error('Error updating alias:', error);
            aliasUpdateInProgress.delete(file.path);
        }
    }

    async addAliasToFile(file: TFile, originalFirstLine: string, newFileName: string, content: string): Promise<void> {
        try {
            // Check if file still exists before processing
            const currentFile = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFile || !(currentFile instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias addition - file no longer exists: ${file.path}`);
                return;
            }

            // Update our file reference to the current one from vault
            file = currentFile;

            // Step 1: Parse first line (original, unprocessed)
            const firstLine = originalFirstLine;

            // Step 2: Compute what the alias will be (first line without forbidden char replacements)
            let aliasProcessedLine = firstLine;

            // Apply custom replacements to alias if enabled
            if (this.settings.enableCustomReplacements && this.settings.applyCustomRulesInAlias) {
                for (const replacement of this.settings.customReplacements) {
                    if (replacement.searchText === '' || !replacement.enabled) continue;

                    let tempLine = aliasProcessedLine;
                    if (replacement.onlyWholeLine) {
                        if (aliasProcessedLine.trim() === replacement.searchText.trim()) {
                            tempLine = replacement.replaceText;
                        }
                    } else if (replacement.onlyAtStart) {
                        if (tempLine.startsWith(replacement.searchText)) {
                            tempLine = replacement.replaceText + tempLine.slice(replacement.searchText.length);
                        }
                    } else {
                        tempLine = tempLine.replaceAll(replacement.searchText, replacement.replaceText);
                    }
                    aliasProcessedLine = tempLine;
                }
            }

            // Process alias WITHOUT forbidden char replacements
            const originalCharReplacementSetting = this.settings.enableForbiddenCharReplacements;
            const originalStripMarkupSetting = this.settings.enableStripMarkup;

            this.settings.enableForbiddenCharReplacements = false;
            if (!this.settings.stripMarkupInAlias) {
                this.settings.enableStripMarkup = false;
            }

            let aliasToAdd = extractTitle(aliasProcessedLine, this.settings);

            // Restore original settings
            this.settings.enableForbiddenCharReplacements = originalCharReplacementSetting;
            this.settings.enableStripMarkup = originalStripMarkupSetting;

            // Step 3: Compare alias (without forbidden chars) to target filename (with forbidden chars)
            const targetFileNameWithoutExt = newFileName.trim();
            const aliasMatchesFilename = (aliasToAdd.trim() === targetFileNameWithoutExt);

            // Step 4: Check if we need to add alias based on setting
            const shouldAddAlias = !this.settings.addAliasOnlyIfFirstLineDiffers || !aliasMatchesFilename;

            if (!shouldAddAlias) {
                verboseLog(this.plugin, `Removing plugin aliases and skipping add - alias matches filename: \`${aliasToAdd}\` = \`${targetFileNameWithoutExt}\``);
                await this.removePluginAliasesFromFile(file);
                return;
            }

            // Apply truncation to alias if enabled
            if (this.settings.truncateAlias) {
                if (aliasToAdd.length > this.settings.charCount - 1) {
                    aliasToAdd = aliasToAdd.slice(0, this.settings.charCount - 1).trimEnd() + "…";
                }
            }

            // If the alias is empty or only whitespace, remove the plugin alias instead
            if (!aliasToAdd || aliasToAdd.trim() === '') {
                verboseLog(this.plugin, `Removing plugin alias - no non-empty content found`);
                await this.removePluginAliasesFromFile(file);
                return;
            }

            // Prevent "Untitled" or "Untitled n" aliases UNLESS first line is literally that
            const untitledPattern = /^Untitled(\s+[1-9]\d*)?$/;
            if (untitledPattern.test(aliasToAdd.trim())) {
                // Check if original first line (before processing) was literally "Untitled" or "Untitled n"
                const originalFirstLineTrimmed = firstLine.trim();
                if (!untitledPattern.test(originalFirstLineTrimmed)) {
                    verboseLog(this.plugin, `Removing plugin alias - extracted title is "${aliasToAdd}" but first line is not literally Untitled`);
                    await this.removePluginAliasesFromFile(file);
                    return;
                }
            }

            // Mark alias with ZWSP for identification
            const markedAlias = '\u200B' + aliasToAdd + '\u200B';

            // Step 6: Save any unsaved changes before modifying frontmatter
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
                await activeView.save();
            }

            // Step 8: Check if file has frontmatter by parsing content directly (not metadata cache)
            // This avoids race conditions where metadata cache hasn't updated yet
            const lines = content.split('\n');
            const hasFrontmatter = lines.length > 0 && lines[0].trim() === '---';

            if (!hasFrontmatter) {
                // Get current file reference again right before processFrontMatter
                const currentFileForFrontmatter = this.app.vault.getAbstractFileByPath(file.path);
                if (!currentFileForFrontmatter || !(currentFileForFrontmatter instanceof TFile)) {
                    verboseLog(this.plugin, `Skipping frontmatter creation - file no longer exists: ${file.path}`);
                    return;
                }

                // No frontmatter exists - use processFrontMatter to create it properly
                const aliasPropertyKeys = this.getAliasPropertyKeys();
                this.plugin.markFlitModificationStart(currentFileForFrontmatter.path);
                await this.app.fileManager.processFrontMatter(currentFileForFrontmatter, (frontmatter) => {
                    // Insert alias into all specified properties
                    for (const aliasPropertyKey of aliasPropertyKeys) {
                        // Use array format for 'aliases' property, inline format for custom properties
                        if (aliasPropertyKey === 'aliases') {
                            frontmatter[aliasPropertyKey] = [markedAlias];
                        } else {
                            frontmatter[aliasPropertyKey] = markedAlias;
                        }
                    }
                });
                this.plugin.markFlitModificationEnd(currentFileForFrontmatter.path);
                // Mark file as having pending metadata cache update
                this.plugin.pendingMetadataUpdates.add(currentFileForFrontmatter.path);
                verboseLog(this.plugin, `Created frontmatter and added alias \`${aliasToAdd}\` to ${currentFileForFrontmatter.path}`);
                return;
            }

            // Get current file reference again right before processFrontMatter
            const currentFileForUpdate = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFileForUpdate || !(currentFileForUpdate instanceof TFile)) {
                verboseLog(this.plugin, `Skipping frontmatter update - file no longer exists: ${file.path}`);
                return;
            }

            // File has frontmatter, use processFrontMatter to update aliases
            const aliasPropertyKeys = this.getAliasPropertyKeys();
            this.plugin.markFlitModificationStart(currentFileForUpdate.path);
            await this.app.fileManager.processFrontMatter(currentFileForUpdate, (frontmatter) => {
                // Insert alias into all specified properties
                for (const aliasPropertyKey of aliasPropertyKeys) {
                    // Check if property is 'aliases' - if yes, use current behavior
                    if (aliasPropertyKey === 'aliases') {
                        // Current behavior: add value on its own line as the last line
                        let existingAliases: string[] = [];
                        if (frontmatter[aliasPropertyKey]) {
                            if (Array.isArray(frontmatter[aliasPropertyKey])) {
                                existingAliases = [...frontmatter[aliasPropertyKey]];
                            } else {
                                existingAliases = [frontmatter[aliasPropertyKey]];
                            }
                        }

                        // Remove any existing plugin aliases (marked with ZWSP) and empty strings
                        existingAliases = existingAliases.filter(alias =>
                            !(typeof alias === 'string' && alias.startsWith('\u200B') && alias.endsWith('\u200B')) &&
                            alias !== ""
                        );

                        // Check if this exact alias already exists (unmarked)
                        if (!existingAliases.includes(aliasToAdd)) {
                            // Add the new marked alias
                            existingAliases.push(markedAlias);
                            frontmatter[aliasPropertyKey] = existingAliases;
                        } else {
                            // If only non-plugin aliases remain, update with them
                            if (existingAliases.length === 0) {
                                if (this.settings.keepEmptyAliasProperty) {
                                    // Keep empty property as null
                                    frontmatter[aliasPropertyKey] = null;
                                } else {
                                    // Delete empty property
                                    delete frontmatter[aliasPropertyKey];
                                }
                            } else {
                                frontmatter[aliasPropertyKey] = existingAliases;
                            }
                        }
                    } else {
                        // New behavior for non-aliases properties
                        const propertyExists = frontmatter.hasOwnProperty(aliasPropertyKey);

                        if (!propertyExists || frontmatter[aliasPropertyKey] === null || frontmatter[aliasPropertyKey] === undefined || frontmatter[aliasPropertyKey] === "") {
                            // Property doesn't exist or has no value - insert inline
                            frontmatter[aliasPropertyKey] = markedAlias;
                        } else {
                            // Property has existing values - check if they're FLIT-added or user-added
                            let existingValues: string[] = [];
                            if (Array.isArray(frontmatter[aliasPropertyKey])) {
                                existingValues = [...frontmatter[aliasPropertyKey]];
                            } else {
                                existingValues = [frontmatter[aliasPropertyKey]];
                            }

                            // Remove plugin values (marked with ZWSP) and empty strings
                            const userValues = existingValues.filter(value =>
                                !(typeof value === 'string' && value.startsWith('\u200B') && value.endsWith('\u200B')) &&
                                value !== ""
                            );

                            // Check if this exact value already exists (unmarked)
                            if (!userValues.includes(aliasToAdd)) {
                                if (userValues.length === 0) {
                                    // No user values, just our value - insert inline
                                    frontmatter[aliasPropertyKey] = markedAlias;
                                } else {
                                    // Has user values - add as new line in array
                                    userValues.push(markedAlias);
                                    frontmatter[aliasPropertyKey] = userValues;
                                }
                            } else {
                                // Value already exists, just restore user values
                                if (userValues.length === 0) {
                                    if (this.settings.keepEmptyAliasProperty) {
                                        // Keep empty property as null
                                        frontmatter[aliasPropertyKey] = null;
                                    } else {
                                        // Delete empty property
                                        delete frontmatter[aliasPropertyKey];
                                    }
                                } else if (userValues.length === 1) {
                                    frontmatter[aliasPropertyKey] = userValues[0];
                                } else {
                                    frontmatter[aliasPropertyKey] = userValues;
                                }
                            }
                        }
                    }
                }
            });
            this.plugin.markFlitModificationEnd(currentFileForUpdate.path);

            // Mark file as having pending metadata cache update
            this.plugin.pendingMetadataUpdates.add(currentFileForUpdate.path);
            verboseLog(this.plugin, `Updated alias \`${aliasToAdd}\` in ${currentFileForUpdate.path}`);

        } catch (error) {
            // Check if this is an ENOENT error (file was renamed during async operation)
            if ((error as any).code === 'ENOENT') {
                // File was renamed during operation - this is expected race condition, log as info
                verboseLog(this.plugin, `Skipping alias addition - file was renamed during operation: ${file.path}`);
            } else {
                // Unexpected error, log it
                console.error(`Failed to add alias to file ${file.path}:`, error);
            }
            // Don't throw - alias addition failure shouldn't prevent the rename
        }
    }

    async removePluginAliasesFromFile(file: TFile, forceCompleteRemoval: boolean = false): Promise<void> {
        try {
            // Check if file still exists before processing
            const currentFile = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFile || !(currentFile instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias removal - file no longer exists: ${file.path}`);
                return;
            }

            // Update our file reference to the current one from vault
            file = currentFile;

            // Save any unsaved changes before modifying frontmatter
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
                await activeView.save();
            }

            // Get current file reference again right before processFrontMatter
            const currentFileForRemoval = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFileForRemoval || !(currentFileForRemoval instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias removal - file no longer exists: ${file.path}`);
                return;
            }

            this.plugin.markFlitModificationStart(currentFileForRemoval.path);
            await this.app.fileManager.processFrontMatter(currentFileForRemoval, (frontmatter) => {
                const aliasPropertyKeys = this.getAliasPropertyKeys();

                // Remove plugin aliases from all specified properties
                for (const aliasPropertyKey of aliasPropertyKeys) {
                    if (frontmatter[aliasPropertyKey]) {
                        let existingValues: string[] = [];

                        // Normalize to array
                        if (Array.isArray(frontmatter[aliasPropertyKey])) {
                            existingValues = [...frontmatter[aliasPropertyKey]];
                        } else {
                            existingValues = [frontmatter[aliasPropertyKey]];
                        }

                        // Filter out plugin values (marked with ZWSP) and empty strings
                        const filteredValues = existingValues.filter(value =>
                            !(typeof value === 'string' && value.startsWith('\u200B') && value.endsWith('\u200B')) &&
                            value !== ""
                        );

                        // Update or remove the property based on remaining values
                        if (filteredValues.length === 0) {
                            if (forceCompleteRemoval || !this.settings.keepEmptyAliasProperty) {
                                // Delete empty property completely
                                delete frontmatter[aliasPropertyKey];
                            } else {
                                // Keep empty property as null
                                frontmatter[aliasPropertyKey] = null;
                            }
                        } else if (filteredValues.length === 1 && aliasPropertyKey !== 'aliases') {
                            // For non-aliases properties, convert back to single value if only one remains
                            frontmatter[aliasPropertyKey] = filteredValues[0];
                        } else {
                            // Keep as array for aliases or multiple values
                            frontmatter[aliasPropertyKey] = filteredValues;
                        }
                    }
                }
            });
            this.plugin.markFlitModificationEnd(currentFileForRemoval.path);

            // Mark file as having pending metadata cache update
            this.plugin.pendingMetadataUpdates.add(currentFileForRemoval.path);
            verboseLog(this.plugin, `Removed plugin aliases from ${currentFileForRemoval.path}`);
        } catch (error) {
            // Check if this is an ENOENT error (file was renamed during async operation)
            if ((error as any).code === 'ENOENT') {
                // File was renamed during operation - this is expected race condition, log as info
                verboseLog(this.plugin, `Skipping alias removal - file was renamed during operation: ${file.path}`);
            } else {
                // Unexpected error, log it
                console.error(`Failed to remove plugin aliases from ${file.path}:`, error);
            }
        }
    }

    async removeAliasFromFile(file: TFile, aliasToRemove: string): Promise<void> {
        try {
            const trimmedAlias = aliasToRemove.trim();

            if (!trimmedAlias) {
                return;
            }

            // Save any unsaved changes before modifying frontmatter
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
                await activeView.save();
            }

            this.plugin.markFlitModificationStart(file.path);
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const aliasPropertyKeys = this.getAliasPropertyKeys();

                // Remove the specified alias from all specified properties
                for (const aliasPropertyKey of aliasPropertyKeys) {
                    if (frontmatter[aliasPropertyKey]) {
                        let existingAliases: string[] = [];

                        // Normalize to array
                        if (Array.isArray(frontmatter[aliasPropertyKey])) {
                            existingAliases = [...frontmatter[aliasPropertyKey]];
                        } else {
                            existingAliases = [frontmatter[aliasPropertyKey]];
                        }

                        // Remove the specified alias and any empty strings
                        const filteredAliases = existingAliases.filter(alias => alias !== trimmedAlias && alias !== "");

                        // Update or remove the property
                        if (filteredAliases.length === 0) {
                            if (this.settings.keepEmptyAliasProperty) {
                                // Keep empty property as null
                                frontmatter[aliasPropertyKey] = null;
                            } else {
                                // Delete empty property
                                delete frontmatter[aliasPropertyKey];
                            }
                        } else {
                            frontmatter[aliasPropertyKey] = filteredAliases;
                        }
                    }
                }
            });
            this.plugin.markFlitModificationEnd(file.path);

            verboseLog(this.plugin, `Removed alias "${trimmedAlias}" from ${file.path}`);
        } catch (error) {
            console.error(`Failed to remove alias from ${file.path}:`, error);
        }
    }
}