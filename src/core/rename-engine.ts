import { TFile, Editor, Notice } from "obsidian";
import { PluginSettings } from '../types';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from '../constants';
import {
    verboseLog,
    detectOS,
    shouldProcessFile,
    hasDisablePropertyInFile,
    containsSafeword,
    extractTitle,
    isValidHeading
} from '../utils';

import FirstLineIsTitle from '../../main';

// Cache manager now accessed via plugin instance
export class RenameEngine {
    private plugin: FirstLineIsTitle;
    private lastProcessedContent = new Map<string, string>();
    private filesCurrentlyProcessing = new Set<number>(); // Track by file.stat.ctime (stable across renames)
    private filesNeedingRecheck = new Set<number>(); // Track files that had edits blocked during processing
    private fileTimeTracker = new Map<string, {timestamp: number, count: number}>();
    private globalOperationTracker = {timestamp: Date.now(), count: 0};
    private lastSelfRefNotice = new Map<string, number>();

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
            // Check if file is already being processed using stable identifier
            const fileId = file.stat.ctime;
            if (this.filesCurrentlyProcessing.has(fileId)) {
                verboseLog(this.plugin, `Editor change ignored - file already processing (ID ${fileId}): ${file.path}`);
                // Flag this file for recheck after processing completes
                this.filesNeedingRecheck.add(fileId);
                return;
            }

            if (this.plugin.aliasManager.isAliasUpdateInProgress(file.path)) {
                verboseLog(this.plugin, `Editor change ignored - alias update in progress: ${file.path}`);
                return;
            }

            const currentContent = editor.getValue();
            const lines = currentContent.split('\n');
            let firstLineIndex = 0;

