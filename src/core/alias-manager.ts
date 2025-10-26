import { TFile, MarkdownView, getFrontMatterInfo, parseYaml } from "obsidian";
import { NodeError } from '../obsidian-ex';
import { PluginSettings } from '../types';
import { verboseLog, shouldProcessFile, extractTitle, canModifyFile, findTitleSourceLine } from '../utils';
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

    async updateAliasIfNeeded(file: TFile, providedContent?: string, targetTitle?: string, isManualCommand = false, hasActiveEditor?: boolean, editor?: any): Promise<void> {
        // Track plugin usage
        this.plugin.trackUsage();

        try {
            const currentFile = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFile || !(currentFile instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias update - file no longer exists: ${file.path}`);
                return;
            }

            file = currentFile;

            // Note: No lock check here - alias manager is called from within processFile's lock
            // The lock is already acquired by the time we reach this point

            // Central gate: check policy requirements and always-on safeguards
            const {canModify, reason} = await canModifyFile(
                file,
                this.app,
                this.settings.exclusions.disableRenamingKey,
                this.settings.exclusions.disableRenamingValue,
                isManualCommand,
                hasActiveEditor
            );

            if (!canModify) {
                verboseLog(this.plugin, `Skipping alias update: ${reason}: ${file.path}`);
                return;
            }

            if (!shouldProcessFile(file, this.settings, this.app, undefined, undefined, this.plugin)) {
                return;
            }
            const content = await readFileContent(this.plugin, file, {
                providedContent
            });

            if (!content || content.trim() === '') {
                return;
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
                    await this.removePluginAliasesFromFile(file, false, editor);
                }
                return;
            }

            // Determine titleSourceLine using shared utility function
            // This may differ from firstNonEmptyLine in special cases (card links, code blocks, tables)
            const titleSourceLine = findTitleSourceLine(firstNonEmptyLine, lines, this.settings, this.plugin);

            if (!this.settings.aliases.enableAliases) {
                return;
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
                    return;
                }
            }

            const processedTitleSource = extractTitle(titleSourceLine, this.settings);
            const titleToCompare = targetTitle !== undefined ? targetTitle.trim() : file.basename.trim();
            const processedLineMatchesFilename = (processedTitleSource.trim() === titleToCompare);

            const shouldHaveAlias = !this.settings.aliases.addAliasOnlyIfFirstLineDiffers || !processedLineMatchesFilename;

            if (!shouldHaveAlias) {
                await this.removePluginAliasesFromFile(file, false, editor);
                return;
            }

            // Catch-up: if this file has pending alias update and we're NOT in popover, clear flag
            // This handles case where popover closed but no event fired, or event handler didn't run yet
            if (this.plugin.fileStateManager.hasPendingAliasRecheck(file.path)) {
                if (!editor || !this.isEditorInPopover(editor, file)) {
                    verboseLog(this.plugin, `Catching up pending alias update: ${file.path}`);
                    this.plugin.fileStateManager.clearPendingAliasRecheck(file.path);
                    // Continue to update alias below (don't return)
                }
            }

            // Skip alias update when editing in popover to prevent cursor jumping and race conditions
            // Alias will update automatically when popover closes via active-leaf-change/layout-change handler
            if (editor && this.isEditorInPopover(editor, file)) {
                verboseLog(this.plugin, `Skipping alias update in popover: ${file.path}`);
                this.plugin.fileStateManager.markPendingAliasRecheck(file.path, editor);
                return;
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
                return;
            }

            // Note: Lock already acquired by processFile - alias runs within that lock
            // No need to acquire separate lock here

            try {
                verboseLog(this.plugin, `Adding alias to ${file.path} - no correct alias found`);
                await this.addAliasToFile(file, titleSourceLine, titleToCompare, content, editor);
            } catch (error) {
                console.error('Error updating alias:', error);
            }

        } catch (error) {
            console.error('Error updating alias:', error);
        }
    }

    async addAliasToFile(file: TFile, originalFirstNonEmptyLine: string, newTitle: string, content: string, editor?: any): Promise<void> {
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
                await this.removePluginAliasesFromFile(file, false, editor);
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
                await this.removePluginAliasesFromFile(file, false, editor);
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

            // Save any unsaved changes before modifying frontmatter
            if (editor) {
                // Editor provided - find the view containing this editor and save
                // Note: No separate lock needed - already running within processFile()'s lock
                const leaves = this.app.workspace.getLeavesOfType("markdown");
                for (const leaf of leaves) {
                    const view = leaf.view as MarkdownView;
                    if (view?.file?.path === file.path && view.editor === editor) {
                        await view.save();
                        break;
                    }
                }
            } else {
                // Fallback: try active view save
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.file?.path === file.path) {
                    await activeView.save();
                }
            }

            // Parse content directly to avoid race conditions with metadata cache
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
                const originalMtime = this.settings.core.preserveModificationDate ? currentFileForFrontmatter.stat.mtime : undefined;
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
                }, originalMtime !== undefined ? { mtime: originalMtime } : undefined);
                // Mark file as having pending metadata cache update
                this.plugin.pendingMetadataUpdates.add(currentFileForFrontmatter.path);
                verboseLog(this.plugin, `Created frontmatter and added alias \`${aliasToAdd}\` to ${currentFileForFrontmatter.path}`);

                // Sync editor with new frontmatter if editor available
                if (editor) {
                    // Don't read from disk - processFrontMatter's write may not be complete yet
                    // Instead, sync editor directly with frontmatter we know we just wrote
                    try {
                        // Construct frontmatter YAML with alias we just wrote
                        let frontmatterYaml = '';
                        for (const aliasPropertyKey of aliasPropertyKeys) {
                            if (aliasPropertyKey === 'aliases') {
                                frontmatterYaml += `${aliasPropertyKey}:\n  - ${markedAlias}\n`;
                            } else {
                                frontmatterYaml += `${aliasPropertyKey}: ${markedAlias}\n`;
                            }
                        }

                        const currentEditorContent = editor.getValue();
                        const oldFrontmatterLines = this.countFrontmatterLines(currentEditorContent);
                        const newFrontmatterWithDelimiters = `---\n${frontmatterYaml}---\n`;

                        this.plugin.fileStateManager.markEditorSyncing(currentFileForFrontmatter.path);
                        try {
                            editor.replaceRange(
                                newFrontmatterWithDelimiters,
                                { line: 0, ch: 0 },
                                { line: oldFrontmatterLines, ch: 0 }
                            );
                            verboseLog(this.plugin, `[EDITOR-SYNC] Created frontmatter via replaceRange (${oldFrontmatterLines} → ${this.countFrontmatterLines(editor.getValue())} lines)`);
                        } finally {
                            this.plugin.fileStateManager.clearEditorSyncing(currentFileForFrontmatter.path);
                        }
                    } catch (error) {
                        verboseLog(this.plugin, `[EDITOR-SYNC] Failed to sync after frontmatter creation: ${error}`);
                    }
                }
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
            const originalMtime = this.settings.core.preserveModificationDate ? currentFileForUpdate.stat.mtime : undefined;
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
            }, originalMtime !== undefined ? { mtime: originalMtime } : undefined);

            // Mark file as having pending metadata cache update
            this.plugin.pendingMetadataUpdates.add(currentFileForUpdate.path);
            verboseLog(this.plugin, `Updated alias \`${aliasToAdd}\` in ${currentFileForUpdate.path}`);

            // Wait for processFrontMatter's async write to complete before reading
            // processFrontMatter's promise resolves before disk write finishes
            // 10ms delay allows write to complete, preventing stale reads during rapid typing
            await new Promise(resolve => setTimeout(resolve, 10));

            // Read file once after processFrontMatter completes to get updated content
            const contentAfterWrite = await this.app.vault.read(currentFileForUpdate);

            await this.syncPopoverEditorBuffer(currentFileForUpdate, contentAfterWrite, editor);

        } catch (error) {
            // Check if this is an ENOENT error (file was renamed during async operation)
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                // File was renamed during operation - this is expected race condition, log as info
                verboseLog(this.plugin, `Skipping alias addition - file was renamed during operation: ${file.path}`);
            } else {
                // Unexpected error, log it
                console.error(`Failed to add alias to file ${file.path}:`, error);
            }
            // Don't throw - alias addition failure shouldn't prevent the rename
        }
    }

    async removePluginAliasesFromFile(file: TFile, forceCompleteRemoval: boolean = false, editor?: any): Promise<void> {
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
            if (editor) {
                // Editor provided - find the view containing this editor and save
                const leaves = this.app.workspace.getLeavesOfType("markdown");
                for (const leaf of leaves) {
                    const view = leaf.view as MarkdownView;
                    if (view?.file?.path === file.path && view.editor === editor) {
                        await view.save();
                        break;
                    }
                }
            } else {
                // Fallback: try active view save
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.file?.path === file.path) {
                    await activeView.save();
                }
            }

            // Get current file reference again right before processFrontMatter
            const currentFileForRemoval = this.app.vault.getAbstractFileByPath(file.path);
            if (!currentFileForRemoval || !(currentFileForRemoval instanceof TFile)) {
                verboseLog(this.plugin, `Skipping alias removal - file no longer exists: ${file.path}`);
                return;
            }

            const originalMtime = this.settings.core.preserveModificationDate ? currentFileForRemoval.stat.mtime : undefined;
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
            }, originalMtime !== undefined ? { mtime: originalMtime } : undefined);

            // Mark file as having pending metadata cache update
            this.plugin.pendingMetadataUpdates.add(currentFileForRemoval.path);
            verboseLog(this.plugin, `Removed plugin aliases from ${currentFileForRemoval.path}`);

            // Wait for processFrontMatter's async write to complete before reading
            // processFrontMatter's promise resolves before disk write finishes
            // 10ms delay allows write to complete, preventing stale reads during rapid typing
            await new Promise(resolve => setTimeout(resolve, 10));

            // Read file once after processFrontMatter completes to get updated content
            const contentAfterWrite = await this.app.vault.read(currentFileForRemoval);

            await this.syncPopoverEditorBuffer(currentFileForRemoval, contentAfterWrite, editor);
        } catch (error) {
            // Check if this is an ENOENT error (file was renamed during async operation)
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
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

            const originalMtime = this.settings.core.preserveModificationDate ? file.stat.mtime : undefined;
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
            }, originalMtime !== undefined ? { mtime: originalMtime } : undefined);

            verboseLog(this.plugin, `Removed alias "${trimmedAlias}" from ${file.path}`);
        } catch (error) {
            console.error(`Failed to remove alias from ${file.path}:`, error);
        }
    }

    /**
     * Count how many editors currently have this file open
     * Used to detect dual-editor scenarios (main + popover) that cause conflicts
     *
     * @param file - The file to check
     * @returns Number of editor instances showing this file
     */
    private countEditorsForFile(file: TFile): number {
        let count = 0;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() === 'markdown') {
                // Accessing non-public editor API - no official types available
                const mdView = leaf.view as any;
                if (mdView.file?.path === file.path) {
                    count++;
                }
            }
        });
        return count;
    }

    /**
     * Check if the given editor is in a popover/hover preview vs main workspace
     *
     * @param editor - Editor instance to check
     * @param file - File being edited
     * @returns true if editor is in a popover, false if in main workspace
     */
    public isEditorInPopover(editor: any, file: TFile): boolean {
        // Get the active markdown view
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

        // If there's no active view, or the active view's editor doesn't match
        // the one we're syncing, then this editor is likely in a popover
        if (!activeView || activeView.file?.path !== file.path) {
            return true;
        }

        // If active view matches but editor object is different, it's a popover
        if (activeView.editor !== editor) {
            return true;
        }

        // Editor matches active view = main workspace editor
        return false;
    }

    /**
     * Sync editor buffer with disk after frontmatter modification
     * Prevents auto-save from overwriting the frontmatter changes
     *
     * @param file - The file to sync
     * @param diskContent - Content from disk (already read by caller to avoid race conditions)
     * @param editor - Editor reference from editor-change event
     */
    private async syncPopoverEditorBuffer(file: TFile, diskContent: string, editor?: any): Promise<void> {
        try {
            // If we have an editor reference (from editor-change event), use it directly
            if (editor) {
                verboseLog(this.plugin, `[EDITOR-SYNC] Using editor from event for ${file.path}`);

                try {

                    // Get current editor content (may have newer keystrokes)
                    const currentEditorContent = editor.getValue();

                    // Use provided disk content (already read by caller) to avoid race condition
                    // Reading from disk here causes race: previous write may not be complete,
                    // or worse, a newer write might have completed, giving us "future" content
                    verboseLog(this.plugin, `[EDITOR-SYNC] Using provided content: ${diskContent.length} chars, editor has ${currentEditorContent.length} chars`);

                    // Skip sync if file contains footnotes in main editor
                    // Prevents cursor jumping in main editor (setValue() loses cursor position)
                    if (diskContent.match(/\n\[\^[^\]]+\]:\s/)) {
                        verboseLog(this.plugin, `[EDITOR-SYNC] Skipping sync - footnotes in main editor (prevents cursor jump)`);
                        return;
                    }

                    // Clean nested frontmatter from disk content
                    const cleanedDiskContent = this.removeNestedFrontmatterFromFootnotes(diskContent);

                    // Extract frontmatter from disk (has updated alias)
                    const diskFrontmatter = this.extractFrontmatter(cleanedDiskContent);

                    // Count existing frontmatter lines to know what to replace
                    const oldFrontmatterLines = this.countFrontmatterLines(currentEditorContent);

                    // Mark as syncing to prevent editor-change events from replaceRange() triggering processFile
                    // Without this flag, replaceRange() triggers editor-change → processFile runs on stale content
                    // → extracts old first-line → renames to stale value → infinite rename loop
                    this.plugin.fileStateManager.markEditorSyncing(file.path);
                    try {
                        // Use replaceRange() to surgically update ONLY frontmatter lines
                        // This preserves body content and cursor position automatically
                        // No need for complex cursor restoration logic - CodeMirror handles it
                        if (diskFrontmatter) {
                            // Update or insert frontmatter
                            const newFrontmatterWithDelimiters = `---\n${diskFrontmatter}\n---\n`;
                            editor.replaceRange(
                                newFrontmatterWithDelimiters,
                                { line: 0, ch: 0 },
                                { line: oldFrontmatterLines, ch: 0 }
                            );
                            verboseLog(this.plugin, `[EDITOR-SYNC] Updated frontmatter via replaceRange (${oldFrontmatterLines} → ${this.countFrontmatterLines(editor.getValue())} lines)`);
                        } else if (oldFrontmatterLines > 0) {
                            // Remove existing frontmatter if disk has none
                            editor.replaceRange(
                                '',
                                { line: 0, ch: 0 },
                                { line: oldFrontmatterLines, ch: 0 }
                            );
                            verboseLog(this.plugin, `[EDITOR-SYNC] Removed frontmatter via replaceRange (${oldFrontmatterLines} lines)`);
                        }

                        verboseLog(this.plugin, `[EDITOR-SYNC] Successfully synced editor buffer for ${file.path}`);
                    } finally {
                        // Always clear syncing flag, even if replaceRange() throws
                        this.plugin.fileStateManager.clearEditorSyncing(file.path);
                    }

                    // NOTE: Background editor sync removed to prevent cursor interference
                    // During rapid typing, syncing background editors triggered events affecting popover cursor
                    // Obsidian's file watcher will naturally update background editors when safe

                    return;
                } catch (error) {
                    verboseLog(this.plugin, `[EDITOR-SYNC] Failed to sync editor buffer: ${error}`);
                }
            } else {
                verboseLog(this.plugin, `[EDITOR-SYNC] No editor reference available for ${file.path} - skipping buffer sync`);
            }
        } catch (error) {
            verboseLog(this.plugin, `[EDITOR-SYNC] ERROR: Failed to sync editor buffer for ${file.path}: ${error}`);
        }
    }

    /**
     * Merge frontmatter from disk content with body from editor content
     * Preserves user's rapid keystrokes while updating alias in frontmatter
     *
     * @param diskContent - Content from disk (has updated frontmatter)
     * @param editorContent - Current editor content (may have newer body content)
     * @returns Merged content with frontmatter from disk and body from editor
     */
    private mergeFrontmatterWithBody(diskContent: string, editorContent: string): string {
        // Clean nested frontmatter from disk content FIRST
        // When Obsidian inserts footnotes, it copies current file content (including frontmatter)
        // into the footnote definition on disk, creating nested YAML blocks
        // Must clean disk content before extracting frontmatter
        const cleanedDiskContent = this.removeNestedFrontmatterFromFootnotes(diskContent);

        // Extract frontmatter from cleaned disk content
        const diskFrontmatter = this.extractFrontmatter(cleanedDiskContent);

        // Extract body from editor content (skip frontmatter)
        const editorBody = this.extractBody(editorContent);

        // If disk has frontmatter, use it; otherwise use empty frontmatter
        if (diskFrontmatter) {
            return `---\n${diskFrontmatter}\n---\n${editorBody}`;
        } else {
            // No frontmatter in disk content - return editor body as-is
            return editorBody;
        }
    }

    /**
     * Remove nested frontmatter blocks from footnote definitions
     * Footnote definitions may contain YAML frontmatter when created via Command Palette
     *
     * @param content - File body content that may contain footnote definitions with nested frontmatter
     * @returns Content with nested frontmatter removed from footnote definitions
     */
    private removeNestedFrontmatterFromFootnotes(content: string): string {
        // Match footnote definitions that contain frontmatter blocks:
        // [^id]: ---\n\talias...\n\t---\n\tactual content
        // Note: Obsidian indents copied content with tabs when inserting into footnote definitions

        // Pattern: [^footnote-id]: followed by optional whitespace, then ---\n...---\n
        // [\s\S]*? matches content including newlines (non-greedy, consumes trailing \n)
        // \s* before closing --- matches indentation (e.g., \t)
        // \s* after closing ---\n removes trailing indentation before footnote content
        return content.replace(
            /(\[\^[^\]]+\]:\s*)---\n[\s\S]*?\s*---\n\s*/g,
            (match, footnotePrefix) => {
                // Keep the footnote prefix [^id]: but remove the frontmatter block and indentation
                // Result: [^id]: <actual footnote content>
                return footnotePrefix;
            }
        );
    }

    /**
     * Extract frontmatter content (without delimiters) from a string
     * @param content - File content that may contain frontmatter
     * @returns Frontmatter content without delimiters, or null if no frontmatter
     */
    private extractFrontmatter(content: string): string | null {
        if (!content.startsWith('---\n')) {
            return null;
        }

        const endIndex = content.indexOf('\n---\n', 4);
        if (endIndex === -1) {
            return null;
        }

        return content.substring(4, endIndex);
    }

    /**
     * Extract body content (after frontmatter) from a string
     * @param content - File content that may contain frontmatter
     * @returns Body content without frontmatter
     */
    private extractBody(content: string): string {
        if (!content.startsWith('---\n')) {
            return content;
        }

        const endIndex = content.indexOf('\n---\n', 4);
        if (endIndex === -1) {
            return content;
        }

        // Return content after frontmatter delimiter and newline
        return content.substring(endIndex + 5);
    }

    /**
     * Get the 0-indexed line number where content starts after frontmatter
     * Used to calculate cursor position offset when frontmatter size changes
     *
     * @param content - File content
     * @returns Line number (0-indexed) where content starts, or 0 if no frontmatter
     */
    private countFrontmatterLines(content: string): number {
        if (!content.startsWith('---\n')) {
            return 0;
        }

        const endIndex = content.indexOf('\n---\n', 4);
        if (endIndex === -1) {
            return 0;
        }

        // Count newlines from start to end delimiter + 1 for closing delimiter line
        // frontmatterPortion includes: "---\n...content...\n---\n"
        // Return line number (0-indexed) where content starts after frontmatter
        const frontmatterPortion = content.substring(0, endIndex + 5);
        return frontmatterPortion.split('\n').length - 1;
    }
}