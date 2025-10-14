export interface CacheConfig {
    maxContentEntries: number;
    maxOperationEntries: number;
    maintenanceIntervalMs: number;
    staleThresholdMs: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
    maxContentEntries: 1000,
    maxOperationEntries: 500,
    maintenanceIntervalMs: 300000, // 5 minutes - safety net for edge case cleanup
    staleThresholdMs: 10 * 60 * 1000,
};

class LRUCache<K, V> {
    private maxSize: number;
    private cache: Map<K, V>;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
    }

    size(): number {
        return this.cache.size;
    }

    keys(): IterableIterator<K> {
        return this.cache.keys();
    }
}

class FileExistenceCache {
    private pathCache: Set<string> = new Set();
    private lastUpdate: number = 0;
    private readonly cacheTTL: number = 5000;
    private plugin: any;

    constructor(plugin: any) {
        this.plugin = plugin;
    }

    exists(path: string): boolean {
        const now = Date.now();
        if (now - this.lastUpdate > this.cacheTTL) {
            this.rebuildCache();
            this.lastUpdate = now;
        }

        return this.pathCache.has(path.toLowerCase()) ||
               this.plugin.app.vault.getAbstractFileByPath(path) !== null;
    }

    private rebuildCache(): void {
        this.pathCache.clear();
        const files = this.plugin.app.vault.getAllLoadedFiles();
        for (const file of files) {
            this.pathCache.add(file.path.toLowerCase());
        }
    }

    addPath(path: string): void {
        this.pathCache.add(path.toLowerCase());
    }

    removePath(path: string): void {
        this.pathCache.delete(path.toLowerCase());
    }

    clear(): void {
        this.pathCache.clear();
        this.lastUpdate = 0;
    }
}

interface OperationData {
    count: number;
    lastContent: string;
    lastUpdate: number;
}

export class CacheManager {
    private config: CacheConfig;

    // Optimized data structures
    private contentCache: LRUCache<string, string>;
    private tempPaths: Set<string>;
    private fileExistence: FileExistenceCache;
    private operationTracker: Map<string, OperationData>;
    private aliasTimers: Map<string, NodeJS.Timeout>;
    private aliasInProgress: Set<string>;
    private firstRenames: Set<string>;

    // Maintenance
    private maintenanceTimer: NodeJS.Timeout | null = null;
    private isDisposed: boolean = false;

    constructor(plugin: any, config: CacheConfig = DEFAULT_CACHE_CONFIG) {
        this.config = config;

        // Initialize optimized caches
        this.contentCache = new LRUCache(config.maxContentEntries);
        this.tempPaths = new Set();
        this.fileExistence = new FileExistenceCache(plugin);
        this.operationTracker = new Map();
        this.aliasTimers = new Map();
        this.aliasInProgress = new Set();
        this.firstRenames = new Set();

        // Start maintenance cycle only if configured
        if (config.maintenanceIntervalMs > 0) {
            this.startMaintenance();
        }
    }

    // ==================== CONTENT CACHE ====================

    /**
     * Get cached content for a file - O(1) operation
     */
    getContent(filePath: string): string | undefined {
        return this.contentCache.get(filePath);
    }

    /**
     * Store content in cache - O(1) operation with LRU eviction
     */
    setContent(filePath: string, content: string): void {
        this.contentCache.set(filePath, content);
    }

    /**
     * Check if content has changed - O(1) operation
     */
    hasContentChanged(filePath: string, currentContent: string): boolean {
        const cachedContent = this.contentCache.get(filePath);
        return cachedContent !== currentContent;
    }

    // ==================== TEMP PATHS (CONFLICT PREVENTION) ====================

    /**
     * Reserve a path to prevent conflicts - O(1) operation (vs O(n) with array)
     */
    reservePath(path: string): void {
        this.tempPaths.add(path.toLowerCase());
    }

    /**
     * Release a reserved path - O(1) operation
     */
    releasePath(path: string): void {
        this.tempPaths.delete(path.toLowerCase());
    }

    /**
     * Release multiple paths at once (for batch operations)
     */
    releasePathsBatch(paths: string[]): void {
        for (const path of paths) {
            this.tempPaths.delete(path.toLowerCase());
        }
    }

    /**
     * Clear all reserved paths (for immediate cleanup after batch operations)
     */
    clearReservedPaths(): void {
        this.tempPaths.clear();
    }

    /**
     * Check if path is reserved - O(1) operation (vs O(n) with array.some())
     */
    isPathReserved(path: string): boolean {
        return this.tempPaths.has(path.toLowerCase());
    }

    /**
     * Check for path conflicts - O(1) operation combining existence + reservation
     */
    hasPathConflict(path: string): boolean {
        return this.fileExistence.exists(path) || this.isPathReserved(path);
    }

    // ==================== FILE EXISTENCE CACHE ====================

    /**
     * Check if file exists - O(1) with TTL cache
     */
    fileExists(path: string): boolean {
        return this.fileExistence.exists(path);
    }

    /**
     * Notify cache of new file creation
     */
    notifyFileCreated(path: string): void {
        this.fileExistence.addPath(path);
    }

    /**
     * Notify cache of file deletion
     */
    notifyFileDeleted(path: string): void {
        this.fileExistence.removePath(path);
        this.contentCache.delete(path);
        this.releasePath(path);
        this.operationTracker.delete(path);
        this.firstRenames.delete(path);
    }

