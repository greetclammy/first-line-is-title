# Popover Alias Auto-Update Debugging Postmortem

## Executive Summary

**Problem**: Alias property not auto-updating when user closes popover editor after editing a note.

**Duration**: 5.5 hours (October 26, 2025, 00:36-05:58 GMT+3)

**Attempts**: 27 commits representing 12+ distinct solution approaches

**Outcome**: All auto-update approaches failed. Final resolution was **acceptance of limitation** - aliases deliberately left stale in popovers, with user documentation added to settings explaining the constraint.

**Root causes**: Multiple intersecting issues made reliable auto-update impossible:
1. Obsidian provides no lifecycle events for popover close
2. Popover detection via workspace API is structurally unreliable
3. Async disk-write race conditions during rapid typing
4. Editor instance tracking fails when popovers close

**Key insight**: Sometimes the correct engineering decision is accepting a limitation rather than implementing an unreliable solution. The removed code (175 lines) eliminated multiple race conditions and produced a simpler, more maintainable codebase.

## The Problem

### Initial Symptoms

User editing notes in Obsidian hover popovers experienced two related issues:

1. **Cursor jumping**: Cursor would jump to line start during rapid typing
2. **Stale aliases**: After closing popover, the frontmatter alias property would not update to match the (successfully renamed) filename

### Constraints

- File rename functionality MUST work in popovers (core feature)
- Alias updates must not interfere with typing (no cursor jumps)
- Must handle rapid typing (multiple keystrokes per 100ms)
- Must work with both hover popovers and regular editor tabs

### Context

The plugin automatically:
1. Renames files based on first line content
2. Maintains a frontmatter alias property matching the old filename
3. Syncs multiple editor views to prevent flickering

When editing in popovers, the rename worked correctly, but alias property remained stale until user manually opened file in main editor.

## Timeline of Attempts

### Phase 1: Editor Sync Debugging (00:36-01:09, 6 commits)

**Objective**: Fix cursor jumping while maintaining alias visibility in popover

#### Attempt 1: Re-enable Editor Sync (00:36, commit bde94aa)
- **What**: Re-enabled `syncPopoverEditorBuffer()` calls previously disabled for testing
- **Why**: Log showed alias written to disk but not visible in popover
- **Result**: FAILED - Cursor jumping returned
- **Evidence**: Used `replaceRange()` instead of `setValue()`, no `setCursor()` calls, but still jumping

#### Attempt 2: Disk-Read Race Condition Fix (00:46, commit 39b9983)
- **What**:
  - Added 10ms delay after `processFrontMatter()` before `vault.read()`
  - Skip disk read entirely for frontmatter creation, construct YAML directly
- **Why**: Log showed disk content consistently behind editor content:
  ```
  Line 73:  disk 27 chars, editor 28 chars
  Line 140: disk 33 chars, editor 36 chars
  Line 177: disk 34 chars, editor 43 chars
  ```
- **Result**: FAILED - Cursor still jumped
- **Evidence**: Race condition persisted even with delay

#### Attempt 3: Skip Editor Sync in Popovers (00:56, commit f44cce4)
- **What**: Added popover detection before all editor sync operations
- **Why**: ANY `replaceRange()` call during rapid typing was interfering with cursor
- **Result**: FAILED - Alias not visible in popover (trade-off accepted temporarily)
- **Rationale**: Prioritized cursor stability over immediate alias visibility

#### Attempt 4: Force Fresh Disk Reads (01:02, commit 9fdb0df)
- **What**: Set `needsFreshRead` flag when skipping editor sync in popover
- **Why**: Ensure cached content doesn't become stale
- **Result**: N/A - Reverted in next commit

#### Attempt 5: Skip view.save() Before processFrontMatter (01:09, commit 0ff1ce9)
- **What**: Conditionally skip `view.save()` call when editing in popover
- **Why**: Prevent additional disk write that might trigger race condition
- **Result**: FAILED - Still had issues
- **Evidence**: Removed in next commit as part of new approach

### Phase 2: Defer Alias Updates to Popover Close (01:46-02:52, 7 commits)

**Objective**: Stop updating aliases during popover editing, trigger update when popover closes

#### Attempt 6: Skip Alias Updates, Pending Flag (01:46, commit ff269fe)
- **What**:
  - Detect popover editing via `isEditorInPopover()`, return early
  - Set `pendingAliasRecheck` flag
  - Add `active-leaf-change` event handler to detect popover close