            if (lines.length > 0 && lines[0].trim() === '---') {
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === '---') {
                        firstLineIndex = i + 1;
                        break;
                    }
                }
            }

            const metadata = this.plugin.app.metadataCache.getFileCache(file);

            let firstLine = '';
            for (let i = firstLineIndex; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim() !== '') {
                    firstLine = line;
                    break;
                }
            }

            // Extract final title using same logic as processFile to track changes accurately
            let trackingContent = firstLine;

            // Build content without frontmatter from lines
            const contentWithoutFrontmatter = lines.slice(firstLineIndex).join('\n');
            const trimmedFirstLine = firstLine.trim();

            // Check for card link - extract title
            if (this.plugin.settings.grabTitleFromCardLink && trimmedFirstLine.match(/^```(embed|cardlink)$/)) {
                const allLines = contentWithoutFrontmatter.split('\n');
                let nonEmptyCount = 0;
                for (let i = 0; i < allLines.length; i++) {
                    const line = allLines[i].trim();
                    if (line === '') continue;

                    nonEmptyCount++;
                    if (nonEmptyCount === 1) continue;
                    if (nonEmptyCount > 10) break;

                    if (line.startsWith('title:')) {
                        let title = line.substring(6).trim();
                        if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
                            title = title.substring(1, title.length - 1);
                        }
                        trackingContent = title;
                        break;
                    }
                    if (line.startsWith('```')) {
                        trackingContent = 'Untitled';
                        break;
                    }
                }
            }
            // Check for code block - pass 2 lines to extractTitle
            else if (trimmedFirstLine.startsWith('```') && !trimmedFirstLine.match(/^```(embed|cardlink)$/)) {
                const contentLines = contentWithoutFrontmatter.split('\n');
                let extractedLines: string[] = [];
                for (const line of contentLines) {
                    if (line.trim() !== '') {
                        extractedLines.push(line);
                        if (extractedLines.length >= 2) break;
                    }
                }
                trackingContent = extractTitle(extractedLines.join('\n'), this.plugin.settings);
            }
            // Normal content - just use extractTitle
            else {
                trackingContent = extractTitle(firstLine, this.plugin.settings);
            }

            const lastContent = this.lastProcessedContent.get(file.path);

            if (trackingContent !== lastContent) {
                const timeSinceStart = Date.now() - startTime;
                verboseLog(this.plugin, `[TIMING] KEYSTROKE: ${file.path} - "${lastContent}" -> "${trackingContent}" (processed in ${timeSinceStart}ms)`);

                // Update tracking BEFORE async processing to prevent duplicate triggers
                this.lastProcessedContent.set(file.path, trackingContent);
                this.plugin.editorLifecycle.updateLastFirstLine(file.path, trackingContent);

                // Mark file as being processed
                this.filesCurrentlyProcessing.add(fileId);

                try {
                    await this.processFileImmediate(file, currentContent, metadata);
                } finally {
                    // Always remove from processing set when done
                    this.filesCurrentlyProcessing.delete(fileId);

                    // RECHECK: Only if edit was blocked during processing
                    if (this.filesNeedingRecheck.has(fileId)) {
                        this.filesNeedingRecheck.delete(fileId);

                        const currentEditorContent = editor.getValue();
                        const recheckLines = currentEditorContent.split('\n');
                        let recheckFirstLine = '';
                        let recheckFirstLineIndex = 0;

                        // Skip frontmatter
                        if (recheckLines.length > 0 && recheckLines[0].trim() === '---') {
                            for (let i = 1; i < recheckLines.length; i++) {
                                if (recheckLines[i].trim() === '---') {
                                    recheckFirstLineIndex = i + 1;
                                    break;
                                }
                            }
                        }

                        // Find first non-empty line
                        for (let i = recheckFirstLineIndex; i < recheckLines.length; i++) {
                            if (recheckLines[i].trim() !== '') {
                                recheckFirstLine = recheckLines[i];
                                break;
                            }
                        }

                        const recheckContent = extractTitle(recheckFirstLine, this.plugin.settings);
                        const currentlyProcessed = this.lastProcessedContent.get(file.path);

                        if (recheckContent !== currentlyProcessed) {
                            verboseLog(this.plugin, `RECHECK: Content changed during processing, triggering final check: ${file.path}`);
                            // One recheck is sufficient - normal editor-change events will catch further edits
                            setTimeout(() => this.processEditorChangeOptimal(editor, file), 0);
                        }
                    }
                }
            } else {
                verboseLog(this.plugin, `Editor change ignored - no first line change: ${file.path}`);
            }
        } catch (error) {
            console.error(`Error in optimal editor-change processing for ${file.path}:`, error);
        }
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
        exclusionOverrides?: { ignoreFolder?: boolean; ignoreTag?: boolean; ignoreProperty?: boolean },
        isManualCommand = false
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

        // ═══════════════════════════════════════════════════════════════════════════════
        // ABSOLUTE FIRST-GATE: Disable Property Check
        // ═══════════════════════════════════════════════════════════════════════════════
        // This check MUST occur first and CANNOT be bypassed by:
        // - Any command (manual rename, "unless excluded", etc.)
        // - exclusionOverrides parameter
        // - Batch operations
        // - Any other mechanism
        //
        // If a file has the disable property (default: no rename:true), it will
        // NEVER be processed by this plugin under any circumstances.
        // ═══════════════════════════════════════════════════════════════════════════════
        if (await hasDisablePropertyInFile(file, this.plugin.app, this.plugin.settings.disableRenamingKey, this.plugin.settings.disableRenamingValue)) {
            verboseLog(this.plugin, `ABSOLUTE BLOCK: Skipping file with disable property: ${file.path}`);

            // Show notice for manual commands
            if (showNotices && !isBatchOperation) {
                new Notice('Property to disable renaming prevents rename.');
            }

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

        // ═══════════════════════════════════════════════════════════════════════════════
        // SECOND-GATE: Folder/Tag/Property Exclusion Checks
        // ═══════════════════════════════════════════════════════════════════════════════
        // Unlike the disable property check above, these exclusions CAN be bypassed by:
        // - Manual single-file commands (via exclusionOverrides parameter)
        // - Commands like "Put first line in title" which intentionally override exclusions
        //
        // The exclusionOverrides parameter allows selective bypassing:
        // - ignoreFolder: Skip folder-based exclusion checks
        // - ignoreTag: Skip tag-based exclusion checks
        // - ignoreProperty: Skip property-based exclusion checks
        // ═══════════════════════════════════════════════════════════════════════════════
        if (!shouldProcessFile(file, this.plugin.settings, this.plugin.app, initialContent, exclusionOverrides)) {
            verboseLog(this.plugin, `Skipping file based on include/exclude strategy: ${file.path}`);
            return { success: false, reason: 'excluded' };
        }

        // Skip all delay logic - process immediately
        const startTime = Date.now();
        verboseLog(this.plugin, `RENAME: Starting renameFile for ${file.name}`);

        // Get previous content to detect content deletion
        const cacheManager = this.plugin.cacheManager;
        const previousFileContent = cacheManager?.getContent(file.path);

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

        // If first line is empty (no content after frontmatter)
        if (firstLine === '') {
            // Check if file had previous content
            const previousContentWithoutFrontmatter = previousFileContent
                ? this.stripFrontmatterFromContent(previousFileContent, file)
                : '';
            const hadPreviousContent = previousContentWithoutFrontmatter.trim() !== '';

            if (hadPreviousContent) {
                // Content was deleted - rename to Untitled
                verboseLog(this.plugin, `Content became empty - renaming to Untitled: ${file.path}`);
                firstLine = 'Untitled';
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
            if (!isValidHeading(firstLine)) {
                verboseLog(this.plugin, `Skipping file - first line is not a valid heading: ${file.path}`);
                return { success: false, reason: 'not-heading' };
            }
        }

        // Check for card links if enabled - extract title but continue to normal processing
        if (this.plugin.settings.grabTitleFromCardLink) {
            // Check if first non-empty line is ```embed or ```cardlink
            const cardLinkMatch = firstLine.trim().match(/^```(embed|cardlink)$/);
            if (cardLinkMatch) {
                // Found embed or cardlink at start, parse lines until we find title: or closing ```
                const allLines = contentWithoutFrontmatter.split('\n');
                let foundTitle = false;
                let nonEmptyCount = 0;
                for (let i = 0; i < allLines.length; i++) {
                    const line = allLines[i].trim();
                    if (line === '') continue;

                    nonEmptyCount++;
                    // Skip first non-empty line (the opening ```embed/```cardlink)
                    if (nonEmptyCount === 1) continue;

                    if (nonEmptyCount > 10) break;

                    // Check for title line
                    if (line.startsWith('title:')) {
                        let title = line.substring(6).trim();
                        // Remove quotes if present
                        if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
                            title = title.substring(1, title.length - 1);
                        }
                        firstLine = title;
                        foundTitle = true;
                        verboseLog(this.plugin, `Found ${cardLinkMatch[1]} card link in ${file.path}`, { title: firstLine });
                        break;
                    }
                    // Check for closing ``` before finding title
                    if (line.startsWith('```')) {
                        firstLine = 'Untitled';
                        verboseLog(this.plugin, `Card link in ${file.path} has no title, using Untitled`);
                        break;
                    }
                }
                if (!foundTitle && firstLine !== 'Untitled') {
                    // Reached limit without finding title or closing
                    firstLine = 'Untitled';
                }
            }
        }

        // Store current content for next check in cache (only if not handled above)
        // Don't update cache if content became empty and we're renaming to Untitled (prevents cache poisoning)
        const contentBecameEmpty = contentWithoutFrontmatter.trim() === '' && firstLine === 'Untitled';
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

        // Check for self-referencing wikilink in original first line (before custom replacements)
        if (wikiLinkRegex.test(firstLine)) {
            isSelfReferencing = true;
            verboseLog(this.plugin, `Found self-referencing wikilink in ${file.path} before custom replacements`);
        }

        // Check for self-referencing Markdown link by parsing the actual URL (ignoring link text)
        let match;
        while ((match = markdownLinkRegex.exec(firstLine)) !== null) {
            const url = match[2];

            // Decode percent-encoding for comparison
            let decodedUrl = url;
            try {
                decodedUrl = decodeURIComponent(url);
            } catch (e) {
                // Invalid encoding, use original
            }

            // Check various self-reference patterns:
            // 1. Fragment-only: #heading (always self-referencing)
            // 2. Relative path with .md: filename.md or path/filename.md
            // 3. Relative path without extension: filename
            if (url.startsWith("#")) {
                // Fragment-only links always reference current file
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
        // For code block detection, pass first 2 lines if first line starts with ``` (but not card links)
        let contentForExtraction = processedTitle;
        const trimmedFirstLine = firstLine.trim();
        if (trimmedFirstLine.startsWith('```') && !trimmedFirstLine.match(/^```(embed|cardlink)$/)) {
            // Extract first 2 non-empty lines after frontmatter for code block pattern matching
            const contentLines = contentWithoutFrontmatter.split('\n');
            let extractedLines: string[] = [];
            for (const line of contentLines) {
                if (line.trim() !== '') {
                    extractedLines.push(line);
                    if (extractedLines.length >= 2) break;
                }
            }
            contentForExtraction = extractedLines.join('\n');
        }
        const extractedTitle = extractTitle(contentForExtraction, this.plugin.settings);
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
        if (file.path === newPath) {
            verboseLog(this.plugin, `No rename needed for ${file.path} - already has correct name`);

            // Log for manual commands even when no rename needed
            if (isManualCommand) {
                console.log(`Renamed to: ${currentName}\nOriginal filename: ${currentName}`);
            }

            // File passed exclusion checks - process aliases when enabled (immediate since no file rename)
            if (this.plugin.settings.enableAliases) {
                await this.plugin.aliasManager.updateAliasIfNeeded(file, originalContentWithFrontmatter);
            }

            // Show notification for manual commands when no rename needed
            verboseLog(this.plugin, `Notification check (no rename): showNotices=${showNotices}, isBatchOperation=${isBatchOperation}, manualNotificationMode=${this.plugin.settings.manualNotificationMode}`);
            if (showNotices && !isBatchOperation) {
                const shouldShowNotice = this.plugin.settings.manualNotificationMode === 'Always';
                verboseLog(this.plugin, `shouldShowNotice (no rename)=${shouldShowNotice}`);
                if (shouldShowNotice) {
                    verboseLog(this.plugin, `Showing notice: Renamed to: ${currentName}`);
                    new Notice(`Renamed to: ${currentName}`);
                }
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
                if (file.path === newPath) {
                    verboseLog(this.plugin, `No rename needed for ${file.path} - already has correct name with counter`);
                    // Note: Alias was already handled earlier in the function
                    return { success: false, reason: 'no-rename-needed' };
                }
                counter += 1;
                newPath = `${parentPath}${newFileName} ${counter}.md`;
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
                    new Notice(`Note not renamed due to self-referential link in first line: ${file.basename}`);
                    this.lastSelfRefNotice.set(file.path, now);
                }
            }
            verboseLog(this.plugin, `Skipping self-referencing file: ${file.path}`);
            return { success: false, reason: 'self-referential' };
        }

        if (noDelay) {
            cacheManager?.reservePath(newPath);
        }

        try {

            // Mark as batch operation for debug output exclusion
            if (isBatchOperation) {
                this.plugin.markBatchOperationStart(file.path);
            }

            // Mark as FLIT modification for debug output
            this.plugin.markFlitModificationStart(file.path);

            const oldPath = file.path;
            const oldBasename = file.basename;

            // Log original filename on first rename only OR when manual command is run
            if (cacheManager?.isFirstRename(oldPath) || isManualCommand) {
                const newBasename = newPath.replace(/\.md$/, '').split('/').pop() || newFileName;
                console.log(`Renamed to: ${newBasename}\nOriginal filename: ${oldBasename}`);
                if (!isManualCommand) {
                    cacheManager.markFileRenamed(oldPath);
                }
            }

            await this.plugin.app.fileManager.renameFile(file, newPath);
            const processingTime = Date.now() - startTime;
            verboseLog(this.plugin, `Successfully renamed ${oldPath} to ${newPath} (${processingTime}ms)`);

            // Mark FLIT modification end
            this.plugin.markFlitModificationEnd(newPath);

            // Mark batch operation end
            if (isBatchOperation) {
                this.plugin.markBatchOperationEnd(newPath);
            }

            // Update cache with new path
            const lastContent = this.lastProcessedContent.get(oldPath);
            if (lastContent !== undefined) {
                this.lastProcessedContent.delete(oldPath);
                this.lastProcessedContent.set(newPath, lastContent);
            }

            // Notify cache manager of rename
            cacheManager?.notifyFileRenamed(oldPath, newPath);

            // File passed exclusion checks - process aliases when enabled AFTER rename
            if (this.plugin.settings.enableAliases) {
                // Get fresh file reference from vault after rename
                const renamedFile = this.plugin.app.vault.getAbstractFileByPath(newPath);
                if (renamedFile && renamedFile instanceof TFile) {
                    await this.plugin.aliasManager.updateAliasIfNeeded(renamedFile, originalContentWithFrontmatter, newFileName);
                }
            }

            // Show notification for manual renames only (not batch operations)
            verboseLog(this.plugin, `Notification check: showNotices=${showNotices}, isBatchOperation=${isBatchOperation}, manualNotificationMode=${this.plugin.settings.manualNotificationMode}`);
            if (showNotices && !isBatchOperation) {
                // Extract actual final filename from newPath (includes counter if added)
                const finalFileName = newPath.replace(/\.md$/, '').split('/').pop() || newFileName;
                const titleChanged = currentName !== finalFileName;
                verboseLog(this.plugin, `Notification details: currentName=${currentName}, finalFileName=${finalFileName}, titleChanged=${titleChanged}`);
                const shouldShowNotice =
                    this.plugin.settings.manualNotificationMode === 'Always' ||
                    (this.plugin.settings.manualNotificationMode === 'On title change' && titleChanged);

                verboseLog(this.plugin, `shouldShowNotice=${shouldShowNotice}`);
                if (shouldShowNotice) {
                    verboseLog(this.plugin, `Showing notice: Updated title: ${currentName} → ${finalFileName}`);
                    new Notice(`Renamed to: ${finalFileName}`);
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