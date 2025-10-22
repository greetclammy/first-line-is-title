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
 * Consolidates tracking from EditorLifecycleManager, RenameEngine, and CacheManager
 */
export interface FileState {
    path: string;

    // Lifecycle timers (from EditorLifecycleManager)
    creationDelayTimer?: NodeJS.Timeout;
    viewReadinessTimer?: NodeJS.Timeout;
    recentlyRenamedTimestamp?: number; // 150ms TTL

    // Content tracking (from RenameEngine)
    lastEditorContent?: string;
    titleRegionCache?: TitleRegionCache;
    lastSelfRefNotice?: number; // timestamp
    lastSafewordNotice?: number; // timestamp

    // Operation tracking (from CacheManager)
    operationData?: OperationData;
    isLocked?: boolean;
    pendingAliasRecheck?: boolean;
}

/**
 * Centralized file state manager
 * Consolidates 9 per-file tracking systems from multiple managers
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
    // LIFECYCLE TIMERS (from EditorLifecycleManager)
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
     * Set view readiness timer for a file
     */
    setViewReadinessTimer(path: string, timer: NodeJS.Timeout): void {
        const state = this.getOrCreateState(path);
        if (state.viewReadinessTimer) {
            clearTimeout(state.viewReadinessTimer);
        }
        state.viewReadinessTimer = timer;
    }

    /**
     * Clear view readiness timer
     */
    clearViewReadinessTimer(path: string): void {
        const state = this.fileStates.get(path);
        if (state?.viewReadinessTimer) {
            clearTimeout(state.viewReadinessTimer);
            delete state.viewReadinessTimer;
        }
    }

    /**
     * Mark file as recently renamed (150ms TTL)
     */
    markRecentlyRenamed(path: string): void {
        const state = this.getOrCreateState(path);
        state.recentlyRenamedTimestamp = Date.now();

        setTimeout(() => {
            const currentState = this.fileStates.get(path);
            if (currentState) {
                delete currentState.recentlyRenamedTimestamp;
            }
        }, TIMING.RENAME_TRACKING_CLEANUP_DELAY_MS);
    }

    /**
     * Check if file was recently renamed (within TTL window)
     */
    wasRecentlyRenamed(path: string): boolean {
        const state = this.fileStates.get(path);
        if (!state?.recentlyRenamedTimestamp) return false;
        return (Date.now() - state.recentlyRenamedTimestamp) < TIMING.RENAME_TRACKING_CLEANUP_DELAY_MS;
    }

    // ============================================================================
    // CONTENT TRACKING (from RenameEngine)
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
    // OPERATION TRACKING (from CacheManager)
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
     */
    markPendingAliasRecheck(path: string): void {
        const state = this.getOrCreateState(path);
        state.pendingAliasRecheck = true;
    }

    /**
     * Check if file has pending alias recheck
     */
    hasPendingAliasRecheck(path: string): boolean {
        return this.fileStates.get(path)?.pendingAliasRecheck ?? false;
    }

    /**
     * Clear pending alias recheck
     */
    clearPendingAliasRecheck(path: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.pendingAliasRecheck = false;
        }
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
            if (state.viewReadinessTimer) clearTimeout(state.viewReadinessTimer);
            this.fileStates.delete(path);
        }
    }

    /**
     * Maintenance: cleanup stale entries
     * Called periodically to remove old operation data
     */
    runMaintenance(): void {
        const now = Date.now();
        const staleThreshold = 10 * 60 * 1000;

        for (const [path, state] of this.fileStates.entries()) {
            if (state.operationData) {
                const age = now - state.operationData.lastUpdate;
                if (age > staleThreshold) {
                    delete state.operationData;
                }
            }

            if (Object.keys(state).length === 1 && state.path === path) {
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
            if (state.viewReadinessTimer) clearTimeout(state.viewReadinessTimer);
        }
        this.fileStates.clear();
    }
}
