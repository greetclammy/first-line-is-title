import { TFile, MarkdownView } from "obsidian";
import { verboseLog } from '../utils';
import FirstLineIsTitle from '../../main';

/**
 * EditorLifecycleManager
 *
 * Manages editor state tracking and polling/checking systems for detecting
 * first line changes in active editors.
 *
 * Responsibilities:
 * - Track open editors and their first line content
 * - Poll active editors for changes (interval-based)
 * - Immediate change detection (event-based)
 * - Manage editor lifecycle events
 */
export class EditorLifecycleManager {
    private plugin: FirstLineIsTitle;

    // Track files currently open in editors (with last-seen timestamp)
    private openEditorFiles = new Map<string, number>();

    // Interval-based checking system
    private pendingChecks = new Map<string, { editor: any, file: TFile, lastChangeTime: number }>();
    private checkTimer: NodeJS.Timeout | null = null;

    // Track active editors for tab close detection
    private activeEditorFiles = new Map<string, { file: TFile, editor: any, lastFirstLine: string | undefined, leafId: string }>();

    // Throttle timer system for checkInterval > 0
    private throttleTimers = new Map<string, NodeJS.Timeout>();

    // Track files in creation delay period with their timer references
    private creationDelayTimers = new Map<string, NodeJS.Timeout>();

    // Track files that were just processed on tab close to prevent duplicate processing
    // Performance optimization: prevents redundant checks from multiple workspace events
    private recentlyProcessedCloses = new Set<string>();

    // Track last focused file for rename-on-focus detection
    private lastFocusedFile: string | null = null;

    // Track previous count for logging only on changes
    private previousActiveFileCount: number = 0;

    constructor(plugin: FirstLineIsTitle) {
        this.plugin = plugin;
    }

    get app() {
        return this.plugin.app;
    }

    get settings() {
        return this.plugin.settings;
    }

    get isFullyLoaded() {
        return this.plugin.isFullyLoaded;
    }

    get renameEngine() {
        return this.plugin.renameEngine;
    }

    /**
     * Set creation delay timer for a file
     */
    setCreationDelayTimer(filePath: string, timer: NodeJS.Timeout): void {
        this.creationDelayTimers.set(filePath, timer);
        verboseLog(this.plugin, `Set creation delay timer for: ${filePath}`);
    }

    /**
     * Clear creation delay timer for a file
     */
    clearCreationDelayTimer(filePath: string): void {
        const timer = this.creationDelayTimers.get(filePath);
        if (timer) {
            clearTimeout(timer);
            this.creationDelayTimers.delete(filePath);
            verboseLog(this.plugin, `Cleared creation delay timer for: ${filePath}`);
        }
    }

    /**
     * Check if a file is in creation delay period
     */
    isFileInCreationDelay(filePath: string): boolean {
        return this.creationDelayTimers.has(filePath);
    }

    /**
     * Initialize the checking system based on settings
     */
    initializeCheckingSystem(): void {
        // Clear any existing system
        this.clearCheckingSystems();

        // Always track active editors for tab close detection
        this.trackActiveEditors();

        if (this.settings.core.checkInterval === 0) {
            // Use event-based immediate checking
            this.setupEventBasedChecking();
        } else {
            // Use throttle-based checking
            this.setupThrottleBasedChecking();
        }
    }

    /**
     * Setup event-based checking (immediate processing)
     */
    private setupEventBasedChecking(): void {
        verboseLog(this.plugin, 'Setting up event-based checking (immediate)');
        // This will be set up in the main event registration
    }

    /**
     * Setup throttle-based checking (process N ms after editor change)
     */
    private setupThrottleBasedChecking(): void {
        verboseLog(this.plugin, `Setting up throttle-based checking (${this.settings.core.checkInterval}ms delay)`);
    }

