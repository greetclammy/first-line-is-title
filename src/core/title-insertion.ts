import { TFile, MarkdownView } from "obsidian";
import FirstLineIsTitle from '../../main';
import { verboseLog } from '../utils';
import { TITLE_CHAR_REVERSAL_MAP } from '../constants';

export class TitleInsertion {
    private plugin: FirstLineIsTitle;

    constructor(plugin: FirstLineIsTitle) {
        this.plugin = plugin;
    }

    async insertTitleOnCreation(file: TFile): Promise<void> {
        try {
            // Check if filename is "Untitled" or "Untitled n" (where n is any integer)
            const untitledPattern = /^Untitled(\s\d+)?$/;
            if (untitledPattern.test(file.basename)) {
                verboseLog(this.plugin, `Skipping title insertion for untitled file: ${file.path}`);
                return;
            }

            // Read current file content
            let content: string;
            try {
                content = await this.plugin.app.vault.read(file);
            } catch (error) {
                console.error(`Failed to read file ${file.path} for title insertion:`, error);
                return;
            }

            // Debug: log what content we found
            verboseLog(this.plugin, `Title insertion delay complete. File content length: ${content.length} chars, trimmed: "${content.trim()}"`);

            // Check if file already has content (skip if not empty)
            if (content.trim() !== '') {
                verboseLog(this.plugin, `Skipping title insertion - file already has content: ${file.path}`);
                return;
            }

            // Get clean title by reversing forbidden character replacements
            let cleanTitle = file.basename;

            // Apply character reversal mapping
            for (const [forbiddenChar, normalChar] of Object.entries(TITLE_CHAR_REVERSAL_MAP)) {
                cleanTitle = cleanTitle.replaceAll(forbiddenChar, normalChar);
            }

            verboseLog(this.plugin, `Inserting title "${cleanTitle}" in new file: ${file.path}`);

            // Check if we're in canvas view to decide cursor behavior
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            const inCanvas = !activeView; // If no markdown view, likely in canvas or other view

            // Create content with title and cursor positioning
            let newContent = cleanTitle;

            // Only add cursor if not in canvas and moveCursorToFirstLine is enabled
            if (!inCanvas && this.plugin.settings.moveCursorToFirstLine) {
                if (this.plugin.settings.placeCursorAtLineEnd) {
                    newContent += "\n"; // Place cursor at end of title line
                } else {
                    newContent += "\n"; // Place cursor on new line after title
                }
            } else {
                newContent += "\n"; // Always add at least one newline after title
            }

            // Re-read current content with retry logic (template may still be applying)
            let currentContent: string;
            let retryCount = 0;
            const maxRetries = 3;
            const retryDelay = 500;

            do {
                try {
                    currentContent = await this.plugin.app.vault.read(file);
                    verboseLog(this.plugin, `Re-read file content (attempt ${retryCount + 1}). Length: ${currentContent.length} chars`);

                    if (currentContent.trim() !== '') {
                        verboseLog(this.plugin, `Template content found after ${retryCount + 1} attempts`);
                        break; // Template applied, stop retrying
                    }

                    if (retryCount < maxRetries - 1) {
                        verboseLog(this.plugin, `File still empty, retrying in ${retryDelay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }

                } catch (error) {
                    console.error(`Failed to re-read file ${file.path} for title insertion:`, error);
                    return;
                }
                retryCount++;
            } while (retryCount < maxRetries && currentContent.trim() === '');

            // If file now has content (template applied), insert title properly
            if (currentContent.trim() !== '') {
                verboseLog(this.plugin, `File now has template content, inserting title into existing content`);

                // Use metadata cache to find where to insert title
                const metadata = this.plugin.app.metadataCache.getFileCache(file);
                const lines = currentContent.split('\n');

                if (metadata?.frontmatterPosition) {
                    // Insert title after frontmatter
                    const insertLine = metadata.frontmatterPosition.end.line + 1;
                    lines.splice(insertLine, 0, cleanTitle);
                    verboseLog(this.plugin, `Inserted title after frontmatter at line ${insertLine}`);
                } else {
                    // Insert title at beginning
                    lines.unshift(cleanTitle);
                    verboseLog(this.plugin, `Inserted title at beginning of file`);
                }

                const finalContent = lines.join('\n');
                await this.plugin.app.vault.modify(file, finalContent);
            } else {
                // File still empty, use original behavior
                verboseLog(this.plugin, `File still empty, inserting title as new content`);
                await this.plugin.app.vault.modify(file, newContent);
            }

            // Handle cursor positioning and view mode if file is currently open
            if (!inCanvas && this.plugin.settings.moveCursorToFirstLine) {
                setTimeout(() => {
                    this.handleCursorPositioning(file);
                }, 50);
            }

            verboseLog(this.plugin, `Successfully inserted title in ${file.path}`);

        } catch (error) {
            console.error(`Error inserting title on creation for ${file.path}:`, error);
        }
    }

    private async handleCursorPositioning(file: TFile): Promise<void> {
        try {
            verboseLog(this.plugin, `handleCursorPositioning called for ${file.path}`);
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
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
                const metadata = this.plugin.app.metadataCache.getFileCache(file);
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

                if (this.plugin.settings.placeCursorAtLineEnd) {
                    // Move to end of title line
                    activeView.editor?.setCursor({ line: titleLineNumber, ch: titleLineLength });
                    verboseLog(this.plugin, `Moved cursor to end of title line ${titleLineNumber} (${titleLineLength} chars) via handleCursorPositioning for ${file.path}`);
                } else {
                    // Move to line after title
                    activeView.editor?.setCursor({ line: titleLineNumber + 1, ch: 0 });
                    verboseLog(this.plugin, `Moved cursor to line after title (line ${titleLineNumber + 1}) via handleCursorPositioning for ${file.path}`);
                }
            } else {
                verboseLog(this.plugin, `Skipping cursor positioning - no matching active view for ${file.path}`);
            }
        } catch (error) {
            console.error(`Error positioning cursor for ${file.path}:`, error);
        }
    }
}
