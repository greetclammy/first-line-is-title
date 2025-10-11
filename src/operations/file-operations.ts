import { TFile, TFolder, MarkdownView, Notice } from "obsidian";
import { PluginSettings } from '../types';
import { verboseLog, shouldProcessFile, hasDisablePropertyInFile } from '../utils';
import { TITLE_CHAR_REVERSAL_MAP } from '../constants';
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
     * Cleans up stale entries from caches (deprecated - now handled by cache manager)
     */
    cleanupStaleCache(): void {
        // Cache cleanup now handled by CacheManager
        verboseLog(this.plugin, 'Cache cleanup delegated to CacheManager');
    }

    /**
     * Inserts the filename as the first line of a newly created file
     * @param initialContent - Optional initial content captured at file creation time
     * @param templateContent - Optional template content captured after template wait (skips internal wait)
     * @returns true if title was inserted, false if skipped
     */
    async insertTitleOnCreation(file: TFile, initialContent?: string, templateContent?: string): Promise<boolean> {
        try {
            // Check if filename is "Untitled" or "Untitled n" (where n is a positive integer)
            const untitledPattern = /^Untitled(\s[1-9]\d*)?$/;
            if (untitledPattern.test(file.basename)) {
                verboseLog(this.plugin, `Skipping title insertion for untitled file: ${file.path}`);
                return false;
            }

            // Get clean title by reversing forbidden character replacements
            let cleanTitle = file.basename;

            // Create mapping from replacement char to setting key for trim settings lookup
            const replacementCharToKey: Record<string, keyof typeof this.settings.charReplacements> = {
                '∕': 'slash',
                '։': 'colon',
                '∗': 'asterisk',
                '﹖': 'question',
                '‹': 'lessThan',
                '›': 'greaterThan',
                '＂': 'quote',
                '❘': 'pipe',
                '＃': 'hash',
                '［': 'leftBracket',
                '］': 'rightBracket',
                'ˆ': 'caret',
                '⧵': 'backslash',
                '․': 'dot'
            };

            // Punctuation characters that should not have space added before them
            const punctuation = ',.?;:!"\'""\'\'»«¡¿‽';

            // Apply character reversal mapping with whitespace restoration
            for (const [replacementChar, originalChar] of Object.entries(TITLE_CHAR_REVERSAL_MAP)) {
                // Check if this replacement char exists in the filename
                if (!cleanTitle.includes(replacementChar)) continue;

                const settingKey = replacementCharToKey[replacementChar];
                if (!settingKey) continue;

                // Check if this replacement is enabled and has trim settings
                const replacementEnabled = this.settings.charReplacementEnabled[settingKey];
                const trimLeft = this.settings.charReplacementTrimLeft[settingKey];
                const trimRight = this.settings.charReplacementTrimRight[settingKey];

                if (!replacementEnabled) {
                    cleanTitle = cleanTitle.replaceAll(replacementChar, originalChar);
                    continue;
                }

                // Process each occurrence individually to check context
                let result = '';
                let remaining = cleanTitle;
                while (remaining.includes(replacementChar)) {
                    const index = remaining.indexOf(replacementChar);

                    // Add everything before this replacement char
                    result += remaining.substring(0, index);

                    // Build replacement with context-aware spacing
                    let replacement = originalChar;

                    // Add left space if trimLeft enabled
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

                // Add any remaining content
                result += remaining;
                cleanTitle = result;
            }

            // Add heading if setting enabled
            if (this.settings.addHeadingToTitle) {
                cleanTitle = '# ' + cleanTitle;
            }

            verboseLog(this.plugin, `Inserting title "${cleanTitle}" in new file: ${file.path}`);

            // Determine content to use for title insertion
            let currentContent: string;

            if (templateContent !== undefined) {
                // Template content provided by caller (already waited for template)
                currentContent = templateContent;
                verboseLog(this.plugin, `[TITLE-INSERT] Using provided template content. Length: ${currentContent.length} chars`);
            } else if (this.settings.insertTitleOnCreation && this.settings.waitForTemplate) {
                // Wait for template plugins to apply templates if enabled
                // Both newNoteDelay and waitForTemplate delays start from file creation
                // Cache/File modes: Total wait = max(newNoteDelay, 2500ms if waitForTemplate is ON)
                //   - 2500ms = Templater insertion (300ms) + Obsidian modify debounce (2000ms) + buffer (200ms)
                // Editor mode: Total wait = max(newNoteDelay, 600ms if waitForTemplate is ON)
                verboseLog(this.plugin, `[TITLE-INSERT] Checking template wait: insertTitleOnCreation=${this.settings.insertTitleOnCreation}, waitForTemplate=${this.settings.waitForTemplate}`);

                const templateWaitTime = (this.settings.fileReadMethod === 'Cache' || this.settings.fileReadMethod === 'File') ? 2500 : 600;
                const remainingWait = templateWaitTime - this.settings.newNoteDelay;
                verboseLog(this.plugin, `[TITLE-INSERT] Template wait calculation: templateWaitTime=${templateWaitTime}ms, newNoteDelay=${this.settings.newNoteDelay}ms, remainingWait=${remainingWait}ms`);

                if (remainingWait > 0) {
                    // For Cache/File read methods, wait the full duration (no event-based detection)
                    if (this.settings.fileReadMethod === 'Cache' || this.settings.fileReadMethod === 'File') {
                        verboseLog(this.plugin, `[TITLE-INSERT] Waiting full ${remainingWait}ms for template (${this.settings.fileReadMethod} read method, total: ${templateWaitTime}ms)`);
                        await new Promise(resolve => setTimeout(resolve, remainingWait));
                    } else {
                        // For Editor read method, use event-based YAML detection
                        verboseLog(this.plugin, `[TITLE-INSERT] Starting YAML wait for ${remainingWait}ms (Editor mode)`);
                        await this.waitForYamlOrTimeout(file, remainingWait);
                        verboseLog(this.plugin, `[TITLE-INSERT] YAML wait completed`);
                    }
                } else {
                    verboseLog(this.plugin, `Skipping template wait - newNoteDelay (${this.settings.newNoteDelay}ms) already >= ${templateWaitTime}ms`);
                }

                // After waiting for template, re-read content from editor to get latest state
                verboseLog(this.plugin, `[TITLE-INSERT] Re-reading content after template wait`);
                const leaves = this.app.workspace.getLeavesOfType("markdown");
                let foundEditor = false;
                for (const leaf of leaves) {
                    const view = leaf.view as MarkdownView;
                    if (view && view.file?.path === file.path && view.editor) {
                        currentContent = view.editor.getValue();
                        verboseLog(this.plugin, `[TITLE-INSERT] Read fresh content from editor after template wait. Length: ${currentContent.length} chars`);
                        foundEditor = true;
                        break;
                    }
                }
                if (!foundEditor) {
                    // Fallback to vault
                    currentContent = await this.app.vault.read(file);
                    verboseLog(this.plugin, `[TITLE-INSERT] Read fresh content from vault after template wait. Length: ${currentContent.length} chars`);
                }
            } else if (initialContent !== undefined) {
                // No template wait, use captured initial content
                currentContent = initialContent;
                verboseLog(this.plugin, `Using provided initial content for title insertion. Length: ${currentContent.length} chars`);
            } else {
                try {
                    currentContent = await this.app.vault.read(file);
                    verboseLog(this.plugin, `Read file content from vault for title insertion. Length: ${currentContent.length} chars`);
                } catch (error) {
                    console.error(`Failed to read file ${file.path} for title insertion:`, error);
                    return false;
                }
            }

            const lines = currentContent.split('\n');

            // Detect YAML frontmatter directly from content
            let yamlEndLine = -1;
            if (lines[0] === '---') {
                // Find closing ---
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i] === '---') {
                        yamlEndLine = i;
                        break;
                    }
                }
            }

            // Get content after YAML (if present) or all content (if no YAML)
            const contentAfterYaml = yamlEndLine !== -1
                ? lines.slice(yamlEndLine + 1).join('\n').trim()
                : currentContent.trim();

            // Only insert title if file is empty (excluding YAML)
            if (contentAfterYaml !== '') {
                verboseLog(this.plugin, `File has content (excluding YAML), skipping title insertion for ${file.path}`);
                return false;
            }

            // File is empty (excluding YAML), insert title
            // Use editor API for immediate insertion to avoid disk write delay
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            let insertedViaEditor = false;

            for (const leaf of leaves) {
                const view = leaf.view as MarkdownView;
                if (view && view.file?.path === file.path && view.editor) {
                    if (yamlEndLine !== -1) {
                        // Insert after YAML using editor
                        const insertLine = yamlEndLine + 1;
                        view.editor.replaceRange(cleanTitle + '\n', { line: insertLine, ch: 0 });
                        verboseLog(this.plugin, `[TITLE-INSERT] Inserted title after frontmatter at line ${insertLine} via editor`);
                    } else {
                        // Insert at beginning using editor
                        view.editor.replaceRange(cleanTitle + '\n', { line: 0, ch: 0 });
                        verboseLog(this.plugin, `[TITLE-INSERT] Inserted title at beginning via editor`);
                    }
                    insertedViaEditor = true;
                    break;
                }
            }

            // Fallback to vault.modify if no editor found
            if (!insertedViaEditor) {
                if (yamlEndLine !== -1) {
                    const lines = currentContent.split('\n');
                    const insertLine = yamlEndLine + 1;
                    lines.splice(insertLine, 0, cleanTitle);
                    const newContent = lines.join('\n');
                    verboseLog(this.plugin, `[TITLE-INSERT] Inserting title after frontmatter at line ${insertLine} via vault`);
                    await this.app.vault.modify(file, newContent);
                } else {
                    verboseLog(this.plugin, `[TITLE-INSERT] Inserting title at beginning via vault`);
                    await this.app.vault.modify(file, cleanTitle + "\n");
                }
            }

            verboseLog(this.plugin, `Successfully inserted title in ${file.path}`);
            return true;

        } catch (error) {
            console.error(`Error inserting title on creation for ${file.path}:`, error);
            return false;
        }
    }

    /**
     * Wait for YAML to appear or timeout
     * Public method for use by workspace-integration
     */
    async waitForYamlOrTimeout(file: TFile, timeoutMs: number): Promise<void> {
        return new Promise((resolve) => {
            const startTime = Date.now();

            // Timeout fallback
            const timeoutTimer = setTimeout(() => {
                const waiter = this.yamlWaiters.get(file.path);
                if (waiter) {
                    this.yamlWaiters.delete(file.path);
                    verboseLog(this.plugin, `Template wait timeout (${timeoutMs}ms) reached for ${file.path}`);
                    resolve();
                }
            }, timeoutMs);

            // Register this file as waiting for YAML
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

        // Check for YAML - must start at beginning of file (no whitespace allowed before)
        if (content.startsWith('---')) {
            const lines = content.split('\n');
            for (let i = 1; i < lines.length; i++) {
                if (lines[i] === '---') {
                    // YAML detected - clear timeout and resolve
                    const elapsed = Date.now() - waiter.startTime;
                    verboseLog(this.plugin, `YAML detected after ${elapsed}ms for ${file.path}`);
                    clearTimeout(waiter.timeoutTimer);
                    this.yamlWaiters.delete(file.path);
                    waiter.resolve();
                    return;
                }
            }
        }
    }

    /**
     * Handles cursor positioning after title insertion
     * @param file - The file to position cursor in
     * @param usePlaceCursorAtLineEndSetting - Whether to respect placeCursorAtLineEnd setting (true when title insertion is OFF)
     */
    async handleCursorPositioning(file: TFile, usePlaceCursorAtLineEndSetting: boolean = true): Promise<void> {
        try {
            verboseLog(this.plugin, `handleCursorPositioning called for ${file.path}, usePlaceCursorAtLineEndSetting: ${usePlaceCursorAtLineEndSetting}`);

            // Find the specific view for this file (not just active view)
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
                // Set to source mode
                await targetView.leaf.setViewState({
                    type: "markdown",
                    state: {
                        mode: "source",
                        source: false
                    }
                });

                // Focus the editor
                await targetView.editor?.focus();

                // Position cursor - find actual title line by parsing content
                let titleLineNumber = 0;
                let titleLineLength = 0;

                // Parse content directly to detect frontmatter
                const content = targetView.editor?.getValue() || '';
                const lines = content.split('\n');

                // Detect YAML frontmatter
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
                    // Title is on the line after frontmatter
                    titleLineNumber = yamlEndLine + 1;
                    verboseLog(this.plugin, `Found frontmatter ending at line ${yamlEndLine}, title on line ${titleLineNumber}`);
                } else {
                    // No frontmatter, title is on first line
                    titleLineNumber = 0;
                    verboseLog(this.plugin, `No frontmatter found, title on line ${titleLineNumber}`);
                }

                titleLineLength = targetView.editor?.getLine(titleLineNumber)?.length || 0;

                // Determine cursor position based on settings
                const shouldPlaceAtEnd = usePlaceCursorAtLineEndSetting && this.settings.moveCursorToFirstLine && this.settings.placeCursorAtLineEnd;

                if (shouldPlaceAtEnd) {
                    // Move to end of title line
                    targetView.editor?.setCursor({ line: titleLineNumber, ch: titleLineLength });
                    verboseLog(this.plugin, `Moved cursor to end of title line ${titleLineNumber} (${titleLineLength} chars) via handleCursorPositioning for ${file.path}`);
                } else {
                    // Move to start of title line
                    targetView.editor?.setCursor({ line: titleLineNumber, ch: 0 });
                    verboseLog(this.plugin, `Moved cursor to start of title line ${titleLineNumber} via handleCursorPositioning for ${file.path}`);
                }
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
     */
    async isFileExcludedForCursorPositioning(file: TFile, content?: string): Promise<boolean> {
        // Check folder/tag/property exclusions
        if (!shouldProcessFile(file, this.settings, this.app, content)) {
            return true;
        }

        // Check disable property by parsing content directly
        if (content) {
            const hasDisableProperty = this.checkDisablePropertyInContent(content);
            if (hasDisableProperty) {
                return true;
            }
        } else {
            // Fallback to cache-based check if no content provided
            if (await hasDisablePropertyInFile(file, this.app, this.settings.disableRenamingKey, this.settings.disableRenamingValue)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check for disable property and excluded properties by parsing YAML directly from content
     */
    private checkDisablePropertyInContent(content: string): boolean {
        const lines = content.split('\n');

        // Check for YAML frontmatter
        if (lines[0] !== '---') return false;

        let yamlEndLine = -1;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i] === '---') {
                yamlEndLine = i;
                break;
            }
        }

        if (yamlEndLine === -1) return false;

        // Parse YAML for both disable property and excluded properties
        const yamlLines = lines.slice(1, yamlEndLine);

        // Check disable property
        const disableKey = this.settings.disableRenamingKey;
        const disableValue = this.settings.disableRenamingValue.toLowerCase();

        // Check excluded properties from settings
        const nonEmptyExcludedProps = this.settings.excludedProperties.filter(
            prop => prop.key.trim() !== ""
        );

        // Simple YAML parser - handles key: value and key: [array, items]
        let currentKey = '';
        let inArray = false;

        for (const line of yamlLines) {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (trimmed === '' || trimmed.startsWith('#')) continue;

            // Check if line starts array items (- item)
            if (trimmed.startsWith('- ')) {
                if (inArray && currentKey) {
                    let arrayValue = trimmed.substring(2).trim();

                    // Remove quotes if present
                    if ((arrayValue.startsWith('"') && arrayValue.endsWith('"')) ||
                        (arrayValue.startsWith("'") && arrayValue.endsWith("'"))) {
                        arrayValue = arrayValue.substring(1, arrayValue.length - 1);
                    }

                    // Normalize tag values - remove # prefix for comparison
                    const normalizedArrayValue = arrayValue.startsWith('#') ? arrayValue.substring(1) : arrayValue;

                    // Check against disable property
                    if (currentKey === disableKey && arrayValue.toLowerCase() === disableValue) {
                        verboseLog(this.plugin, `Found disable property in array: ${currentKey}: [${arrayValue}]`);
                        return true;
                    }

                    // Check against excluded properties
                    for (const excludedProp of nonEmptyExcludedProps) {
                        const propKey = excludedProp.key.trim();
                        const propValue = excludedProp.value.trim();

                        if (currentKey === propKey) {
                            // For tags property, normalize both sides (remove #)
                            if (propKey === 'tags') {
                                const normalizedPropValue = propValue.startsWith('#') ? propValue.substring(1) : propValue;
                                if (propValue === '' || normalizedArrayValue === normalizedPropValue) {
                                    verboseLog(this.plugin, `Found excluded tag in array: ${propKey}: [${arrayValue}]`);
                                    return true;
                                }
                            } else {
                                // For other properties, exact match
                                if (propValue === '' || arrayValue === propValue) {
                                    verboseLog(this.plugin, `Found excluded property in array: ${propKey}: [${arrayValue}]`);
                                    return true;
                                }
                            }
                        }
                    }
                }
                continue;
            }

            // Check for key: value pattern
            if (trimmed.includes(':')) {
                const colonIndex = trimmed.indexOf(':');
                const key = trimmed.substring(0, colonIndex).trim();
                const value = trimmed.substring(colonIndex + 1).trim();

                currentKey = key;

                // Check if value is empty (array follows)
                if (value === '' || value === '[') {
                    inArray = true;
                    continue;
                } else {
                    inArray = false;
                }

                // Check against disable property
                if (key === disableKey && value.toLowerCase() === disableValue) {
                    verboseLog(this.plugin, `Found disable property: ${key}: ${value}`);
                    return true;
                }

                // Check against excluded properties
                for (const excludedProp of nonEmptyExcludedProps) {
                    const propKey = excludedProp.key.trim();
                    const propValue = excludedProp.value.trim();

                    if (key === propKey) {
                        // Match if value is empty (any value) or exact match
                        if (propValue === '' || value === propValue) {
                            verboseLog(this.plugin, `Found excluded property: ${propKey}: ${value}`);
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }
}