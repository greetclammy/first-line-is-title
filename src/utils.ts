import { TFile, App } from "obsidian";
import { PluginSettings, OSPreset } from './types';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from './constants';

export function verboseLog(plugin: { settings: PluginSettings }, message: string, data?: any) {
    if (plugin.settings.verboseLogging) {
        if (data) {
            console.debug(message, data);
        } else {
            console.debug(message);
        }
    }
}

/**
 * Validates if a line is a proper Markdown heading
 * Valid headings: start with 1-6 consecutive #, followed by whitespace, then any text
 * No preceding characters (including whitespace) allowed before #
 */
export function isValidHeading(line: string): boolean {
    // Regex: ^ = start of line, #{1,6} = 1-6 consecutive #, \s+ = one or more whitespace, .* = any text after
    return /^#{1,6}\s+.*/.test(line);
}

/**
 * Normalize property value for frontmatter insertion
 * Converts string values to appropriate types to avoid quotes in YAML
 * - "true"/"false" → boolean
 * - Numeric strings → number
 * - "null" → null
 * - Other strings → keep as string (YAML writes unquoted when possible)
 */
export function normalizePropertyValue(value: any): any {
    // Already not a string, return as-is
    if (typeof value !== 'string') return value;

    // Convert boolean strings
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Convert null string
    if (value === 'null') return null;

    // Convert numeric strings
    if (value !== '' && !isNaN(Number(value))) {
        return Number(value);
    }

    // Return string as-is (YAML will write unquoted for simple strings)
    return value;
}

// OS detection function
export function detectOS(): OSPreset {
    // Check if we're on mobile (Android/iOS)
    if (typeof process === 'undefined' || !process.platform) {
        // On mobile, use user agent detection
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('android')) {
            return 'Windows'; // Android has same file restrictions as Windows
        } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
            return 'macOS'; // iOS uses macOS-like paths
        }
        // Default for unknown mobile
        return 'Linux';
    }

    // Desktop detection using process.platform
    switch (process.platform) {
        case 'darwin': return 'macOS';
        case 'win32': return 'Windows';
        default: return 'Linux';
    }
}

