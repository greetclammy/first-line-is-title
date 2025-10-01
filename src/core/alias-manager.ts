import { TFile, MarkdownView } from "obsidian";
import { PluginSettings } from '../types';
import { verboseLog, shouldProcessFile, extractTitle } from '../utils';
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

    async updateAliasIfNeeded(file: TFile, providedContent?: string): Promise<void> {
        // Track plugin usage
        this.plugin.trackUsage();

        try {
            const fileKey = file.path;

            // Check if file still exists (may have been renamed/deleted during processing)
            const currentFile = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFile || !(currentFile instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias update - file no longer exists: ${file.path}`);
                return;
            }

            // Update our file reference to the current one from vault
            file = currentFile;

            // Skip if an alias update is already in progress for this file
            if (aliasUpdateInProgress.has(fileKey)) {
                verboseLog(this.plugin, `Skipping alias update for ${file.path} - update already in progress`);
                return;
            }

            // Skip if file is excluded or should not be processed
            if (!shouldProcessFile(file, this.settings)) {
                return;
            }

            // Get the current content
            let content: string;
            if (providedContent !== undefined) {
                content = providedContent;
                verboseLog(this.plugin, `Using provided content for alias update in ${file.path} (${content.length} chars)`);
            } else if (this.settings.fileReadMethod === 'File') {
                content = await this.app.vault.read(file);
            } else {
                // Both 'Editor' and 'Cache' use cachedRead here since no editor content available
                content = await this.app.vault.cachedRead(file);
            }

            // Rate limiting check - prevent infinite loops
            if (!this.plugin.renameEngine.checkOperationLimit(file, content)) {
                return;
            }

            if (!content || content.trim() === '') {
                return;
            }

            // Strip frontmatter to get actual content using shared utility function
            const contentWithoutFrontmatter = this.plugin.renameEngine.stripFrontmatterFromContent(content, file);

            // Extract first line from actual content (not frontmatter)
            const lines = contentWithoutFrontmatter.split('\n');
            const firstLine = lines.length > 0 ? lines[0] : '';

            if (!firstLine || firstLine.trim() === '') {
                return;
            }

            // Check if we need to process aliases for this file
            if (!this.settings.enableAliases) {
                return;
            }

            // Get current metadata to check for existing aliases
            const metadata = this.app.metadataCache.getFileCache(file);
            const frontmatter = metadata?.frontmatter;

            // Process the first line to get what would become the filename/alias
            const processedFirstLine = extractTitle(firstLine, this.settings);
            // By this point, file has been renamed, so compare processed first line to current filename
            const currentFileName = file.basename.trim();
            const processedLineMatchesFilename = (processedFirstLine.trim() === currentFileName);

            // Determine if we should have an alias based on settings
            const shouldHaveAlias = !this.settings.addAliasOnlyIfFirstLineDiffers || !processedLineMatchesFilename;

            if (!shouldHaveAlias) {
                // Settings say we shouldn't have an alias - remove any existing plugin aliases
                await this.removePluginAliasesFromFile(file);
                return;
            }

            // We should have an alias - check if we already have the correct one
            const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';
            const zwspMarker = String.fromCharCode(8203);
            const expectedAlias = this.settings.stripMarkupInAlias ?
                extractTitle(firstLine, this.settings) : firstLine;
            const expectedAliasWithMarker = expectedAlias + zwspMarker;

            let existingAliases: string[] = [];
            if (frontmatter && frontmatter[aliasPropertyKey]) {
                if (Array.isArray(frontmatter[aliasPropertyKey])) {
                    existingAliases = frontmatter[aliasPropertyKey];
                } else {
                    existingAliases = [frontmatter[aliasPropertyKey]];
                }
            }

            // Check if we already have the correct alias
            const hasCorrectAlias = existingAliases.some(alias =>
                alias === expectedAliasWithMarker || alias === expectedAlias
            );

            if (hasCorrectAlias) {
                // We already have the correct alias, no need to update
                verboseLog(this.plugin, `File ${file.path} already has correct alias`);
                return;
            }

            // Mark this file as having an update in progress
            aliasUpdateInProgress.add(fileKey);

            try {
                verboseLog(this.plugin, `Adding alias to ${file.path} - no correct alias found`);

                // Use the actual current filename (file has already been renamed at this point)
                // This ensures we compare alias against the actual filename with forbidden chars replaced
                const currentFileName = file.basename.trim();

                // Update the alias using existing logic
                await this.addAliasToFile(file, firstLine, currentFileName, content);

            } finally {
                // Always remove the lock, even if there was an error
                aliasUpdateInProgress.delete(fileKey);
            }

        } catch (error) {
            console.error('Error updating alias:', error);
            // Make sure to clean up the lock on error
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
                await this.app.fileManager.processFrontMatter(currentFileForFrontmatter, (frontmatter) => {
                    const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';
                    // Use array format for 'aliases' property, inline format for custom properties
                    if (aliasPropertyKey === 'aliases') {
                        frontmatter[aliasPropertyKey] = [markedAlias];
                    } else {
                        frontmatter[aliasPropertyKey] = markedAlias;
                    }
                });
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
            await this.app.fileManager.processFrontMatter(currentFileForUpdate, (frontmatter) => {
                const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';

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
            });

            // Mark file as having pending metadata cache update
            this.plugin.pendingMetadataUpdates.add(currentFileForUpdate.path);
            verboseLog(this.plugin, `Updated alias \`${aliasToAdd}\` in ${currentFileForUpdate.path}`);

        } catch (error) {
            console.error(`Failed to add alias to file ${file.path}:`, error);
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

            await this.app.fileManager.processFrontMatter(currentFileForRemoval, (frontmatter) => {
                const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';

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
            });

            // Mark file as having pending metadata cache update
            this.plugin.pendingMetadataUpdates.add(currentFileForRemoval.path);
            verboseLog(this.plugin, `Removed plugin aliases from ${currentFileForRemoval.path}`);
        } catch (error) {
            console.error(`Failed to remove plugin aliases from ${file.path}:`, error);
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

            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const aliasPropertyKey = this.settings.aliasPropertyKey || 'aliases';

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
            });

            verboseLog(this.plugin, `Removed alias "${trimmedAlias}" from ${file.path}`);
        } catch (error) {
            console.error(`Failed to remove alias from ${file.path}:`, error);
        }
    }
}