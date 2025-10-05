import { TFile, TFolder, MarkdownView, Notice } from "obsidian";
import { PluginSettings } from '../types';
import { verboseLog } from '../utils';
import { TITLE_CHAR_REVERSAL_MAP } from '../constants';
import FirstLineIsTitle from '../../main';

// Global variables for file operations (imported from main)
declare global {
    var tempNewPaths: string[];
    var previousContent: Map<string, string>;
}

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
     * Cleans up stale entries from global caches
     */
    cleanupStaleCache(): void {
        // Clean up tempNewPaths - remove paths that don't exist anymore
        if (typeof tempNewPaths !== 'undefined') {
            tempNewPaths = tempNewPaths.filter(path => {
                return this.app.vault.getAbstractFileByPath(path) !== null;
            });
        }

        // Clean up previousContent - remove entries for files that don't exist anymore
        if (typeof previousContent !== 'undefined') {
            for (const [path, content] of previousContent) {
                if (!this.app.vault.getAbstractFileByPath(path)) {
                    previousContent.delete(path);
                }
            }
        }

        verboseLog(this.plugin, 'Cache cleanup completed');
    }

    /**
     * Inserts the filename as the first line of a newly created file
     * @returns true if title was inserted, false if skipped
     */
    async insertTitleOnCreation(file: TFile): Promise<boolean> {
        try {
            // Check if filename is "Untitled" or "Untitled n" (where n is any integer)
            const untitledPattern = /^Untitled(\s\d+)?$/;
            if (untitledPattern.test(file.basename)) {
                verboseLog(this.plugin, `Skipping title insertion for untitled file: ${file.path}`);
                return false;
            }

            // Read current file content
            let content: string;
            try {
                content = await this.app.vault.read(file);
            } catch (error) {
                console.error(`Failed to read file ${file.path} for title insertion:`, error);
                return false;
            }

            // Debug: log what content we found
            verboseLog(this.plugin, `Title insertion delay complete. File content length: ${content.length} chars, trimmed: "${content.trim()}"`);

            // Check if file already has content (skip if not empty)
            if (content.trim() !== '') {
                verboseLog(this.plugin, `Skipping title insertion - file already has content: ${file.path}`);
                return false;
            }

            // Get clean title by reversing forbidden character replacements
            let cleanTitle = file.basename;

            // Apply character reversal mapping
            for (const [forbiddenChar, normalChar] of Object.entries(TITLE_CHAR_REVERSAL_MAP)) {
                cleanTitle = cleanTitle.replaceAll(forbiddenChar, normalChar);
            }

            verboseLog(this.plugin, `Inserting title "${cleanTitle}" in new file: ${file.path}`);

            // Wait for template plugins to apply templates if enabled
            // Both newNoteDelay and waitForTemplate delays start from file creation
            // Total wait = max(newNoteDelay, 2500ms if waitForTemplate is ON)
            if (this.settings.waitForTemplate) {
                const remainingWait = 2500 - this.settings.newNoteDelay;
                if (remainingWait > 0) {
                    // For Cache/File read methods, wait the full duration (no event-based detection)
                    if (this.settings.fileReadMethod === 'Cache' || this.settings.fileReadMethod === 'File') {
                        verboseLog(this.plugin, `Waiting full ${remainingWait}ms for template (${this.settings.fileReadMethod} read method)`);
                        await new Promise(resolve => setTimeout(resolve, remainingWait));
                    } else {
                        // For Editor read method, use event-based YAML detection
                        await this.waitForYamlOrTimeout(file, remainingWait);
                    }
                } else {
                    verboseLog(this.plugin, `Skipping template wait - newNoteDelay (${this.settings.newNoteDelay}ms) already >= 2500ms`);
                }
            }

            // Get content from editor (always current) or fallback to vault
            let currentContent: string;
            try {
                // Try to get content from active editor first (most current)
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.file?.path === file.path && activeView.editor) {
                    currentContent = activeView.editor.getValue();
                    verboseLog(this.plugin, `Read file content from editor. Length: ${currentContent.length} chars`);
                } else {
                    // Fallback to vault read
                    currentContent = await this.app.vault.read(file);
                    verboseLog(this.plugin, `Read file content from vault. Length: ${currentContent.length} chars`);
                }
            } catch (error) {
                console.error(`Failed to read file ${file.path} for title insertion:`, error);
                return false;
            }

            // Check if template was applied
            if (currentContent.trim() !== '') {
                verboseLog(this.plugin, `File has template content, inserting title into existing content`);

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

                if (yamlEndLine !== -1) {
                    // Insert title after YAML
                    const insertLine = yamlEndLine + 1;
                    lines.splice(insertLine, 0, cleanTitle);
                    verboseLog(this.plugin, `Inserted title after frontmatter at line ${insertLine}`);
                } else {
                    // Insert title at beginning
                    lines.unshift(cleanTitle);
                    verboseLog(this.plugin, `Inserted title at beginning of file`);
                }

                const finalContent = lines.join('\n');
                await this.app.vault.modify(file, finalContent);
            } else {
                // File still empty, insert title as new content
                verboseLog(this.plugin, `File still empty, inserting title as new content`);
                await this.app.vault.modify(file, cleanTitle + "\n");
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
     */
    private async waitForYamlOrTimeout(file: TFile, timeoutMs: number): Promise<void> {
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
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            verboseLog(this.plugin, `Active view found: ${!!activeView}, file matches: ${activeView?.file?.path === file.path}`);

            if (activeView && activeView.file?.path === file.path) {
                // Set to source mode
                await activeView.leaf.setViewState({
                    type: "markdown",
                    state: {
                        mode: "source",
                        source: false
                    }
                });

                // Focus the editor
                await activeView.editor?.focus();

                // Position cursor - find actual title line using metadata cache
                let titleLineNumber = 0;
                let titleLineLength = 0;

                // Use metadata cache to determine frontmatter position
                const metadata = this.app.metadataCache.getFileCache(file);
                if (metadata?.frontmatterPosition) {
                    // Title is on the line after frontmatter
                    titleLineNumber = metadata.frontmatterPosition.end.line + 1;
                    verboseLog(this.plugin, `Found frontmatter ending at line ${metadata.frontmatterPosition.end.line}, title on line ${titleLineNumber}`);
                } else {
                    // No frontmatter, title is on first line
                    titleLineNumber = 0;
                    verboseLog(this.plugin, `No frontmatter found, title on line ${titleLineNumber}`);
                }

                titleLineLength = activeView.editor?.getLine(titleLineNumber)?.length || 0;

                // Determine cursor position based on settings
                const shouldPlaceAtEnd = usePlaceCursorAtLineEndSetting && this.settings.placeCursorAtLineEnd;

                if (shouldPlaceAtEnd) {
                    // Move to end of title line
                    activeView.editor?.setCursor({ line: titleLineNumber, ch: titleLineLength });
                    verboseLog(this.plugin, `Moved cursor to end of title line ${titleLineNumber} (${titleLineLength} chars) via handleCursorPositioning for ${file.path}`);
                } else {
                    // Move to start of title line
                    activeView.editor?.setCursor({ line: titleLineNumber, ch: 0 });
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
     * Processes multiple files with the specified action
     */
    async processMultipleFiles(files: TFile[], action: 'rename'): Promise<void> {
        if (files.length === 0) return;

        let processed = 0;
        let skipped = 0;
        let errors = 0;

        verboseLog(this.plugin, `Showing notice: Processing ${files.length} files...`);
        new Notice(`Processing ${files.length} files...`);

        for (const file of files) {
            try {
                if (action === 'rename') {
                    const result = await this.plugin.renameEngine.attemptRename(file);
                    if (result.success) {
                        processed++;
                    } else {
                        skipped++;
                    }
                }
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
                errors++;
            }
        }

        // Show completion notice
        if (errors > 0) {
            verboseLog(this.plugin, `Showing notice: Renamed ${processed} files, skipped ${skipped}, ${errors} errors`);
            new Notice(`Renamed ${processed} files, skipped ${skipped}, ${errors} errors`);
        } else {
            verboseLog(this.plugin, `Showing notice: Renamed ${processed} files, skipped ${skipped}`);
            new Notice(`Renamed ${processed} files, skipped ${skipped}`);
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
}