    /**
     * Update cache when file is renamed
     */
    notifyFileRenamed(oldPath: string, newPath: string): void {
        // Move content cache entry
        const content = this.contentCache.get(oldPath);
        if (content !== undefined) {
            this.contentCache.delete(oldPath);
            this.contentCache.set(newPath, content);
        }

        // Update file existence cache
        this.fileExistence.removePath(oldPath);
        this.fileExistence.addPath(newPath);

        // Move operation tracking
        const operation = this.operationTracker.get(oldPath);
        if (operation) {
            this.operationTracker.delete(oldPath);
            this.operationTracker.set(newPath, operation);
        }

        // Move first rename tracking
        if (this.firstRenames.has(oldPath)) {
            this.firstRenames.delete(oldPath);
            this.firstRenames.add(newPath);
        }

        // Release old path, reserve new path temporarily
        this.releasePath(oldPath);
        this.reservePath(newPath);
    }

    // ==================== OPERATION TRACKING ====================

    /**
     * Track operation for rate limiting and conflict prevention
     */
    trackOperation(filePath: string, content: string): void {
        const existing = this.operationTracker.get(filePath);

        if (existing) {
            existing.count++;
            existing.lastContent = content;
            existing.lastUpdate = Date.now();
        } else {
            this.operationTracker.set(filePath, {
                count: 1,
                lastContent: content,
                lastUpdate: Date.now()
            });
        }
    }

    /**
     * Get operation data for a file
     */
    getOperationData(filePath: string): OperationData | undefined {
        return this.operationTracker.get(filePath);
    }

    // ==================== ALIAS MANAGEMENT ====================

    /**
     * Set alias update timer
     */
    setAliasTimer(filePath: string, timer: NodeJS.Timeout): void {
        // Clear existing timer
        const existing = this.aliasTimers.get(filePath);
        if (existing) {
            clearTimeout(existing);
        }

        this.aliasTimers.set(filePath, timer);
    }

    /**
     * Clear alias timer
     */
    clearAliasTimer(filePath: string): void {
        const timer = this.aliasTimers.get(filePath);
        if (timer) {
            clearTimeout(timer);
            this.aliasTimers.delete(filePath);
        }
    }

    /**
     * Mark alias operation as in progress
     */
    markAliasInProgress(filePath: string): void {
        this.aliasInProgress.add(filePath);
    }

    /**
     * Mark alias operation as completed
     */
    markAliasCompleted(filePath: string): void {
        this.aliasInProgress.delete(filePath);
        this.clearAliasTimer(filePath);
    }

    /**
     * Check if alias operation is in progress
     */
    isAliasInProgress(filePath: string): boolean {
        return this.aliasInProgress.has(filePath);
    }

    /**
     * Clear all alias timers (used during plugin unload)
     */
    clearAllAliasTimers(): void {
        for (const timer of this.aliasTimers.values()) {
            clearTimeout(timer);
        }
        this.aliasTimers.clear();
        this.aliasInProgress.clear();
    }

    // ==================== FIRST RENAME TRACKING ====================

    /**
     * Check if this is the first rename for a file
     */
    isFirstRename(filePath: string): boolean {
        return !this.firstRenames.has(filePath);
    }

    /**
     * Mark file as having been renamed
     */
    markFileRenamed(filePath: string): void {
        this.firstRenames.add(filePath);
    }

    /**
     * Clear first rename tracking for a file
     */
    clearFirstRenameTracking(filePath: string): void {
        this.firstRenames.delete(filePath);
    }

    // ==================== MAINTENANCE & CLEANUP ====================

    /**
     * Start automatic maintenance cycle (only if configured)
     * Note: Most cleanup is now done immediately after operations complete
     */
    private startMaintenance(): void {
        if (this.maintenanceTimer) return;

        this.maintenanceTimer = setInterval(() => {
            if (!this.isDisposed) {
                this.performMaintenance();
            }
        }, this.config.maintenanceIntervalMs);
    }

    /**
     * Perform maintenance - clean up stale entries (legacy fallback only)
     * Most cleanup is now done immediately after operations complete
     */
    private performMaintenance(): void {
        const now = Date.now();
        const cutoff = now - this.config.staleThresholdMs;

        // Clean up stale operations
        for (const [path, data] of this.operationTracker.entries()) {
            if (data.lastUpdate < cutoff) {
                this.operationTracker.delete(path);
            }
        }

        // Validate temp paths against actual file system
        const validPaths = new Set<string>();
        for (const path of this.tempPaths) {
            if (this.fileExistence.exists(path)) {
                validPaths.add(path);
            }
        }
        this.tempPaths = validPaths;

        // Clean up completed alias operations
        for (const path of this.aliasInProgress) {
            if (!this.fileExistence.exists(path)) {
                this.aliasInProgress.delete(path);
                this.clearAliasTimer(path);
            }
        }
    }

    /**
     * Get cache statistics for monitoring
     */
    getStats(): {
        contentCacheSize: number;
        tempPathsCount: number;
        operationsTracked: number;
        aliasTimersActive: number;
        aliasInProgressCount: number;
    } {
        return {
            contentCacheSize: this.contentCache.size(),
            tempPathsCount: this.tempPaths.size,
            operationsTracked: this.operationTracker.size,
            aliasTimersActive: this.aliasTimers.size,
            aliasInProgressCount: this.aliasInProgress.size
        };
    }

    /**
     * Force immediate cleanup
     */
    forceCleanup(): void {
        this.performMaintenance();
    }

    /**
     * Dispose of cache manager and clean up all resources
     */
    dispose(): void {
        this.isDisposed = true;

        // Stop maintenance
        if (this.maintenanceTimer) {
            clearInterval(this.maintenanceTimer);
            this.maintenanceTimer = null;
        }

        // Clear all alias timers
        for (const timer of this.aliasTimers.values()) {
            clearTimeout(timer);
        }

        // Clear all caches
        this.contentCache.clear();
        this.tempPaths.clear();
        this.fileExistence.clear();
        this.operationTracker.clear();
        this.aliasTimers.clear();
        this.aliasInProgress.clear();
        this.firstRenames.clear();
    }
}