export function inExcludedFolder(file: TFile, settings: PluginSettings): boolean {
    // Filter out empty strings
    const nonEmptyFolders = settings.excludedFolders.filter(folder => folder.trim() !== "");
    if (nonEmptyFolders.length === 0) return false;

    const filePath = file.parent?.path as string;
    if (nonEmptyFolders.includes(filePath)) {
        return true;
    }

    // Check subfolders if enabled
    if (settings.excludeSubfolders) {
        for (const excludedFolder of nonEmptyFolders) {
            if (filePath && filePath.startsWith(excludedFolder + "/")) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Strategy-aware function to check if a file is in the target folder list
 * @param file The file to check
 * @param settings Plugin settings containing folder list and strategy
 * @returns true if file is in the target folder list
 */
export function isFileInTargetFolders(file: TFile, settings: PluginSettings): boolean {
    // Filter out empty strings
    const nonEmptyFolders = settings.excludedFolders.filter(folder => folder.trim() !== "");
    if (nonEmptyFolders.length === 0) return false;

    const filePath = file.parent?.path as string;
    if (nonEmptyFolders.includes(filePath)) {
        return true;
    }

    // Check subfolders if enabled
    if (settings.excludeSubfolders) {
        for (const targetFolder of nonEmptyFolders) {
            if (filePath && filePath.startsWith(targetFolder + "/")) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check if a file has any of the excluded properties
 * @param file The file to check
 * @param settings Plugin settings containing excluded properties list
 * @param app The Obsidian app instance
 * @returns true if file has any excluded property
 */
export function fileHasExcludedProperties(file: TFile, settings: PluginSettings, app: App): boolean {
    const nonEmptyProperties = settings.excludedProperties.filter(
        prop => prop.key.trim() !== ""
    );
    if (nonEmptyProperties.length === 0) return false;

    const fileCache = app.metadataCache.getFileCache(file);
    if (!fileCache || !fileCache.frontmatter) return false;

    const frontmatter = fileCache.frontmatter;

    for (const excludedProp of nonEmptyProperties) {
        const propKey = excludedProp.key.trim();
        const propValue = excludedProp.value.trim();

        // Check if property key exists in frontmatter
        if (propKey in frontmatter) {
            // If value is empty, match any value for this key
            if (propValue === "") {
                return true;
            }

            // If value is specified, check for exact match
            const frontmatterValue = frontmatter[propKey];

            // Handle different value types
            if (typeof frontmatterValue === 'string') {
                if (frontmatterValue === propValue) {
                    return true;
                }
            } else if (Array.isArray(frontmatterValue)) {
                // Check if any array element matches
                if (frontmatterValue.some(val => String(val) === propValue)) {
                    return true;
                }
            } else if (frontmatterValue != null) {
                // Handle numbers, booleans, etc.
                if (String(frontmatterValue) === propValue) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Strategy-aware function to check if a file has any of the target tags
 * @param file The file to check
 * @param settings Plugin settings containing tag list and strategy
 * @param app The Obsidian app instance
 * @param content Optional file content for real-time checking
 * @returns true if file has any of the target tags
 */
export function fileHasTargetTags(file: TFile, settings: PluginSettings, app: App, content?: string): boolean {
    const nonEmptyTags = settings.excludedTags.filter(tag => tag.trim() !== "");
    if (nonEmptyTags.length === 0) return false;

    const fileCache = app.metadataCache.getFileCache(file);

    // Check YAML frontmatter tags (unless mode is 'In note body only')
    if (settings.tagMatchingMode !== 'In note body only') {
        let fileTags: string[] = [];

        // Parse tags from content if provided, otherwise use cache
        if (content) {
            fileTags = parseTagsFromYAML(content);
        } else if (fileCache && fileCache.frontmatter && fileCache.frontmatter.tags) {
            const frontmatterTags = fileCache.frontmatter.tags;
            fileTags = Array.isArray(frontmatterTags) ? frontmatterTags.map(String) : [String(frontmatterTags)];
        }

        for (const targetTag of nonEmptyTags) {
            // Normalize both sides: remove # prefix for comparison
            const normalizedTargetTag = targetTag.startsWith('#') ? targetTag.slice(1) : targetTag;

            for (const fileTag of fileTags) {
                const normalizedFileTag = fileTag.toString();

                // Exact match
                if (normalizedFileTag === normalizedTargetTag) {
                    return true;
                }

                // Check child tags if enabled (default true)
                if (settings.excludeChildTags) {
                    // If file has child tag and target tag is parent
                    if (normalizedFileTag.startsWith(normalizedTargetTag + '/')) {
                        return true;
                    }
                }
            }
        }
    }

    // Check tags based on matching mode
    if (settings.tagMatchingMode !== 'In Properties only') {
        let inlineTagsInContent: string[] = [];

        if (content && settings.tagMatchingMode === 'In Properties and note body') {
            // Use provided content (real-time) - check both frontmatter and body
            inlineTagsInContent = parseInlineTagsFromText(content);
        } else if (content && settings.tagMatchingMode === 'In note body only') {
            // Only check content after frontmatter
            const bodyContent = stripFrontmatter(content);
            inlineTagsInContent = parseInlineTagsFromText(bodyContent);
        } else if (!content) {
            // Fall back to cached metadata if no content provided
            if (fileCache && fileCache.tags) {
                inlineTagsInContent = fileCache.tags.map(tag =>
                    tag.tag.startsWith('#') ? tag.tag.slice(1) : tag.tag
                );
            }
        }

        for (const targetTag of nonEmptyTags) {
            // Normalize target tag: remove # prefix for comparison
            const normalizedTargetTag = targetTag.startsWith('#') ? targetTag.slice(1) : targetTag;

            for (const inlineTag of inlineTagsInContent) {
                // Exact match
                if (inlineTag === normalizedTargetTag) {
                    return true;
                }

                // Check child tags if enabled (default true)
                if (settings.excludeChildTags) {
                    // If file has child tag and target tag is parent
                    if (inlineTag.startsWith(normalizedTargetTag + '/')) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

/**
 * Determines whether a file should be processed based on the include/exclude strategy
 *
 * Logic summary:
 * - "Only exclude...": Process all files EXCEPT those in target folders/tags/properties
 *   - If no targets specified: Process ALL files (default enabled)
 *   - If targets specified: Process files NOT in targets (traditional exclude)
 *
 * - "Exclude all except...": Process ONLY files in target folders/tags/properties
 *   - If no targets specified: Process NO files (default disabled)
 *   - If targets specified: Process ONLY files in targets (include-only mode)
 *
 * @param file The file to check
 * @param settings Plugin settings containing strategy, folders, tags, and properties
 * @param app The Obsidian app instance
 * @param content Optional file content for real-time checking
 * @returns true if the file should be processed, false otherwise
 */
export function shouldProcessFile(file: TFile, settings: PluginSettings, app: App, content?: string): boolean {
    const isInTargetFolders = isFileInTargetFolders(file, settings);
    const hasTargetTags = fileHasTargetTags(file, settings, app, content);
    const hasTargetProperties = fileHasExcludedProperties(file, settings, app);

    // Helper function to apply strategy logic for a single exclusion type
    // Returns TRUE if file should be EXCLUDED (don't process)
    const applyStrategy = (
        isTargeted: boolean,
        hasTargets: boolean,
        strategy: string
    ): boolean => {
        if (strategy === 'Only exclude...') {
            // Only exclude: exclude files matching the targets
            // If no targets specified, don't exclude anything (process all)
            return hasTargets ? isTargeted : false;
        } else {
            // 'Exclude all except...'
            // Exclude all except: exclude files NOT matching the targets
            // If no targets specified, exclude everything (process none)
            return hasTargets ? !isTargeted : true;
        }
    };

    // Apply strategy for each exclusion type independently
    const shouldExcludeFromFolders = applyStrategy(
        isInTargetFolders,
        settings.excludedFolders.some(folder => folder.trim() !== ""),
        settings.folderScopeStrategy
    );

    const shouldExcludeFromTags = applyStrategy(
        hasTargetTags,
        settings.excludedTags.some(tag => tag.trim() !== ""),
        settings.tagScopeStrategy
    );

    const shouldExcludeFromProperties = applyStrategy(
        hasTargetProperties,
        settings.excludedProperties.some(prop => prop.key.trim() !== ""),
        settings.propertyScopeStrategy
    );

    // A file should be processed if it doesn't meet the exclusion criteria for ANY exclusion type
    // OR logic: if ANY exclusion type says "exclude" (returns true), then we exclude
    return !(shouldExcludeFromFolders || shouldExcludeFromTags || shouldExcludeFromProperties);
}

export function isFileExcluded(file: TFile, settings: PluginSettings, app: App, content?: string): boolean {
    // Check property exclusions
    if (fileHasExcludedProperties(file, settings, app)) {
        return true;
    }

    // Check folder exclusions
    if (inExcludedFolder(file, settings)) {
        return true;
    }

    // Check tag exclusions
    const nonEmptyTags = settings.excludedTags.filter(tag => tag.trim() !== "");
    if (nonEmptyTags.length > 0) {
        const fileCache = app.metadataCache.getFileCache(file);

        // Check YAML frontmatter tags (unless mode is 'In note body only')
        if (settings.tagMatchingMode !== 'In note body only' &&
            fileCache && fileCache.frontmatter && fileCache.frontmatter.tags) {
            const frontmatterTags = fileCache.frontmatter.tags;
            // Handle both string arrays and single strings
            const fileTags = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
            for (const excludedTag of nonEmptyTags) {
                // Normalize both sides: remove # prefix for comparison
                const normalizedExcludedTag = excludedTag.startsWith('#') ? excludedTag.slice(1) : excludedTag;

                for (const fileTag of fileTags) {
                    const normalizedFileTag = fileTag.toString();

                    // Exact match
                    if (normalizedFileTag === normalizedExcludedTag) {
                        return true;
                    }

                    // Check child tags if enabled (default true)
                    if (settings.excludeChildTags) {
                        // If file has child tag and excluded tag is parent
                        if (normalizedFileTag.startsWith(normalizedExcludedTag + '/')) {
                            return true;
                        }
                    }
                }
            }
        }

        // Check tags based on matching mode
        if (settings.tagMatchingMode !== 'In Properties only') {
            let inlineTagsInContent: string[] = [];

            if (content && settings.tagMatchingMode === 'In Properties and note body') {
                // Use provided content (real-time) - check both frontmatter and body
                inlineTagsInContent = parseInlineTagsFromText(content);
            } else if (content && settings.tagMatchingMode === 'In note body only') {
                // Only check content after frontmatter
                const bodyContent = stripFrontmatter(content);
                inlineTagsInContent = parseInlineTagsFromText(bodyContent);
            } else if (!content) {
                // Fall back to cached metadata if no content provided
                if (fileCache && fileCache.tags) {
                    inlineTagsInContent = fileCache.tags.map(tag =>
                        tag.tag.startsWith('#') ? tag.tag.slice(1) : tag.tag
                    );
                }
            }

            for (const excludedTag of nonEmptyTags) {
                // Normalize excluded tag: remove # prefix for comparison
                const normalizedExcludedTag = excludedTag.startsWith('#') ? excludedTag.slice(1) : excludedTag;

                for (const inlineTag of inlineTagsInContent) {
                    // Exact match
                    if (inlineTag === normalizedExcludedTag) {
                        return true;
                    }

                    // Check child tags if enabled (default true)
                    if (settings.excludeChildTags) {
                        // If file has child tag and excluded tag is parent
                        if (inlineTag.startsWith(normalizedExcludedTag + '/')) {
                            return true;
                        }
                    }
                }
            }
        }
    }

    return false;
}

function parseInlineTagsFromText(content: string): string[] {
    // Extract inline tags using regex
    // This regex matches tags in the format #tag or #tag/subtag
    const tagRegex = /#([a-zA-Z][\w\-_/]*)/g;
    const tags: string[] = [];
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
        const tag = match[1]; // Extract the tag without the # prefix
        if (!tags.includes(tag)) {
            tags.push(tag);
        }
    }

    return tags;
}

function stripFrontmatter(content: string): string {
    // Remove YAML frontmatter from content
    if (!content.startsWith('---')) {
        return content;
    }

    const lines = content.split('\n');
    let endIndex = -1;

    // Find the closing ---
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            endIndex = i;
            break;
        }
    }

    if (endIndex === -1) {
        return content; // No closing ---, return original
    }

    // Return content after frontmatter
    return lines.slice(endIndex + 1).join('\n');
}

function parseTagsFromYAML(content: string): string[] {
    const tags: string[] = [];

    if (!content.startsWith('---')) {
        return tags;
    }

    const lines = content.split('\n');
    let yamlEndLine = -1;

    // Find closing ---
    for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') {
            yamlEndLine = i;
            break;
        }
    }

    if (yamlEndLine === -1) return tags;

    const yamlLines = lines.slice(1, yamlEndLine);
    let currentKey = '';
    let inArray = false;

    for (const line of yamlLines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (trimmed === '' || trimmed.startsWith('#')) continue;

        // Check if line starts array items (- item)
        if (trimmed.startsWith('- ')) {
            if (inArray && currentKey === 'tags') {
                let tagValue = trimmed.substring(2).trim();

                // Remove quotes if present
                if ((tagValue.startsWith('"') && tagValue.endsWith('"')) ||
                    (tagValue.startsWith("'") && tagValue.endsWith("'"))) {
                    tagValue = tagValue.substring(1, tagValue.length - 1);
                }

                // Remove # prefix if present
                if (tagValue.startsWith('#')) {
                    tagValue = tagValue.substring(1);
                }

                tags.push(tagValue);
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

            // Handle single tag value
            if (key === 'tags' && value) {
                let tagValue = value;

                // Remove quotes if present
                if ((tagValue.startsWith('"') && tagValue.endsWith('"')) ||
                    (tagValue.startsWith("'") && tagValue.endsWith("'"))) {
                    tagValue = tagValue.substring(1, tagValue.length - 1);
                }

                // Remove # prefix if present
                if (tagValue.startsWith('#')) {
                    tagValue = tagValue.substring(1);
                }

                tags.push(tagValue);
            }
        }
    }

    return tags;
}

export async function hasDisablePropertyInFile(file: TFile, app: App, disableKey: string, disableValue: string): Promise<boolean> {
    try {
        // Use Obsidian's metadata cache to read frontmatter (already parsed YAML)
        const metadata = app.metadataCache.getFileCache(file);
        const frontmatter = metadata?.frontmatter;

        if (!frontmatter) return false;

        // Get the property value
        const propertyValue = frontmatter[disableKey];

        if (propertyValue === undefined || propertyValue === null) return false;

        // Normalize disableValue for comparison
        const normalizedDisableValue = normalizePropertyValue(disableValue);

        // Handle array/list values
        if (Array.isArray(propertyValue)) {
            // Check if any item in the array matches (case-insensitive for strings)
            return propertyValue.some(item => {
                if (typeof item === 'string' && typeof normalizedDisableValue === 'string') {
                    return item.toLowerCase() === normalizedDisableValue.toLowerCase();
                }
                return item === normalizedDisableValue;
            });
        }

        // Handle single values (case-insensitive comparison for strings)
        if (typeof propertyValue === 'string' && typeof normalizedDisableValue === 'string') {
            return propertyValue.toLowerCase() === normalizedDisableValue.toLowerCase();
        }

        // Direct comparison for non-string types
        return propertyValue === normalizedDisableValue;
    } catch (error) {
        return false;
    }
}

export function containsSafeword(filename: string, settings: PluginSettings): boolean {
    if (!settings.enableSafewords) return false;

    // Get filename without extension for comparison
    const filenameWithoutExt = filename.replace(/\.md$/, '');

    for (const safeword of settings.safewords) {
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
    line = line.trim();

    // Remove template placeholder if enabled
    if (settings.stripTemplaterSyntax) {
        line = line.replace(/<%\s*tp\.file\.cursor\(\)\s*%>/, '').trim();
        if (line === "<%*") {
            return "Untitled";
        }
    }

    // Check if original line (before trim) starts with valid heading - before any processing
    const isHeading = isValidHeading(originalLine);

    // Check for empty heading (only hash marks with optional spaces, nothing preceding)
    // Empty heading must: start at line beginning (no preceding chars), have 1-6 hashes, end with optional spaces
    const isEmptyHeading = /^#{1,6}\s*$/.test(originalLine);
    if (isEmptyHeading) {
        return "Untitled";
    }

    // Handle escaped characters based on backslash replacement setting
    const escapeMap = new Map<string, string>();
    let escapeCounter = 0;

    const backslashReplacementEnabled = settings.enableForbiddenCharReplacements && settings.charReplacementEnabled.backslash;

    if (!backslashReplacementEnabled) {
        // Backslash disabled: use as escape character, omit from output
        line = line.replace(/\\(.)/g, (match, char) => {
            const placeholder = `__ESCAPED_${escapeCounter++}__`;
            escapeMap.set(placeholder, char);
            return placeholder;
        });
    }
    // If backslash replacement enabled: treat \ as regular character, no escaping

    // Strip markup based on settings (legacy fallback + new granular controls)
    if (settings.enableStripMarkup || settings.omitComments || settings.omitHtmlTags) {

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

        // Strip comments (legacy settings + new granular control)
        if ((settings.enableStripMarkup && settings.stripMarkupSettings.comments) || settings.omitComments) {
            // Remove markdown comments %% %% (only matching pairs)
            line = line.replace(/%%.*?%%/g, '');
            // Remove HTML comments <!-- --> (only matching pairs)
            line = line.replace(/<!--.*?-->/g, '');
        }

        // Strip bold markup
        if (settings.enableStripMarkup && settings.stripMarkupSettings.bold) {
            line = line.replace(/\*\*(.+?)\*\*/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
            line = line.replace(/__(.+?)__/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip italic markup
        if (settings.enableStripMarkup && settings.stripMarkupSettings.italic) {
            line = line.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
            line = line.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip strikethrough markup
        if (settings.enableStripMarkup && settings.stripMarkupSettings.strikethrough) {
            line = line.replace(/~~(.+?)~~/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip highlight markup
        if (settings.enableStripMarkup && settings.stripMarkupSettings.highlight) {
            line = line.replace(/==(.+?)==/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip code markup
        if (settings.enableStripMarkup && settings.stripMarkupSettings.code) {
            line = line.replace(/`(.+?)`/g, (match, content, offset) => {
                return checkEscaped(match, offset) ? match : content;
            });
        }

        // Strip callout markup (check before blockquote to avoid conflicts)
        if (settings.enableStripMarkup && settings.stripMarkupSettings.callouts) {
            line = line.replace(/^>\s*\[![^\]]+\]\s*(.*)$/gm, '$1');
        }

        // Strip blockquote markup
        if (settings.enableStripMarkup && settings.stripMarkupSettings.blockquote) {
            line = line.replace(/^>\s*(.*)$/gm, '$1');
        }

        // Strip HTML tags (legacy settings + new granular control)
        if ((settings.enableStripMarkup && settings.stripMarkupSettings.htmlTags) || settings.omitHtmlTags) {
            let previousLine = '';
            while (line !== previousLine) {
                previousLine = line;
                line = line.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>(.*?)<\/\1>/g, '$2');
            }
        }

        // Strip task markup
        if (settings.enableStripMarkup && settings.stripMarkupSettings.tasks) {
            line = line.replace(/^-\s*\[.\]\s*/gm, '');
        }

        // Strip footnote markup
        if (settings.enableStripMarkup && settings.stripMarkupSettings.footnotes) {
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
    if (isHeading && (!settings.enableStripMarkup || settings.stripMarkupSettings.headings)) {
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

    // Note: Custom replacements are now handled in main.ts before calling extractTitle
    // This avoids duplicate processing and ensures proper ordering with self-reference checks

    // Handle wikilinks (only if strip wikilink markup is enabled)
    if (!settings.enableStripMarkup || settings.stripMarkupSettings.wikilinks) {
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
        return "Untitled";
    }

    // Handle regular Markdown links (only if strip markdown link markup is enabled)
    if (!settings.enableStripMarkup || settings.stripMarkupSettings.markdownLinks) {
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

    return line;
}

/**
 * Generates a safe internal link target by applying the plugin's character replacement rules
 * This function mimics the logic from main.ts for processing forbidden characters
 */
export function generateSafeLinkTarget(text: string, settings: PluginSettings): string {
    function detectOS(): OSPreset {
        const platform = window.navigator.platform.toLowerCase();
        if (platform.indexOf('win') !== -1) return 'Windows';
        if (platform.indexOf('mac') !== -1) return 'macOS';
        return 'Linux';
    }

    const charMap: { [key: string]: string } = {
        '/': settings.charReplacements.slash,
        ':': settings.charReplacements.colon,
        '|': settings.charReplacements.pipe,
        '#': settings.charReplacements.hash,
        '[': settings.charReplacements.leftBracket,
        ']': settings.charReplacements.rightBracket,
        '^': settings.charReplacements.caret,
        '*': settings.charReplacements.asterisk,
        '?': settings.charReplacements.question,
        '<': settings.charReplacements.lessThan,
        '>': settings.charReplacements.greaterThan,
        '"': settings.charReplacements.quote,
        [String.fromCharCode(92)]: settings.charReplacements.backslash,
        '.': settings.charReplacements.dot
    };

    // Get forbidden chars - universal chars are always forbidden
    const universalForbiddenChars = UNIVERSAL_FORBIDDEN_CHARS;
    const windowsAndroidChars = WINDOWS_ANDROID_CHARS;
    const allForbiddenChars = [...universalForbiddenChars];

    // Add Windows/Android chars if current OS requires them OR user has enabled compatibility
    const currentOS = detectOS();
    if (currentOS === 'Windows' || settings.windowsAndroidEnabled) {
        allForbiddenChars.push(...windowsAndroidChars);
    }
    const forbiddenChars = [...new Set(allForbiddenChars)].join('');

    let result = "";

    for (let i = 0; i < text.length; i++) {
        let char = text[i];

        if (char === '.') {
            // Special handling for dots - only forbidden at filename start
            if (result === '') {
                // Dot at start of filename
                if (settings.enableForbiddenCharReplacements && settings.charReplacementEnabled.dot) {
                    const replacement = charMap['.'] || '';
                    if (replacement !== '') {
                        // Check for whitespace trimming
                        if (settings.charReplacementTrimRight.dot) {
                            // Skip upcoming whitespace characters
                            while (i + 1 < text.length && /\s/.test(text[i + 1])) {
                                i++;
                            }
                        }
                        result += replacement;
                    }
                    // If replacement is empty, omit the dot (don't add anything)
                }
                // If dot replacement is disabled, omit the dot (don't add anything)
            } else {
                // Dot not at start - always keep it
                result += '.';
            }
        } else if (forbiddenChars.includes(char)) {
            let shouldReplace = false;
            let replacement = '';

            // Check if master toggle is on AND individual toggle is on
            if (settings.enableForbiddenCharReplacements) {
                // Map character to setting key
                let settingKey: keyof typeof settings.charReplacementEnabled | null = null;
                switch (char) {
                    case '/': settingKey = 'slash'; break;
                    case String.fromCharCode(92): settingKey = 'backslash'; break;
                    case ':': settingKey = 'colon'; break;
                    case '|': settingKey = 'pipe'; break;
                    case '#': settingKey = 'hash'; break;
                    case '[': settingKey = 'leftBracket'; break;
                    case ']': settingKey = 'rightBracket'; break;
                    case '^': settingKey = 'caret'; break;
                    case '*': settingKey = 'asterisk'; break;
                    case '?': settingKey = 'question'; break;
                    case '<': settingKey = 'lessThan'; break;
                    case '>': settingKey = 'greaterThan'; break;
                    case '"': settingKey = 'quote'; break;
                }

                // For Windows/Android chars, also check if that toggle is enabled
                const isWindowsAndroidChar = WINDOWS_ANDROID_CHARS.includes(char);
                const canReplace = isWindowsAndroidChar ?
                    (settings.windowsAndroidEnabled && settingKey && settings.charReplacementEnabled[settingKey]) :
                    (settingKey && settings.charReplacementEnabled[settingKey]);

                if (canReplace && settingKey) {
                    shouldReplace = true;
                    replacement = charMap[char] || '';

                    // Check for whitespace trimming
                    if (replacement !== '') {
                        // Trim whitespace to the left
                        if (settings.charReplacementTrimLeft[settingKey]) {
                            // Remove trailing whitespace from result
                            result = result.trimEnd();
                        }

                        // Check if we should trim whitespace to the right
                        if (settings.charReplacementTrimRight[settingKey]) {
                            // Skip upcoming whitespace characters
                            while (i + 1 < text.length && /\s/.test(text[i + 1])) {
                                i++;
                            }
                        }
                    }
                }
            }

            if (shouldReplace && replacement !== '') {
                result += replacement;
            }
            // If not replacing or replacement is empty, omit the character (don't add anything)
        } else {
            // Normal character - keep it
            result += char;
        }
    }

    return result.trim();
}