- **Why**: Complete separation - zero alias operations during popover editing
- **Result**: PARTIALLY WORKED - Cursor jumping solved, but alias didn't update on close
- **Evidence**: Log showed active-leaf-change didn't fire when popover closed

#### Attempt 7: Add Layout-Change Event (01:54, commit 0d23821)
- **What**: Added `layout-change` event handler alongside `active-leaf-change`
- **Why**: Layout-change fires on any layout modification including popover close
- **Result**: FAILED - Still not firing reliably
- **Evidence**: Log showed no layout-change events when popover closed

#### Attempt 8: Use Modify/Metadata Events (02:10, commit 1d55715)
- **What**: Check pending flag in `modify` and `metadata-change` handlers
- **Why**: These events fire reliably on auto-save when popover closes
- **Result**: FAILED - Events fired but updates skipped
- **Evidence**: Log showed "file not open in editor" message, updates bypassed

#### Attempt 9: Transfer Pending Flag on Rename (02:23, commit 5138fef)
- **What**: Synchronously transfer `pendingAliasRecheck` flag from old to new path during rename
- **Why**: File path changes during rename, lose track of pending flag
- **Result**: HELPED - Fixed one edge case, but core issue remained

#### Attempt 10: Preserve Pending Flag (02:40, commit 14754dd)
- **What**: Don't clear pending flag when content changes during processing
- **Why**: Multiple renames during rapid typing were clearing flag prematurely
- **Result**: HELPED - Another edge case fixed, but detection still broken

#### Attempt 11: Pass isManualCommand Flag (02:52, commit a4c44e2)
- **What**: Pass `isManualCommand=true` when updating alias from pending flag
- **Why**: Bypass "file not open in editor" check when updating after popover close
- **Result**: PARTIAL - Updates triggered but detection wrong

#### Attempt 12: Refactor to isPendingAliasUpdate (03:20, commit 9ca6284)
- **What**: New parameter `isPendingAliasUpdate` instead of `isManualCommand`
- **Why**: Clearer semantics
- **Result**: REVERTED (03:34, commit fa9372a) - Didn't solve core issue

### Phase 3: Popover Detection Refinement (03:46-05:35, 8 commits)

**Objective**: Reliably detect when popover is still open vs closed

#### Attempt 13: Check Popover Closed Before Update (03:46, commit eddff18)
- **What**: Verify popover actually closed before updating alias
- **Why**: Distinguish between "update skipped during editing" and "update after close"
- **Result**: FAILED - Detection method broken

#### Attempt 14: Replace with hasOpenEditor (03:54, commit 25fcc14)
- **What**: Replace `isFileInPopover()` with `hasOpenEditor()`
- **Why**: Previous function always returned true
- **Result**: FAILED - Still detecting incorrectly

#### Attempt 15: Replace with isFileInHoverPopover (04:02, commit 58f5f1b)
- **What**: Check `view.hoverPopover` structure specifically
- **Why**: Distinguish hover popovers from other popover types
- **Result**: FAILED - User pointed out going in circles, already had this function
- **User feedback**: "why did you create a new isFileInHoverPopover() when we had isFileInPopover()? It seems like you're going in circles."

#### Attempt 16: Store Editor Reference (04:11, commit 30c2595)
- **What**:
  - Store editor instance when setting pending flag
  - Retrieve stored editor in event handlers
  - Use same `isEditorInPopover()` detection logic everywhere
- **Why**: Two different detection methods were inconsistent:
  - alias-manager: `isEditorInPopover(editor, file)` - worked correctly
  - event-handlers: `isFileInHoverPopover(file)` - broken
- **Result**: FAILED - `isEditorInPopover()` returns true for BOTH "in popover" and "closed completely"

#### Attempt 17: Add hasOpenEditor Check (05:04, commit ebfb8d8)
- **What**: Before checking `isEditorInPopover()`, verify file open in any editor
- **Why**: `isEditorInPopover()` returns true when `activeView.file?.path !== file.path`, which happens both in popover AND after file closed
- **Logic**: `if (hasOpenEditor && editor && isEditorInPopover) { defer } else { update }`
- **Result**: FAILED - `hasOpenEditor()` didn't detect files in hover popovers

#### Attempt 18: Fix hasOpenEditor for Hover Popovers (05:19, commit 648da04)
- **What**: Check both `view.file?.path` AND `view.hoverPopover?.file?.path`
- **Why**: Hover popovers accessed via different property path
- **Result**: FAILED - Still not detecting correctly