    /**
     * Register workspace events to track open editors
     */
    private trackActiveEditors(): void {
        // Register workspace events to track open editors
        this.plugin.registerEvent(
            this.app.workspace.on("active-leaf-change", () => {
                this.updateActiveEditorTracking();
            })
        );

        this.plugin.registerEvent(
            this.app.workspace.on("layout-change", () => {
                this.updateActiveEditorTracking();
            })
        );

        // Initial tracking
        this.updateActiveEditorTracking();
    }

    /**
     * Update tracking of active editors
     */
    async updateActiveEditorTracking(): Promise<void> {
        const markdownViews = this.app.workspace.getLeavesOfType("markdown");
        const newActiveFiles = new Map<string, { file: TFile, editor: any, lastFirstLine: string | undefined, leafId: string }>();

        // Track which leafIds are currently active
        const activeLeafIds = new Set<string>();

        // Build new active files map
        for (const leaf of markdownViews) {
            // Accessing non-public editor API - no official types available
            const view = leaf.view as any;
            if (view && view.file && view.editor) {
                try {
                    const leafId = leaf.id;
                    if (!leafId) continue;

                    activeLeafIds.add(leafId);

                    const firstLine = this.extractFirstLineFromEditor(view.editor, view.file);
                    const existing = this.activeEditorFiles.get(view.file.path);

                    newActiveFiles.set(view.file.path, {
                        file: view.file,
                        editor: view.editor,
                        lastFirstLine: existing ? existing.lastFirstLine : undefined, // Preserve existing (even if undefined)
                        leafId: leafId
                    });
                } catch (error) {
                    console.error(`Error tracking editor for ${view.file.path}:`, error);
                }
            }
        }

        // Process files that were closed (in old map but not in new map)
        if (this.isFullyLoaded && this.settings.core.renameNotes === "automatically") {
            for (const [filePath, oldData] of this.activeEditorFiles) {
                if (!newActiveFiles.has(filePath)) {
                    // Check if this TFile object still exists in new tracking (just renamed, not closed)
                    let stillOpen = false;
                    for (const newData of newActiveFiles.values()) {
                        if (newData.file === oldData.file) {
                            stillOpen = true;
                            verboseLog(this.plugin, `File ${filePath} was renamed, not closed - skipping tab close processing`);
                            break;
                        }
                    }

                    if (stillOpen) {
                        continue; // File was renamed, not actually closed
                    }

                    // Check if the leaf that had this file is still active (tab switch vs tab close)
                    if (activeLeafIds.has(oldData.leafId)) {
                        verboseLog(this.plugin, `File ${filePath} switched in same tab (leaf ${oldData.leafId} still active) - skipping tab close processing`);
                        continue; // Tab still exists, just switched files
                    }

                    // Check if we already processed this file's close recently (prevent duplicate processing)
                    if (this.recentlyProcessedCloses.has(filePath)) {
                        verboseLog(this.plugin, `File ${filePath} already processed on tab close - skipping duplicate`);
                        continue;
                    }

                    // Tab actually closed - handle based on pending delays
                    verboseLog(this.plugin, `Tab closed for: ${filePath}`);

                    // Mark as processed to prevent duplicate processing from multiple events
                    this.recentlyProcessedCloses.add(filePath);
                    setTimeout(() => {
                        this.recentlyProcessedCloses.delete(filePath);
                    }, 100); // Clear after 100ms (workspace events settle quickly)

                    // Check if there's a pending throttle timer (first line was modified)
                    const hasThrottleTimer = this.plugin.fileStateManager.hasThrottleTimer(filePath);

                    if (hasThrottleTimer) {
                        // Tab close overrides throttle delay - process immediately
                        verboseLog(this.plugin, `Tab close overriding throttle timer for: ${filePath}`);
                        this.plugin.fileStateManager.clearThrottleTimer(filePath);

                        verboseLog(this.plugin, `Processing immediately due to pending throttle: ${filePath}`);
                        try {
                            // hasActiveEditor=true because throttle was created when editor was active
                            await this.renameEngine.processFile(oldData.file, true, false, undefined, false, undefined, true);
                        } catch (error) {
                            console.error(`Error processing closed file ${filePath}:`, error);
                        }
                    } else {
                        // No pending throttle - do nothing
                        // Tab close with unsaved changes triggers immediate save → modify event
                        verboseLog(this.plugin, `Tab closed with no pending throttle: ${filePath} - no action needed`);
                    }
                }
            }
        }

        this.activeEditorFiles = newActiveFiles;

        // Only log if count changed to reduce spam from excessive workspace events
        if (this.activeEditorFiles.size !== this.previousActiveFileCount) {
            verboseLog(this.plugin, `Tracking ${this.activeEditorFiles.size} active editor files for tab close detection`);
            this.previousActiveFileCount = this.activeEditorFiles.size;
        }

        // Handle rename-on-focus: detect when active file changes
        if (this.settings.core.renameOnFocus && this.isFullyLoaded) {
            const currentActiveFile = this.app.workspace.getActiveFile();
            if (currentActiveFile && currentActiveFile.extension === 'md') {
                const currentPath = currentActiveFile.path;

                // Only process if the focused file actually changed
                if (currentPath !== this.lastFocusedFile) {
                    this.lastFocusedFile = currentPath;

                    verboseLog(this.plugin, `File focused: ${currentPath}`);

                    // Process file with rename-on-focus (async but don't await to avoid blocking)
                    // hasActiveEditor=true because file just became active
                    this.renameEngine.processFile(currentActiveFile, true, false, undefined, false, undefined, true).catch(error => {
                        console.error(`Error processing rename-on-focus for ${currentPath}:`, error);
                    });
                }
            }
        }
    }

