import { TFile, Editor, Notice } from "obsidian";
import { PluginSettings } from '../types';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from '../constants';
import {
    verboseLog,
    detectOS,
    shouldProcessFile,
    hasDisableProperty,
    containsSafeword,
    extractTitle,
    isValidHeading
} from '../utils';

// Access optimized cache manager
const globals = (globalThis as any).flitGlobals;
const getCacheManager = () => globals?.getCacheManager();

export class RenameEngine {
    private plugin: any; // Plugin instance

    // Track last processed first line content to avoid duplicate processing
    private lastProcessedContent = new Map<string, string>();

    // Rate limiting: Track operations per file to prevent infinite loops
    private operationTracker = new Map<string, {count: number, lastContent: string}>();

    // Track files currently being renamed to prevent spurious events
    private filesBeingRenamed = new Set<TFile>();

    constructor(plugin: any) {
        this.plugin = plugin;
    }

    /**
     * Check if a file is currently being renamed by this plugin
     */
    isFileBeingRenamed(file: TFile): boolean {
        return this.filesBeingRenamed.has(file);
    }

    checkOperationLimit(file: TFile, content: string): boolean {
        const key = file.path;
        const tracker = this.operationTracker.get(key);

        if (!tracker) {
            this.operationTracker.set(key, {count: 1, lastContent: content});
            return true;
        }

        if (tracker.lastContent !== content) {
            // Content changed, reset counter
            this.operationTracker.set(key, {count: 1, lastContent: content});
            return true;
        }

        if (tracker.count >= 3) {
            verboseLog(this.plugin, `Rate limit hit for ${file.path} - blocked operation ${tracker.count + 1}`);
            return false;
        }

        tracker.count++;
        return true;
    }

    async processEditorChangeOptimal(editor: Editor, file: TFile): Promise<void> {
        // Track plugin usage
        this.plugin.trackUsage();

        const startTime = Date.now();

        try {
            // Skip if alias update in progress for this file
            if (this.plugin.aliasManager.isAliasUpdateInProgress(file.path)) {
                verboseLog(this.plugin, `Editor change ignored - alias update in progress: ${file.path}`);
                return;
            }

            // Get current content directly from editor (bypasses file batching delay)
            const currentContent = editor.getValue();

            // Use direct parsing for frontmatter to avoid metadata cache staleness
            const lines = currentContent.split('\n');
            let firstLineIndex = 0;

            // Check if content starts with frontmatter
            if (lines.length > 0 && lines[0].trim() === '---') {
                // Find closing delimiter
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '---') {
                        firstLineIndex = i + 1;
                        break;
                    }
                }
            }

            const metadata = this.plugin.app.metadataCache.getFileCache(file);

