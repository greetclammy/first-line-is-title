import { TFile, App, Platform, normalizePath } from "obsidian";
import { PluginSettings, OSPreset } from './types';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from './constants';
import { t } from './i18n';
import { PropertyManager } from './core/property-manager';

// Re-export from modular utilities
export { filterNonEmpty, generateSafeLinkTarget, reverseSafeLinkTarget, processForbiddenChars } from './utils/string-processing';
export { normalizeTag, parseTagsFromYAML, stripFrontmatter, fileHasTargetTags } from './utils/tag-utils';
export { isFileInConfiguredFolders, fileHasExcludedProperties, shouldProcessFile, isFileExcluded } from './utils/file-exclusions';

// Re-export from PropertyManager
export const normalizePropertyValue = PropertyManager.normalizePropertyValue;

export function verboseLog(plugin: { settings: PluginSettings }, message: string, data?: any) {
    if (plugin.settings.core.verboseLogging) {
        if (data) {
            console.debug(message, data);
        } else {
            console.debug(message);
        }
    }
}

export function isValidHeading(line: string): boolean {
    return /^#{1,6}\s+.*/.test(line);
}

export function detectOS(): OSPreset {
    if (Platform.isMacOS || Platform.isIosApp) {
        return 'macOS';
    }
    if (Platform.isWin) {
        return 'Windows';
    }
    // Android and Linux both fall under Linux category
    return 'Linux';
}

/**
 * Check if file is currently open in any editor (main workspace or popover)
 * @param file - File to check
 * @param app - Obsidian App instance
 * @returns true if file is open in any editor
 */
