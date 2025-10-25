import { TFile, TFolder, MarkdownView, Notice, getFrontMatterInfo, parseYaml } from "obsidian";
import { PluginSettings } from '../types';
import { verboseLog, shouldProcessFile, hasDisablePropertyInFile } from '../utils';
import { t } from '../i18n';
import { TITLE_CHAR_REVERSAL_MAP } from '../constants';
import { readFileContent } from '../utils/content-reader';
import { TIMING, LIMITS } from '../constants/timing';
import FirstLineIsTitle from '../../main';

export class FileOperations {
    // Track files waiting for YAML with their resolve callbacks and timeout timers
    private yamlWaiters = new Map<string, { resolve: () => void; startTime: number; timeoutTimer: NodeJS.Timeout }>();

    constructor(private plugin: FirstLineIsTitle) {}

    get app() {
        return this.plugin.app;
    }

    get settings(): PluginSettings {
        return this.plugin.settings;
    }


    /**
     * Inserts the filename as the first line of a newly created file
     * @param initialContent - Optional initial content captured at file creation time
     * @param templateContent - Optional template content captured after template wait (skips internal wait)
     * @returns true if title was inserted, false if skipped
     */
    async insertTitleOnCreation(file: TFile, initialContent?: string, templateContent?: string): Promise<boolean> {
        try {
            const untitledWord = t('untitled').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const untitledPattern = new RegExp(`^${untitledWord}(\\s[1-9]\\d*)?$`);
            if (untitledPattern.test(file.basename)) {
                verboseLog(this.plugin, `Skipping title insertion for untitled file: ${file.path}`);
                return false;
            }

            let cleanTitle = file.basename;
            if (this.settings.core.convertReplacementCharactersInTitle) {
                const charMap: Record<string, string> = {
                    '/': 'slash',
                    ':': 'colon',
                    '*': 'asterisk',
                    '?': 'question',
                    '<': 'lessThan',
                    '>': 'greaterThan',
                    '"': 'quote',
                    '|': 'pipe',
                    '#': 'hash',
                    '[': 'leftBracket',
                    ']': 'rightBracket',
                    '^': 'caret',
                    '\\': 'backslash',
                    '.': 'dot'
                };

                // Punctuation characters that should not have space added before them
                const punctuation = ',.?;:!"\'""\'\'»«¡¿‽';
                const replacementCounts = new Map<string, number>();
                const enabledReplacements: string[] = [];
                for (const settingKey of Object.values(charMap)) {
                    const replacement = this.settings.replaceCharacters.charReplacements[settingKey as keyof typeof this.settings.replaceCharacters.charReplacements];
                    if (replacement.enabled && replacement.replacement) {
                        replacementCounts.set(replacement.replacement, (replacementCounts.get(replacement.replacement) || 0) + 1);
                        enabledReplacements.push(`${settingKey}="${replacement.replacement}"`);
                    }
                }

                verboseLog(this.plugin, `[TITLE-REVERSAL] "${cleanTitle}" with replacements: [${enabledReplacements.join(', ')}]`);

                for (const [originalChar, settingKey] of Object.entries(charMap)) {
                const charConfig = this.settings.replaceCharacters.charReplacements[settingKey as keyof typeof this.settings.replaceCharacters.charReplacements];

                // Skip if not enabled or no replacement defined
                if (!charConfig.enabled || !charConfig.replacement) continue;

                const replacementChar = charConfig.replacement;

                if (!cleanTitle.includes(replacementChar)) continue;

                // Skip if this replacement string is used by multiple enabled characters (ambiguous)
                const count = replacementCounts.get(replacementChar) || 0;
                if (count > 1) {
                    verboseLog(this.plugin, `[TITLE-REVERSAL] Skipping "${replacementChar}" → "${originalChar}" (duplicate, count=${count})`);
                    continue;
                }

                const trimLeft = charConfig.trimLeft;
                const trimRight = charConfig.trimRight;

                let result = '';
                let remaining = cleanTitle;
                while (remaining.includes(replacementChar)) {
                    const index = remaining.indexOf(replacementChar);

                    result += remaining.substring(0, index);
                    let replacement = originalChar;

                    if (trimLeft) {
                        replacement = ' ' + replacement;
                    }

                    // Add right space if trimRight enabled and right char is not punctuation
                    if (trimRight) {
                        const charToRight = remaining.length > index + 1 ? remaining[index + 1] : '';
                        if (!punctuation.includes(charToRight)) {
                            replacement = replacement + ' ';
                        }
                    }

                    result += replacement;
                    remaining = remaining.substring(index + 1);
                }

                    result += remaining;
                    cleanTitle = result;
                }

                if (cleanTitle !== file.basename) {
                    verboseLog(this.plugin, `[TITLE-REVERSAL] Result: "${file.basename}" → "${cleanTitle}"`);
                }
            }

            // Note: addHeadingToTitle setting will be applied conditionally below
            // (skipped if heading pattern already exists in template)

            verboseLog(this.plugin, `Inserting title "${cleanTitle}" in new file: ${file.path}`);

            let currentContent: string;

            if (templateContent !== undefined) {
                // Template content provided by caller (already waited for template)
                currentContent = templateContent;
                verboseLog(this.plugin, `[TITLE-INSERT] Using provided template content. Length: ${currentContent.length} chars`);
            } /* Template wait removed - will be re-implemented automatically later
            else if (this.settings.core.insertAfterTemplate) {
                verboseLog(this.plugin, `[TITLE-INSERT] Template wait enabled`);
                currentContent = await this.waitForTemplate(file, this.settings.core.newNoteDelay);
            } */ else if (initialContent !== undefined) {
                currentContent = initialContent;
                verboseLog(this.plugin, `[TITLE-INSERT] No template wait, using initial content. Length: ${currentContent.length} chars`);
            } else {
                verboseLog(this.plugin, `[TITLE-INSERT] No template wait, reading immediately from editor`);
                try {
                    currentContent = await readFileContent(this.plugin, file, {
                        searchWorkspace: this.settings.core.fileReadMethod === 'Editor',
                        preferFresh: true
                    });
                } catch (error) {
                    console.error(`Failed to read file ${file.path} for title insertion:`, error);
                    return false;
                }
            }

            const lines = currentContent.split('\n');

            let yamlEndLine = -1;
            if (lines[0] === '---') {
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i] === '---') {
                        yamlEndLine = i;
                        break;
                    }
                }
            }

            const contentAfterYaml = yamlEndLine !== -1
                ? lines.slice(yamlEndLine + 1).join('\n').trim()
                : currentContent.trim();

            if (contentAfterYaml !== '') {
                verboseLog(this.plugin, `File has content (excluding YAML)`);
                const startLineIndex = yamlEndLine !== -1 ? yamlEndLine + 1 : 0;
                let firstNonEmptyLine: string | null = null;
                let firstNonEmptyLineIndex = -1;

                for (let i = startLineIndex; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line !== '') {
                        firstNonEmptyLine = line;
                        firstNonEmptyLineIndex = i;
                        break;
                    }
                }

                const headingMatch = firstNonEmptyLine?.match(/^(#{1,6})(\s*)$/);

                if (headingMatch) {
                    const hashMarks = headingMatch[1];
                    const titleWithHeading = `${hashMarks} ${cleanTitle}`;

                    verboseLog(this.plugin, `[TITLE-INSERT] Found heading pattern "${firstNonEmptyLine}" at line ${firstNonEmptyLineIndex}, inserting title`);

                    const leaves = this.app.workspace.getLeavesOfType("markdown");
                    let insertedViaEditor = false;

                    for (const leaf of leaves) {
                        const view = leaf.view as MarkdownView;
                        if (view && view.file?.path === file.path && view.editor) {
                            view.editor.setLine(firstNonEmptyLineIndex, titleWithHeading);
                            verboseLog(this.plugin, `[TITLE-INSERT] Replaced heading at line ${firstNonEmptyLineIndex} via editor`);

                            // Position cursor at end of title if both settings enabled
                            this.positionCursorAfterTitleInsertion(view, firstNonEmptyLineIndex, titleWithHeading.length);

                            insertedViaEditor = true;
                            break;
                        }
                    }

                    if (!insertedViaEditor) {
                        verboseLog(this.plugin, `[TITLE-INSERT] Replacing heading via vault.process`);
                        await this.app.vault.process(file, (content) => {
                            const lines = content.split('\n');
                            lines[firstNonEmptyLineIndex] = titleWithHeading;
                            return lines.join('\n');
                        });
                    }

                    verboseLog(this.plugin, `Successfully inserted title in heading for ${file.path}`);
                    return true;
                } else {
                    verboseLog(this.plugin, `File has content without heading pattern, skipping title insertion for ${file.path}`);

                    // If both settings are ON, position cursor at line end even though we're not inserting
                    if (this.settings.core.moveCursorToFirstLine && this.settings.core.placeCursorAtLineEnd) {
                        // Always check exclusions (cursor never moved in excluded notes)
                        const isExcluded = await this.isFileExcludedForCursorPositioning(file, currentContent);

                        if (!isExcluded) {
                            const leaves = this.app.workspace.getLeavesOfType("markdown");
                            for (const leaf of leaves) {
                                const view = leaf.view as MarkdownView;
                                if (view && view.file?.path === file.path && view.editor) {
                                    const contentLine = yamlEndLine !== -1 ? yamlEndLine + 1 : 0;
                                    const lineContent = view.editor.getLine(contentLine);
                                    const lineLength = lineContent.length;

                                    // Use setTimeout to ensure cursor positioning happens after any pending editor updates
                                    setTimeout(() => {
                                        if (view.editor) {
                                            view.editor.focus();
                                            verboseLog(this.plugin, `[CURSOR-FLIT] file-operations.ts:245 - BEFORE setCursor() | target: line ${contentLine} ch ${lineLength}`);
                                            view.editor.setCursor({ line: contentLine, ch: lineLength });
                                            verboseLog(this.plugin, `[TITLE-INSERT] File has content, positioned cursor at end of line ${contentLine} (${lineLength} chars)`);
                                        }
                                    }, 0);
                                    break;
                                }
                            }
                        }
                    }

                    return false;
                }
            }

            // Apply addHeadingToTitle setting since no heading pattern was found
            const finalTitle = this.settings.markupStripping.addHeadingToTitle
                ? '# ' + cleanTitle
                : cleanTitle;

            // Check if canvas active - canvas files have no editor, use vault.process() immediately
            const canvasIsActive = this.app.workspace.getMostRecentLeaf()?.view?.getViewType?.() === 'canvas';
            let insertedViaEditor = false;

            if (!canvasIsActive) {
                // Use live build's simple loop structure (proven to work)
                const leaves = this.app.workspace.getLeavesOfType("markdown");

                for (const leaf of leaves) {
                    const view = leaf.view as MarkdownView;
                    if (view && view.file?.path === file.path && view.editor) {
                        let titleLine = yamlEndLine !== -1 ? yamlEndLine + 1 : 0;
                        const insertPos = { line: titleLine, ch: 0 };

                        // Verify insertion with retry (max 10 attempts = 1000ms)
                        for (let attempt = 0; attempt < 10; attempt++) {
                            view.editor.replaceRange(finalTitle + '\n', insertPos);

                            // Let editor process the change before verification
                            await new Promise(resolve => setTimeout(resolve, 10));

                            // Now verify
                            const content = view.editor.getValue();
                            const lines = content.split('\n');
                            if (lines[titleLine]?.trim() === finalTitle.trim()) {
                                // Success - position cursor
                                verboseLog(this.plugin, `[TITLE-INSERT] Verified insertion at line ${titleLine} (attempt ${attempt + 1})`);
                                this.positionCursorAfterTitleInsertion(view, titleLine, finalTitle.length);
                                insertedViaEditor = true;
                                break;
                            }

                            // Failed - wait before retry
                            if (attempt < 9) {
                                verboseLog(this.plugin, `[TITLE-INSERT] Verification failed, retry in ${TIMING.VIEW_READINESS_RETRY_DELAY_MS}ms (attempt ${attempt + 1})`);
                                await new Promise(resolve => setTimeout(resolve, TIMING.VIEW_READINESS_RETRY_DELAY_MS));
                            } else {
                                verboseLog(this.plugin, `[TITLE-INSERT] Verification failed after 10 attempts, fallback to vault.process`);
                            }
                        }
                        break;  // Exit leaf loop
                    }
                }
            }

            if (!insertedViaEditor) {
                verboseLog(this.plugin, `[TITLE-INSERT] Inserting title via vault.process`);
                await this.app.vault.process(file, (content) => {
                    if (yamlEndLine !== -1) {
                        const lines = content.split('\n');
                        const insertLine = yamlEndLine + 1;
                        lines.splice(insertLine, 0, finalTitle);
                        return lines.join('\n');
                    } else {
                        return finalTitle + "\n";
                    }
                });
            }

            verboseLog(this.plugin, `Successfully inserted title in ${file.path}`);
            return true;

        } catch (error) {
            console.error(`Error inserting title on creation for ${file.path}:`, error);
            return false;
        }
    }

    /**
     * Wait for template to be applied based on settings
     * Shared utility for both title insertion and cursor positioning
     * @param file - The file to wait for
     * @param alreadyWaited - Time already waited (e.g., newNoteDelay), default 0
     * @returns Content after template is applied (or initial content if no wait needed)
     */
    async waitForTemplate(file: TFile, alreadyWaited: number = 0): Promise<string> {
        const initialContent = await readFileContent(this.plugin, file, {
            searchWorkspace: this.settings.core.fileReadMethod === 'Editor',
            preferFresh: true
        });

        if (initialContent.trim() !== '') {
            verboseLog(this.plugin, `[TEMPLATE-WAIT] File already has content, skipping template wait for ${file.path}`);
            return initialContent;
        }

        const templateWaitTime = (this.settings.core.fileReadMethod === 'Cache' || this.settings.core.fileReadMethod === 'File') ? 2500 : 600;
        const remainingWait = templateWaitTime - alreadyWaited;

        verboseLog(this.plugin, `[TEMPLATE-WAIT] Wait calculation: templateWaitTime=${templateWaitTime}ms, alreadyWaited=${alreadyWaited}ms, remainingWait=${remainingWait}ms`);

        if (remainingWait > 0) {
            // For Cache/File read methods, wait the full duration (no event-based detection)
            if (this.settings.core.fileReadMethod === 'Cache' || this.settings.core.fileReadMethod === 'File') {
                verboseLog(this.plugin, `[TEMPLATE-WAIT] Waiting full ${remainingWait}ms for template (${this.settings.core.fileReadMethod} read method)`);
                await new Promise(resolve => setTimeout(resolve, remainingWait));
            } else {
                // For Editor read method, use event-based YAML detection
                verboseLog(this.plugin, `[TEMPLATE-WAIT] Starting YAML wait for ${remainingWait}ms (Editor mode)`);
                await this.waitForYamlOrTimeout(file, remainingWait);
                verboseLog(this.plugin, `[TEMPLATE-WAIT] YAML wait completed`);
            }
        } else {
            verboseLog(this.plugin, `[TEMPLATE-WAIT] Skipping template wait - already waited ${alreadyWaited}ms >= ${templateWaitTime}ms`);
        }

        verboseLog(this.plugin, `[TEMPLATE-WAIT] Re-reading content after template wait`);
        return await readFileContent(this.plugin, file, {
            searchWorkspace: this.settings.core.fileReadMethod === 'Editor',
            preferFresh: true
        });
    }

    /**
     * Wait for YAML to appear or timeout
     * Internal method used by waitForTemplate
     */
    async waitForYamlOrTimeout(file: TFile, timeoutMs: number): Promise<void> {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const timeoutTimer = setTimeout(() => {
                const waiter = this.yamlWaiters.get(file.path);
                if (waiter) {
                    this.yamlWaiters.delete(file.path);
                    verboseLog(this.plugin, `Template wait timeout (${timeoutMs}ms) reached for ${file.path}`);
                    resolve();
                }
            }, timeoutMs);

            this.yamlWaiters.set(file.path, { resolve, startTime, timeoutTimer });
        });
    }

    /**
     * Check if file has YAML and resolve waiting promise if found
     * Called from editor-change event
     */
    checkYamlAndResolve(file: TFile, content: string): void {
        const waiter = this.yamlWaiters.get(file.path);
        if (!waiter) return;

        const frontmatterInfo = getFrontMatterInfo(content);
        if (frontmatterInfo.exists) {
            const elapsed = Date.now() - waiter.startTime;
            verboseLog(this.plugin, `YAML detected after ${elapsed}ms for ${file.path}`);
            clearTimeout(waiter.timeoutTimer);
            this.yamlWaiters.delete(file.path);
            waiter.resolve();
        }
    }

    /**
     * Handles cursor positioning for new file creation (Step 1)
     * @param file - The file to position cursor in
     * @param usePlaceCursorAtLineEndSetting - Controls cursor placement:
     *   - true: Use placeCursorAtLineEnd setting (when title insertion will be skipped)
     *   - false: Always position at line start (when title will be inserted in Step 2)
     * Rationale: If title will be inserted, cursor positioned at start now, then Step 2
     * repositions at end after insertion. If title skipped, position at end now.
     */
    async handleCursorPositioning(file: TFile, usePlaceCursorAtLineEndSetting: boolean = true): Promise<void> {
        try {
            verboseLog(this.plugin, `handleCursorPositioning called for ${file.path}, usePlaceCursorAtLineEndSetting: ${usePlaceCursorAtLineEndSetting}`);

            let targetView: MarkdownView | null = null;
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            for (const leaf of leaves) {
                const view = leaf.view as MarkdownView;
                if (view && view.file?.path === file.path) {
                    targetView = view;
                    break;
                }
            }

            verboseLog(this.plugin, `Target view found: ${!!targetView}, file matches: ${targetView?.file?.path === file.path}`);

            if (targetView && targetView.file?.path === file.path) {
                await targetView.leaf.setViewState({
                    type: "markdown",
                    state: {
                        mode: "source",
                        source: false
                    }
                });

                await targetView.editor?.focus();

                let titleLineNumber = 0;
                let titleLineLength = 0;
                const content = targetView.editor?.getValue() || '';
                const lines = content.split('\n');

                let yamlEndLine = -1;
                if (lines[0] === '---') {
                    for (let i = 1; i < lines.length; i++) {
                        if (lines[i] === '---') {
                            yamlEndLine = i;
                            break;
                        }
                    }
                }

                if (yamlEndLine !== -1) {
                    titleLineNumber = yamlEndLine + 1;
                    verboseLog(this.plugin, `Found frontmatter ending at line ${yamlEndLine}, title on line ${titleLineNumber}`);
                } else {
                    titleLineNumber = 0;
                    verboseLog(this.plugin, `No frontmatter found, title on line ${titleLineNumber}`);
                }

                titleLineLength = targetView.editor?.getLine(titleLineNumber)?.length || 0;

                // Determine target position
                let targetPosition: {line: number, ch: number};

                if (!usePlaceCursorAtLineEndSetting) {
                    // Title will be inserted in Step 2 - position at start of title line
                    targetPosition = { line: titleLineNumber, ch: 0 };
                } else {
                    // Title insertion skipped - use placeCursorAtLineEnd setting
                    if (this.settings.core.moveCursorToFirstLine) {
                        if (this.settings.core.placeCursorAtLineEnd) {
                            // Place at end of title line
                            targetPosition = { line: titleLineNumber, ch: titleLineLength };
                        } else {
                            // Place at start of title line
                            targetPosition = { line: titleLineNumber, ch: 0 };
                        }
                    } else {
                        // Don't move cursor
                        return;
                    }
                }

                verboseLog(this.plugin, `[CURSOR-FLIT] file-operations.ts:500 - BEFORE setCursor() | target: line ${targetPosition.line} ch ${targetPosition.ch}`);
                targetView.editor?.setCursor(targetPosition);
                verboseLog(this.plugin, `[CURSOR-POS] Set cursor to line ${targetPosition.line}, ch ${targetPosition.ch} for ${file.path}`);
            } else {
                verboseLog(this.plugin, `Skipping cursor positioning - no matching active view for ${file.path}`);
            }
        } catch (error) {
            console.error(`Error positioning cursor for ${file.path}:`, error);
        }
    }

    /**
     * Checks if a file is currently open in an editor
     */
    isFileOpenInEditor(file: TFile): boolean {
        let isOpen = false;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
                isOpen = true;
            }
        });
        return isOpen;
    }

    /**
     * Check if file is excluded from processing (folder/tag/property exclusions + disable property)
     * Uses real-time content checking for tags if content provided
     * @param skipFolderCheck - If true, ignore folder exclusions (only check tags/properties)
     */
    async isFileExcludedForCursorPositioning(file: TFile, content?: string, skipFolderCheck: boolean = false): Promise<boolean> {
        const exclusionOverrides = skipFolderCheck ? { ignoreFolder: true } : undefined;
        if (!shouldProcessFile(file, this.settings, this.app, content, exclusionOverrides, this.plugin)) {
            return true;
        }

        if (content) {
            const hasDisableProperty = this.checkDisablePropertyInContent(content);
            if (hasDisableProperty) {
                return true;
            }
        } else {
            if (await hasDisablePropertyInFile(file, this.app, this.settings.exclusions.disableRenamingKey, this.settings.exclusions.disableRenamingValue)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check for disable property and excluded properties by parsing YAML directly from content
     */
    private checkDisablePropertyInContent(content: string): boolean {
        const frontmatterInfo = getFrontMatterInfo(content);
        if (!frontmatterInfo.exists) return false;

        let frontmatter: Record<string, any>;
        try {
            frontmatter = parseYaml(frontmatterInfo.frontmatter);
        } catch (error) {
            verboseLog(this.plugin, `Failed to parse YAML: ${error}`);
            return false;
        }

        if (!frontmatter || typeof frontmatter !== 'object') return false;

        const disableKey = this.settings.exclusions.disableRenamingKey;
        const disableValue = this.settings.exclusions.disableRenamingValue.toLowerCase();

        const nonEmptyExcludedProps = this.settings.exclusions.excludedProperties.filter(
            prop => prop.key.trim() !== ""
        );

        // Helper to normalize tag values (remove # prefix)
        const normalizeTag = (val: string): string => {
            return val.startsWith('#') ? val.substring(1) : val;
        };

        const checkValue = (key: string, value: any): boolean => {
            const valueStr = String(value);

            if (key === disableKey && valueStr.toLowerCase() === disableValue) {
                verboseLog(this.plugin, `Found disable property: ${key}: ${valueStr}`);
                return true;
            }

            for (const excludedProp of nonEmptyExcludedProps) {
                const propKey = excludedProp.key.trim();
                const propValue = excludedProp.value.trim();

                if (key === propKey) {
                    // For tags property, normalize both sides (remove #)
                    if (propKey === 'tags') {
                        const normalizedPropValue = normalizeTag(propValue);
                        const normalizedValue = normalizeTag(valueStr);
                        if (propValue === '' || normalizedValue === normalizedPropValue) {
                            verboseLog(this.plugin, `Found excluded tag: ${propKey}: ${valueStr}`);
                            return true;
                        }
                    } else {
                        // For other properties, exact match or empty value (any value)
                        if (propValue === '' || valueStr === propValue) {
                            verboseLog(this.plugin, `Found excluded property: ${propKey}: ${valueStr}`);
                            return true;
                        }
                    }
                }
            }

            return false;
        };

        for (const [key, value] of Object.entries(frontmatter)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (checkValue(key, item)) {
                        return true;
                    }
                }
            } else if (value !== null && value !== undefined) {
                if (checkValue(key, value)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Position cursor at end of title line after insertion (if settings allow)
     * Helper to consolidate cursor positioning logic in insertTitleOnCreation
     * @param view The markdown view where title was inserted
     * @param titleLine Line number where title was inserted
     * @param titleLength Length of the inserted title
     */
    private positionCursorAfterTitleInsertion(view: MarkdownView, titleLine: number, titleLength: number): void {
        if (this.settings.core.moveCursorToFirstLine && this.settings.core.placeCursorAtLineEnd) {
            setTimeout(() => {
                if (view.editor) {
                    view.editor.focus();
                    verboseLog(this.plugin, `[CURSOR-FLIT] file-operations.ts:641 - BEFORE setCursor() | target: line ${titleLine} ch ${titleLength}`);
                    view.editor.setCursor({ line: titleLine, ch: titleLength });
                    verboseLog(this.plugin, `[TITLE-INSERT] Positioned cursor at end of title line ${titleLine} (${titleLength} chars)`);
                }
            }, 0);
        }
    }

    /**
     * Clean up all YAML waiters (clear timeouts and promises)
     */
    cleanup(): void {
        for (const waiter of this.yamlWaiters.values()) {
            clearTimeout(waiter.timeoutTimer);
        }
        this.yamlWaiters.clear();
        verboseLog(this.plugin, 'Cleaned up all YAML waiters');
    }
}