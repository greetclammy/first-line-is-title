import { TFile, Editor, Notice, getFrontMatterInfo } from "obsidian";
import { PluginSettings, TitleRegionCache } from '../types';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from '../constants';
import {
    verboseLog,
    detectOS,
    shouldProcessFile,
    hasDisablePropertyInFile,
    containsSafeword,
    extractTitle,
    isValidHeading,
    findTitleSourceLine
} from '../utils';
import { t } from '../i18n';

import FirstLineIsTitle from '../../main';

// Cache manager now accessed via plugin instance
export class RenameEngine {
    private plugin: FirstLineIsTitle;
    private lastEditorContent = new Map<string, string>();
    private titleRegionCache = new Map<string, TitleRegionCache>();
    private fileTimeTracker = new Map<string, {timestamp: number, count: number}>();
    private globalOperationTracker = {timestamp: Date.now(), count: 0};
    private lastSelfRefNotice = new Map<string, number>();
    private filesBeingProcessed = new Set<string>();

    constructor(plugin: FirstLineIsTitle) {
        this.plugin = plugin;
    }


    checkFileTimeLimit(file: TFile): boolean {
        const now = Date.now();
        const windowMs = 500;
        const maxOpsPerFile = 15;

        const key = file.path;
        const tracker = this.fileTimeTracker.get(key);

        if (!tracker || now - tracker.timestamp > windowMs) {
            this.fileTimeTracker.set(key, {timestamp: now, count: 1});
            return true;
        }

        if (tracker.count >= maxOpsPerFile) {
            console.log(`Per-file rate limit hit for ${file.path} - ${tracker.count} operations in ${now - tracker.timestamp}ms`);
            return false;
        }

        tracker.count++;
        return true;
    }

    checkGlobalRateLimit(): boolean {
        const now = Date.now();
        const windowMs = 500;
        const maxGlobalOps = 30;

        if (now - this.globalOperationTracker.timestamp > windowMs) {
            this.globalOperationTracker = {timestamp: now, count: 1};
            return true;
        }

        if (this.globalOperationTracker.count >= maxGlobalOps) {
            console.log(`Global rate limit hit - ${this.globalOperationTracker.count} operations in ${now - this.globalOperationTracker.timestamp}ms`);
            return false;
        }

        this.globalOperationTracker.count++;
        return true;
    }

    async processEditorChangeOptimal(editor: Editor, file: TFile): Promise<void> {
        this.plugin.trackUsage();
        const startTime = Date.now();

        try {
            if (this.plugin.aliasManager.isAliasUpdateInProgress(file.path)) {
                verboseLog(this.plugin, `Editor change ignored - alias update in progress: ${file.path}`);
                return;
            }

            const currentContent = editor.getValue();

            // Detect if only frontmatter changed (skip processing to preserve YAML formatting)
            const previousContent = this.lastEditorContent.get(file.path);
            if (previousContent) {
                const currentFrontmatterInfo = getFrontMatterInfo(currentContent);
                const previousFrontmatterInfo = getFrontMatterInfo(previousContent);

                const currentContentAfterFrontmatter = currentContent.substring(currentFrontmatterInfo.contentStart);
                const previousContentAfterFrontmatter = previousContent.substring(previousFrontmatterInfo.contentStart);

                // If only frontmatter changed, skip ALL processing (rename + alias)
                if (currentContentAfterFrontmatter === previousContentAfterFrontmatter) {
                    verboseLog(this.plugin, `Skipping - only frontmatter edited: ${file.path}`);
                    this.lastEditorContent.set(file.path, currentContent);
                    return;
                }
            }

            // Update lastEditorContent for next comparison
            this.lastEditorContent.set(file.path, currentContent);

            // Extract title region and check cache
            const currentTitleRegion = this.extractTitleRegion(editor, file);
            const cachedTitleRegion = this.titleRegionCache.get(file.path);

            if (cachedTitleRegion &&
                currentTitleRegion.firstNonEmptyLine === cachedTitleRegion.firstNonEmptyLine &&
                currentTitleRegion.titleSourceLine === cachedTitleRegion.titleSourceLine) {

                verboseLog(this.plugin, `Title region unchanged - skipping processing: ${file.path}`);

                // Still process aliases if alias settings changed (edge case)
                // For now, skip all processing when title region unchanged
                return;
            }

            // Title changed - update cache and process
            this.titleRegionCache.set(file.path, currentTitleRegion);
            verboseLog(this.plugin, `Title region changed - processing: ${file.path}`, {
                previous: cachedTitleRegion,
                current: currentTitleRegion
            });

            const metadata = this.plugin.app.metadataCache.getFileCache(file);

            // Policy: Process on ANY content change (not just first line changes)
            const timeSinceStart = Date.now() - startTime;
            verboseLog(this.plugin, `[TIMING] Content changed in ${timeSinceStart}ms: ${file.path}`);
            await this.processFileImmediate(file, currentContent, metadata);
        } catch (error) {
            console.error(`Error in optimal editor-change processing for ${file.path}:`, error);
        }
    }

