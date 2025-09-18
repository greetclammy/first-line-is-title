import { TFile, App } from "obsidian";
import { PluginSettings, OSPreset } from './types';

export function verboseLog(plugin: { settings: PluginSettings }, message: string, data?: any) {
    if (plugin.settings.verboseLogging) {
        if (data) {
            console.log(`[First Line Is Title] ${message}`, data);
        } else {
            console.log(`[First Line Is Title] ${message}`);
        }
    }
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

export function isFileExcluded(file: TFile, settings: PluginSettings, app: App): boolean {
    // Check folder exclusions
    if (inExcludedFolder(file, settings)) {
        return true;
    }

    // Check tag exclusions (only YAML frontmatter tags)
    const nonEmptyTags = settings.excludedTags.filter(tag => tag.trim() !== "");
    if (nonEmptyTags.length > 0) {
        const fileCache = app.metadataCache.getFileCache(file);
        if (fileCache && fileCache.frontmatter && fileCache.frontmatter.tags) {
            const frontmatterTags = fileCache.frontmatter.tags;
            // Handle both string arrays and single strings
            const fileTags = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
            for (const excludedTag of nonEmptyTags) {
                // Normalize both sides: remove # prefix for comparison
                const normalizedExcludedTag = excludedTag.startsWith('#') ? excludedTag.slice(1) : excludedTag;
                if (fileTags.includes(normalizedExcludedTag)) {
                    return true;
                }
            }
        }
    }

    return false;
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
    // Valid heading must: start at line beginning (no preceding chars), have 1-6 hashes, have space after
    const isValidHeading = /^#{1,6}\s/.test(originalLine);

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
    if (isValidHeading) {
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

    // Apply custom replacements
    if (settings.enableCustomReplacements) {
        for (const replacement of settings.customReplacements) {
            if (replacement.searchText === '' || !replacement.enabled) continue;

            // Check if this replacement would make the whole line match
            let tempLine = line;

            if (replacement.onlyWholeLine) {
                // Only replace if the entire line matches
                if (line.trim() === replacement.searchText.trim()) {
                    tempLine = replacement.replaceText;
                }
            } else if (replacement.onlyAtStart) {
                if (tempLine.startsWith(replacement.searchText)) {
                    tempLine = replacement.replaceText + tempLine.slice(replacement.searchText.length);
                }
            } else {
                tempLine = tempLine.replaceAll(replacement.searchText, replacement.replaceText);
            }

            // If the replacement results in empty string or whitespace only, and original search matched whole line, return "Untitled"
            if (tempLine.trim() === '' && line.trim() === replacement.searchText.trim()) {
                return "Untitled";
            }

            line = tempLine;
        }
    }

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