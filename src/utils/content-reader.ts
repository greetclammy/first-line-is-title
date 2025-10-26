import { App, TFile, Editor, MarkdownView } from 'obsidian';
import { PluginSettings } from '../types';
import { verboseLog } from '../utils';
import FirstLineIsTitlePlugin from '../../main';

/**
 * Options for reading file content
 */
export interface ContentReaderOptions {
    /** Already have content (from editor.getValue()) */
    providedContent?: string;
    /** Already have editor instance */
    providedEditor?: Editor;
    /** Search workspace for matching editor */
    searchWorkspace?: boolean;
    /** Use vault.read instead of vault.cachedRead when falling back */
    preferFresh?: boolean;
}

/**
 * Centralized utility for reading file content with support for multiple strategies.
 * Handles Editor/Cache/File read methods and workspace editor searching.
 *
 * @param plugin - Plugin instance for settings and logging
 * @param file - File to read content from
 * @param options - Read options
 * @returns File content as string
 * @throws Error if file cannot be read
 */
export async function readFileContent(
    plugin: FirstLineIsTitlePlugin,
    file: TFile,
    options: ContentReaderOptions = {}
): Promise<string> {
    const { providedContent, providedEditor, searchWorkspace = false, preferFresh = false } = options;
    const app = plugin.app;
    const settings = plugin.settings;

    let content: string;

    try {
        // Strategy 1: Use provided content if available (highest priority)
        // Accept any string including empty (user may have deleted all content)
        if (providedContent !== undefined) {
            content = providedContent;
            if (settings.core.verboseLogging) {
                console.debug(`Using provided content for ${file.path} (${content.length} chars)`);
            }
            return content;
        }

        // Strategy 2: Use provided editor if available
        if (providedEditor) {
            content = providedEditor.getValue();
            if (settings.core.verboseLogging) {
                console.debug(`Using provided editor content for ${file.path} (${content.length} chars)`);
            }
            return content;
        }

        // Strategy 3: Search workspace for matching editor if requested
        if (searchWorkspace) {
            const editorContent = findEditorContent(app, file);
            if (editorContent !== null) {
                if (settings.core.verboseLogging) {
                    console.debug(`Found editor in workspace for ${file.path} (${editorContent.length} chars)`);
                }
                return editorContent;
            }
        }

        // Strategy 4: Use fileReadMethod setting
        if (settings.core.fileReadMethod === 'Editor') {
            // Editor method with no editor available - fallback based on preferFresh or file state
            const needsFresh = preferFresh || plugin.fileStateManager?.needsFreshRead(file.path);
            if (needsFresh) {
                content = await app.vault.read(file);
                // Clear needsFreshRead flag after using it
                if (plugin.fileStateManager?.needsFreshRead(file.path)) {
                    plugin.fileStateManager.clearNeedsFreshRead(file.path);
                }
                if (settings.core.verboseLogging) {
                    console.debug(`Editor method using fresh read for ${file.path} (${content.length} chars)`);
                }
            } else {
                content = await app.vault.cachedRead(file);
                if (settings.core.verboseLogging) {
                    console.debug(`Editor method fallback to cached read for ${file.path} (${content.length} chars)`);
                }
            }
        } else if (settings.core.fileReadMethod === 'Cache') {
            content = await app.vault.cachedRead(file);
            if (settings.core.verboseLogging) {
                console.debug(`Cached read content from ${file.path} (${content.length} chars)`);
            }
        } else if (settings.core.fileReadMethod === 'File') {
            content = await app.vault.read(file);
            if (settings.core.verboseLogging) {
                console.debug(`Direct read content from ${file.path} (${content.length} chars)`);
            }
        } else {
            // Unknown method - use preferFresh or fallback to cache
            if (preferFresh) {
                content = await app.vault.read(file);
                if (settings.core.verboseLogging) {
                    console.debug(`Unknown method, using fresh read for ${file.path} (${content.length} chars)`);
                }
            } else {
                content = await app.vault.cachedRead(file);
                if (settings.core.verboseLogging) {
                    console.debug(`Unknown method, fallback to cached read for ${file.path} (${content.length} chars)`);
                }
            }
        }

        return content;
    } catch (error) {
        console.error(`Failed to read file ${file.path}:`, error);
        throw new Error(`Failed to read file: ${error.message}`);
    }
}