    /**
     * Extract title region (first non-empty line and title source line) from editor content
     * Returns TitleRegionCache with extracted strings
     */
    extractTitleRegion(editor: Editor, file: TFile): TitleRegionCache {
        const content = editor.getValue();
        const metadata = this.plugin.app.metadataCache.getFileCache(file);

        // Skip frontmatter
        let startLine = 0;
        if (metadata?.frontmatterPosition) {
            startLine = metadata.frontmatterPosition.end.line + 1;
        }

        const lines = content.split('\n');

        // Find first non-empty line
        let firstNonEmptyLine = '';
        for (let i = startLine; i < lines.length; i++) {
            if (lines[i].trim() !== '') {
                firstNonEmptyLine = lines[i];
                break;
            }
        }

        if (firstNonEmptyLine === '') {
            return { firstNonEmptyLine: '', titleSourceLine: '', lastUpdated: Date.now() };
        }

        // Get lines after frontmatter for title source computation
        const contentLines = lines.slice(startLine);

        // Use shared utility function to find title source line
        const titleSourceLine = findTitleSourceLine(
            firstNonEmptyLine,
            contentLines,
            this.plugin.settings,
            this.plugin
        );

        return {
            firstNonEmptyLine,
            titleSourceLine,
            lastUpdated: Date.now()
        };
    }

    async processFileImmediate(file: TFile, content: string, metadata: any): Promise<void> {
        if (file.extension !== 'md') {
            return;
        }

        if (!shouldProcessFile(file, this.plugin.settings, this.plugin.app, content)) {
            return;
        }

        verboseLog(this.plugin, `PROCESS: Starting immediate processFile for ${file.path}`);

        try {
            await this.processFile(file, true, false, content);
        } catch (error) {
            console.error(`Error in immediate process for ${file.path}:`, error);
        }
    }

