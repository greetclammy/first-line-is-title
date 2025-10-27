import { TFile, MarkdownView, getFrontMatterInfo, parseYaml } from "obsidian";
import { NodeError } from '../obsidian-ex';
import { PluginSettings } from '../types';
import { verboseLog, shouldProcessFile, extractTitle, hasDisablePropertyInFile, findTitleSourceLine } from '../utils';
import { t } from '../i18n';
import { readFileContent } from '../utils/content-reader';
import FirstLineIsTitle from '../../main';

export class AliasManager {
    constructor(private plugin: FirstLineIsTitle) {}

    get app() {
        return this.plugin.app;
    }

    get settings(): PluginSettings {
        return this.plugin.settings;
    }

    private getAliasPropertyKeys(): string[] {
        const aliasPropertyKey = this.settings.aliases.aliasPropertyKey || 'aliases';
        return aliasPropertyKey
            .split(',')
            .map(key => key.trim())
            .filter(key => key.length > 0);
    }

    async updateAliasIfNeeded(file: TFile, providedContent?: string, targetTitle?: string, editor?: any): Promise<boolean> {
        // Track plugin usage
        this.plugin.trackUsage();

        try {
            const currentFile = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFile || !(currentFile instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias update - file no longer exists: ${file.path}`);
                return false;
            }

            file = currentFile;

            // Note: No lock check here - alias manager is called from within processFile's lock
            // The lock is already acquired by the time we reach this point

            // Check disable property FIRST - this cannot be overridden by any command
            if (await hasDisablePropertyInFile(file, this.app, this.settings.exclusions.disableRenamingKey, this.settings.exclusions.disableRenamingValue)) {
                verboseLog(this.plugin, `Skipping alias update - file has disable property: ${file.path}`);
                return false;
            }

            if (!shouldProcessFile(file, this.settings, this.app, undefined, undefined, this.plugin)) {
                return false;
            }

            // Skip ALL alias operations in popovers/canvas due to Obsidian sync/cache issues
            // Popovers and canvas have: delayed disk writes, stale editor cache, content mismatches
            if (editor) {
                const canvasLeaves = this.app.workspace.getLeavesOfType('canvas');
                const isCanvas = canvasLeaves.length > 0;
                const isPopoverOrCanvas = this.isEditorInPopoverOrCanvas(editor, file);

                if (isPopoverOrCanvas) {
                    const context = isCanvas ? 'canvas' : 'popover';
                    verboseLog(this.plugin, `Skipping alias update in ${context}: ${file.path}`);
                    return false;
                }
            }

            const content = await readFileContent(this.plugin, file, {
                providedContent,
                providedEditor: editor
            });

            if (!content || content.trim() === '') {
                return false;
            }

            const contentWithoutFrontmatter = this.plugin.renameEngine.stripFrontmatterFromContent(content, file);
            const lines = contentWithoutFrontmatter.split('\n');

            // Find first non-empty line (consistent with rename-engine.ts)
            let firstNonEmptyLine = '';
            for (const line of lines) {
                if (line.trim() !== '') {
                    firstNonEmptyLine = line;
                    break;
                }
            }

            if (!firstNonEmptyLine || firstNonEmptyLine.trim() === '') {
                if (this.settings.aliases.enableAliases) {
                    await this.removePluginAliasesFromFile(file);
                }
                return false;
            }

            // Determine titleSourceLine using shared utility function
            // This may differ from firstNonEmptyLine in special cases (card links, code blocks, tables)
            const titleSourceLine = findTitleSourceLine(firstNonEmptyLine, lines, this.settings, this.plugin);

            if (!this.settings.aliases.enableAliases) {
                return false;
            }

            // Parse frontmatter from fresh editor content instead of stale cache
            // This prevents race conditions where cache hasn't updated yet during YAML edits
            const frontmatterInfo = getFrontMatterInfo(content);
            let frontmatter: Record<string, any> | null = null;
            if (frontmatterInfo.exists) {
                try {
                    frontmatter = parseYaml(frontmatterInfo.frontmatter);
                } catch (error) {
                    // YAML is malformed (e.g., user is mid-typing) - skip alias update until valid
                    verboseLog(this.plugin, `Skipping alias update - malformed YAML in ${file.path}`);
                    return false;
                }
            }

            const processedTitleSource = extractTitle(titleSourceLine, this.settings);
            const titleToCompare = targetTitle !== undefined ? targetTitle.trim() : file.basename.trim();
            const processedLineMatchesFilename = (processedTitleSource.trim() === titleToCompare);

            const shouldHaveAlias = !this.settings.aliases.addAliasOnlyIfFirstLineDiffers || !processedLineMatchesFilename;

            if (!shouldHaveAlias) {
                await this.removePluginAliasesFromFile(file);
                return false;
            }

            const aliasPropertyKeys = this.getAliasPropertyKeys();
            const zwspMarker = '\u200B'; // Zero-width space marker
            const expectedAlias = this.settings.markupStripping.stripMarkupInAlias ?
                extractTitle(titleSourceLine, this.settings) : titleSourceLine;
            const expectedAliasWithMarker = zwspMarker + expectedAlias + zwspMarker;

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
                return true;
            }

            // Note: Lock already acquired by processFile - alias runs within that lock
            // No need to acquire separate lock here

            try {
                verboseLog(this.plugin, `Adding alias to ${file.path} - no correct alias found`);
                await this.addAliasToFile(file, titleSourceLine, titleToCompare, content);
                return true;
            } catch (error) {
                console.error('Error updating alias:', error);
                return false;
            }

        } catch (error) {
            console.error('Error updating alias:', error);
            return false;
        }
    }

    async addAliasToFile(file: TFile, originalFirstNonEmptyLine: string, newTitle: string, content: string): Promise<void> {
        try {
            // Check if file still exists before processing
            const currentFile = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFile || !(currentFile instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias addition - file no longer exists: ${file.path}`);
                return;
            }

            file = currentFile;

            const firstNonEmptyLine = originalFirstNonEmptyLine;
            let aliasProcessedLine = firstNonEmptyLine;

            // Apply custom replacements to alias if enabled
            if (this.settings.customRules.enableCustomReplacements && this.settings.markupStripping.applyCustomRulesInAlias) {
                for (const replacement of this.settings.customRules.customReplacements) {
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
            const originalCharReplacementSetting = this.settings.replaceCharacters.enableForbiddenCharReplacements;
            const originalStripMarkupSetting = this.settings.markupStripping.enableStripMarkup;

            this.settings.replaceCharacters.enableForbiddenCharReplacements = false;
            if (!this.settings.markupStripping.stripMarkupInAlias) {
                this.settings.markupStripping.enableStripMarkup = false;
            }

            let aliasToAdd = extractTitle(aliasProcessedLine, this.settings);

            this.settings.replaceCharacters.enableForbiddenCharReplacements = originalCharReplacementSetting;
            this.settings.markupStripping.enableStripMarkup = originalStripMarkupSetting;
            const targetTitle = newTitle.trim();
            const aliasMatchesFilename = (aliasToAdd.trim() === targetTitle);
            const shouldAddAlias = !this.settings.aliases.addAliasOnlyIfFirstLineDiffers || !aliasMatchesFilename;

            if (!shouldAddAlias) {
                verboseLog(this.plugin, `Removing plugin aliases and skipping add - alias matches filename: \`${aliasToAdd}\` = \`${targetTitle}\``);
                await this.removePluginAliasesFromFile(file);
                return;
            }

            // Apply truncation to alias if enabled
            if (this.settings.aliases.truncateAlias) {
                if (aliasToAdd.length > this.settings.core.charCount - 1) {
                    aliasToAdd = aliasToAdd.slice(0, this.settings.core.charCount - 1).trimEnd() + "…";
                }
            }

            // If the alias is empty or only whitespace, remove the plugin alias instead
            if (!aliasToAdd || aliasToAdd.trim() === '') {
                verboseLog(this.plugin, `Removing plugin alias - no non-empty content found`);
                await this.removePluginAliasesFromFile(file);
                return;
            }

            // Prevent "Untitled" or "Untitled n" aliases UNLESS first line is literally that
            const untitledWord = t('untitled').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const untitledPattern = new RegExp(`^${untitledWord}(\\s+[1-9]\\d*)?$`);
            if (untitledPattern.test(aliasToAdd.trim())) {
                // Check if original first non-empty line (before processing) was literally "Untitled" or "Untitled n"
                const originalFirstLineTrimmed = firstNonEmptyLine.trim();

                if (!untitledPattern.test(originalFirstLineTrimmed)) {
                    // Extracted title is "Untitled" but first line is not literally "Untitled"
                    // This happens when markup stripping results in empty content:
                    // - Empty headings: `#`, `##`, etc.
                    // - Empty list markers: `- `, `* `, `1. `, etc.
                    // - Template syntax: `<%*`, `<% tp.file.cursor() %>`, etc.
                    // Skip alias addition entirely (don't add, don't remove)
                    verboseLog(this.plugin, `Skipping alias addition - extracted title is "Untitled" from markup: ${originalFirstLineTrimmed}`);
                    return;
                }
            }

            // Mark alias with ZWSP for identification
            const markedAlias = '\u200B' + aliasToAdd + '\u200B';
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === file) {
                await activeView.save();
            }

            // Parse content directly to avoid race conditions with metadata cache
            const lines = content.split('\n');
            const hasFrontmatter = lines.length > 0 && lines[0].trim() === '---';

            if (!hasFrontmatter) {
                // Race condition mitigation: Get current file reference right before processFrontMatter
                // File could be renamed/deleted between initial check and this point
                const currentFileForFrontmatter = this.app.vault.getAbstractFileByPath(file.path);
                if (!currentFileForFrontmatter || !(currentFileForFrontmatter instanceof TFile)) {
                    verboseLog(this.plugin, `Skipping frontmatter creation - file no longer exists: ${file.path}`);
                    return;
                }

                // No frontmatter exists - use processFrontMatter to create it properly
                const aliasPropertyKeys = this.getAliasPropertyKeys();
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
                // Mark file as having pending metadata cache update
                this.plugin.pendingMetadataUpdates.add(currentFileForFrontmatter.path);
                verboseLog(this.plugin, `Created frontmatter and added alias \`${aliasToAdd}\` to ${currentFileForFrontmatter.path}`);
                return;
            }

            // Race condition mitigation: Get current file reference right before processFrontMatter
            // File could be renamed/deleted between initial check and this point
            const currentFileForUpdate = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFileForUpdate || !(currentFileForUpdate instanceof TFile)) {
                verboseLog(this.plugin, `Skipping frontmatter update - file no longer exists: ${file.path}`);
                return;
            }

            // File has frontmatter, use processFrontMatter to update aliases
            const aliasPropertyKeys = this.getAliasPropertyKeys();
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
                                if (this.settings.aliases.keepEmptyAliasProperty) {
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
                                    if (this.settings.aliases.keepEmptyAliasProperty) {
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

            // Mark file as having pending metadata cache update
            this.plugin.pendingMetadataUpdates.add(currentFileForUpdate.path);
            verboseLog(this.plugin, `Updated alias \`${aliasToAdd}\` in ${currentFileForUpdate.path}`);

        } catch (error) {
            // Check if this is an ENOENT error (file was renamed during async operation)
            const errWithCode = error as NodeJS.ErrnoException;
            if (errWithCode && typeof errWithCode === 'object' && 'code' in errWithCode && errWithCode.code === 'ENOENT') {
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

            // Race condition mitigation: Get current file reference right before processFrontMatter
            // File could be renamed/deleted between initial check and this point
            const currentFileForRemoval = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFileForRemoval || !(currentFileForRemoval instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias removal - file no longer exists: ${file.path}`);
                return;
            }

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
                            if (forceCompleteRemoval || !this.settings.aliases.keepEmptyAliasProperty) {
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

            // Mark file as having pending metadata cache update
            this.plugin.pendingMetadataUpdates.add(currentFileForRemoval.path);
            verboseLog(this.plugin, `Removed plugin aliases from ${currentFileForRemoval.path}`);
        } catch (error) {
            // Check if this is an ENOENT error (file was renamed during async operation)
            const errWithCode = error as NodeJS.ErrnoException;
            if (errWithCode && typeof errWithCode === 'object' && 'code' in errWithCode && errWithCode.code === 'ENOENT') {
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
                            if (this.settings.aliases.keepEmptyAliasProperty) {
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

            verboseLog(this.plugin, `Removed alias "${trimmedAlias}" from ${file.path}`);
        } catch (error) {
            console.error(`Failed to remove alias from ${file.path}:`, error);
        }
    }

    /**
     * Check if editor is in a popover (hover preview) or canvas
     * Canvas editors are treated like popovers - alias updates disabled due to sync/cache issues
     * @param editor - Editor instance to check
     * @param file - File being edited
     * @returns true if editor is in a popover or canvas, false if in main workspace
     */
    public isEditorInPopoverOrCanvas(editor: any, file: TFile): boolean {
        // Check if canvas is active - treat canvas like popovers (disable alias updates)
        // Canvas has similar cache/sync issues as popovers, making reliable alias updates impossible
        const canvasLeaves = this.app.workspace.getLeavesOfType('canvas');
        if (canvasLeaves.length > 0) {
            return true; // Canvas active - disable alias updates
        }

        // If editor is provided, it's from editor-change event
        // Popovers don't trigger editor-change events, so this is always a real editor
        if (editor) {
            return false; // Editor provided = not a popover
        }

        // Get the active markdown view
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

        // If there's no active view, or the active view's editor doesn't match
        // the one we're syncing, it's a popover
        if (!activeView || activeView.file?.path !== file.path) {
            return true; // It's a popover
        }

        // Editor matches active view = main workspace editor
        return false;
    }
}