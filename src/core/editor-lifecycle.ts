import { TFile, MarkdownView } from "obsidian";
import { verboseLog } from '../utils';
import FirstLineIsTitle from '../../main';

/**
 * EditorLifecycleManager
 *
 * Manages editor state tracking and polling/checking systems for detecting
 * content changes in active editors.
 *
 * Responsibilities:
 * - Track open editors and their content state
 * - Poll active editors for changes (interval-based)
 * - Immediate change detection (event-based)
 * - Manage editor lifecycle events (create, modify, close)
 */
export class EditorLifecycleManager {
    private plugin: FirstLineIsTitle;

    // Track files currently open in editors (with last-seen timestamp)
    private openEditorFiles = new Map<string, number>();

    // Interval-based checking system
    private pendingChecks = new Map<string, { editor: any, file: TFile, lastChangeTime: number }>();
    private checkTimer: NodeJS.Timeout | null = null;

    // Track active editors for tab close detection
    private activeEditorFiles = new Map<string, { file: TFile, editor: any, leafId: string }>();

    // Throttle timer system for checkInterval > 0
    private throttleTimers = new Map<string, NodeJS.Timeout>();

    // Track files in creation delay period with their timer references
    private creationDelayTimers = new Map<string, NodeJS.Timeout>();

    // Track view readiness check timers (for CREATE event)
    private viewReadinessTimers = new Map<string, NodeJS.Timeout>();

    // Track files that were just processed on tab close to prevent duplicate processing
    private recentlyProcessedCloses = new Set<string>();

    // Track last focused file for rename-on-focus detection
    private lastFocusedFile: string | null = null;

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
     * Set view readiness timer for a file
     */
    setViewReadinessTimer(filePath: string, timer: NodeJS.Timeout): void {
        this.viewReadinessTimers.set(filePath, timer);
        verboseLog(this.plugin, `Set view readiness timer for: ${filePath}`);
    }

    /**
     * Clear view readiness timer for a file
     */
    clearViewReadinessTimer(filePath: string): void {
        const timer = this.viewReadinessTimers.get(filePath);
        if (timer) {
            clearTimeout(timer);
            this.viewReadinessTimers.delete(filePath);
            verboseLog(this.plugin, `Cleared view readiness timer for: ${filePath}`);
        }
    }

