import { TFile, App } from "obsidian";
import { PluginSettings, OSPreset } from './types';

export function verboseLog(plugin: { settings: PluginSettings }, message: string, data?: any) {
    if (plugin.settings.verboseLogging) {
        if (data) {
            console.log(message, data);
        } else {
            console.log(message);
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

// OS detection function
export function detectOS(): OSPreset {
    // Check if we're on mobile (Android/iOS)
    if (typeof process === 'undefined' || !process.platform) {
        // On mobile, use user agent detection
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('android')) {
            return 'Linux'; // Android uses Linux-like paths but needs same char restrictions as macOS
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

    // Check YAML frontmatter tags
    if (fileCache && fileCache.frontmatter && fileCache.frontmatter.tags) {
        const frontmatterTags = fileCache.frontmatter.tags;
        // Handle both string arrays and single strings
        const fileTags = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
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

    // Check inline tags in file content if enabled
    if (settings.excludeInlineTags) {
        let inlineTagsInContent: string[] = [];

        if (content) {
            // Use provided content (real-time)
            inlineTagsInContent = parseInlineTagsFromText(content);
        } else {
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
 * - "Enable in all notes except below": Process all files EXCEPT those in target folders/tags
 *   - If no targets specified: Process ALL files (default enabled)
 *   - If targets specified: Process files NOT in targets (traditional exclude)
 *
 * - "Disable in all notes except below": Process ONLY files in target folders/tags
 *   - If no targets specified: Process NO files (default disabled)
 *   - If targets specified: Process ONLY files in targets (include-only mode)
 *
 * @param file The file to check
 * @param settings Plugin settings containing strategy, folders, and tags
 * @param app The Obsidian app instance
 * @param content Optional file content for real-time checking
 * @returns true if the file should be processed, false otherwise
 */
export function shouldProcessFile(file: TFile, settings: PluginSettings, app: App, content?: string): boolean {
    const isInTargetFolders = isFileInTargetFolders(file, settings);
    const hasTargetTags = fileHasTargetTags(file, settings, app, content);

    // If file is in target folders OR has target tags, it's "targeted"
    const isTargeted = isInTargetFolders || hasTargetTags;

    // Check if any targets are actually specified
    const hasAnyTargets = (
        settings.excludedFolders.some(folder => folder.trim() !== "") ||
        settings.excludedTags.some(tag => tag.trim() !== "")
    );

    // Apply strategy logic
    if (settings.scopeStrategy === 'Enable in all notes except below') {
        // Enable renaming in all notes EXCEPT those in the specified folders/tags
        // The list contains folders/tags where renaming should be DISABLED
        // If no targets specified, enable renaming for all files
        return hasAnyTargets ? !isTargeted : true;
    } else {
        // 'Disable in all notes except below'
        // Disable renaming in all notes EXCEPT those in the specified folders/tags
        // The list contains folders/tags where renaming should be ENABLED
        // If no targets specified, disable renaming for all files
        return hasAnyTargets ? isTargeted : false;
    }
}

export function isFileExcluded(file: TFile, settings: PluginSettings, app: App, content?: string): boolean {
    // Check folder exclusions
    if (inExcludedFolder(file, settings)) {
        return true;
    }

    // Check tag exclusions
    const nonEmptyTags = settings.excludedTags.filter(tag => tag.trim() !== "");
    if (nonEmptyTags.length > 0) {
        const fileCache = app.metadataCache.getFileCache(file);

        // Check YAML frontmatter tags
        if (fileCache && fileCache.frontmatter && fileCache.frontmatter.tags) {
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

        // Check inline tags in file content if enabled
        if (settings.excludeInlineTags) {
            let inlineTagsInContent: string[] = [];

            if (content) {
                // Use provided content (real-time)
                inlineTagsInContent = parseInlineTagsFromText(content);
            } else {
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

export function hasDisableProperty(content: string, settings: PluginSettings): boolean {
    // Check if the setting is configured
    if (!settings.disableRenamingKey || !settings.disableRenamingValue) return false;

    // Check if content starts with frontmatter
    if (!content.startsWith("---")) return false;

    // Find the end of the first frontmatter block
    const frontmatterEnd = content.indexOf("---", 3);
    if (frontmatterEnd === -1) return false;

    // Extract frontmatter content
    const frontmatter = content.slice(3, frontmatterEnd);

    // Create case-insensitive regex for key:value pair
    const escapedKey = settings.disableRenamingKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedValue = settings.disableRenamingValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match with or without quotes, and handle trailing spaces
    const patterns = [
        new RegExp(`^\\s*${escapedKey}\\s*:\\s*"${escapedValue}"\\s*$`, 'im'),
        new RegExp(`^\\s*${escapedKey}\\s*:\\s*'${escapedValue}'\\s*$`, 'im'),
        new RegExp(`^\\s*${escapedKey}\\s*:\\s*${escapedValue}\\s*$`, 'im')
    ];

    return patterns.some(regex => regex.test(frontmatter));
}

export async function hasDisablePropertyInFile(file: TFile, app: App, settings: PluginSettings): Promise<boolean> {
    try {
        const content = await app.vault.read(file);
        return hasDisableProperty(content, settings);
    } catch (error) {
        return false;
    }
}

export function isExcalidrawFile(content: string, settings: PluginSettings): boolean {
    if (!settings.skipExcalidrawFiles) return false;

    // Check if content starts with frontmatter
    if (!content.startsWith("---")) return false;

    // Find the end of the first frontmatter block
    const frontmatterEnd = content.indexOf("---", 3);
    if (frontmatterEnd === -1) return false;

    // Extract frontmatter content
    const frontmatter = content.slice(3, frontmatterEnd);

    // Check for excalidraw-plugin: parsed
    const excalidrawRegex = /^\s*excalidraw-plugin\s*:\s*parsed\s*$/m;
    return excalidrawRegex.test(frontmatter);
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

    // Remove template placeholder
    line = line.replace(/<%\s*tp\.file\.cursor\(\)\s*%>/, '').trim();

    if (line === "<%*") {
        return "Untitled";
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

    // Remove comments if enabled
    if (settings.omitComments) {
        // Remove markdown comments %% %% (only matching pairs)
        line = line.replace(/%%.*?%%/g, '');

        // Remove HTML comments <!-- --> (only matching pairs)
        line = line.replace(/<!--.*?-->/g, '');
    }

    // Remove markdown formatting (only complete pairs, not escaped)
    // We check against the original line before escape placeholder replacement
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

    // Remove bold **text** or __text__
    line = line.replace(/\*\*(.+?)\*\*/g, (match, content, offset) => {
        return checkEscaped(match, offset) ? match : content;
    });
    line = line.replace(/__(.+?)__/g, (match, content, offset) => {
        return checkEscaped(match, offset) ? match : content;
    });

    // Remove italic *text* or _text_
    line = line.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (match, content, offset) => {
        return checkEscaped(match, offset) ? match : content;
    });
    line = line.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, (match, content, offset) => {
        return checkEscaped(match, offset) ? match : content;
    });

    // Remove strikethrough ~~text~~
    line = line.replace(/~~(.+?)~~/g, (match, content, offset) => {
        return checkEscaped(match, offset) ? match : content;
    });

    // Remove highlight ==text==
    line = line.replace(/==(.+?)==/g, (match, content, offset) => {
        return checkEscaped(match, offset) ? match : content;
    });

    // Remove HTML tags (all tags with opening and closing pairs) - handle nested tags
    if (settings.omitHtmlTags) {
        let previousLine = '';
        while (line !== previousLine) {
            previousLine = line;
            line = line.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>(.*?)<\/\1>/g, '$2');
        }
    }

    // Handle embedded image links (remove ! before [[]])
    const embedLinkRegex = /!\[\[(.*?)\]\]/g;
    line = line.replace(embedLinkRegex, '[[$1]]');

    // Handle regular embedded image links
    const regularEmbedRegex = /!\[(.*?)\]\((.*?)\)/g;
    line = line.replace(regularEmbedRegex, (match, caption) => caption);

    // Handle headers - only if the original line was a valid heading
    if (isHeading) {
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

    // Handle wikilinks
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

    // Check for empty links that should result in "Untitled"
    // If entire line is just empty links (regular or image), return "Untitled"
    const onlyEmptyLinksRegex = /^(\s*!?\[\]\([^)]*\)\s*)+$/;
    if (onlyEmptyLinksRegex.test(line)) {
        return "Untitled";
    }

    // Handle regular Markdown links (non-empty)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    line = line.replace(markdownLinkRegex, (_, title) => title);

    // Remove empty links (but keep surrounding text)
    // This handles cases like "test [](smile.md)" -> "test"
    line = line.replace(/!?\[\]\([^)]*\)/g, '').trim();

    // Restore escaped characters (remove escape, keep character) - only if escaping was used
    if (!backslashReplacementEnabled) {
        for (const [placeholder, char] of escapeMap) {
            line = line.replace(placeholder, char);
        }
    }

    return line;
}