    /**
     * Handle editor change with throttle for checkInterval > 0
     * Only starts timer if first line actually changed from last known state
     */
    handleEditorChangeWithThrottle(editor: any, file: TFile): void {
        const filePath = file.path;

        // Skip files in creation delay
        if (this.isFileInCreationDelay(filePath)) {
            verboseLog(this.plugin, `File in creation delay, skipping throttle: ${filePath}`);
            return;
        }

        // Get current first line
        const currentFirstLine = this.extractFirstLineFromEditor(editor, file);

        // Get last known first line from tracking
        let tracked = this.activeEditorFiles.get(filePath);

        // If file not tracked yet (first change event before workspace event), initialize it now
        if (!tracked) {
            tracked = {
                file: file,
                editor: editor,
                lastFirstLine: undefined, // Initialize as undefined so first change is processed
                leafId: '' // Will be set properly by updateActiveEditorTracking
            };
            this.activeEditorFiles.set(filePath, tracked);
            verboseLog(this.plugin, `Initialized tracking on first editor change for ${filePath}: "${currentFirstLine}"`);
        }

        // TypeScript: tracked is always defined here (either from get() or newly created)
        const lastFirstLine = tracked!.lastFirstLine;

        // If first line hasn't changed, skip throttle
        if (lastFirstLine !== undefined && lastFirstLine === currentFirstLine) {
            verboseLog(this.plugin, `First line unchanged for ${filePath}, skipping throttle`);
            return;
        }

        // First line changed - update tracking
        tracked!.lastFirstLine = currentFirstLine;

        // Check if timer already running for this file
        if (this.plugin.fileStateManager.hasThrottleTimer(filePath)) {
            verboseLog(this.plugin, `Throttle timer already running for: ${filePath}, not starting new one`);
            return;
        }

        // Start new throttle timer
        verboseLog(this.plugin, `Starting throttle timer (${this.settings.core.checkInterval}ms) for: ${filePath}`);
        const timer = setTimeout(async () => {
            verboseLog(this.plugin, `Throttle timer expired, processing: ${filePath}`);

            // Remove timer from tracking
            this.plugin.fileStateManager.clearThrottleTimer(filePath);

            // Process file
            try {
                await this.renameEngine.processEditorChangeOptimal(editor, file);
            } catch (error) {
                console.error(`Error processing throttled change for ${filePath}:`, error);
            }
        }, this.settings.core.checkInterval);

        this.plugin.fileStateManager.setThrottleTimer(filePath, timer);
    }