    /**
     * Initialize the checking system based on settings
     */
    initializeCheckingSystem(): void {
        // Clear any existing system
        this.clearCheckingSystems();

        // Always track active editors for tab close detection
        this.trackActiveEditors();

        if (this.settings.checkInterval === 0) {
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
        verboseLog(this.plugin, `Setting up throttle-based checking (${this.settings.checkInterval}ms delay)`);
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
        const newActiveFiles = new Map<string, { file: TFile, editor: any, leafId: string }>();

        // Track which leafIds are currently active
        const activeLeafIds = new Set<string>();

        // Build new active files map
        for (const leaf of markdownViews) {
            const view = leaf.view as { file?: TFile; editor?: any };
            if (view && view.file && view.editor) {
                try {
                    const leafId = leaf.id;
                    activeLeafIds.add(leafId);

                    newActiveFiles.set(view.file.path, {
                        file: view.file,
                        editor: view.editor,
                        leafId: leafId
                    });
                } catch (error) {
                    console.error(`Error tracking editor for ${view.file.path}:`, error);
                }
            }
        }

        // Process files that were closed (in old map but not in new map)
        if (this.isFullyLoaded && this.settings.renameNotes === "automatically") {
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

                    // Clear first rename tracking when tab closes
                    this.plugin.cacheManager?.clearFirstRenameTracking(filePath);

                    // Mark as processed to prevent duplicate processing from multiple events
                    this.recentlyProcessedCloses.add(filePath);
                    setTimeout(() => {
                        this.recentlyProcessedCloses.delete(filePath);
                    }, 100); // Clear after 100ms (workspace events settle quickly)

                    // Check if there's a pending throttle timer (first line was modified)
                    const hasThrottleTimer = this.throttleTimers.has(filePath);

                    if (hasThrottleTimer) {
                        // Tab close overrides throttle delay - process immediately
                        verboseLog(this.plugin, `Tab close overriding throttle timer for: ${filePath}`);
                        this.clearThrottleTimer(filePath);

                        verboseLog(this.plugin, `Processing immediately due to pending throttle: ${filePath}`);
                        try {
                            await this.renameEngine.processFile(oldData.file, true);
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
        verboseLog(this.plugin, `Tracking ${this.activeEditorFiles.size} active editor files for tab close detection`);

        // Handle rename-on-focus: detect when active file changes
        if (this.settings.renameOnFocus && this.isFullyLoaded) {
            const currentActiveFile = this.app.workspace.getActiveFile();
            if (currentActiveFile && currentActiveFile.extension === 'md') {
                const currentPath = currentActiveFile.path;

                // Only process if the focused file actually changed
                if (currentPath !== this.lastFocusedFile) {
                    this.lastFocusedFile = currentPath;

                    verboseLog(this.plugin, `File focused: ${currentPath}`);

                    // Process file with rename-on-focus (async but don't await to avoid blocking)
                    this.renameEngine.processFile(currentActiveFile, true).catch(error => {
                        console.error(`Error processing rename-on-focus for ${currentPath}:`, error);
                    });
                }
            }
        }
    }

    /**
     * Handle editor change with throttle for checkInterval > 0
     * Policy: Process on ANY content change, not just first line changes
     */
    handleEditorChangeWithThrottle(editor: any, file: TFile): void {
        const filePath = file.path;

        // Skip files in creation delay
        if (this.isFileInCreationDelay(filePath)) {
            verboseLog(this.plugin, `File in creation delay, skipping throttle: ${filePath}`);
            return;
        }

        // Check if timer already running for this file
        if (this.throttleTimers.has(filePath)) {
            verboseLog(this.plugin, `Throttle timer already running for: ${filePath}, not starting new one`);
            return;
        }

        // Start new throttle timer
        verboseLog(this.plugin, `Starting throttle timer (${this.settings.checkInterval}ms) for: ${filePath}`);
        const timer = setTimeout(async () => {
            verboseLog(this.plugin, `Throttle timer expired, processing: ${filePath}`);

            // Remove timer from tracking
            this.throttleTimers.delete(filePath);

            // Process file
            try {
                await this.renameEngine.processEditorChangeOptimal(editor, file);
            } catch (error) {
                console.error(`Error processing throttled change for ${filePath}:`, error);
            }
        }, this.settings.checkInterval);

        this.throttleTimers.set(filePath, timer);
    }

    /**
     * Clear throttle timer for a specific file
     */
    clearThrottleTimer(filePath: string): void {
        const timer = this.throttleTimers.get(filePath);
        if (timer) {
            clearTimeout(timer);
            this.throttleTimers.delete(filePath);
            verboseLog(this.plugin, `Cleared throttle timer for: ${filePath}`);
        }
    }

    /**
     * Clear all checking systems and state
     * Note: Does NOT clear creation delay timers or view readiness timers
     * as those need to persist across initialization
     */
    clearCheckingSystems(): void {
        // Clear old interval system (kept for backward compatibility)
        if (this.checkTimer) {
            clearTimeout(this.checkTimer);
            this.checkTimer = null;
        }

        // Clear throttle timers
        for (const timer of this.throttleTimers.values()) {
            clearTimeout(timer);
        }
        this.throttleTimers.clear();

        // DO NOT clear creation delay timers - they must persist across initialization
        // DO NOT clear view readiness timers - they must persist across initialization

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
     * Process pending editor changes (kept for backward compatibility)
     */
    processPendingEditorChanges(): void {
        // No longer needed since we process immediately on editor-change
        // This method is kept for backward compatibility with event handlers
        verboseLog(this.plugin, `processPendingEditorChanges called - no action needed with immediate processing`);
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
    getActiveEditorFiles(): Map<string, { file: TFile, editor: any, leafId: string }> {
        return this.activeEditorFiles;
    }
}