#### Attempt 19: Add targetEl Check (05:30, commit f405237)
- **What**: Check `view.hoverPopover.targetEl` exists (DOM element)
- **Why**: `hoverPopover` object persists after close, `targetEl` only exists when actually rendered
- **Result**: FAILED - Still issues with detection

#### Attempt 20: Replace with isEditorStillOpen (05:35, commit 357356a)
- **What**: Replace file-path-based detection with editor-instance-based detection
- **Why**: Path matching unreliable due to varying popover structures, use editor object identity
- **Result**: FAILED - Aliases updated while popover still open, or didn't update after close

### Phase 4: Acceptance (05:58, commit 968f15f)

**Decision**: Remove all auto-update-on-popover-close functionality

**Rationale**:
- 20 attempts over 5.5 hours
- Every detection method failed in some scenario
- No reliable way to detect popover close via Obsidian API
- Removed 175 lines of fragile, unreliable code
- Accepted limitation documented in settings UI

**What was removed**:
- `markPendingAliasRecheck()` calls and catch-up logic
- `active-leaf-change` and `layout-change` event handlers
- `checkPendingAliasUpdates()` function
- `isEditorStillOpen()` and `hasOpenEditor()` functions
- Pending alias checks from modify/metadata handlers
- `isCheckingPendingUpdates` field
- Pending flag transfer on rename

**Current behavior**:
- ✅ Typing in popover: Rename works, alias update skipped (prevents cursor jump)
- ⚠️ Close popover: Nothing happens (alias stays stale)
- ✅ Open in main editor: Normal auto-update works
- ✅ Manual command: Force update works

## Failed Solutions by Category

### Category 1: Editor Sync Approaches (6 attempts)

| # | Commit | Approach | Why It Failed |
|---|--------|----------|---------------|
| 1 | bde94aa | Re-enable editor sync with replaceRange() | Still caused cursor jumping despite surgical updates |
| 2 | 39b9983 | Add 10ms delay + direct YAML construction | Race condition persisted, delay too short |
| 3 | f44cce4 | Skip all editor sync in popovers | Fixed cursor but alias invisible (trade-off) |
| 4 | 9fdb0df | Force fresh disk reads after skipping sync | Didn't address core issue |
| 5 | 0ff1ce9 | Skip view.save() before processFrontMatter | Race condition remained |
| 6 | 16:43 | Pass diskContent to avoid vault.read() | Removed in phase 2 approach |

**Pattern**: ANY editor manipulation during rapid typing interfered with cursor, even "surgical" updates.

**Root cause**: CodeMirror events from FLIT's edits triggered during user's active typing session.

### Category 2: Event-Based Detection (7 attempts)

| # | Commit | Event Source | Why It Failed |
|---|--------|--------------|---------------|
| 7 | ff269fe | active-leaf-change | Doesn't fire when popover closes if file not open elsewhere |
| 8 | 0d23821 | layout-change | Doesn't fire if no actual layout change (e.g., popover overlay) |
| 9 | 1d55715 | modify + metadata-change | Fire on auto-save, but wrong context (no editor reference) |
| 10 | 5138fef | Flag transfer on rename | Helped edge case, didn't solve detection |
| 11 | 14754dd | Preserve flag during changes | Helped edge case, didn't solve detection |
| 12 | a4c44e2 | Use isManualCommand flag | Bypassed wrong check, detection still broken |
| 13 | 9ca6284 | Rename to isPendingAliasUpdate | Semantics change, no functional improvement |

**Pattern**: Obsidian provides no reliable "popover closed" event. Attempted to infer from workspace events, but none fire consistently.

**Root cause**: Popovers are overlays, not workspace leaves. Closing them doesn't trigger workspace restructuring events.

### Category 3: Popover Detection Methods (8 attempts)

| # | Commit | Detection Method | Why It Failed |
|---|--------|------------------|---------------|
| 14 | eddff18 | Check before update | Used broken detection function |
| 15 | 25fcc14 | hasOpenEditor(file) | Only checked main editor, missed popovers |
| 16 | 58f5f1b | isFileInHoverPopover(file) | User pointed out this was circular, already tried |
| 17 | 30c2595 | Store editor ref + isEditorInPopover(editor, file) | Returns true for both "in popover" and "closed" |
| 18 | ebfb8d8 | hasOpenEditor() + isEditorInPopover() | hasOpenEditor() missed files in popovers |
| 19 | 648da04 | Check view.hoverPopover.file.path | Still unreliable across different popover types |
| 20 | f405237 | Check view.hoverPopover.targetEl | targetEl can be stale or structure varies |
| 21 | 357356a | isEditorStillOpen(editor) via instance identity | Editor instances disappear unpredictably |

