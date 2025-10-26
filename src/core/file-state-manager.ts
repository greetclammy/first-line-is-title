import { TFile } from 'obsidian';
import FirstLineIsTitlePlugin from '../../main';
import { TIMING } from '../constants/timing';

/**
 * Title region cache for a file
 */
export interface TitleRegionCache {
    firstNonEmptyLine: string;
    titleSourceLine: string;
    lastUpdated: number;
}

/**
 * Operation tracking data for a file
 */
export interface OperationData {
    count: number;
    lastContent: string;
    lastUpdate: number;
}

/**
 * Comprehensive per-file state tracking
 */
export interface FileState {
    path: string;

    // Lifecycle timers
    creationDelayTimer?: NodeJS.Timeout;
    throttleTimer?: NodeJS.Timeout; // checkInterval > 0 delayed processing

    // Content tracking
    lastEditorContent?: string;
    titleRegionCache?: TitleRegionCache;
    lastSelfRefNotice?: number; // timestamp
    lastSafewordNotice?: number; // timestamp

    // Operation tracking
    operationData?: OperationData;
    isLocked?: boolean;
    pendingAliasRecheck?: boolean;
    pendingAliasEditor?: any; // Stored editor reference for popover detection
    isSyncingEditors?: boolean; // True when syncing background editors to prevent spurious rechecks

    // Rename tracking - prevents processing stale content after rename
    lastRenamedTime?: number; // Timestamp when file was renamed by plugin

    // Cache staleness tracking - when editor sync skipped in popover
    needsFreshRead?: boolean; // True when cache is stale, must read from disk not cache
    needsFreshReadTimestamp?: number; // When flag was set, for cleanup in maintenance
}

/**
 * Centralized file state manager
 */
export class FileStateManager {
    private plugin: FirstLineIsTitlePlugin;
    private fileStates: Map<string, FileState>;

    constructor(plugin: FirstLineIsTitlePlugin) {
        this.plugin = plugin;
        this.fileStates = new Map();
    }

    /**
     * Get or create file state
     */
    private getOrCreateState(path: string): FileState {
        if (!this.fileStates.has(path)) {
            this.fileStates.set(path, { path });
        }
        return this.fileStates.get(path)!;
    }

    /**
     * Get file state (read-only)
     */
    getState(path: string): Readonly<FileState> | undefined {
        return this.fileStates.get(path);
    }

    // ============================================================================
    // LIFECYCLE TIMERS
    // ============================================================================

    /**
     * Set creation delay timer for a file
     */
    setCreationDelayTimer(path: string, timer: NodeJS.Timeout): void {
        const state = this.getOrCreateState(path);
        if (state.creationDelayTimer) {
            clearTimeout(state.creationDelayTimer);
        }
        state.creationDelayTimer = timer;
    }

    /**
     * Clear creation delay timer
     */
    clearCreationDelayTimer(path: string): void {
        const state = this.fileStates.get(path);
        if (state?.creationDelayTimer) {
            clearTimeout(state.creationDelayTimer);
            delete state.creationDelayTimer;
        }
    }

    /**
     * Check if file is in creation delay
     */
    isFileInCreationDelay(path: string): boolean {
        return !!this.fileStates.get(path)?.creationDelayTimer;
    }

    /**
     * Set throttle timer for a file (checkInterval > 0 delayed processing)
     */
    setThrottleTimer(path: string, timer: NodeJS.Timeout): void {
        const state = this.getOrCreateState(path);
        if (state.throttleTimer) {
            clearTimeout(state.throttleTimer);
        }
        state.throttleTimer = timer;
    }

    /**
     * Clear throttle timer
     */
    clearThrottleTimer(path: string): void {
        const state = this.fileStates.get(path);
        if (state?.throttleTimer) {
            clearTimeout(state.throttleTimer);
            delete state.throttleTimer;
        }
    }

    /**
     * Check if file has throttle timer
     */
    hasThrottleTimer(path: string): boolean {
        return !!this.fileStates.get(path)?.throttleTimer;
    }

    /**
     * Clear all throttle timers (used on settings change)
     */
    clearAllThrottleTimers(): void {
        for (const state of this.fileStates.values()) {
            if (state.throttleTimer) {
                clearTimeout(state.throttleTimer);
                delete state.throttleTimer;
            }
        }
    }

    // ============================================================================
    // CONTENT TRACKING
    // ============================================================================

    /**
     * Set last editor content
     */
    setLastEditorContent(path: string, content: string): void {
        const state = this.getOrCreateState(path);
        state.lastEditorContent = content;
    }

    /**
     * Get last editor content
     */
    getLastEditorContent(path: string): string | undefined {
        return this.fileStates.get(path)?.lastEditorContent;
    }

