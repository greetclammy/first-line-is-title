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

    // Check hover popovers FIRST - most likely to have fresh content during active editing
    // Popovers are ephemeral and only exist when actively being used
    for (const leaf of leaves) {
        // Accessing non-public API - hoverPopover not in official types
        const view = leaf.view as any;
        if (view?.hoverPopover?.targetEl) {
            const popoverEditor = view.hoverPopover.editor;
            if (popoverEditor && view.hoverPopover.file?.path === file.path) {
                const content = popoverEditor.getValue();
                // Don't trust empty content - likely transient state after file operations
                // Return null instead to try other methods
                if (content) {
                    return content;
                }
                // Empty content, continue searching other editors
            }
        }
    }

    // Check main workspace leaves as fallback
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