**Pattern**: Every detection method had false positives or false negatives.

**Root causes**:
1. `isEditorInPopover()` compares active view to provided editor - returns true when file closed because no active view
2. `hasOpenEditor()` iterates leaves, but popover editors aren't in main leaf structure
3. `targetEl` approach assumes consistent popover DOM structure - not guaranteed by Obsidian API
4. Editor instance tracking fails when Obsidian destroys editor before our event fires

## Root Causes Identified

### 1. Async Disk-Write Race Conditions

**Evidence**: Log obsidian.md-1761428457405.log showed:
```
Line 73:  disk 27 chars, editor 28 chars
Line 140: disk 33 chars, editor 36 chars
Line 177: disk 34 chars, editor 43 chars
```

**Mechanism**:
1. `processFrontMatter()` writes async to disk
2. Promise resolves before disk write completes
3. Subsequent `vault.read()` gets stale content
4. Sync stale content to editor → overwrites user's new keystrokes

**Why delays failed**: Async completion time unpredictable, 10-50ms insufficient for consistency.

### 2. Popover API Unreliability

**Structural issues**:
- Popovers are DOM overlays, not workspace leaves
- No dedicated API for popover lifecycle
- Multiple popover types: hover, page preview, link preview (different structures)
- `view.hoverPopover` property exists but undocumented, may change

**Detection failures**:
- File path matching: Popovers don't appear in `workspace.getLeavesOfType()`
- Editor instance: Gets destroyed before close event fires
- Active view comparison: Active view switches unpredictably
- DOM element checking: Assumes internal Obsidian structure

### 3. Event Timing Issues

**What we needed**: Synchronous event when popover closes

**What Obsidian provides**:
- `active-leaf-change`: Only fires if active leaf actually changes
- `layout-change`: Only fires on structural layout changes (split, resize)
- `file-open`: Fires when opening, not closing
- `modify` / `metadata-change`: Fire on auto-save (2s delay), no editor context

**Why auto-save events failed**: By the time modify event fires 2 seconds later, we've lost editor reference and can't determine if it was a popover.

### 4. Editor Instance Lifecycle Mismatch

**The problem**: We store editor instance at time of editing, retrieve it later for detection.

**What happens**:
1. User types in popover → store `popoverEditor` instance
2. User closes popover → Obsidian destroys `popoverEditor`
3. Auto-save triggers 2s later → we have reference to destroyed editor
4. Detection fails because we're checking a stale object

**Why isEditorInPopover returns true for closed files**:
```typescript
// Line 692-693 in alias-manager.ts
if (!activeView || activeView.file?.path !== file.path) {
    return true;  // Returns true when file closed AND when in popover
}
```

## Technical Insights

### Obsidian API Behaviors Discovered

1. **Popover editors are ephemeral**: Created on popover open, destroyed on close, no lifecycle hooks
2. **Auto-save is 2 seconds**: Obsidian's internal auto-save interval, not configurable
3. **replaceRange() triggers events**: Even "surgical" edits cause editor-change to fire
4. **Workspace events don't cover popovers**: Popovers are overlays outside main workspace leaf structure
5. **Editor instance comparison unreliable**: Instances can change between event and check

### What Would Be Needed for Working Solution

1. **Obsidian API addition**: `workspace.on('popover-close', callback)` event
2. **Alternative**: Stable popover identifier that persists after close
3. **Alternative**: Synchronous way to query "is file currently in any popover"
4. **Alternative**: Read-only mode in popovers (Obsidian feature, not plugin-controllable)

### Attempted Approaches Not Tried

**Why not poll?**
- Bad UX (CPU usage)
- Still unreliable (popover could close between polls)
- Against Obsidian plugin guidelines