/**
 * Search workspace for an editor matching the given file
 * Checks hover popovers first (most likely fresh during active editing), then main workspace
 * @param app - Obsidian App instance
 * @param file - File to find editor for
 * @returns Editor content if found, null otherwise
 */
function findEditorContent(app: App, file: TFile): string | null {
    const leaves = app.workspace.getLeavesOfType("markdown");

    // DEBUG: Log search start
    console.debug(`[findEditorContent] Searching for ${file.path}, found ${leaves.length} markdown leaves`);

    // Track popover editors for single-popover fallback logic
    let singlePopoverContent: string | null = null;
    let popoverCount = 0;

    // Check hover popovers FIRST - most likely to have fresh content during active editing
    // Popovers are ephemeral and only exist when actively being used
    for (const leaf of leaves) {
        // Accessing non-public API - hoverPopover not in official types
        const view = leaf.view as any;

        // DEBUG: Log popover detection
        const hasPopover = !!view?.hoverPopover?.targetEl;
        const hasEditor = !!view?.hoverPopover?.editor;
        if (hasPopover || hasEditor) {
            console.debug(`[findEditorContent] Leaf has popover: targetEl=${hasPopover}, editor=${hasEditor}`);
        }

        if (view?.hoverPopover?.targetEl && view.hoverPopover.editor) {
            const content = view.hoverPopover.editor.getValue();
            const popoverPath = view.hoverPopover.file?.path;

            // DEBUG: Log popover content
            console.debug(`[findEditorContent] Popover found: path=${popoverPath}, contentLength=${content?.length || 0}`);

            // Don't trust empty content - likely transient state after file operations
            if (content) {
                popoverCount++;
                singlePopoverContent = content;

                // Try exact path match first (normal case)
                if (view.hoverPopover.file?.path === file.path) {
                    console.debug(`[findEditorContent] Exact path match, returning content`);
                    return content;
                }
                // Path might not match immediately after rename due to async update
                // Continue to check other popovers and fall back to single-popover logic
            }
        }
    }

    // DEBUG: Log fallback decision
    console.debug(`[findEditorContent] After popover search: popoverCount=${popoverCount}, willUseFallback=${popoverCount === 1}`);

    // If exactly one active popover exists with content, use it
    // This handles post-rename case where popover's file.path hasn't updated yet
    // Assumption: single active popover = user's working context when manual command triggered
    if (popoverCount === 1 && singlePopoverContent) {
        console.debug(`[findEditorContent] Using single-popover fallback`);
        return singlePopoverContent;
    }

    // Check active view's editor as fallback
    // When manual command triggered, user is focused on active editor
    // Trust active editor content regardless of file path matching
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.editor) {
        const content = activeView.editor.getValue();
        if (content) {
            console.debug(`[findEditorContent] Found content in active view editor (${content.length} chars)`);
            return content;
        }
    }

    // Check main workspace leaves as final fallback
    // These can be stale after file operations (renames, etc.)
    for (const leaf of leaves) {
        const view = leaf.view as MarkdownView;
        if (view && view.file?.path === file.path && view.editor) {
            const content = view.editor.getValue();
            // Don't trust empty content - could be transient/stale state
            if (content) {
                return content;
            }
            // Empty content, continue searching
        }
    }

    console.debug(`[findEditorContent] No editor content found, returning null`);
    return null;
}

/**
 * Find an editor instance for the given file in the workspace
 * @param app - Obsidian App instance
 * @param file - File to find editor for
 * @returns Editor instance if found, null otherwise
 */
export function findEditor(app: App, file: TFile): Editor | null {
    const leaves = app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
        const view = leaf.view as MarkdownView;
        if (view && view.file?.path === file.path && view.editor) {
            return view.editor;
        }
    }
    return null;
}