            // Find first non-empty line after frontmatter
            let firstLine = '';
            for (let i = firstLineIndex; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim() !== '') {
                    firstLine = line;
                    break;
                }
            }
            const lastContent = this.lastProcessedContent.get(file.path);

            // Only process if first line actually changed
            if (firstLine !== lastContent) {
                const timeSinceStart = Date.now() - startTime;
                const keystrokeTime = Date.now();
                verboseLog(this.plugin, `[TIMING] KEYSTROKE: ${file.path} - "${lastContent}" -> "${firstLine}" (processed in ${timeSinceStart}ms) @${keystrokeTime}`);

                // Process immediately using editor content
                await this.renameFileImmediate(file, currentContent, metadata);

                // Update last processed content
                this.lastProcessedContent.set(file.path, firstLine);
            } else {
                verboseLog(this.plugin, `Editor change ignored - no first line change: ${file.path}`);
            }
        } catch (error) {
            console.error(`Error in optimal editor-change processing for ${file.path}:`, error);
        }
    }

    async renameFileImmediate(file: TFile, content: string, metadata: any): Promise<void> {
        // Skip all the slow checks since we know this is an open editor file
        if (file.extension !== 'md') {
            return;
        }

        // Rate limiting check - prevent infinite loops
        if (!this.checkOperationLimit(file, content)) {
            return;
        }

        // Quick exclusion check using already-available content
        if (!shouldProcessFile(file, this.plugin.settings, this.plugin.app, content)) {
            return;
        }

        const timestamp = Date.now();
        const timeStr = new Date(timestamp).toLocaleTimeString() + '.' + (timestamp % 1000).toString().padStart(3, '0') + 'ms';
        verboseLog(this.plugin, `RENAME: Starting immediate renameFile for ${file.path} at ${timeStr}`);

        try {
            // IMMEDIATE PROCESSING: Use existing renameFile but with editor content
            await this.renameFile(file, true, false, false, content);

        } catch (error) {
            console.error(`Error in immediate rename for ${file.path}:`, error);
        }
    }

    stripFrontmatterFromContent(content: string, file: TFile): string {
        // Use direct parsing to avoid metadata cache staleness during rapid edits
        const lines = content.split('\n');

        // Check if content starts with frontmatter delimiter
        if (lines.length > 0 && lines[0].trim() === '---') {
            // Find closing delimiter
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '---') {
                    // Found closing delimiter at line i
                    const strippedContent = lines.slice(i + 1).join('\n');
                    verboseLog(this.plugin, `Stripped frontmatter from ${file.path} (lines 0-${i} removed)`);
                    return strippedContent;
                }
            }
        }

        // No frontmatter found - return content as-is
        return content;
    }

    async renameFile(file: TFile, noDelay = false, ignoreExclusions = false, showNotices = false, providedContent?: string): Promise<{ success: boolean, reason?: string }> {
        // Track plugin usage
        this.plugin.trackUsage();

        verboseLog(this.plugin, `Processing file: ${file.path}`, { noDelay, ignoreExclusions });

        // Check if file still exists before processing (more thorough check)
        const currentFile = this.plugin.app.vault.getAbstractFileByPath(file.path);
        if (!currentFile || !(currentFile instanceof TFile)) {
            verboseLog(this.plugin, `Skipping processing - file no longer exists or is not a TFile: ${file.path}`);
            return { success: false, reason: 'file-not-found' };
        }

        // Update our file reference to the current one from vault
        file = currentFile;

        // Get content for rate limiting check
        let contentForRateLimit: string;
        if (providedContent) {
            contentForRateLimit = providedContent;
        } else {
            try {
                contentForRateLimit = await this.plugin.app.vault.read(file);
            } catch (error) {
                console.error(`Error reading file for rate limit check: ${file.path}`, error);
                return { success: false, reason: 'read-error' };
            }
        }

        // Rate limiting check - prevent infinite loops
        if (!this.checkOperationLimit(file, contentForRateLimit)) {
            return { success: false, reason: 'rate-limited' };
        }

        // Log full file content at start of processing and use it for exclusion check
        let initialContent: string | undefined;
        try {
            initialContent = await this.plugin.app.vault.read(file);
        } catch (error) {
            // Silently continue if unable to read initial content
        }

        if (!ignoreExclusions && !shouldProcessFile(file, this.plugin.settings, this.plugin.app, initialContent)) {
            verboseLog(this.plugin, `Skipping file based on include/exclude strategy: ${file.path}`);
            return { success: false, reason: 'excluded' };
        }
        if (file.extension !== 'md') {
            verboseLog(this.plugin, `Skipping non-markdown file: ${file.path}`);
            return { success: false, reason: 'not-markdown' };
        }

        // Skip all delay logic - process immediately
        const startTime = Date.now();
        console.log(`RENAME: Starting renameFile for ${file.name}`);

        // tempNewPaths array eliminated - using chronological processing instead

        // Clean up stale cache before processing
        this.cleanupStaleCache();

        let content: string;
        try {
            if (this.plugin.settings.fileReadMethod === 'Editor') {
                if (providedContent !== undefined) {
                    content = providedContent;
                    verboseLog(this.plugin, `Using provided editor content for ${file.path} (${content.length} chars)`);
                } else {
                    content = await this.plugin.app.vault.cachedRead(file);
                    verboseLog(this.plugin, `Editor method fallback to cached read for ${file.path} (${content.length} chars)`);
                }
            } else if (this.plugin.settings.fileReadMethod === 'Cache') {
                content = await this.plugin.app.vault.cachedRead(file);
                verboseLog(this.plugin, `Cached read content from ${file.path} (${content.length} chars)`);
            } else if (this.plugin.settings.fileReadMethod === 'File') {
                content = await this.plugin.app.vault.read(file);
                verboseLog(this.plugin, `Direct read content from ${file.path} (${content.length} chars)`);
            } else {
                // Fallback for unknown method
                content = await this.plugin.app.vault.cachedRead(file);
                verboseLog(this.plugin, `Unknown method, fallback to cached read for ${file.path} (${content.length} chars)`);
            }
        } catch (error) {
            console.error(`Failed to read file ${file.path}:`, error);
            throw new Error(`Failed to read file: ${error.message}`);
        }

        // Check if this file has the disable property (always respect "no rename: true")
        if (hasDisableProperty(content)) {
            verboseLog(this.plugin, `Skipping file with disable property: ${file.path}`);
            return { success: false, reason: 'property-disabled' };
        }

        // Check if filename contains any safewords and skip if enabled (always respect safewords)
        if (containsSafeword(file.name, this.plugin.settings)) {
            verboseLog(this.plugin, `Skipping file with safeword: ${file.path}`);
            return { success: false, reason: 'safeword' };
        }


        const currentName = file.basename;

        // Find first non-empty line after frontmatter
        const contentWithoutFrontmatter = this.stripFrontmatterFromContent(content, file);
        const lines = contentWithoutFrontmatter.split('\n');
        let firstLine = '';
        for (const line of lines) {
            if (line.trim() !== '') {
                firstLine = line;
                break;
            }
        }

        // If first line is empty (no content after frontmatter), rename to Untitled
        if (firstLine === '') {
            const parentPath = file.parent?.path === "/" ? "" : file.parent?.path + "/";
            let newPath: string = `${parentPath}Untitled.md`;

            let counter: number = 0;
            const cacheManager = getCacheManager();

            // Check for actual file conflicts (same as main logic)
            let fileExists: boolean = this.checkFileExistsCaseInsensitive(newPath);
            while (fileExists) {
                if (file.path == newPath) {
                    cacheManager?.setContent(file.path, content);
                    return { success: false, reason: 'no-change' };
                }
                counter += 1;
                newPath = `${parentPath}Untitled ${counter}.md`;
                fileExists = this.checkFileExistsCaseInsensitive(newPath);
            }

            // tempNewPaths array eliminated - files processed chronologically

            // Reserve path to prevent conflicts during rename
            cacheManager?.reservePath(newPath);

            const oldPath = file.path;
            try {
                await this.plugin.app.fileManager.renameFile(file, newPath);
                verboseLog(this.plugin, `Renamed empty file ${file.path} to ${newPath}`);

                // Update cache with new path
                const lastContent = this.lastProcessedContent.get(oldPath);
                if (lastContent !== undefined) {
                    this.lastProcessedContent.delete(oldPath);
                    this.lastProcessedContent.set(newPath, lastContent);
                }
            } catch (error) {
                console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
                cacheManager?.releasePath(newPath);
                throw new Error(`Failed to rename file: ${error.message}`);
            }

            // Remove any plugin aliases since there's no content to alias
            if (this.plugin.settings.enableAliases) {
                verboseLog(this.plugin, `Removing plugin aliases - file has no content`);
                await this.plugin.aliasManager.removePluginAliasesFromFile(file, false); // Respect keepEmptyAliasProperty setting
            }

            cacheManager?.setContent(newPath, content);
            cacheManager?.releasePath(newPath);
            return { success: true, reason: 'empty-content' };
        }

        // Check if only headings should be processed
        if (this.plugin.settings.whatToPutInTitle === "headings_only") {
            if (!isValidHeading(firstLine)) {
                verboseLog(this.plugin, `Skipping file - first line is not a valid heading: ${file.path}`);
                return { success: false, reason: 'not-heading' };
            }
        }

        // Check for card links if enabled - extract title but continue to normal processing
        if (this.plugin.settings.grabTitleFromCardLink) {
            // Handle ```embed card links (Link Embed plugin)
            // Note: The backticks may already be stripped by Obsidian/other plugins
            let embedMatch = content.match(/^embed\s*\n[\s\S]*?title:\s*"([^"]+)"/);
            if (!embedMatch) {
                // Try with backticks if they're still present
                embedMatch = content.match(/^```embed[^\n]*\n[\s\S]*?title:\s*"([^"]+)"/);
            }
            if (!embedMatch) {
                // Try without quotes (YAML style)
                embedMatch = content.match(/^embed\s*\n[\s\S]*?title:\s*(.+?)(?:\n|$)/);
            }
            if (embedMatch) {
                // Extract title and continue with normal processing
                firstLine = embedMatch[1];
                verboseLog(this.plugin, `Found embed card link in ${file.path}`, { title: firstLine });
            } else {
                // Handle ```cardlink card links
                // Note: The backticks may already be stripped by Obsidian/other plugins
                let cardlinkMatch = content.match(/^cardlink\s*\n[\s\S]*?title:\s*"([^"]+)"/);
                if (!cardlinkMatch) {
                    // Try with backticks if they're still present
                    cardlinkMatch = content.match(/^```cardlink[^\n]*\n[\s\S]*?title:\s*"([^"]+)"/);
                }
                if (cardlinkMatch) {
                    // Extract title and continue with normal processing
                    firstLine = cardlinkMatch[1];
                    verboseLog(this.plugin, `Found cardlink in ${file.path}`, { title: firstLine });
                }
            }
        }

        // Check if content became empty when it wasn't before (after stripping frontmatter)
        const cacheManager = getCacheManager();
        const previousFileContent = cacheManager?.getContent(file.path);
        if (contentWithoutFrontmatter.trim() === '' && previousFileContent && this.stripFrontmatterFromContent(previousFileContent, file).trim() !== '') {
            // Content became empty, rename to Untitled
            const parentPath = file.parent?.path === "/" ? "" : file.parent?.path + "/";
            let newPath: string = `${parentPath}Untitled.md`;

            let counter: number = 0;

            // Check for actual file conflicts (same as main logic)
            let fileExists: boolean = this.checkFileExistsCaseInsensitive(newPath);
            while (fileExists) {
                if (file.path == newPath) {
                    cacheManager?.setContent(file.path, content);
                    return { success: false, reason: 'no-change' };
                }
                counter += 1;
                newPath = `${parentPath}Untitled ${counter}.md`;
                fileExists = this.checkFileExistsCaseInsensitive(newPath);
            }

            // tempNewPaths array eliminated - files processed chronologically

            // Reserve path to prevent conflicts
            cacheManager?.reservePath(newPath);

            const oldPath = file.path;
            try {
                await this.plugin.app.fileManager.renameFile(file, newPath);
                verboseLog(this.plugin, `Renamed empty file ${file.path} to ${newPath}`);

                // Update cache with new path
                const lastContent = this.lastProcessedContent.get(oldPath);
                if (lastContent !== undefined) {
                    this.lastProcessedContent.delete(oldPath);
                    this.lastProcessedContent.set(newPath, lastContent);
                }
            } catch (error) {
                console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
                cacheManager?.releasePath(newPath);
                throw new Error(`Failed to rename file: ${error.message}`);
            }

            // Remove any plugin aliases since there's no content to alias
            if (this.plugin.settings.enableAliases) {
                verboseLog(this.plugin, `Removing plugin aliases - file became empty`);
                await this.plugin.aliasManager.removePluginAliasesFromFile(file, false); // Respect keepEmptyAliasProperty setting
            }

            cacheManager?.setContent(newPath, content);
            cacheManager?.releasePath(newPath);
            return { success: true, reason: 'empty-content' };
        }

        // Store current content for next check in cache
        cacheManager?.setContent(file.path, content);

        // Preserve original content with frontmatter for alias manager
        const originalContentWithFrontmatter = content;

        // Use the stripped content for processing
        content = contentWithoutFrontmatter;

        // Check for self-referencing links BEFORE custom replacements to prevent character mismatch
        const escapedName = currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wikiLinkRegex = new RegExp(`\\[\\[${escapedName}(\\|.*?)?\\]\\]`);
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

        let isSelfReferencing = false;

        // Check for self-referencing wikilink in original first line (before custom replacements)
        if (wikiLinkRegex.test(firstLine)) {
            isSelfReferencing = true;
            verboseLog(this.plugin, `Found self-referencing wikilink in ${file.path} before custom replacements`);
        }

        // Check for self-referencing Markdown link by parsing the actual URL (ignoring link text)
        let match;
        while ((match = markdownLinkRegex.exec(firstLine)) !== null) {
            const url = match[2];
            if (url.startsWith("#") && url.includes(currentName)) {
                isSelfReferencing = true;
                verboseLog(this.plugin, `Found self-referencing markdown link in ${file.path} before custom replacements`);
                break;
            }
        }

        // First apply custom replacements to the original line (before forbidden char processing)
        let processedTitle = firstLine;

        // Apply custom replacements first
        verboseLog(this.plugin, `Custom replacements enabled: ${this.plugin.settings.enableCustomReplacements}, count: ${this.plugin.settings.customReplacements?.length || 0}`);
        if (this.plugin.settings.enableCustomReplacements) {
            for (const replacement of this.plugin.settings.customReplacements) {
                if (replacement.searchText === '' || !replacement.enabled) continue;

                verboseLog(this.plugin, `Checking custom replacement:`, {
                    searchText: replacement.searchText,
                    replaceText: replacement.replaceText,
                    onlyWholeLine: replacement.onlyWholeLine,
                    onlyAtStart: replacement.onlyAtStart,
                    enabled: replacement.enabled,
                    currentLine: processedTitle
                });

                let tempLine = processedTitle;

                if (replacement.onlyWholeLine) {
                    // Only replace if the entire line matches
                    if (processedTitle.trim() === replacement.searchText.trim()) {
                        tempLine = replacement.replaceText;
                        verboseLog(this.plugin, `Applied whole line replacement:`, { from: processedTitle, to: tempLine });
                    }
                } else if (replacement.onlyAtStart) {
                    if (tempLine.startsWith(replacement.searchText)) {
                        tempLine = replacement.replaceText + tempLine.slice(replacement.searchText.length);
                        verboseLog(this.plugin, `Applied start replacement:`, { from: processedTitle, to: tempLine });
                    }
                } else {
                    const beforeReplace = tempLine;
                    tempLine = tempLine.replaceAll(replacement.searchText, replacement.replaceText);
                    if (beforeReplace !== tempLine) {
                        verboseLog(this.plugin, `Applied general replacement:`, { from: beforeReplace, to: tempLine });
                    }
                }

                processedTitle = tempLine;
            }
        }

        // If custom replacements resulted in empty string or whitespace only, use "Untitled"
        if (processedTitle.trim() === '') {
            processedTitle = "Untitled";
        }

        verboseLog(this.plugin, isSelfReferencing ? `Self-reference found in ${file.path}` : `No self-reference found in ${file.path}`);

        // Now extract title from the processed line (custom replacements already applied above)
        const extractedTitle = extractTitle(processedTitle, this.plugin.settings);
        verboseLog(this.plugin, `Extracted title from ${file.path}`, { original: firstLine, afterCustomReplacements: processedTitle, extracted: extractedTitle });

        const charMap: { [key: string]: string } = {
            '/': this.plugin.settings.charReplacements.slash,
            ':': this.plugin.settings.charReplacements.colon,
            '|': this.plugin.settings.charReplacements.pipe,
            '#': this.plugin.settings.charReplacements.hash,
            '[': this.plugin.settings.charReplacements.leftBracket,
            ']': this.plugin.settings.charReplacements.rightBracket,
            '^': this.plugin.settings.charReplacements.caret,
            '*': this.plugin.settings.charReplacements.asterisk,
            '?': this.plugin.settings.charReplacements.question,
            '<': this.plugin.settings.charReplacements.lessThan,
            '>': this.plugin.settings.charReplacements.greaterThan,
            '"': this.plugin.settings.charReplacements.quote,
            [String.fromCharCode(92)]: this.plugin.settings.charReplacements.backslash,
            '.': this.plugin.settings.charReplacements.dot
        };

        // Get forbidden chars - universal chars are always forbidden
        const universalForbiddenChars = UNIVERSAL_FORBIDDEN_CHARS;
        const windowsAndroidChars = WINDOWS_ANDROID_CHARS;
        const allForbiddenChars = [...universalForbiddenChars];

        // Add Windows/Android chars if current OS requires them OR user has enabled compatibility
        const currentOS = detectOS();
        if (currentOS === 'Windows' || this.plugin.settings.windowsAndroidEnabled) {
            allForbiddenChars.push(...windowsAndroidChars);
        }
        const forbiddenChars = [...new Set(allForbiddenChars)].join('');
        const forbiddenNames: string[] = [
            "CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "COM0",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9", "LPT0",
        ];
        let newFileName: string = "";

        for (let i: number = 0; i < extractedTitle.length; i++) {
            if (newFileName.length >= this.plugin.settings.charCount - 1) {
                newFileName = newFileName.trimEnd();
                newFileName += "…";
                break;
            }
            let char = extractedTitle[i];

            if (char === '.') {
                // Special handling for dots - only forbidden at filename start
                if (newFileName === '') {
                    // Dot at start of filename
                    if (this.plugin.settings.enableForbiddenCharReplacements && this.plugin.settings.charReplacementEnabled.dot) {
                        const replacement = charMap['.'] || '';
                        if (replacement !== '') {
                            // Check for whitespace trimming
                            if (this.plugin.settings.charReplacementTrimRight.dot) {
                                // Skip upcoming whitespace characters
                                while (i + 1 < extractedTitle.length && /\s/.test(extractedTitle[i + 1])) {
                                    i++;
                                }
                            }
                            newFileName += replacement;
                            verboseLog(this.plugin, `Replaced leading dot with \`${replacement}\` in ${file.path}`);
                        }
                        // If replacement is empty, omit the dot (don't add anything)
                    }
                    // If dot replacement is disabled, omit the dot (don't add anything)
                } else {
                    // Dot not at start - always keep it
                    newFileName += '.';
                }
            } else if (forbiddenChars.includes(char)) {
                let shouldReplace = false;
                let replacement = '';

                // Check if master toggle is on AND individual toggle is on
                if (this.plugin.settings.enableForbiddenCharReplacements) {
                    // Map character to setting key
                    let settingKey: keyof typeof this.plugin.settings.charReplacementEnabled | null = null;
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
                        (this.plugin.settings.windowsAndroidEnabled && settingKey && this.plugin.settings.charReplacementEnabled[settingKey]) :
                        (settingKey && this.plugin.settings.charReplacementEnabled[settingKey]);

                    if (canReplace && settingKey) {
                        shouldReplace = true;
                        replacement = charMap[char] || '';

                        // Check for whitespace trimming
                        if (replacement !== '') {
                            // Trim whitespace to the left
                            if (this.plugin.settings.charReplacementTrimLeft[settingKey]) {
                                // Remove trailing whitespace from newFileName
                                newFileName = newFileName.trimEnd();
                            }

                            // Check if we should trim whitespace to the right
                            if (this.plugin.settings.charReplacementTrimRight[settingKey]) {
                                // Skip upcoming whitespace characters
                                while (i + 1 < extractedTitle.length && /\s/.test(extractedTitle[i + 1])) {
                                    i++;
                                }
                            }
                        }
                    }
                }

                if (shouldReplace && replacement !== '') {
                    newFileName += replacement;
                    verboseLog(this.plugin, `Replaced forbidden char \`${char}\` with \`${replacement}\` in ${file.path}`);
                }
                // If master toggle is off, individual toggle is off, or replacement is empty, omit the character (continue to next char)
            } else {
                newFileName += char;
            }
        }

        newFileName = newFileName
            .trim()
            .replace(/\s+/g, " ");

        // Check if filename is empty or a forbidden name
        const isForbiddenName =
            newFileName === "" ||
            forbiddenNames.includes(newFileName.toUpperCase());
        if (isForbiddenName) {
            newFileName = "Untitled";
            verboseLog(this.plugin, `Using fallback name \`Untitled\` for ${file.path}`);
        }

        const parentPath =
            file.parent?.path === "/" ? "" : file.parent?.path + "/";

        let newPath: string = `${parentPath}${newFileName}.md`;

        verboseLog(this.plugin, `Initial target path: ${newPath} for file: ${file.path}`);

        // Check if filename would change - if not, process aliases only (no delay needed)
        if (file.path == newPath) {
            verboseLog(this.plugin, `No rename needed for ${file.path} - already has correct name`);
            // File passed exclusion checks - process aliases when enabled (immediate since no file rename)
            if (this.plugin.settings.enableAliases) {
                await this.plugin.aliasManager.updateAliasIfNeeded(file, originalContentWithFrontmatter);
            }
            return { success: false, reason: 'no-rename-needed' };
        }

        let counter: number = 0;
        let fileExists: boolean = this.checkFileExistsCaseInsensitive(newPath);

        // Only check actual file existence on disk - tempNewPaths no longer needed
        // Files are processed one at a time in chronological order (oldest first)
        const tempPathConflict = false;

        verboseLog(this.plugin, `Conflict check for ${newPath}: fileExists=${fileExists}, tempPathConflict=${tempPathConflict} (tempNewPaths eliminated)`);

        // Only increment counter if there are actual conflicts
        if (fileExists || tempPathConflict) {
            verboseLog(this.plugin, `Found conflicts for ${newPath}, starting counter loop`);
            while (fileExists) {
                // Check if we're about to create a path that matches current file (with counter)
                if (file.path == newPath) {
                    verboseLog(this.plugin, `No rename needed for ${file.path} - already has correct name with counter`);
                    // Note: Alias was already handled earlier in the function
                    return { success: false, reason: 'no-rename-needed' };
                }
                counter += 1;
                newPath = `${parentPath}${newFileName} ${counter}.md`;
                fileExists = this.checkFileExistsCaseInsensitive(newPath);
                verboseLog(this.plugin, `Counter loop: counter=${counter}, newPath=${newPath}, fileExists=${fileExists}`);
            }
        } else {
            verboseLog(this.plugin, `No conflicts found for ${newPath}, proceeding without counter`);
        }

        // Only check for self-reference if filename would actually change (after handling counter)
        if (isSelfReferencing) {
            if (!suppressNotices) {
                new Notice(`File not renamed due to self-referential link in first line: ${file.name}`, 0);
            }
            verboseLog(this.plugin, `Skipping self-referencing file: ${file.path}`);
            return { success: false, reason: 'self-referential' };
        }

        if (noDelay) {
            const cacheManager = getCacheManager();
            cacheManager?.reservePath(newPath);
        }

        // File passed exclusion checks - process aliases when enabled
        if (this.plugin.settings.enableAliases) {
            await this.plugin.aliasManager.updateAliasIfNeeded(file, originalContentWithFrontmatter);
        }

        try {
            // Mark file as being renamed before operation
            this.filesBeingRenamed.add(file);

            const oldPath = file.path;
            await this.plugin.app.fileManager.renameFile(file, newPath);
            // Renamed file counter removed - not needed with optimized system
            const processingTime = Date.now() - startTime;
            verboseLog(this.plugin, `Successfully renamed ${file.path} to ${newPath} (${processingTime}ms)`);

            // Update cache with new path
            const lastContent = this.lastProcessedContent.get(oldPath);
            if (lastContent !== undefined) {
                this.lastProcessedContent.delete(oldPath);
                this.lastProcessedContent.set(newPath, lastContent);
            }

            // Note: Alias was handled before the file rename to stay synchronized

            // Show notification for manual renames (unless suppressed)
            if (showNotices) {
                const titleChanged = currentName !== newFileName;
                const shouldShowNotice =
                    this.plugin.settings.manualNotificationMode === 'Always' ||
                    (this.plugin.settings.manualNotificationMode === 'On title change' && titleChanged);

                if (shouldShowNotice) {
                    new Notice(`Updated title: ${currentName} → ${newFileName}`);
                }
            }

            // Unmark file after rename (no cooldown needed - using object identity checking)
            this.filesBeingRenamed.delete(file);

            return { success: true };
        } catch (error) {
            console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
            // Clean up tracking even on error
            this.filesBeingRenamed.delete(file);
            return { success: false, reason: 'error' };
        }
    }

    checkFileExistsCaseInsensitive(path: string): boolean {
        // First check exact match (faster)
        const exactMatch = this.plugin.app.vault.getAbstractFileByPath(path);
        if (exactMatch !== null) {
            verboseLog(this.plugin, `Exact file conflict found: ${path} (existing file: ${exactMatch.path})`);
            return true;
        }

        // Then check case-insensitive match by comparing lowercase paths
        const lowerPath = path.toLowerCase();
        const allFiles = this.plugin.app.vault.getAllLoadedFiles();

        for (const file of allFiles) {
            if (file.path.toLowerCase() === lowerPath) {
                verboseLog(this.plugin, `Case-insensitive file conflict found: ${path} (existing file: ${file.path})`);
                return true;
            }
        }

        return false;
    }

    cleanupStaleCache(): void {
        // Clean up tempNewPaths - now handled by CacheManager maintenance

        // Cache cleanup now handled by CacheManager maintenance system

        verboseLog(this.plugin, 'Cache cleanup completed');
    }

    // Getter for lastProcessedContent (for use in main.ts)
    getLastProcessedContent(): Map<string, string> {
        return this.lastProcessedContent;
    }

    // Setter for lastProcessedContent (for use in main.ts)
    setLastProcessedContent(path: string, content: string): void {
        this.lastProcessedContent.set(path, content);
    }

    // Clear method for lastProcessedContent (for use in main.ts)
    clearLastProcessedContent(): void {
        this.lastProcessedContent.clear();
    }
}