    /**
     * Delete last editor content
     */
    deleteLastEditorContent(path: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            delete state.lastEditorContent;
        }
    }

    /**
     * Set title region cache
     */
    setTitleRegionCache(path: string, cache: TitleRegionCache): void {
        const state = this.getOrCreateState(path);
        state.titleRegionCache = cache;
    }

    /**
     * Get title region cache
     */
    getTitleRegionCache(path: string): TitleRegionCache | undefined {
        return this.fileStates.get(path)?.titleRegionCache;
    }

    /**
     * Delete title region cache
     */
    deleteTitleRegionCache(path: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            delete state.titleRegionCache;
        }
    }

    /**
     * Clear all title region caches (on settings change)
     */
    clearAllTitleRegionCaches(): void {
        for (const state of this.fileStates.values()) {
            delete state.titleRegionCache;
        }
    }

    /**
     * Update title region cache key on rename
     */
    updateTitleRegionCacheKey(oldPath: string, newPath: string): void {
        const state = this.fileStates.get(oldPath);
        if (state?.titleRegionCache) {
            const cache = state.titleRegionCache;
            delete state.titleRegionCache;
            this.setTitleRegionCache(newPath, cache);
        }
    }

    /**
     * Set last self-reference notice timestamp
     */
    setLastSelfRefNotice(path: string): void {
        const state = this.getOrCreateState(path);
        state.lastSelfRefNotice = Date.now();
    }

    /**
     * Check if can show self-ref notice (rate limit)
     */
    canShowSelfRefNotice(path: string): boolean {
        const state = this.fileStates.get(path);
        if (!state?.lastSelfRefNotice) return true;
        return (Date.now() - state.lastSelfRefNotice) > TIMING.SELF_REF_NOTICE_TTL_MS;
    }

    /**
     * Set last safeword notice timestamp
     */
    setLastSafewordNotice(path: string): void {
        const state = this.getOrCreateState(path);
        state.lastSafewordNotice = Date.now();
    }

    /**
     * Check if can show safeword notice (rate limit)
     */
    canShowSafewordNotice(path: string): boolean {
        const state = this.fileStates.get(path);
        if (!state?.lastSafewordNotice) return true;
        return (Date.now() - state.lastSafewordNotice) > TIMING.SELF_REF_NOTICE_TTL_MS;
    }

    // ============================================================================
    // OPERATION TRACKING
    // ============================================================================

    /**
     * Get operation data
     */
    getOperationData(path: string): OperationData | undefined {
        return this.fileStates.get(path)?.operationData;
    }

    /**
     * Set operation data
     */
    setOperationData(path: string, data: OperationData): void {
        const state = this.getOrCreateState(path);
        state.operationData = data;
    }

    /**
     * Update operation count
     */
    updateOperationCount(path: string, content: string): void {
        const state = this.getOrCreateState(path);
        if (!state.operationData) {
            state.operationData = {
                count: 1,
                lastContent: content,
                lastUpdate: Date.now()
            };
        } else {
            state.operationData.count++;
            state.operationData.lastContent = content;
            state.operationData.lastUpdate = Date.now();
        }
    }

    /**
     * Acquire file operation lock
     */
    acquireLock(path: string): boolean {
        const state = this.getOrCreateState(path);
        if (state.isLocked) {
            return false;
        }
        state.isLocked = true;
        return true;
    }

    /**
     * Release file operation lock
     */
    releaseLock(path: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.isLocked = false;
        }
    }

    /**
     * Check if file is locked
     */
    isLocked(path: string): boolean {
        return this.fileStates.get(path)?.isLocked ?? false;
    }

    /**
     * Clear all locks (on unload)
     */
    clearAllLocks(): void {
        for (const state of this.fileStates.values()) {
            state.isLocked = false;
        }
    }

    /**
     * Mark file for pending alias recheck
     * @param editor - Optional editor reference for popover detection
     */
    markPendingAliasRecheck(path: string, editor?: any): void {
        const state = this.getOrCreateState(path);
        state.pendingAliasRecheck = true;
        if (editor) {
            state.pendingAliasEditor = editor;
        }
    }

    /**
     * Check if file has pending alias recheck
     */
    hasPendingAliasRecheck(path: string): boolean {
        return this.fileStates.get(path)?.pendingAliasRecheck ?? false;
    }

    /**
     * Get stored editor reference for pending alias recheck
     */
    getPendingAliasEditor(path: string): any | undefined {
        return this.fileStates.get(path)?.pendingAliasEditor;
    }

    /**
     * Clear pending alias recheck
     */
    clearPendingAliasRecheck(path: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.pendingAliasRecheck = false;
            state.pendingAliasEditor = undefined;
        }
    }

    /**
     * Get all file paths with pending alias recheck
     */
    getFilesWithPendingAliasRecheck(): string[] {
        const files: string[] = [];
        for (const [path, state] of this.fileStates.entries()) {
            if (state.pendingAliasRecheck) {
                files.push(path);
            }
        }
        return files;
    }

    /**
     * Mark file as currently syncing background editors
     * Used to prevent editor-change events from our own setValue() operations
     * from triggering spurious rechecks
     */
    markEditorSyncing(path: string): void {
        const state = this.getOrCreateState(path);
        state.isSyncingEditors = true;
    }

    /**
     * Check if file is currently syncing background editors
     */
    isEditorSyncing(path: string): boolean {
        return this.fileStates.get(path)?.isSyncingEditors ?? false;
    }

    /**
     * Clear editor syncing flag
     */
    clearEditorSyncing(path: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.isSyncingEditors = false;
        }
    }

    /**
     * Mark file as needing fresh read from disk (not cache)
     * Used when editor sync skipped in popover - cache is stale, must read from disk
     */
    markNeedsFreshRead(path: string): void {
        const state = this.getOrCreateState(path);
        state.needsFreshRead = true;
        state.needsFreshReadTimestamp = Date.now();
    }

    /**
     * Check if file needs fresh read from disk (cache is stale)
     */
    needsFreshRead(path: string): boolean {
        return this.fileStates.get(path)?.needsFreshRead ?? false;
    }

    /**
     * Clear needs fresh read flag
     */
    clearNeedsFreshRead(path: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.needsFreshRead = false;
            delete state.needsFreshReadTimestamp;
        }
    }

    /**
     * Mark file as recently renamed by plugin
     * Used to prevent processFile from running with stale content immediately after rename
     */
    markRecentlyRenamed(path: string): void {
        const state = this.getOrCreateState(path);
        state.lastRenamedTime = Date.now();
    }

    /**
     * Check if file was recently renamed by plugin
     * Returns true if renamed within the specified time window
     *
     * @param path - File path to check
     * @param withinMs - Time window in milliseconds (default 100ms)
     */
    wasRecentlyRenamed(path: string, withinMs: number = 100): boolean {
        const state = this.fileStates.get(path);
        if (!state?.lastRenamedTime) return false;
        return (Date.now() - state.lastRenamedTime) < withinMs;
    }

    // ============================================================================
    // FILE LIFECYCLE MANAGEMENT
    // ============================================================================

    /**
     * Handle file rename - move state to new path
     */
    notifyFileRenamed(oldPath: string, newPath: string): void {
        const state = this.fileStates.get(oldPath);
        if (state) {
            state.path = newPath;
            this.fileStates.delete(oldPath);
            this.fileStates.set(newPath, state);
        }
    }

    /**
     * Handle file deletion - cleanup all state
     */
    notifyFileDeleted(path: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            if (state.creationDelayTimer) clearTimeout(state.creationDelayTimer);
            if (state.throttleTimer) clearTimeout(state.throttleTimer);
            this.fileStates.delete(path);
        }
    }

    /**
     * Maintenance: cleanup stale entries
     * Called periodically to remove old operation data, flags, and timestamps
     */
    runMaintenance(): void {
        const now = Date.now();
        const staleThreshold = 10 * 60 * 1000; // 10 minutes

        for (const [path, state] of this.fileStates.entries()) {
            // Clean up stale operation data
            if (state.operationData) {
                const age = now - state.operationData.lastUpdate;
                if (age > staleThreshold) {
                    delete state.operationData;
                }
            }

            // Clean up stale needsFreshRead flags (5 minutes)
            if (state.needsFreshReadTimestamp) {
                const age = now - state.needsFreshReadTimestamp;
                if (age > 5 * 60 * 1000) {
                    delete state.needsFreshRead;
                    delete state.needsFreshReadTimestamp;
                }
            }

            // Clean up stale lastRenamedTime (prevents memory leak)
            if (state.lastRenamedTime) {
                const age = now - state.lastRenamedTime;
                if (age > 10 * 1000) { // 10 seconds is more than enough
                    delete state.lastRenamedTime;
                }
            }

            // Remove completely empty state entries (only has path field)
            const stateKeys = Object.keys(state).filter(k => k !== 'path' && state[k as keyof FileState] !== undefined);
            if (stateKeys.length === 0) {
                this.fileStates.delete(path);
            }
        }
    }

    /**
     * Clear all state (on unload)
     */
    dispose(): void {
        for (const state of this.fileStates.values()) {
            if (state.creationDelayTimer) clearTimeout(state.creationDelayTimer);
        }
        this.fileStates.clear();
    }
}
