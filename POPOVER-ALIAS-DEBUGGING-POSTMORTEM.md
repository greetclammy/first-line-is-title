# Popover Alias Operations - Technical Postmortem

## Problem

Aliases do not update correctly in Obsidian popover editors due to fundamental sync/cache limitations in Obsidian's architecture.

**Auto-updates**: Alias property not updating when popover closes after editing
**Manual commands**: Alias duplicates or fails to add when user explicitly triggers update

**Constraints**:
- File rename must work in popovers (core feature)
- No cursor jumping during typing
- Handle rapid typing (multiple keystrokes per 100ms)

## Root Causes (Obsidian API Limitations)

### 1. No Popover Lifecycle Events

Obsidian provides no `popover-close` or similar event. Attempted workarounds:
- `active-leaf-change`: Only fires if active leaf changes (not when popover closes)
- `layout-change`: Only fires on structural changes (split, resize)
- `modify`/`metadata-change`: Fire on auto-save (2s delay), no editor context

**Result**: Cannot reliably detect when popover closes.

### 2. Popover Detection Unreliable

Popovers are DOM overlays, not workspace leaves. Detection methods all failed:

**File path matching**: Popovers don't appear in `workspace.getLeavesOfType()`
**Editor instance tracking**: Destroyed before events fire
**Active view comparison**: `isEditorInPopover()` returns true for both "in popover" AND "file closed"
```typescript
// Returns true when file closed AND when in popover
if (!activeView || activeView.file?.path !== file.path) {
    return true;
}
```
**DOM element checking**: `view.hoverPopover.targetEl` unreliable, assumes internal structure

### 3. Async Disk-Write Race Conditions

`processFrontMatter()` promise resolves before disk write completes:
- `vault.read()` immediately after returns stale content
- Editor sync overwrites user's new keystrokes
- Delays (10-50ms) insufficient due to unpredictable completion time

### 4. Four Layers of Stale Content

Manual commands revealed cascading cache issues:

1. **Editor cache**: `editor.getValue()` stale after `processFrontMatter()` writes
2. **Provided content cache**: Content passed to functions stale
3. **Disk cache**: `vault.cachedRead()` returns stale content
4. **Disk delay**: `vault.read()` returns empty/partial during async write (0-2 seconds)

**Evidence**: Even with `preferFresh=true` and `vault.read()`, content varies:
- 0 chars (empty file during write delay)
- Body only (frontmatter not yet synced)
- Full content (finally synced after 2+ seconds)

### 5. Editor Instance Lifecycle Mismatch

Workflow: Store editor instance → User closes popover → Obsidian destroys editor → Auto-save fires 2s later → Check stale editor reference

**Result**: Detection always fails.

## Failed Approaches

### Category 1: Editor Sync During Typing

**Approach**: Update frontmatter in editor while user types
**Methods tried**:
- `replaceRange()` instead of `setValue()` (still caused cursor jump)
- 10ms delay before disk read (race condition persisted)
- Direct YAML construction without disk read (still cursor jump)

**Why failed**: ANY CodeMirror edit during active typing triggers events that interfere with cursor

### Category 2: Defer to Popover Close

**Approach**: Set pending flag, update when popover closes
**Methods tried**:
- `active-leaf-change` + `layout-change` events (don't fire)
- `modify` + `metadata-change` events (fire on auto-save, wrong context)
- Store editor reference for later detection (editor destroyed)
- Transfer pending flag on rename (edge case fix, core issue remained)

**Why failed**: No reliable close event exists

### Category 3: Popover State Detection

**Methods tried**:
- `isFileInPopover(file)`: Only checks main editor
- `hasOpenEditor(file)`: Misses popover editors
- `view.hoverPopover.targetEl` exists: Stale after close
- `isEditorInPopover(editor, file)`: True for both "in popover" and "closed"
- `isEditorStillOpen(editor)`: Editor instance unreliable

**Why failed**: All detection has false positives or negatives

### Category 4: Manual Command Workarounds

**Objective**: Bypass auto-update restrictions, force fresh disk read

**Methods tried**:
- Skip `providedEditor`: Still used `providedContent`
- Skip `providedContent`: Used `vault.cachedRead()`
- Set `preferFresh=true`: `vault.read()` returned empty (disk write delay)
- Editor fallback when empty: `vault.read()` returned partial content (body without frontmatter)

**Why failed**: Obsidian's disk write delay (0-2s) + partial sync states = no consistent read method

## Phase 5: Manual Commands

After accepting auto-update limitation, manual commands also failed.

**Additional issue discovered**: Event handler thrashing
- Manual command adds alias via `processFrontMatter()`
- Async write triggers `modify` event
- Event handler reads stale content (no frontmatter yet)
- Removes just-added alias
- Pattern repeats

**Fix (commit 47461d5)**: Guard event handlers with `pendingMetadataUpdates` Set - skip processing if file has pending write

**Result**: Event thrashing fixed, but manual commands still hit 4 layers of stale content

**Final resolution (commit b39a049)**: Disable ALL alias operations in popovers (auto + manual)

## Final Solution

```typescript
// alias-manager.ts - Simple early return
if (editor && this.isEditorInPopover(editor, file)) {
    verboseLog(this.plugin, `Skipping alias update in popover: ${file.path}`);
    return;
}
```

**Removed**:
- 175 lines of auto-update workarounds
- 29 lines of manual command workarounds
- Total: 204 lines

**Current behavior**:
- ✅ File rename works in popovers
- ✅ No cursor jumping
- ✅ Aliases work in main workspace
- ❌ Aliases NOT updated in popovers (auto or manual)
- Workaround: Open file in main editor or use Hover Editor plugin

## Obsidian API Insights

### Documented Behaviors

1. **Popover editors are ephemeral**: Created on open, destroyed on close, no lifecycle hooks
2. **Auto-save is 2 seconds**: Internal interval, not configurable
3. **`replaceRange()` triggers events**: Even "surgical" edits cause editor-change
4. **Workspace events exclude popovers**: Popovers are overlays outside leaf structure
5. **Disk writes are async**: `processFrontMatter()` resolves before disk write completes
6. **Content read hierarchy**:
   - `providedContent` (stale after edits)
   - `editor.getValue()` (stale after `processFrontMatter()`)
   - `vault.cachedRead()` (stale, cached)
   - `vault.read()` (fresh but empty/partial during write delay)

### What Would Be Needed

- Obsidian API addition: `workspace.on('popover-close', callback)`
- OR: Synchronous query for "is file currently in any popover"
- OR: Consistent content read method that accounts for pending writes

## Technical Notes

**Why not polling?**: Performance cost, against plugin guidelines, still unreliable

**Why not mutation observer?**: Fragile (DOM structure dependency), breaks on Obsidian updates

**pendingMetadataUpdates Set**: Exists in code (alias-manager.ts) but only guards event handlers, doesn't solve read consistency