    stripFrontmatterFromContent(content: string | undefined, file: TFile): string {
        if (!content) return '';
        const lines = content.split('\n');

        if (lines.length > 0 && lines[0].trim() === '---') {
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '---') {
                    const strippedContent = lines.slice(i + 1).join('\n');
                    verboseLog(this.plugin, `Stripped frontmatter from ${file.path} (lines 0-${i} removed)`);
                    return strippedContent;
                }
            }
        }

        return content;
    }

    async processFile(
        file: TFile,
        noDelay = false,
        showNotices = false,
        providedContent?: string,
        isBatchOperation = false,
        exclusionOverrides?: { ignoreFolder?: boolean; ignoreTag?: boolean; ignoreProperty?: boolean }
    ): Promise<{ success: boolean, reason?: string }> {
        this.plugin.trackUsage();
        verboseLog(this.plugin, `Processing file: ${file.path}`, { noDelay });

        const currentFile = this.plugin.app.vault.getAbstractFileByPath(file.path);
        if (!currentFile || !(currentFile instanceof TFile)) {
            verboseLog(this.plugin, `Skipping processing - file no longer exists or is not a TFile: ${file.path}`);
            return { success: false, reason: 'file-not-found' };
        }

        file = currentFile;

        if (file.extension !== 'md') {
            verboseLog(this.plugin, `Skipping non-markdown file: ${file.path}`);
            return { success: false, reason: 'not-markdown' };
        }

        // Capture original path before acquiring lock (path may change during rename)
        const originalPath = file.path;

        // Check if file is already being processed (prevents concurrent processFile race conditions)
        if (this.filesBeingProcessed.has(originalPath)) {
            verboseLog(this.plugin, `Skipping - file already being processed: ${originalPath}`);
            return { success: false, reason: 'already-processing' };
        }

        // Acquire processing lock with original path
        this.filesBeingProcessed.add(originalPath);

        try {
            return await this.processFileInternal(file, noDelay, showNotices, providedContent, isBatchOperation, exclusionOverrides);
        } finally {
            // Always release lock using original path (file.path may have changed during rename)
            this.filesBeingProcessed.delete(originalPath);
        }
    }

    private async processFileInternal(
        file: TFile,
        noDelay: boolean,
        showNotices: boolean,
        providedContent?: string,
        isBatchOperation = false,
        exclusionOverrides?: { ignoreFolder?: boolean; ignoreTag?: boolean; ignoreProperty?: boolean }
    ): Promise<{ success: boolean, reason?: string }> {

        // ABSOLUTE FIRST-GATE: Check disable property - cannot be overridden by any command or exclusionOverrides
        if (await hasDisablePropertyInFile(file, this.plugin.app, this.plugin.settings.disableRenamingKey, this.plugin.settings.disableRenamingValue)) {
            verboseLog(this.plugin, `ABSOLUTE BLOCK: Skipping file with disable property: ${file.path}`);
            return { success: false, reason: 'property-disabled' };
        }

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

        // Time-based rate limiting (per-file always enforced, global bypassed for batches)
        if (!this.checkFileTimeLimit(file)) {
            return { success: false, reason: 'time-rate-limited' };
        }

        // Global rate limiting bypassed for batch operations to avoid blocking legitimate bulk operations
        if (!isBatchOperation) {
            if (!this.checkGlobalRateLimit()) {
                return { success: false, reason: 'global-rate-limited' };
            }
        }

        // Log full file content at start of processing and use it for exclusion check
        let initialContent: string | undefined;
        try {
            initialContent = await this.plugin.app.vault.read(file);
        } catch (error) {
            // Silently continue if unable to read initial content
        }

        // Check folder/tag/property exclusions
        // Pass exclusionOverrides to skip checks for manual single-file commands
        if (!shouldProcessFile(file, this.plugin.settings, this.plugin.app, initialContent, exclusionOverrides)) {
            verboseLog(this.plugin, `Skipping file based on include/exclude strategy: ${file.path}`);
            return { success: false, reason: 'excluded' };
        }

        // Skip all delay logic - process immediately
        const startTime = Date.now();
        verboseLog(this.plugin, `RENAME: Starting renameFile for ${file.name}`);

        // Get previous content BEFORE cache cleanup to detect content deletion
        const cacheManager = this.plugin.cacheManager;
        const previousFileContent = cacheManager?.getContent(file.path);

        // Clean up stale cache before processing
        this.cleanupStaleCache();

        let content: string;
        try {
            if (this.plugin.settings.fileReadMethod === 'Editor') {
                if (typeof providedContent === 'string' && providedContent !== '') {
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

        // Check if filename contains any safewords and skip if enabled (always respect safewords)
        if (containsSafeword(file.name, this.plugin.settings)) {
            verboseLog(this.plugin, `Skipping file with safeword: ${file.path}`);
            return { success: false, reason: 'safeword' };
        }


        const currentName = file.basename;

        /**
         * Title Processing Pipeline:
         *
         * 1. firstNonEmptyLine - Literal first non-empty line after frontmatter
         *    (never modified, preserved for reference)
         *
         * 2. titleSourceLine - The raw line that becomes the filename source
         *    (derived from firstNonEmptyLine with special case handling:
         *     - Card links: Extract title from ```embed/```cardlink blocks
         *     - Code blocks: Use second line if first is ``` fence)
         *
         * 3. newTitle - Final title after all transformations:
         *    - Custom replacements applied to titleSourceLine
         *    - Markup stripping via extractTitle() (removes headings, bold, italics, etc.)
         *    - Forbidden character replacement
         *    - Trim and forbidden name fallback
         */

        // Find first non-empty line after frontmatter
        const contentWithoutFrontmatter = this.stripFrontmatterFromContent(content, file);
        const lines = contentWithoutFrontmatter.split('\n');
        let firstNonEmptyLine = '';
        for (const line of lines) {
            if (line.trim() !== '') {
                firstNonEmptyLine = line;
                break;
            }
        }

        // If first line is empty (no content after frontmatter)
        if (firstNonEmptyLine === '') {
            // Check if file had previous content
            const previousContentWithoutFrontmatter = previousFileContent
                ? this.stripFrontmatterFromContent(previousFileContent, file)
                : '';
            const hadPreviousContent = previousContentWithoutFrontmatter.trim() !== '';

            if (hadPreviousContent) {
                // Content was deleted - rename to Untitled
                verboseLog(this.plugin, `Content became empty - renaming to ${t('untitled')}: ${file.path}`);
                firstNonEmptyLine = t('untitled');
            } else {
                // File was always empty - retain current filename
                cacheManager?.setContent(file.path, content);

                // Don't call removePluginAliasesFromFile - no content means no plugin aliases exist
                // Calling processFrontMatter here races with template plugins (Templater)

                verboseLog(this.plugin, `Skipping rename for empty file - retaining current filename: ${file.path}`);
                return { success: false, reason: 'empty-content-retained' };
            }
        }

        // Check if only headings should be processed
        if (this.plugin.settings.whatToPutInTitle === "headings_only") {
            if (!isValidHeading(firstNonEmptyLine)) {
                verboseLog(this.plugin, `Skipping file - first line is not a valid heading: ${file.path}`);
                return { success: false, reason: 'not-heading' };
            }
        }

        // Determine titleSourceLine using shared utility function
        // This handles special cases like card links, code blocks, and markdown tables
        const titleSourceLine = findTitleSourceLine(firstNonEmptyLine, lines, this.plugin.settings, this.plugin);

        // Store current content for next check in cache (only if not handled above)
        // Don't update cache if content became empty and we're renaming to Untitled (prevents cache poisoning)
        const contentBecameEmpty = contentWithoutFrontmatter.trim() === '' && firstNonEmptyLine === t('untitled');
        if (!contentBecameEmpty) {
            cacheManager?.setContent(file.path, content);
        }

        // Preserve original content with frontmatter for alias manager
        const originalContentWithFrontmatter = content;

        // Use the stripped content for processing
        content = contentWithoutFrontmatter;

        // Check for self-referencing links BEFORE custom replacements to prevent character mismatch
        const escapedName = currentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pathWithoutExt = file.path.replace(/\.md$/, '');
        const escapedPath = pathWithoutExt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Match [[filename]], [[filename#heading]], [[filename#^block]], [[path/filename#heading]], with optional |alias
        // Need to check both basename and full path (some users link with path)
        const wikiLinkRegex = new RegExp(`\\[\\[(${escapedName}|${escapedPath})(#[^\\]|]*?)?(\\|.*?)?\\]\\]`);
        // Match markdown links including empty link text: [text](url) or [](url)
        const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;

        let isSelfReferencing = false;

        // Check for self-referencing wikilink in titleSourceLine (before custom replacements)
        if (wikiLinkRegex.test(titleSourceLine)) {
            isSelfReferencing = true;
            verboseLog(this.plugin, `Found self-referencing wikilink in ${file.path} before custom replacements`);
        }

        // Check for self-referencing Markdown link by parsing the actual URL (ignoring link text)
        let match;
        while ((match = markdownLinkRegex.exec(titleSourceLine)) !== null) {
            const url = match[2];

            // Decode percent-encoding for comparison
            let decodedUrl = url;
            try {
                decodedUrl = decodeURIComponent(url);
            } catch (e) {
                // Invalid encoding, use original
            }

            // Check various self-reference patterns:
            // 1. Fragment-only: #heading
            // 2. Relative path with .md: filename.md or path/filename.md
            // 3. Relative path without extension: filename
            if (url.startsWith("#") && url.includes(currentName)) {
                isSelfReferencing = true;
                verboseLog(this.plugin, `Found self-referencing markdown link (fragment) in ${file.path} before custom replacements`);
                break;
            }

            // Check if decoded URL matches current file (with or without .md extension)
            const urlWithoutFragment = decodedUrl.split('#')[0];
            if (urlWithoutFragment && (
                urlWithoutFragment === `${currentName}.md` ||
                urlWithoutFragment === currentName ||
                urlWithoutFragment === `${pathWithoutExt}.md` ||
                urlWithoutFragment === pathWithoutExt
            )) {
                isSelfReferencing = true;
                verboseLog(this.plugin, `Found self-referencing markdown link (percent-encoded) in ${file.path} before custom replacements`);
                break;
            }
        }

        // Apply custom replacements to titleSourceLine (before forbidden char processing)
        let newTitle = titleSourceLine;

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
                    currentLine: newTitle
                });

                let tempLine = newTitle;

                if (replacement.onlyWholeLine) {
                    // Only replace if the entire line matches
                    if (newTitle.trim() === replacement.searchText.trim()) {
                        tempLine = replacement.replaceText;
                        verboseLog(this.plugin, `Applied whole line replacement:`, { from: newTitle, to: tempLine });
                    }
                } else if (replacement.onlyAtStart) {
                    if (tempLine.startsWith(replacement.searchText)) {
                        tempLine = replacement.replaceText + tempLine.slice(replacement.searchText.length);
                        verboseLog(this.plugin, `Applied start replacement:`, { from: newTitle, to: tempLine });
                    }
                } else {
                    const beforeReplace = tempLine;
                    tempLine = tempLine.replaceAll(replacement.searchText, replacement.replaceText);
                    if (beforeReplace !== tempLine) {
                        verboseLog(this.plugin, `Applied general replacement:`, { from: beforeReplace, to: tempLine });
                    }
                }

                newTitle = tempLine;
            }
        }

        // If custom replacements resulted in empty string or whitespace only, use "Untitled"
        if (newTitle.trim() === '') {
            newTitle = t('untitled');
        }

        verboseLog(this.plugin, isSelfReferencing ? `Self-reference found in ${file.path}` : `No self-reference found in ${file.path}`);

        // Extract title from newTitle (custom replacements already applied above)
        // titleSourceLine already determined (card links and code blocks handled earlier)
        newTitle = extractTitle(newTitle, this.plugin.settings);
        verboseLog(this.plugin, `Extracted title from ${file.path}`, {
            firstNonEmptyLine: firstNonEmptyLine,
            titleSourceLine: titleSourceLine,
            extracted: newTitle
        });

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

        // Process forbidden characters in newTitle
        const titleBeforeForbiddenCharProcessing = newTitle;
        newTitle = "";

        for (let i: number = 0; i < titleBeforeForbiddenCharProcessing.length; i++) {
            if (newTitle.length >= this.plugin.settings.charCount - 1) {
                newTitle = newTitle.trimEnd();
                newTitle += "…";
                break;
            }
            let char = titleBeforeForbiddenCharProcessing[i];

            if (char === '.') {
                // Special handling for dots - only forbidden at filename start
                if (newTitle === '') {
                    // Dot at start of filename
                    if (this.plugin.settings.enableForbiddenCharReplacements && this.plugin.settings.charReplacementEnabled.dot) {
                        const replacement = charMap['.'] || '';
                        if (replacement !== '') {
                            // Check for whitespace trimming
                            if (this.plugin.settings.charReplacementTrimRight.dot) {
                                // Skip upcoming whitespace characters
                                while (i + 1 < titleBeforeForbiddenCharProcessing.length && /\s/.test(titleBeforeForbiddenCharProcessing[i + 1])) {
                                    i++;
                                }
                            }
                            newTitle += replacement;
                            verboseLog(this.plugin, `Replaced leading dot with \`${replacement}\` in ${file.path}`);
                        }
                        // If replacement is empty, omit the dot (don't add anything)
                    }
                    // If dot replacement is disabled, omit the dot (don't add anything)
                } else {
                    // Dot not at start - always keep it
                    newTitle += '.';
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
                                // Remove trailing whitespace from newTitle
                                newTitle = newTitle.trimEnd();
                            }

                            // Check if we should trim whitespace to the right
                            if (this.plugin.settings.charReplacementTrimRight[settingKey]) {
                                // Skip upcoming whitespace characters
                                while (i + 1 < titleBeforeForbiddenCharProcessing.length && /\s/.test(titleBeforeForbiddenCharProcessing[i + 1])) {
                                    i++;
                                }
                            }
                        }
                    }
                }

                if (shouldReplace && replacement !== '') {
                    newTitle += replacement;
                    verboseLog(this.plugin, `Replaced forbidden char \`${char}\` with \`${replacement}\` in ${file.path}`);
                }
                // If master toggle is off, individual toggle is off, or replacement is empty, omit the character (continue to next char)
            } else {
                newTitle += char;
            }
        }

        newTitle = newTitle
            .trim()
            .replace(/\s+/g, " ");

        // Check if filename is empty or a forbidden name
        const isForbiddenName =
            newTitle === "" ||
            forbiddenNames.includes(newTitle.toUpperCase());
        if (isForbiddenName) {
            newTitle = t('untitled');
            verboseLog(this.plugin, `Using fallback name \`${t('untitled')}\` for ${file.path}`);
        }

        const parentPath =
            file.parent?.path === "/" ? "" : file.parent?.path + "/";

        let newPath: string = `${parentPath}${newTitle}.md`;

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

                    // File passed exclusion checks - process aliases when enabled
                    if (this.plugin.settings.enableAliases) {
                        await this.plugin.aliasManager.updateAliasIfNeeded(file, originalContentWithFrontmatter, newTitle);
                    }

                    // Show notification for manual renames only (not batch operations)
                    if (showNotices && !isBatchOperation) {
                        // Extract actual final filename from newPath (includes counter)
                        const finalFileName = newPath.replace(/\.md$/, '').split('/').pop() || newTitle;
                        const titleChanged = currentName !== finalFileName;
                        const shouldShowNotice =
                            this.plugin.settings.manualNotificationMode === 'Always' ||
                            (this.plugin.settings.manualNotificationMode === 'On title change' && titleChanged);

                        if (shouldShowNotice) {
                            verboseLog(this.plugin, `Showing notice: Updated title: ${currentName} → ${finalFileName}`);
                            new Notice(t('notifications.renamedTo').replace('{{filename}}', finalFileName));
                        }
                    }

                    return { success: false, reason: 'no-rename-needed' };
                }
                counter += 1;
                newPath = `${parentPath}${newTitle} ${counter}.md`;
                fileExists = this.checkFileExistsCaseInsensitive(newPath);
            }
            verboseLog(this.plugin, `Found available filename with counter ${counter}: ${newPath}`);
        } else {
            verboseLog(this.plugin, `No conflicts found for ${newPath}, proceeding without counter`);
        }

        // Only check for self-reference if filename would actually change (after handling counter)
        if (isSelfReferencing) {
            // Only show notice if not a batch operation
            if (!isBatchOperation) {
                // Rate limit: show notice max once per 2 seconds per file
                const now = Date.now();
                const lastNoticeTime = this.lastSelfRefNotice.get(file.path) || 0;
                if (now - lastNoticeTime >= 2000) {
                    verboseLog(this.plugin, `Showing notice: File not renamed due to self-referential link in first line: ${file.basename}`);
                    new Notice(t('notifications.notRenamedSelfReference').replace('{{filename}}', file.basename));
                    this.lastSelfRefNotice.set(file.path, now);
                }
            }
            verboseLog(this.plugin, `Skipping self-referencing file: ${file.path}`);
            return { success: false, reason: 'self-referential' };
        }

        if (noDelay) {
            cacheManager?.reservePath(newPath);
        }

        // File passed exclusion checks - process aliases when enabled
        if (this.plugin.settings.enableAliases) {
            await this.plugin.aliasManager.updateAliasIfNeeded(file, originalContentWithFrontmatter, newTitle);
        }

        try {

            // Mark as batch operation for debug output exclusion
            if (isBatchOperation) {
                this.plugin.markBatchOperationStart(file.path);
            }

            // Mark as FLIT modification for debug output
            this.plugin.markFlitModificationStart(file.path);

            const oldPath = file.path;
            await this.plugin.app.fileManager.renameFile(file, newPath);
            const processingTime = Date.now() - startTime;
            verboseLog(this.plugin, `Successfully renamed ${oldPath} to ${newPath} (${processingTime}ms)`);

            // Mark FLIT modification end
            this.plugin.markFlitModificationEnd(newPath);

            // Mark batch operation end
            if (isBatchOperation) {
                this.plugin.markBatchOperationEnd(newPath);
            }

            // Update lastEditorContent with new path
            const lastContent = this.lastEditorContent.get(oldPath);
            if (lastContent !== undefined) {
                this.lastEditorContent.delete(oldPath);
                this.lastEditorContent.set(newPath, lastContent);
            }

            // Update title region cache key
            this.updateTitleRegionCacheKey(oldPath, newPath);

            // Notify cache manager of rename
            cacheManager?.notifyFileRenamed(oldPath, newPath);

            // Show notification for manual renames only (not batch operations)
            if (showNotices && !isBatchOperation) {
                // Extract actual final filename from newPath (includes counter if added)
                const finalFileName = newPath.replace(/\.md$/, '').split('/').pop() || newTitle;
                const titleChanged = currentName !== finalFileName;
                const shouldShowNotice =
                    this.plugin.settings.manualNotificationMode === 'Always' ||
                    (this.plugin.settings.manualNotificationMode === 'On title change' && titleChanged);

                if (shouldShowNotice) {
                    verboseLog(this.plugin, `Showing notice: Updated title: ${currentName} → ${finalFileName}`);
                    new Notice(t('notifications.renamedTo').replace('{{filename}}', finalFileName));
                }
            }

            return { success: true };
        } catch (error) {
            console.error(`Failed to rename file ${file.path} to ${newPath}:`, error);
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
        verboseLog(this.plugin, 'Cache cleanup completed');
    }

    // Getter for lastEditorContent (for use in main.ts)
    getLastEditorContent(path: string): string | undefined {
        return this.lastEditorContent.get(path);
    }

    // Setter for lastEditorContent (for use in main.ts)
    setLastEditorContent(path: string, content: string): void {
        this.lastEditorContent.set(path, content);
    }

    // Delete method for lastEditorContent (for use in main.ts)
    deleteLastEditorContent(path: string): void {
        this.lastEditorContent.delete(path);
    }

    // ==================== TITLE REGION CACHE MANAGEMENT ====================

    /**
     * Clear all title region cache entries (used when settings change)
     */
    clearTitleRegionCache(): void {
        this.titleRegionCache.clear();
        verboseLog(this.plugin, 'Cleared title region cache');
    }

    /**
     * Delete title region cache entry for a specific file
     */
    deleteTitleRegionCache(path: string): void {
        this.titleRegionCache.delete(path);
        verboseLog(this.plugin, `Deleted title region cache for: ${path}`);
    }

    /**
     * Update title region cache key when file is renamed
     */
    updateTitleRegionCacheKey(oldPath: string, newPath: string): void {
        const cached = this.titleRegionCache.get(oldPath);
        if (cached) {
            this.titleRegionCache.delete(oldPath);
            this.titleRegionCache.set(newPath, cached);
            verboseLog(this.plugin, `Updated title region cache key: ${oldPath} → ${newPath}`);
        }
    }
}