function isFileOpenInAnyEditor(file: TFile, app: App): boolean {
    const leaves = app.workspace.getLeavesOfType("markdown");

    // Check main workspace leaves
    for (const leaf of leaves) {
        // Accessing non-public editor API - no official types available
        const view = leaf.view as any;
        if (view?.file?.path === file.path) {
            return true;
        }
    }

    // Check popovers
    for (const leaf of leaves) {
        // Accessing non-public editor API - no official types available
        const view = leaf.view as any;
        if (view?.hoverPopover?.targetEl) {
            const popoverEditor = view.hoverPopover.editor;
            if (popoverEditor && view.hoverPopover.file?.path === file.path) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Central gate for file modification eligibility.
 * Checks policy requirements and always-on safeguards.
 *
 * @param isManualCommand - true for manual commands, false for automatic operations
 * @returns {canModify: boolean, reason?: string}
 */
export async function canModifyFile(
    file: TFile,
    app: App,
    disableKey: string,
    disableValue: string,
    isManualCommand: boolean,
    hasActiveEditor?: boolean
): Promise<{ canModify: boolean; reason?: string }> {
    // Check 1: Disable property (ALWAYS-ON SAFEGUARD #4)
    // Fastest check, absolute blocker for all operations
    if (await hasDisablePropertyInFile(file, app, disableKey, disableValue)) {
        return { canModify: false, reason: 'disable property present' };
    }

    // Check 2: File open in editor (ALWAYS-ON SAFEGUARD #5 for automatic operations)
    // Prevents processing external/programmatic edits
    // Manual commands bypass this check
    if (!isManualCommand) {
        // If hasActiveEditor provided (from editor-change event), trust it
        // This includes both leaf editors and popover/hover editors
        if (hasActiveEditor !== undefined) {
            if (!hasActiveEditor) {
                return { canModify: false, reason: 'file not open in editor' };
            }
        } else {
            // Fallback: check for open editors using helper function
            if (!isFileOpenInAnyEditor(file, app)) {
                return { canModify: false, reason: 'file not open in editor' };
            }
        }
    }

    return { canModify: true };
}

// Functions moved to modular utils (re-exported above):
// - filterNonEmpty → utils/string-processing.ts
// - generateSafeLinkTarget → utils/string-processing.ts
// - normalizeTag → utils/tag-utils.ts
// - parseTagsFromYAML, stripFrontmatter → utils/tag-utils.ts
// - fileHasTargetTags → utils/tag-utils.ts
// - isFileInConfiguredFolders → utils/file-exclusions.ts
// - fileHasExcludedProperties → utils/file-exclusions.ts
// - shouldProcessFile → utils/file-exclusions.ts
// - isFileExcluded → utils/file-exclusions.ts

export async function hasDisablePropertyInFile(file: TFile, app: App, disableKey: string, disableValue: string): Promise<boolean> {
    try {
        // Use Obsidian's metadata cache to read frontmatter (already parsed YAML)
        const metadata = app.metadataCache.getFileCache(file);
        const frontmatter = metadata?.frontmatter;

        if (!frontmatter) return false;

        // Get the property value
        const propertyValue = frontmatter[disableKey];

        if (propertyValue === undefined || propertyValue === null) return false;

        // Normalize BOTH values for comparison
        const normalizedPropertyValue = normalizePropertyValue(propertyValue);
        const normalizedDisableValue = normalizePropertyValue(disableValue);

        // Handle array/list values
        if (Array.isArray(normalizedPropertyValue)) {
            // Check if any item in the array matches (case-insensitive for strings)
            return normalizedPropertyValue.some(item => {
                const normalizedItem = normalizePropertyValue(item);
                if (typeof normalizedItem === 'string' && typeof normalizedDisableValue === 'string') {
                    return normalizedItem.toLowerCase() === normalizedDisableValue.toLowerCase();
                }
                return normalizedItem === normalizedDisableValue;
            });
        }

        // Handle single values (case-insensitive comparison for strings)
        if (typeof normalizedPropertyValue === 'string' && typeof normalizedDisableValue === 'string') {
            return normalizedPropertyValue.toLowerCase() === normalizedDisableValue.toLowerCase();
        }

        // Direct comparison for non-string types
        return normalizedPropertyValue === normalizedDisableValue;
    } catch (error) {
        return false;
    }
}

export function containsSafeword(filename: string, settings: PluginSettings): boolean {
    if (!settings.safewords.enableSafewords) return false;

    // Get filename without extension for comparison
    const filenameWithoutExt = filename.replace(/\.md$/, '');

    for (const safeword of settings.safewords.safewords) {
        if (!safeword.enabled || !safeword.text) continue;

        // Check against both full filename and filename without extension
        const compareFullFilename = safeword.caseSensitive ? filename : filename.toLowerCase();
        const compareFilenameWithoutExt = safeword.caseSensitive ? filenameWithoutExt : filenameWithoutExt.toLowerCase();
        const compareText = safeword.caseSensitive ? safeword.text : safeword.text.toLowerCase();

        for (const compareFilename of [compareFullFilename, compareFilenameWithoutExt]) {
            if (safeword.onlyWholeLine) {
                // Only match if the entire filename matches
                if (compareFilename.trim() === compareText.trim()) {
                    return true;
                }
            } else if (safeword.onlyAtStart) {
                if (compareFilename.startsWith(compareText)) {
                    return true;
                }
            } else {
                if (compareFilename.includes(compareText)) {
                    return true;
                }
            }
        }
    }
    return false;
}

export function extractTitle(line: string, settings: PluginSettings): string {
    const originalLine = line;

    // Check if line is only a list marker (before trim removes trailing space)
    if (settings.markupStripping.enableStripMarkup) {
        if (settings.markupStripping.stripMarkupSettings.unorderedLists && /^[-+*] $/.test(line)) {
            return t('untitled');
        }
        if (settings.markupStripping.stripMarkupSettings.orderedLists && /^\d+\. $/.test(line)) {
            return t('untitled');
        }
    }

    line = line.trim();

    // Remove template placeholder if enabled
    if (settings.markupStripping.stripTemplaterSyntax) {
        line = line.replace(/<%\s*tp\.file\.cursor\(\)\s*%>/, '').trim();
        if (line === "<%*") {
            return t('untitled');
        }
    }

    // Check if original line (before trim) starts with valid heading - before any processing
    const isHeading = isValidHeading(originalLine);

    // Check for empty heading (only hash marks with optional spaces, nothing preceding)
    // Empty heading must: start at line beginning (no preceding chars), have 1-6 hashes, end with optional spaces
    const isEmptyHeading = /^#{1,6}\s*$/.test(originalLine);
    if (isEmptyHeading) {
        return t('untitled');
    }

    // Handle escaped characters based on backslash replacement setting
    const escapeMap = new Map<string, string>();
    let escapeCounter = 0;

    const backslashReplacementEnabled = settings.replaceCharacters.enableForbiddenCharReplacements && settings.replaceCharacters.charReplacements.backslash.enabled;

    if (!backslashReplacementEnabled) {
        // Backslash disabled: use as escape character, omit from output
        line = line.replace(/\\(.)/g, (match, char) => {
            const placeholder = `__ESCAPED_${escapeCounter++}__`;
            escapeMap.set(placeholder, char);
            return placeholder;
        });
    }

    if (settings.markupStripping.enableStripMarkup || settings.markupStripping.stripCommentsEntirely || settings.markupStripping.omitHtmlTags) {

        // Helper function to check if text is escaped
        const checkEscaped = (match: string, offset: number): boolean => {
            if (backslashReplacementEnabled) return false;
            // Check if any part of the match contains escape placeholders
            const matchEnd = offset + match.length;
            for (let i = offset; i < matchEnd; i++) {
                for (const placeholder of escapeMap.keys()) {
                    if (line.indexOf(placeholder) === i) return true;
                }
            }
            return false;
        };

        if (settings.markupStripping.stripCommentsEntirely) {
            // Strip comments entirely: remove everything
            line = line.replace(/%%.*?%%/g, '');
            line = line.replace(/<!--.*?-->/g, '');
        } else if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.comments) {
            // Strip markup but keep content: remove markers only
            line = line.replace(/%%(.+?)%%/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
            line = line.replace(/<!--(.+?)-->/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip bold markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.bold) {
            line = line.replace(/\*\*(.*?)\*\*/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
            line = line.replace(/__(.*?)__/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip italic markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.italic) {
            line = line.replace(/\*([^*]*?)\*/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
            line = line.replace(/_([^_]*?)_/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip strikethrough markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.strikethrough) {
            line = line.replace(/~~(.*?)~~/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip highlight markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.highlight) {
            line = line.replace(/==(.*?)==/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip code block markup (must run before code markup stripping)
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.codeBlocks) {
            // Check if only ``` (empty code block) - return Untitled
            // Don't use multiline flag - we want to match entire string, not just first line
            if (/^\s*```\s*$/.test(line)) {
                return t('untitled');
            }

            // Match lines with optional leading whitespace followed by ```
            // Capture everything after ``` opener line
            const codeBlockMatch = /^\s*```(?!`)[^\n]*\n([\s\S]+)/m.exec(line);
            if (codeBlockMatch) {
                const content = codeBlockMatch[1];
                // Extract first non-empty line from code block content
                const contentLines = content.split('\n');
                let foundLine = false;
                for (const contentLine of contentLines) {
                    const trimmed = contentLine.trim();
                    if (trimmed !== '' && !trimmed.startsWith('```')) {
                        line = contentLine;
                        foundLine = true;
                        break;
                    }
                }
                // If only found ``` inside (both first and second line are ```), return Untitled
                if (!foundLine) {
                    return t('untitled');
                }
            }
        }

        // Strip code markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.code) {
            line = line.replace(/`(.*?)`/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip inline math markup
        if (settings.markupStripping.stripInlineMathMarkup) {
            // Only match if no whitespace after opening $ and before closing $
            line = line.replace(/\$((?:\S(?:.*?\S)?)?)\$/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip callout markup (check before quote to avoid conflicts)
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.callouts) {
            line = line.replace(/^>\s*\[![^\]]+\]\s*(.*)$/gm, '$1');
        }

        // Strip quote markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.quote) {
            line = line.replace(/^>\s*(.*)$/gm, '$1');
        }

        // Strip task list markup BEFORE list markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.taskLists) {
            line = line.replace(/^(?:[-+*]|\d+\.) \[.\] /gm, '');
        }

        // Strip unordered list markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.unorderedLists) {
            line = line.replace(/^[-+*] /gm, '');
        }

        // Strip ordered list markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.orderedLists) {
            line = line.replace(/^\d+\. /gm, '');
        }

        if ((settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.htmlTags) || settings.markupStripping.omitHtmlTags) {
            let previousLine = '';
            while (line !== previousLine) {
                previousLine = line;
                line = line.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>(.*?)<\/\1>/g, '$2');
            }
        }

        // Strip footnote markup
        if (settings.markupStripping.enableStripMarkup && settings.markupStripping.stripMarkupSettings.footnotes) {
            // Strip [^1] style footnotes (but not if followed by colon)
            line = line.replace(/\[\^[^\]]+\](?!:)/g, '');
            // Strip ^[note] style footnotes (but not if followed by colon)
            line = line.replace(/\^\[[^\]]+\](?!:)/g, '');
        }
    }

    // Handle embedded image links (remove ! before [[]])
    const embedLinkRegex = /!\[\[(.*?)\]\]/g;
    line = line.replace(embedLinkRegex, '[[$1]]');

    // Handle regular embedded image links
    const regularEmbedRegex = /!\[(.*?)\]\((.*?)\)/g;
    line = line.replace(regularEmbedRegex, (match, caption) => caption);

    // Handle headers - only if the original line was a valid heading and strip heading markup is enabled
    if (isHeading && (!settings.markupStripping.enableStripMarkup || settings.markupStripping.stripMarkupSettings.headings)) {
        const headerArr: string[] = [
            "# ", "## ", "### ", "#### ", "##### ", "###### ",
        ];
        for (let i = 0; i < headerArr.length; i++) {
            if (line.startsWith(headerArr[i])) {
                line = line.slice(headerArr[i].length).trim();
                break;
            }
        }
    }

    // Handle wikilinks (only if strip wikilink markup is enabled)
    if (!settings.markupStripping.enableStripMarkup || settings.markupStripping.stripMarkupSettings.wikilinks) {
        while (line.includes("[[") && line.includes("]]")) {
            const openBracket = line.indexOf("[[");
            const closeBracket = line.indexOf("]]", openBracket);

            if (openBracket === -1 || closeBracket === -1) break;

            const linkText = line.slice(openBracket + 2, closeBracket);
            const beforeLink = line.slice(0, openBracket);
            const afterLink = line.slice(closeBracket + 2);

            // Handle aliased wikilinks
            const pipeIndex = linkText.indexOf("|");
            const resolvedText = pipeIndex !== -1 ? linkText.slice(pipeIndex + 1) : linkText;

            line = (beforeLink + resolvedText + afterLink).trim();
        }
    }

    // Check for empty links that should result in "Untitled"
    // If entire line is just empty links (regular or image), return "Untitled"
    const onlyEmptyLinksRegex = /^(\s*!?\[\]\([^)]*\)\s*)+$/;
    if (onlyEmptyLinksRegex.test(line)) {
        return t('untitled');
    }

    // Handle regular Markdown links (only if strip markdown link markup is enabled)
    if (!settings.markupStripping.enableStripMarkup || settings.markupStripping.stripMarkupSettings.markdownLinks) {
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        line = line.replace(markdownLinkRegex, (_, title) => title);

        // Remove empty links (but keep surrounding text)
        // This handles cases like "test [](smile.md)" -> "test"
        line = line.replace(/!?\[\]\([^)]*\)/g, '').trim();
    }

    // Restore escaped characters (remove escape, keep character) - only if escaping was used
    if (!backslashReplacementEnabled) {
        for (const [placeholder, char] of escapeMap) {
            line = line.replace(placeholder, char);
        }
    }

    // Final check: if line is empty or only whitespace after all processing
    if (line.trim() === '') {
        return t('untitled');
    }

    return line;
}

/**
 * Finds the title source line from the first non-empty line
 * Handles special cases like card links, code blocks, and markdown tables
 *
 * @param firstNonEmptyLine The first non-empty line (after frontmatter)
 * @param contentLines Array of content lines (without frontmatter)
 * @param settings Plugin settings
 * @param plugin Optional plugin instance for verbose logging
 * @returns The title source line to use for filename
 */
export function findTitleSourceLine(
    firstNonEmptyLine: string,
    contentLines: string[],
    settings: PluginSettings,
    plugin?: { settings: PluginSettings }
): string {
    let titleSourceLine = firstNonEmptyLine;

    // Check for markdown table rows - use "Table" as title if stripTableMarkup is enabled
    if (settings.markupStripping.stripTableMarkup) {
        // Valid markdown table requires:
        // Line 1: Contains | (header row)
        // Line 2: Separator row (-- | --, min 2 hyphens per column, no escapes)

        const hasFirstLinePipe = titleSourceLine.includes('|');

        if (hasFirstLinePipe) {
            // Find index of firstNonEmptyLine in contentLines
            let firstNonEmptyIndex = -1;
            for (let i = 0; i < contentLines.length; i++) {
                if (contentLines[i].trim() !== '') {
                    firstNonEmptyIndex = i;
                    break;
                }
            }

            // Check next line exists
            if (firstNonEmptyIndex >= 0 && firstNonEmptyIndex + 1 < contentLines.length) {
                const secondLine = contentLines[firstNonEmptyIndex + 1];

                // Reject if separator contains escaped pipes or hyphens (breaks table structure)
                if (secondLine.includes('\\|') || secondLine.includes('\\-')) {
                    // Not a valid table - escaped characters break separator row
                } else {
                    // Check if second line is valid separator
                    // Pattern: optional spaces + optional : + min 2 hyphens + optional : + optional spaces
                    const separatorPattern = /^\s*:?-{2,}:?\s*$/;

                    // Remove leading/trailing pipes, split by |
                    const trimmedSeparator = secondLine.trim().replace(/^\|/, '').replace(/\|$/, '');
                    const cells = trimmedSeparator.split('|');

                    // Each cell must match separator pattern
                    const isValidSeparator = cells.length >= 1 && cells.every(cell => separatorPattern.test(cell));

                    if (isValidSeparator) {
                        titleSourceLine = t('table');
                        if (plugin) {
                            verboseLog(plugin, `Table detected, using "${t('table')}" as title`);
                        }
                    }
                }
            }
        }
    }

    // Check for math block markup - use "Math block" as title if stripMathBlockMarkup is enabled
    if (settings.markupStripping.stripMathBlockMarkup) {
        // Math block starts with $$ (ignoring leading whitespace)
        if (titleSourceLine.trim().startsWith('$$')) {
            // Find index of firstNonEmptyLine in contentLines
            let firstNonEmptyIndex = -1;
            for (let i = 0; i < contentLines.length; i++) {
                if (contentLines[i].trim() !== '') {
                    firstNonEmptyIndex = i;
                    break;
                }
            }

            // Look for closing $$ in subsequent lines
            if (firstNonEmptyIndex >= 0) {
                for (let i = firstNonEmptyIndex + 1; i < contentLines.length; i++) {
                    if (contentLines[i].trim().startsWith('$$')) {
                        titleSourceLine = t('mathBlock');
                        if (plugin) {
                            verboseLog(plugin, `Math block detected, using "${t('mathBlock')}" as title`);
                        }
                        break;
                    }
                }
            }
        }
    }

    // Check for card links if enabled - extract title from card link
    if (settings.markupStripping.grabTitleFromCardLink) {
        const cardLinkMatch = titleSourceLine.trim().match(/^```(embed|cardlink)$/);
        if (cardLinkMatch) {
            // Found embed or cardlink, parse lines until we find title: or closing ```
            let foundTitle = false;
            const maxLinesToCheck = 20;
            let nonEmptyCount = 0;

            for (let i = 0; i < Math.min(contentLines.length, maxLinesToCheck); i++) {
                const line = contentLines[i].trim();
                if (line === '') continue;

                nonEmptyCount++;
                // Skip first non-empty line (the opening ```embed/```cardlink)
                if (nonEmptyCount === 1) continue;

                if (nonEmptyCount > 10) break;

                // Look for title: field
                if (line.toLowerCase().startsWith('title:')) {
                    let title = line.substring(line.indexOf(':') + 1).trim();
                    // Remove surrounding quotes if present
                    if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
                        title = title.substring(1, title.length - 1);
                    }
                    titleSourceLine = title;
                    foundTitle = true;
                    if (plugin) {
                        verboseLog(plugin, `Found ${cardLinkMatch[1]} card link`, { title: titleSourceLine });
                    }
                    break;
                }
                // Check for closing ``` before finding title
                if (line.startsWith('```')) {
                    titleSourceLine = t('untitled');
                    if (plugin) {
                        verboseLog(plugin, `Card link has no title, using ${t('untitled')}`);
                    }
                    break;
                }
            }
            if (!foundTitle && titleSourceLine !== t('untitled')) {
                // Reached limit without finding title or closing
                titleSourceLine = t('untitled');
            }
        }
    }

    // Check for Mermaid diagrams - use "Diagram" as title if detectDiagrams is enabled
    const trimmedTitleSourceLine = titleSourceLine.trim();
    if (settings.markupStripping.detectDiagrams && trimmedTitleSourceLine === '```mermaid') {
        titleSourceLine = t('diagram');
        if (plugin) {
            verboseLog(plugin, `Mermaid diagram detected, using "${t('diagram')}" as title`);
        }
        return titleSourceLine;
    }

    // Check for code blocks - use second line if first line is a code fence
    if (trimmedTitleSourceLine.startsWith('```') && !trimmedTitleSourceLine.match(/^```(embed|cardlink)$/)) {
        // First line is a code fence (not card link), extract second non-empty line
        let nonEmptyCount = 0;
        for (const line of contentLines) {
            if (line.trim() !== '') {
                nonEmptyCount++;
                // Skip first non-empty line (the code fence)
                if (nonEmptyCount === 2) {
                    titleSourceLine = line;
                    if (plugin) {
                        verboseLog(plugin, `Code block detected, using second line as title source: ${titleSourceLine}`);
                    }
                    break;
                }
            }
        }
    }

    return titleSourceLine;
}

/**
 * Deep merge two objects recursively
 * Arrays and primitives from source override defaults
 * Nested objects are merged recursively
 * @param defaults The default object (will not be mutated)
 * @param source The source object with overrides (will not be mutated)
 * @returns A new object with merged values
 */
export function deepMerge<T>(defaults: T, source: Partial<T>): T {
    // Handle null/undefined cases
    if (!defaults || typeof defaults !== 'object') return defaults;
    if (!source || typeof source !== 'object') return defaults;

    // Create a deep copy of defaults to avoid mutation
    const result = JSON.parse(JSON.stringify(defaults)) as T;
    // Use Record for dynamic key access to avoid 'as any'
    const resultRecord = result as Record<string, any>;
    const sourceRecord = source as Record<string, any>;

    // Merge properties from source
    for (const key in source) {
        if (!source.hasOwnProperty(key)) continue;

        const sourceValue = sourceRecord[key];
        const defaultValue = resultRecord[key];

        // If source value is null/undefined, skip it (keep default)
        if (sourceValue === null || sourceValue === undefined) continue;

        // If default value doesn't exist, use source value
        if (defaultValue === null || defaultValue === undefined) {
            resultRecord[key] = sourceValue;
            continue;
        }

        // Handle arrays: replace entirely (don't merge items)
        if (Array.isArray(sourceValue)) {
            resultRecord[key] = JSON.parse(JSON.stringify(sourceValue));
            continue;
        }

        // Handle objects: merge recursively
        if (typeof sourceValue === 'object' && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
            resultRecord[key] = deepMerge(defaultValue, sourceValue);
            continue;
        }

        // Handle primitives: override with source value
        resultRecord[key] = sourceValue;
    }

    return result;
}

/**
 * Reverse forbidden character replacements in a string
 * @param text - The text to process
 * @param settings - Plugin settings containing character replacement configuration
 * @param plugin - Optional plugin instance for verbose logging
 * @returns The text with replacements reversed to original characters
 */
export function reverseCharacterReplacements(text: string, settings: PluginSettings, plugin?: { settings: PluginSettings }): string {
    if (!settings.core.convertReplacementCharactersInTitle) {
        return text;
    }

    let result = text;

    // Character mapping
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

    // Find duplicate replacement strings (ambiguous - can't reverse)
    const replacementCounts = new Map<string, number>();
    const enabledReplacements: string[] = [];
    for (const settingKey of Object.values(charMap)) {
        const replacement = settings.replaceCharacters.charReplacements[settingKey as keyof typeof settings.replaceCharacters.charReplacements];
        if (replacement.enabled && replacement.replacement) {
            replacementCounts.set(replacement.replacement, (replacementCounts.get(replacement.replacement) || 0) + 1);
            enabledReplacements.push(`${settingKey}="${replacement.replacement}"`);
        }
    }

    if (plugin) {
        verboseLog(plugin, `[CHAR-REVERSAL] "${text}" with replacements: [${enabledReplacements.join(', ')}]`);
    }

    // Reverse each enabled replacement using actual user settings
    for (const [originalChar, settingKey] of Object.entries(charMap)) {
        const replacement = settings.replaceCharacters.charReplacements[settingKey as keyof typeof settings.replaceCharacters.charReplacements];
        if (replacement.enabled && replacement.replacement) {
            // Skip if this replacement string is used by multiple enabled characters (ambiguous)
            const count = replacementCounts.get(replacement.replacement) || 0;
            if (count > 1) {
                if (plugin) {
                    verboseLog(plugin, `[CHAR-REVERSAL] Skipping "${replacement.replacement}" → "${originalChar}" (duplicate, count=${count})`);
                }
                continue;
            }
            result = result.replaceAll(replacement.replacement, originalChar);
        }
    }

    if (plugin && result !== text) {
        verboseLog(plugin, `[CHAR-REVERSAL] Result: "${text}" → "${result}"`);
    }

    return result;
}

/**
 * Normalizes a folder path for duplicate comparison
 * - Trims whitespace
 * - Removes leading and trailing slashes
 * - Converts to lowercase for case-insensitive comparison
 */
function normalizeFolderPath(path: string): string {
    return path.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
}

/**
 * Cleans a folder path for storage (preserves case)
 * - Trims whitespace
 * - Removes leading and trailing slashes
 */
function cleanFolderPath(path: string): string {
    return path.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * Normalizes a tag for duplicate comparison
 * - Trims whitespace
 * - Converts to lowercase for case-insensitive comparison
 */
function normalizeTagName(tag: string): string {
    return tag.trim().toLowerCase();
}

/**
 * Cleans a tag for storage (preserves case)
 * - Trims whitespace
 */
function cleanTag(tag: string): string {
    return tag.trim();
}

/**
 * Normalizes a property key or value for duplicate comparison
 * - Trims whitespace
 * - Converts to lowercase for case-insensitive comparison
 */
function normalizePropertyText(text: string): string {
    return text.trim().toLowerCase();
}

/**
 * Cleans a property key or value for storage (preserves case)
 * - Trims whitespace
 */
function cleanPropertyText(text: string): string {
    return text.trim();
}

/**
 * Deduplicates exclusion arrays in plugin settings
 * Keeps the last occurrence of each duplicate (removes earlier ones)
 * Normalization rules:
 * - Folders: case-insensitive, leading/trailing slashes removed
 * - Tags: case-insensitive
 * - Properties: both key and value must match (case-insensitive)
 *
 * @param settings - Plugin settings object to deduplicate
 * @returns true if any duplicates were removed, false otherwise
 */
export function deduplicateExclusions(settings: PluginSettings): boolean {
    let hasChanges = false;

    // Deduplicate folders
    const originalFolderCount = settings.exclusions.excludedFolders.length;
    const folderMap = new Map<string, number>(); // normalized -> last index

    settings.exclusions.excludedFolders.forEach((folder, index) => {
        const normalized = normalizeFolderPath(folder);
        if (normalized !== '') {
            folderMap.set(normalized, index);
        }
    });

    const keepFolderIndices = new Set(folderMap.values());
    settings.exclusions.excludedFolders = settings.exclusions.excludedFolders.filter((_, index) => {
        const normalized = normalizeFolderPath(settings.exclusions.excludedFolders[index]);
        // Keep if normalized is empty OR it's the last occurrence
        return normalized === '' || keepFolderIndices.has(index);
    });

    if (settings.exclusions.excludedFolders.length !== originalFolderCount) {
        hasChanges = true;
    }

    // Clean folder paths (strip leading/trailing slashes, preserve case)
    settings.exclusions.excludedFolders = settings.exclusions.excludedFolders.map((folder) => {
        const cleaned = cleanFolderPath(folder);
        if (cleaned !== folder) {
            hasChanges = true;
        }
        return cleaned;
    });

    // Deduplicate tags
    const originalTagCount = settings.exclusions.excludedTags.length;
    const tagMap = new Map<string, number>(); // normalized -> last index

    settings.exclusions.excludedTags.forEach((tag, index) => {
        const normalized = normalizeTagName(tag);
        if (normalized !== '') {
            tagMap.set(normalized, index);
        }
    });

    const keepTagIndices = new Set(tagMap.values());
    settings.exclusions.excludedTags = settings.exclusions.excludedTags.filter((_, index) => {
        const normalized = normalizeTagName(settings.exclusions.excludedTags[index]);
        // Keep if normalized is empty OR it's the last occurrence
        return normalized === '' || keepTagIndices.has(index);
    });

    if (settings.exclusions.excludedTags.length !== originalTagCount) {
        hasChanges = true;
    }

    // Clean tags (trim whitespace, preserve case)
    settings.exclusions.excludedTags = settings.exclusions.excludedTags.map((tag) => {
        const cleaned = cleanTag(tag);
        if (cleaned !== tag) {
            hasChanges = true;
        }
        return cleaned;
    });

    // Deduplicate properties (both key AND value must match)
    const originalPropertyCount = settings.exclusions.excludedProperties.length;
    const propertyMap = new Map<string, number>(); // "key:value" -> last index

    settings.exclusions.excludedProperties.forEach((prop, index) => {
        const normalizedKey = normalizePropertyText(prop.key);
        const normalizedValue = normalizePropertyText(prop.value);
        if (normalizedKey !== '' || normalizedValue !== '') {
            const composite = `${normalizedKey}:${normalizedValue}`;
            propertyMap.set(composite, index);
        }
    });

    const keepPropertyIndices = new Set(propertyMap.values());
    settings.exclusions.excludedProperties = settings.exclusions.excludedProperties.filter((_, index) => {
        const prop = settings.exclusions.excludedProperties[index];
        const normalizedKey = normalizePropertyText(prop.key);
        const normalizedValue = normalizePropertyText(prop.value);
        // Keep if both are empty OR it's the last occurrence
        return (normalizedKey === '' && normalizedValue === '') || keepPropertyIndices.has(index);
    });

    if (settings.exclusions.excludedProperties.length !== originalPropertyCount) {
        hasChanges = true;
    }

    // Clean property keys and values (trim whitespace, preserve case)
    settings.exclusions.excludedProperties = settings.exclusions.excludedProperties.map((prop) => {
        const cleanedKey = cleanPropertyText(prop.key);
        const cleanedValue = cleanPropertyText(prop.value);
        if (cleanedKey !== prop.key || cleanedValue !== prop.value) {
            hasChanges = true;
        }
        return { key: cleanedKey, value: cleanedValue };
    });

    return hasChanges;
}
