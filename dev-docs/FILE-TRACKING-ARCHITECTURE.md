# FLIT File Tracking Architecture

> **Note**: This document was fully generated in [Claude Code](https://claude.com/claude-code) by Claude Sonnet 4.5 from comprehensive tracking systems analysis.

**Document Type**: Internal maintainer reference
**Systems Documented**: 13 active tracking systems
**Coverage**: 9 core managers across FLIT plugin
**Purpose**: Understanding file tracking mechanisms for maintenance and debugging

## Overview

FLIT implements 13 tracking systems across 9 core managers to handle file state, editor lifecycle, concurrency control, and operation rates. Event handler registration is centralized through EventHandlerManager.

This document explains how each system works, its purpose, and cleanup mechanisms.

---

## 1. FILE STATE MANAGER
**Manager**: `FileStateManager` (`src/core/file-state-manager.ts`)
**Purpose**: Unified per-file state tracking consolidating systems from EditorLifecycleManager, RenameEngine, and CacheManager

This manager consolidates all per-file tracking into a single `Map<string, FileState>` where `FileState` contains:
```typescript
interface FileState {
    path: string;

    // Lifecycle timers (from EditorLifecycleManager)
    creationDelayTimer?: NodeJS.Timeout;
    viewReadinessTimer?: NodeJS.Timeout;
    recentlyRenamedTimestamp?: number;

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
```

### 1.1 Creation Delay Timers
- **Purpose**: Implement `newNoteDelay` setting (delay before processing newly created files)
- **Lifecycle**: Temporary per file creation, persists across initialization resets
- **Cleanup**:
  - Explicit via `clearCreationDelayTimer()`
  - NOT cleared on `initializeCheckingSystem()` - intentionally persists
  - Cleared on plugin unload and file delete

### 1.2 View Readiness Timers
- **Purpose**: Wait for markdown view to be ready on file creation (max 3 seconds)
- **Lifecycle**: Temporary per file creation, persists across initialization resets
- **Cleanup**:
  - Explicit via `clearViewReadinessTimer()`
  - NOT cleared on `initializeCheckingSystem()` - intentionally persists
  - Cleared on plugin unload and file delete

### 1.3 Recently Renamed Files Tracking
- **Data**: Timestamp stored in `recentlyRenamedTimestamp`
- **Purpose**: Prevent rename-on-focus loop when FLIT renames a file
- **Lifecycle**: 150ms TTL window
- **Cleanup**: Auto-cleared via `setTimeout()` after 150ms

### 1.4 Last Editor Content Cache
- **Purpose**: Cache editor content to detect if only frontmatter changed (YAML-only detection)
- **Lifecycle**: Session-long
- **Cleanup**:
  - Event-driven on file delete via `notifyFileDeleted()`
  - Migrated on rename via `notifyFileRenamed()`

### 1.5 Title Region Cache
- **Data**: `TitleRegionCache = {firstNonEmptyLine, titleSourceLine, lastUpdated}`
- **Purpose**: Cache extracted title regions to skip reprocessing if title unchanged
- **Lifecycle**: Session-long
- **Cleanup**:
  - Event-driven on file delete via `notifyFileDeleted()`
  - Full clear via `clearAllTitleRegionCaches()` on settings change
  - Migrated on rename via `notifyFileRenamed()`

### 1.6 Last Self-Reference Notice
- **Data**: Timestamp stored in `lastSelfRefNotice`
- **Purpose**: Rate-limit self-reference warning notifications (max once per 2 seconds per file)
- **Lifecycle**: Session-long
- **Cleanup**: Event-driven on file delete via `notifyFileDeleted()`

### 1.7 Last Safeword Notice
- **Data**: Timestamp stored in `lastSafewordNotice`
- **Purpose**: Rate-limit safeword warning notifications (max once per 2 seconds per file)
- **Lifecycle**: Session-long
- **Cleanup**: Event-driven on file delete via `notifyFileDeleted()`

### 1.8 Operation Tracker
- **Data**: `OperationData = {count, lastContent, lastUpdate}`
- **Purpose**: Track operation history per file for content change detection
- **Lifecycle**: Medium-lived (10 minutes)
- **Cleanup**:
  - Stale entries cleaned during maintenance (after 10 minutes)
  - Explicit cleanup on file delete via `notifyFileDeleted()`

### 1.9 File Operation Lock
- **Data**: Boolean flag `isLocked`
- **Purpose**: Prevent concurrent file operations (rename, alias update, etc.)
- **Usage**:
  - `acquireLock(path)` - sets locked flag when operation starts
  - `releaseLock(path)` - clears locked flag when operation completes
  - `isLocked(path)` - checks if operation in progress
- **Lifecycle**: Temporary per operation
- **Cleanup**:
  - Released in `finally` block of `processFile()` on **both original and new path** after rename
  - All cleared on unload via `clearAllLocks()`
- **Note**: Lock released on both old and new paths after rename, since state migrates to new path

### 1.10 Pending Alias Recheck
- **Data**: Boolean flag `pendingAliasRecheck`
- **Purpose**: Track files needing alias recheck after lock release (handles edits during locked operations)
- **Usage**:
  - `markPendingAliasRecheck(path)` - marks file for recheck
  - `hasPendingAliasRecheck(path)` - checks if recheck needed
  - `clearPendingAliasRecheck(path)` - clears after recheck
- **Lifecycle**: Temporary per lock cycle
- **Cleanup**: Cleared after 50ms delay when lock released

### Benefits of Consolidation
- **Single source of truth**: All per-file state in one map
- **Coherent lifecycle**: File rename/delete updates all related state atomically
- **Reduced complexity**: 10 separate maps → 1 unified map
- **Better event handling**: `notifyFileRenamed()` and `notifyFileDeleted()` update all state consistently

---

## 2. EDITOR LIFECYCLE TRACKING
**Manager**: `EditorLifecycleManager` (`src/core/editor-lifecycle.ts`)

**Note**: EditorLifecycleManager delegates creation delay timers, view readiness timers, and recently renamed files tracking to FileStateManager (see Section 1).

### 2.1 Active Editor Files Tracking
- **Data Structure**: `Map<string, { file: TFile, editor: any, leafId: string }>`
- **Purpose**: Track currently open markdown files for tab close detection
- **Lifecycle**: Session-long, updates constantly
- **Cleanup**: Replaced on each `updateActiveEditorTracking()` call

### 2.2 Throttle Timer System
- **Data Structure**: `Map<string, NodeJS.Timeout>`
- **Purpose**: Rate-limit file processing when `checkInterval > 0` (delayed processing mode)
- **Lifecycle**: Temporary, removed after delay expires
- **Cleanup**:
  - Explicit via `clearThrottleTimer()`
  - All cleared on `clearCheckingSystems()`
  - Auto-deleted by `setTimeout`

### 2.3 Recently Processed Closes Set
- **Data Structure**: `Set<string>`
- **Purpose**: Prevent duplicate processing of tab close events (multiple workspace events)
- **Lifecycle**: 100ms TTL window
- **Cleanup**: Auto-cleared via `setTimeout(() => delete())` after 100ms

### 2.4 Last Focused File
- **Data Structure**: `string | null`
- **Purpose**: Track last focused file to detect when user switches files (for rename-on-focus)
- **Lifecycle**: Single reference, session-long
- **Cleanup**: Overwritten on each focus change

---

## 3. RENAME ENGINE TRACKING
**Manager**: `RenameEngine` (`src/core/rename-engine.ts`)

**Note**: Content caching (last editor content, title region cache, notice timestamps) is managed by FileStateManager (see Section 1).

### 3.1 Per-File Rate Limiter
- **Data Structure**: `RateLimiter` instance
- **Configuration**: 15 operations per 500ms window per file
- **Purpose**: Prevent excessive processing of individual files
- **Lifecycle**: Session-long with sliding 500ms windows
- **Cleanup**: Automatic - timestamps expire after 500ms

### 3.2 Global Rate Limiter
- **Data Structure**: `RateLimiter` instance
- **Configuration**: 30 operations per 500ms window across all files (bypassed for batches)
- **Purpose**: Prevent excessive processing across entire vault
- **Lifecycle**: Session-long with sliding 500ms window
- **Cleanup**: Automatic - counter resets after 500ms

---

## 4. CACHE MANAGER TRACKING
**Manager**: `CacheManager` (`src/core/cache-manager.ts`)

**Note**: CacheManager delegates operation tracking, file operation locks, and pending alias rechecks to FileStateManager (see Section 1).

### 4.1 Content Cache (LRU)
- **Data Structure**: `LRUCache<string, string>` (max 1000 entries)
- **Purpose**: Track file content for deletion detection (empty → Untitled)
- **Lifecycle**: Session-long, bounded by LRU eviction
- **Cleanup**: LRU automatic eviction or `contentCache.clear()`

### 4.2 Temp Paths
- **Data Structure**: `Set<string>`
- **Purpose**: Reserve paths to prevent filename conflicts during batch operations
- **Lifecycle**: Temporary per operation
- **Cleanup**: Manual via `releasePath()`, `releasePathsBatch()`, or `clearReservedPaths()`

### 4.3 File Existence Cache
- **Data Structure**: `Set<string>` (internal to `FileExistenceCache` class)
- **Configuration**: 5-second TTL
- **Purpose**: Cache file paths to reduce vault lookups
- **Lifecycle**: 5s TTL window
- **Cleanup**: Auto-resets when TTL expires, or manual via `clear()`

---

## 5. WORKSPACE INTEGRATION TRACKING
**Manager**: `WorkspaceIntegration` (`src/core/workspace-integration.ts`)

### 5.1 Original Save Callback
- **Data Structure**: `(checking: boolean) => boolean | void | undefined`
- **Purpose**: Store original save command to restore on unload
- **Lifecycle**: Session-long
- **Cleanup**: Restored in `cleanup()`

---

## 6. PROPERTY MANAGER TRACKING
**Manager**: `PropertyManager` (`src/core/property-manager.ts`)

### 6.1 Notification Observer
- **Data Structure**: `MutationObserver | undefined`
- **Purpose**: Watch DOM for notifications to suppress merge notices
- **Lifecycle**: Session-long
- **Cleanup**: `disconnect()` called in `cleanupNotificationSuppression()`

### 6.2 Property Type Cache
- **Data Structure**: `Map<string, 'checkbox' | 'text' | null>`
- **Purpose**: Cache property types to reduce file I/O
- **Lifecycle**: Session-long
- **Cleanup**: Updated on `ensurePropertyTypeIsCheckbox()`

---

## 7. MAIN PLUGIN TRACKING
**Manager**: `FirstLineIsTitle` (`main.ts`)

### 7.1 Pending Metadata Updates
- **Data Structure**: `Set<string>`
- **Purpose**: Track files with pending metadata cache updates (for alias sync)
- **Lifecycle**: Short-lived (until metadata cache updates)
- **Cleanup**: Cleared when `metadataCache.on("changed")` fires

---

## 8. FILE OPERATIONS TRACKING
**Manager**: `FileOperations` (`src/operations/file-operations.ts`)

### 8.1 YAML Waiters
- **Data Structure**: `Map<string, { resolve: () => void, startTime: number, timeoutTimer: NodeJS.Timeout }>`
- **Purpose**: Template wait promises for YAML processing (5000ms timeout)
- **Lifecycle**: Temporary per operation
- **Cleanup**: Explicit cleanup on plugin unload via `cleanup()` method

---

## 9. EVENT HANDLER MANAGEMENT
**Manager**: `EventHandlerManager` (`src/core/event-handler-manager.ts`)

### 9.1 Registered Events
- **Data Structure**: `EventRef[]`
- **Purpose**: Track all registered event handlers for centralized cleanup
- **Lifecycle**: Session-long
- **Cleanup**: `unregisterAllHandlers()` called on plugin unload
- **Registered handlers**:
  - `file-menu` - Single file/folder context menu
  - `files-menu` - Multiple files/folders selection
  - `editor-menu` - Tag context menus in editor
  - DOM event listener for tag detection (tag pane and YAML)
  - `search:results-menu` - Search results context menu
  - `editor-change` - Real-time file processing
  - `vault.on('rename')` - File rename handler
  - `vault.on('delete')` - File delete handler
  - `vault.on('modify')` - File modify handler (with lock check)
  - `metadataCache.on('changed')` - Metadata change handler (with lock check)

### Benefits of EventHandlerManager
- **Centralized registration**: All event handlers in one place
- **Unified cleanup**: Single method to unregister all handlers
- **Better organization**: Event logic separated from main plugin file
- **Easier debugging**: Single location to inspect all event handlers

---

## DATA FLOW: FILE RENAME OPERATION

```
User edits file
  ↓
Editor change event → EditorLifecycleManager
  ↓
Check: FileStateManager.isLocked() (available?)
Check: FileStateManager.isFileInCreationDelay() (skip if in creation delay)
  ↓
processEditorChangeOptimal()
  ├─ If locked: FileStateManager.markPendingAliasRecheck(), return early
  ├─ Compare: FileStateManager.getLastEditorContent() vs current (YAML-only detection)
  ├─ Get: FileStateManager.getTitleRegionCache()
  ├─ Compare: current title region vs cached
  └─ If different: call processFile()
      ↓
processFile() [RenameEngine]
  ├─ Acquire lock: FileStateManager.acquireLock(originalPath)
  ├─ Check: perFileRateLimiter (15 ops/file/500ms)
  ├─ Check: globalRateLimiter (30 ops total/500ms)
  ├─ Perform: rename (originalPath → newPath)
  ├─ Update: FileStateManager state via notifyFileRenamed(oldPath, newPath)
  │   ├─ Migrates lastEditorContent
  │   ├─ Migrates titleRegionCache
  │   ├─ Migrates lock
  │   ├─ Migrates operationData
  │   └─ Migrates pendingAliasRecheck
  ├─ Update: CacheManager.notifyFileRenamed() (content cache, temp paths)
  ├─ Update aliases: aliasManager.updateAliasIfNeeded()
  │   ├─ Runs within existing fileOperationLock (no separate lock)
  │   ├─ vault.on('modify') event fires → BLOCKED by lock check
  │   └─ metadataCache.on('changed') event fires → BLOCKED by lock check
  ├─ Mark: pendingMetadataUpdates
  └─ Release locks:
      ├─ FileStateManager.releaseLock(originalPath) - old path
      └─ FileStateManager.releaseLock(newPath) - new path
          └─ If pendingAliasRecheck: trigger recheck after 50ms delay
```

**Lock release**: Lock released on both old and new paths after rename, since FileStateManager migrates state during `notifyFileRenamed()`.

**Duplicate alias prevention**: Event handlers check `isLocked()` before calling `updateAliasIfNeeded()`.

---

## CLEANUP STRATEGY

### Automatic Cleanup (TTL/Event-based)

**Time-Based**:
- **100ms**: Recently processed closes
- **150ms**: Recently renamed files (FileStateManager)
- **500ms**: Rate limiter windows (per-file and global)
- **5s**: File existence cache TTL
- **10m**: Stale operation tracker entries (FileStateManager)

**Event-Based**:
- **Metadata updates**: Cleared on `metadataCache.on("changed")`
- **File delete**: All per-file state cleaned on `vault.on("delete")`
  - FileStateManager.notifyFileDeleted() cleans:
    - `creationDelayTimer`, `viewReadinessTimer`
    - `lastEditorContent`, `titleRegionCache`
    - `lastSelfRefNotice`, `lastSafewordNotice`
    - `operationData`, `isLocked`, `pendingAliasRecheck`
  - CacheManager.notifyFileDeleted() cleans:
    - `contentCache`
- **File rename**: State migrated on `vault.on("rename")`
  - FileStateManager.notifyFileRenamed() migrates entire FileState to new path
  - CacheManager.notifyFileRenamed() migrates content cache, updates file existence

### Manual Cleanup (Plugin Unload)

On `onunload()`:
1. **FileStateManager**: `dispose()` - clears all FileState entries, stops all timers
2. **CacheManager**: `dispose()` - clears content cache, temp paths, file existence cache
3. **EditorLifecycleManager**: `clearCheckingSystems()` - clears throttle timers
4. **FileOperations**: `cleanup()` - clears YAML waiters
5. **WorkspaceIntegration**: `cleanup()` - stops observers, restores callbacks
6. **PropertyManager**: `cleanupNotificationSuppression()` - stops observer
7. **EventHandlerManager**: `unregisterAllHandlers()` - unregisters all event handlers

### Settings Change Cleanup

On settings change:
- `FileStateManager.clearAllTitleRegionCaches()` - title extraction rules may have changed

---

## KEY DESIGN PATTERNS

### 1. FileStateManager Consolidation
**Single unified per-file state manager**:
- All per-file tracking consolidated into `Map<string, FileState>`
- Single `notifyFileRenamed()` and `notifyFileDeleted()` updates all state atomically
- Reduces complexity: 10 separate tracking systems → 1 unified manager
- Coherent lifecycle management for all file-related state

### 2. EventHandlerManager Centralization
**Centralized event handler registration**:
- All event handlers registered through single manager
- Unified cleanup via `unregisterAllHandlers()`
- Separates event logic from main plugin file
- Easier debugging and maintenance

### 3. Concurrency Control
**Single unified lock**: `FileStateManager.isLocked` flag
- Acquired at start of `processFile()` on original path
- Released in `finally` block on **both original and new path**
- Alias operations run within same lock (no separate lock needed)
- Event handlers check lock before calling `updateAliasIfNeeded()`
- Recheck mechanism handles edits during lock via `pendingAliasRecheck`

### 4. YAML-Only Detection
**Prevents infinite loop when alias inserted**:
- `FileStateManager.lastEditorContent` cache compares full content
- If only frontmatter changed → skip processing
- Catches both user YAML edits AND FLIT's alias insertion

### 5. Rate Limiting
**Two-tier rate limiting**:
- **Per-file**: 15 ops per 500ms (prevents individual file spam)
- **Global**: 30 ops per 500ms (prevents vault-wide spam, bypassed for batches)
- Both use `RateLimiter` class with sliding windows

### 6. Rename-on-Focus Loop Prevention
**150ms window**: `FileStateManager.recentlyRenamedTimestamp`
- When FLIT renames file, marks with timestamp
- Focus change within 150ms → skip processing
- Prevents: rename → focus → rename → focus loop

### 7. Tab Close Duplicate Prevention
**100ms window**: `EditorLifecycleManager.recentlyProcessedCloses`
- Workspace fires multiple events on tab close
- First event adds to set for 100ms
- Subsequent events within window → skip processing

### 8. Creation Delay Persistence
**Why creation/view timers persist across init**:
- `FileStateManager` timers NOT cleared on `initializeCheckingSystem()`
- Prevents: file created → settings changed → delay reset → premature processing
- Ensures: new notes always respect full delay, regardless of settings changes

### 9. Event Handler Lock Checks
**Prevents duplicate alias updates**:
- `vault.on('modify')` and `metadataCache.on('changed')` both trigger alias updates
- Without lock checks, alias operations cascade: rename triggers modify, modify triggers alias, alias triggers modify...
- Lock checks prevent cascading: if file operation in progress, skip alias update
- Result: alias update runs once during rename, not 3+ times

### 10. Timing Constants Centralization
**Centralized timing configuration**:
- All delays, debounces, and timeouts defined in `src/constants/timing.ts`
- Makes delay values explicit and easy to adjust
- Examples:
  - `RENAME_TRACKING_CLEANUP_DELAY_MS: 150` - Recently renamed files TTL
  - `EVENT_TRACKER_CLEAR_DELAY_MS: 100` - Recently processed closes TTL
  - `SELF_REF_NOTICE_TTL_MS: 2000` - Self-reference notice rate limit
  - `YAML_INSERTION_TIMEOUT_MS: 5000` - YAML waiter timeout
  - `UI_SETTLE_DELAY_MS: 50` - Pending alias recheck delay

---

## TRACKING SYSTEM LIFETIMES

**Note**: Systems marked with [FSM] are managed by FileStateManager.

| System | Manager | Lifetime | Auto-Cleanup | Event-Cleanup | Manual-Cleanup |
|--------|---------|----------|--------------|---------------|----------------|
| **FileStateManager Systems** |
| Creation Delay Timers [FSM] | FileStateManager | Persistent | ✓ (setTimeout) | ✓ (on delete) | ✓ (on dispose) |
| View Readiness Timers [FSM] | FileStateManager | Persistent | ✓ (setTimeout) | ✓ (on delete) | ✓ (on dispose) |
| Recently Renamed Files [FSM] | FileStateManager | 150ms | ✓ (setTimeout) | ✓ (on delete) | — |
| Last Editor Content [FSM] | FileStateManager | Session | — | ✓ (on delete/rename) | ✓ (on dispose) |
| Title Region Cache [FSM] | FileStateManager | Session | — | ✓ (on delete/rename) | ✓ (on clear/dispose) |
| Last Self-Ref Notice [FSM] | FileStateManager | Session | — | ✓ (on delete) | ✓ (on dispose) |
| Last Safeword Notice [FSM] | FileStateManager | Session | — | ✓ (on delete) | ✓ (on dispose) |
| Operation Tracker [FSM] | FileStateManager | 10m | ✓ (maintenance) | ✓ (on delete) | ✓ (on dispose) |
| File Operation Lock [FSM] | FileStateManager | Temporary | — | ✓ (on delete) | ✓ (on release/dispose) |
| Pending Alias Recheck [FSM] | FileStateManager | Temporary (50ms) | ✓ (setTimeout) | ✓ (on delete) | ✓ (after recheck) |
| **Other Tracking Systems** |
| Active Editor Files | EditorLifecycleManager | Session | ✓ (on update) | — | ✓ (on unload) |
| Throttle Timers | EditorLifecycleManager | Temporary | ✓ (setTimeout) | — | ✓ (on clear) |
| Recently Processed Closes | EditorLifecycleManager | 100ms | ✓ (setTimeout) | — | — |
| Last Focused File | EditorLifecycleManager | Session | — | — | ✓ (on unload) |
| Per-File Rate Limiter | RenameEngine | Session (500ms) | ✓ (TTL) | — | — |
| Global Rate Limiter | RenameEngine | Session (500ms) | ✓ (TTL) | — | — |
| Content Cache (LRU) | CacheManager | Session (bounded) | ✓ (LRU) | ✓ (on delete) | ✓ (on dispose) |
| Temp Paths | CacheManager | Temporary | — | — | ✓ (on release) |
| File Existence Cache | CacheManager | 5s TTL | ✓ (TTL) | ✓ (on delete/rename) | ✓ (on dispose) |
| Original Save Callback | WorkspaceIntegration | Session | — | — | ✓ (on cleanup) |
| Notification Observer | PropertyManager | Session | — | — | ✓ (on cleanup) |
| Property Type Cache | PropertyManager | Session | — | — | — |
| Pending Metadata Updates | FirstLineIsTitle | Until update | — | ✓ (on cache changed) | — |
| YAML Waiters | FileOperations | Temporary (5s) | ✓ (timeout) | — | ✓ (on cleanup) |
| Registered Event Handlers | EventHandlerManager | Session | — | — | ✓ (on unregister) |

**Total: 25 tracking systems** (10 consolidated in FileStateManager + 15 others)

---

## MEMORY MANAGEMENT

### Bounded Systems
- **Content Cache**: LRU with 1000 entry limit
- **Rate Limiters**: Sliding windows with auto-expiry
- **TTL-based**: File existence cache (5s), FileStateManager operation tracker (10m)

### Event-Driven Cleanup
**All per-file state cleaned atomically on file delete**:
- **FileStateManager.notifyFileDeleted()** cleans all 10 tracking systems:
  - `creationDelayTimer`, `viewReadinessTimer`
  - `recentlyRenamedTimestamp`
  - `lastEditorContent`, `titleRegionCache`
  - `lastSelfRefNotice`, `lastSafewordNotice`
  - `operationData`, `isLocked`, `pendingAliasRecheck`
- **CacheManager.notifyFileDeleted()** cleans:
  - `contentCache`

### Self-Cleaning Timers
- Recently processed closes (100ms) - EditorLifecycleManager
- Recently renamed files (150ms) - FileStateManager
- Creation delay timers (user-configurable) - FileStateManager
- View readiness timers (max 3s) - FileStateManager
- YAML waiters (100ms default) - FileOperations

---

## ARCHITECTURE INSIGHTS

### FileStateManager Consolidation Benefits
**Why consolidate 10 tracking systems into one?**
- **Atomic state updates**: File rename/delete updates all related state in single operation
- **Reduced memory fragmentation**: 10 separate maps → 1 unified map
- **Coherent lifecycle**: All per-file state shares same lifecycle management
- **Easier debugging**: Single location to inspect all file state
- **Bug prevention**: Lock release on rename handled correctly through unified state management

### EventHandlerManager Centralization Benefits
**Why centralize event handler registration?**
- **Single registration point**: All event handlers registered in one manager
- **Unified cleanup**: One method call to unregister all handlers
- **Separation of concerns**: Event logic separated from main plugin file
- **Easier maintenance**: Single location to inspect/modify event handlers
- **Better organization**: Event handlers grouped by type (file-menu, editor-menu, etc.)

### Why Two Content Caches?
- **`FileStateManager.lastEditorContent`** (unbounded): Frontmatter change detection (editor events)
- **`CacheManager.contentCache`** (LRU-bounded): Content deletion detection (empty→Untitled)
- Different purposes, different eviction policies

### Why Persistent Creation Timers?
- `FileStateManager` timers persist across `initializeCheckingSystem()`
- Ensures new files always respect full delay, even if settings changed mid-creation
- Prevents premature processing of newly created notes

### Why Separate Rate Limiters?
- **Per-file**: Protects individual files from rapid-fire edits
- **Global**: Protects vault performance during bulk operations
- Global bypassed for batch operations (intentional design)

### Why 100ms/150ms TTL Windows?
- **100ms** (tab close): Workspace events settle quickly, duplicate prevention
- **150ms** (rename): Focus change events settle, loop prevention
- Windows carefully sized to allow events to settle without blocking user actions