    /**
     * Update lastFirstLine for a file after processing
     * Called after rename completes to sync tracking state
     */
    updateLastFirstLine(filePath: string, firstLine: string): void {
        const tracked = this.activeEditorFiles.get(filePath);
        if (tracked) {
            tracked.lastFirstLine = firstLine;
            verboseLog(this.plugin, `Updated lastFirstLine for ${filePath}: "${firstLine}"`);
        }
    }

    /**
     * Update activeEditorFiles map key when file is renamed
     * Called from vault rename event handler
     */
    notifyFileRenamed(oldPath: string, newPath: string): void {
        const tracked = this.activeEditorFiles.get(oldPath);
        if (tracked) {
            this.activeEditorFiles.delete(oldPath);
            this.activeEditorFiles.set(newPath, tracked);
            verboseLog(this.plugin, `Updated editor tracking key: ${oldPath} → ${newPath}`);
        }
    }

    /**
     * Clear all checking systems and state
     * Note: Creation delay and view readiness timers are self-cleaning (100ms-3s TTL)
     * but we clear them explicitly for consistency on unload
     */
    clearCheckingSystems(): void {
        // Clear all throttle timers via FileStateManager
        this.plugin.fileStateManager.clearAllThrottleTimers();

        // Note: Creation delay and view readiness timers are now managed by FileStateManager
        // and will be cleaned up in its dispose() method

        this.activeEditorFiles.clear();
        this.pendingChecks.clear();
    }

    /**
     * Extract first line from editor content
     */
    public extractFirstLineFromEditor(editor: any, file: TFile): string {
        try {
            const content = editor.getValue();
            const lines = content.split('\n');

            // Skip frontmatter to get actual first line
            const metadata = this.app.metadataCache.getFileCache(file);
            let firstLineIndex = 0;
            if (metadata?.frontmatterPosition) {
                firstLineIndex = metadata.frontmatterPosition.end.line + 1;
            }

            // Find first non-empty line after frontmatter
            for (let i = firstLineIndex; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim() !== '') {
                    return line;
                }
            }

            return ''; // No non-empty line found
        } catch (error) {
            console.error(`Error extracting first line from ${file.path}:`, error);
            return '';
        }
    }

    /**
     * Extract first line from file content string
     */
    extractFirstLineFromContent(content: string, file: TFile): string {
        try {
            const lines = content.split('\n');

            // Skip frontmatter to get actual first line
            const metadata = this.app.metadataCache.getFileCache(file);
            let firstLineIndex = 0;
            if (metadata?.frontmatterPosition) {
                firstLineIndex = metadata.frontmatterPosition.end.line + 1;
            }

            // Find first non-empty line after frontmatter
            for (let i = firstLineIndex; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim() !== '') {
                    return line;
                }
            }

            return ''; // No non-empty line found
        } catch (error) {
            console.error(`Error extracting first line from content for ${file.path}:`, error);
            return '';
        }
    }

    /**
     * Check if a file is currently open in an editor
     */
    isFileOpenInEditor(file: TFile): boolean {
        let isOpen = false;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
                isOpen = true;
                return false; // break iteration
            }
        });
        return isOpen;
    }

    /**
     * Get open editor files map (for external access)
     */
    getOpenEditorFiles(): Map<string, number> {
        return this.openEditorFiles;
    }

    /**
     * Get active editor files map (for external access)
     */
    getActiveEditorFiles(): Map<string, { file: TFile, editor: any, lastFirstLine: string | undefined, leafId: string }> {
        return this.activeEditorFiles;
    }
}