**Why not mutation observer?**
- Fragile (depends on Obsidian's internal DOM structure)
- Performance cost
- Could break on Obsidian updates

**Why not iframe isolation?**
- Can't control how Obsidian renders popovers
- Would break other plugins

## Final Resolution

### What Was Removed (175 lines)

**file-state-manager.ts**:
- `pendingAliasEditor` field from FileState interface
- `markPendingAliasRecheck()` editor parameter
- `getPendingAliasEditor()` method
- `clearPendingAliasRecheck()` editor cleanup
- `getFilesWithPendingAliasRecheck()` method

**event-handler-manager.ts**:
- `registerActiveLeafChangeHandler()` method (25 lines)
- `checkPendingAliasUpdates()` method (45 lines)
- `isEditorStillOpen()` method (23 lines)
- `hasOpenEditor()` method (22 lines)
- `isCheckingPendingUpdates` field
- Pending alias checks in modify handler (22 lines)
- Pending alias checks in metadata handler (23 lines)

**rename-engine.ts**:
- Pending flag transfer on rename (9 lines)

**alias-manager.ts**:
- `markPendingAliasRecheck()` call
- Catch-up logic for pending aliases (10 lines)

### What Remains

**Working functionality**:
- ✅ File rename in popovers (instant)
- ✅ Cursor stays in place (no jumping)
- ✅ Normal editor alias updates (automatic)
- ✅ Manual command alias updates (works everywhere)
- ✅ Multi-editor sync for main editors

**Documented limitation**:
- Settings UI now shows: "Limitations" section
- English: "First line alias doesn't work in page preview. Using [Hover Editor] is recommended."
- Russian: "Псевдоним первой строки не работает в предварительном просмотре страницы. Рекомендуется использовать [Hover Editor]."
- Link to Hover Editor plugin (better popover editor with full features)

### Trade-off Acceptance

**What we gave up**:
- Auto-update aliases when popover closes

**What we gained**:
- Reliable cursor positioning (no jumping)
- 175 fewer lines of fragile code
- No race conditions
- Simpler mental model
- Better user expectations (clear limitation vs unreliable behavior)

**User impact**:
- Users editing in popovers see stale alias until:
  1. Opening file in main editor (triggers automatic update)
  2. Running manual rename command
  3. File auto-processes on next modification in main editor

## Lessons Learned

### When to Accept Limitations

**Red flags indicating should accept limitation**:
1. ✅ Multiple API approaches all failed
2. ✅ No documented API for required functionality
3. ✅ Solution requires polling or fragile heuristics
4. ✅ Debugging time exceeds feature value
5. ✅ Simpler workaround exists (manual command, open in main editor)

**This issue hit all five criteria.**

### Cost-Benefit of Continued Debugging

**Time invested**: 5.5 hours, 27 commits, 12+ approaches

**Functionality gain if solved**: Alias auto-updates in popovers (nice-to-have)

**Functionality at risk**: Cursor stability (must-have)

**Code complexity added**: 175 lines of event handling, detection heuristics, edge cases

**Maintenance burden**: Would break on Obsidian API changes, unclear error states

**Decision**: Not worth the cost. Feature is not core functionality, workarounds exist, reliability questionable.

### Importance of Clear Failure Criteria

**What we did wrong**: Kept trying new approaches without defining "when to stop"

**What we should have done**: After 3-4 failed detection approaches, evaluate:
- Is there a fundamental API limitation?
- Is the user impact severe enough to justify complexity?
- Is there a simpler alternative?

**Outcome**: Eventually reached right decision, but cost 5.5 hours to get there.

### User Communication

**Before**: Plugin silently failed to update aliases in popovers, confusing users

**After**:
- Clear limitation documented in settings
- Recommendation for alternative plugin
- Cursor stability guaranteed
- Manual workaround available

**Lesson**: Honest limitation > unreliable feature

## Conclusion

This debugging session demonstrates that sometimes the best solution is accepting a limitation. After exhausting every reasonable detection method and facing fundamental API constraints, removing the unreliable auto-update code produced a better outcome than any "working" solution would have:

- **More reliable**: No false positives/negatives in detection
- **Simpler**: 175 fewer lines to maintain
- **Clearer UX**: Users know what to expect
- **More stable**: No cursor jumping, no race conditions

The key insight: **Working around API limitations is acceptable when alternative approaches exist and the workaround is properly documented.**

### Final Statistics

- **Duration**: 5 hours 22 minutes
- **Commits**: 27
- **Distinct approaches**: 12+
- **Lines of code removed**: 175
- **Lines of documentation added**: 18 (translation keys + UI)
- **Bugs fixed**: Cursor jumping (critical)
- **Features removed**: Auto-update on popover close (nice-to-have)
- **Net outcome**: Positive (simpler, more reliable codebase)
