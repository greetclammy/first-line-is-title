# Feature Implementation & Debugging Guide

This document provides in-depth analysis of key FLIT features with exact implementation details and debugging entry points.

---

## Table of Contents

1. [Rename on Focus](#1-rename-on-focus)
2. [Alias Insertion](#2-alias-insertion)
3. [Workspace Events](#3-workspace-events)
4. [Editor Lifecycle](#4-editor-lifecycle)
5. [Page Preview (Hover Popover)](#5-page-preview-hover-popover)
6. [Canvas Integration](#6-canvas-integration)
7. [Quick Reference: Debugging Entry Points](#quick-reference-debugging-entry-points)

---

## 1. Rename on Focus

**Location:** `src/core/editor-lifecycle.ts:252-278`

### Implementation

Triggered when active file changes in workspace via:
- `app.workspace.on("active-leaf-change")`
- `app.workspace.on("layout-change")`

Tracks `lastFocusedFile` to prevent duplicate processing.

### Key Logic

```typescript
// Line 254: Check if rename-on-focus enabled
if (this.settings.core.renameOnFocus && this.isFullyLoaded) {
    const currentActiveFile = this.app.workspace.getActiveFile();

    // Line 260: Only process if focused file actually changed
    if (currentPath !== this.lastFocusedFile) {
        this.lastFocusedFile = currentPath;

        // Lines 263-268: COMMENTED OUT - recently renamed check
        // This prevents infinite rename loops

        // Line 273: Process file with rename engine
        this.renameEngine.processFile(currentActiveFile, true)
    }
}
```

### Debugging Points

- **Line 254:** Check if `renameOnFocus` setting is enabled
- **Line 256:** Verify `getActiveFile()` returns expected file
- **Line 260:** Ensure path comparison works (different file focused)
- **Line 263-268:** Note that `isRecentlyRenamed()` check is currently disabled for TESTING
- **Line 273:** Async call without await - doesn't block workspace

### Potential Issues

- If files rename rapidly, might trigger multiple times
- Currently commented-out loop prevention needs testing
- Rate limiting only via `perFileRateLimiter` in rename-engine

---

## 2. Alias Insertion

**Location:** `src/core/alias-manager.ts`

### Flow Chart

```
updateAliasIfNeeded() [Line 28]
  ↓
  Check disable property [Line 45]
  ↓
  Read file content [Line 53]
  ↓
  Extract first non-empty line [Line 64-70]
  ↓
  Find title source line [Line 82]
  ↓
  Parse frontmatter from fresh content [Line 88-100]
  ↓
  Check if alias should exist [Line 106]
  ↓
  Validate correct alias exists [Line 118-137]
  ↓
  addAliasToFile() [Line 149]
```

### Critical Implementation Details

#### ZWSP Marker System (Zero-Width Space)

```typescript
// Line 113: Define marker
const zwspMarker = '\u200B'

// Line 116: Mark plugin-added aliases
const expectedAliasWithMarker = zwspMarker + expectedAlias + zwspMarker
```

**Purpose:** Identify plugin-added aliases vs user-added aliases for selective removal without affecting user content.

#### Frontmatter Parsing (Lines 88-100)

```typescript
// Parse from FRESH editor content, not stale cache
const frontmatterInfo = getFrontMatterInfo(content);
if (frontmatterInfo.exists) {
    try {
        frontmatter = parseYaml(frontmatterInfo.frontmatter);
    } catch (error) {
        // Malformed YAML - skip until valid
        return;
    }
}
```

**Why fresh content?** Prevents race conditions during rapid YAML edits where cache hasn't updated yet.

#### Alias Property Keys (Lines 20-26)

```typescript
private getAliasPropertyKeys(): string[] {
    // Supports multiple properties: "aliases, alias, aka"
    return this.settings.aliases.aliasPropertyKey
        .split(',')
        .map(key => key.trim())
        .filter(key => key.length > 0);
}
```

Allows user to specify multiple YAML properties for aliases.

#### Custom Replacements in Alias (Lines 174-192)

- Applied if `enableCustomReplacements` AND `applyCustomRulesInAlias` enabled
- Three modes:
  - `onlyWholeLine`: Replace entire line if matches
  - `onlyAtStart`: Replace only at line start
  - General: Replace all occurrences
- Processes before markup stripping (if enabled)

#### Markup Stripping Control (Lines 194-206)

```typescript
// Temporarily disable forbidden chars for alias processing
this.settings.replaceCharacters.enableForbiddenCharReplacements = false;
if (!this.settings.markupStripping.stripMarkupInAlias) {
    this.settings.markupStripping.enableStripMarkup = false;
}

let aliasToAdd = extractTitle(aliasProcessedLine, this.settings);

// Restore settings
this.settings.replaceCharacters.enableForbiddenCharReplacements = originalSetting;
```

**Why toggle settings?** Allows different processing rules for aliases vs filenames.

#### Alias Insertion Logic (Lines 259-387)

**No frontmatter exists:**

```typescript
// Use processFrontMatter to create it (Line 271)
await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
    for (const aliasPropertyKey of aliasPropertyKeys) {
        if (aliasPropertyKey === 'aliases') {
            frontmatter[aliasPropertyKey] = [markedAlias]; // Array format
        } else {
            frontmatter[aliasPropertyKey] = markedAlias; // Inline format
        }
    }
});
```

**Frontmatter exists:**

- **Line 301:** `aliases` property → always array format, append to end
- **Lines 338-385:** Other properties → inline if single value, array if multiple

### Debugging Points

- **Line 45:** Disable property check (absolute first gate)
- **Line 50:** `shouldProcessFile()` - exclusion logic
- **Line 88:** Fresh frontmatter parsing - check for malformed YAML
- **Line 104:** Title vs filename comparison
- **Line 129:** ZWSP marker detection
- **Line 149:** Lock already acquired by `processFile()` - no separate lock needed
- **Line 232:** "Untitled" prevention logic
- **Line 283:** `pendingMetadataUpdates` tracking

### Common Issues

1. **Aliases not updating:** Check if YAML is malformed (Line 96)
2. **Duplicate aliases:** Verify ZWSP marker detection (Line 129)
3. **Wrong property format:** Check `aliases` vs custom property handling (Lines 301 vs 338)

---

## 3. Workspace Events

**Location:** `src/core/event-handler-manager.ts`

### All Registered Events

#### File Menu (Lines 55-67)
- **Event:** `"file-menu"`
- **Triggers:** Right-click on file/folder in file explorer
- **Action:** Adds context menu items via `contextMenuManager`

#### Files Menu (Lines 72-140)
- **Event:** `"files-menu"`
- **Triggers:** Multi-select files/folders, right-click
- **Action:** Batch operations menu items

#### Editor Menu (Lines 146-161)
- **Event:** `"editor-menu"`
- **Triggers:** Right-click in editor
- **Action:** Tag context menu items (if cursor on tag)

#### Editor Change (Lines 271-324)
- **Event:** `"editor-change"`
- **Triggers:** Every keystroke/edit in editor
- **Critical Flow:**
  ```typescript
  Line 278: if (renameNotes !== "automatically") return;
  Line 302: checkYamlAndResolve(file, content); // Early YAML detection
  Line 305: if (isFileInCreationDelay()) return; // Skip new files
  Line 313: if (!isFullyLoaded) return;
  Line 321: handleEditorChangeWithThrottle(); // Main handler
  ```

#### File Rename (Lines 331-347)
- **Event:** `vault.on('rename')`
- **Updates:** fileStateManager, editorLifecycle, cacheManager
- **Critical:** Updates all tracking maps to new path

#### File Delete (Lines 350-357)
- **Event:** `vault.on('delete')`
- **Cleanup:** Removes from cacheManager and fileStateManager

#### File Modify (Lines 360-424)
- **Event:** `vault.on('modify')`
- **Two pathways:**
  1. **Cache/File mode** (Lines 375-397): Process rename if file open in editor
  2. **Alias update** (Lines 399-422): Update aliases if content changed

#### Metadata Change (Lines 427-465)
- **Event:** `metadataCache.on('changed')`
- **Purpose:** Update aliases when metadata cache updates
- **Skips:** Files in creation delay, frontmatter-only changes

### Critical Path: Editor Change → Throttle Flow

```
editor-change event
  ↓
Line 302: checkYamlAndResolve() - resolve template waiters
  ↓
Line 305: Skip if in creation delay
  ↓
Line 321: handleEditorChangeWithThrottle()
    ↓ (goes to editor-lifecycle.ts)
Line 295: Extract current first line
  ↓
Line 315: If unchanged, skip
  ↓
Line 333: Start throttle timer (settings.checkInterval ms)
  ↓
Line 341: processEditorChangeOptimal() when timer expires
```

### Debugging Strategy

1. **Editor Change:** Add log at Line 273 to see all editor events
2. **YAML Detection:** Check Line 302 for template resolution
3. **Creation Delay:** Verify Line 305 skip logic
4. **Throttle:** Monitor Line 321 calls to see throttle engagement

---

## 4. Editor Lifecycle

**Location:** `src/core/editor-lifecycle.ts`

### Core Responsibility

Track editor state and manage change detection for automatic renaming.

### State Tracking Maps

- **`openEditorFiles`** (Line 21): Files open with timestamp
- **`activeEditorFiles`** (Line 28): Files with editor reference, last first line, leaf ID
- **`throttleTimers`** (Line 31): Active throttle timers per file
- **`creationDelayTimers`** (Line 34): Files in creation delay
- **`recentlyProcessedCloses`** (Line 38): Prevent duplicate tab-close processing

### Key Methods

#### updateActiveEditorTracking() (Lines 151-279)

Called on: `active-leaf-change`, `layout-change`

Builds map of all open markdown views and detects tab closures.

**Tab Close Detection** (Lines 185-242):

```typescript
// Line 189: Check if TFile object still exists (renamed vs closed)
for (const newData of newActiveFiles.values()) {
    if (newData.file === oldData.file) {
        stillOpen = true; // File renamed, not closed
        break;
    }
}

// Line 202: Check if leaf still active (tab switch vs close)
if (activeLeafIds.has(oldData.leafId)) {
    continue; // Tab switched, not closed
}

// Line 208: Prevent duplicate processing
if (this.recentlyProcessedCloses.has(filePath)) {
    continue;
}

// Line 223: Check throttle timer
if (hasThrottleTimer) {
    // Process immediately, override throttle delay
    await this.renameEngine.processFile(oldData.file, true);
}
```

**Tab Close Logic:**
1. Detect file no longer in `activeEditorFiles`
2. Verify file wasn't just renamed (same TFile object)
3. Verify leaf was actually closed (leaf ID not in active set)
4. Check for pending throttle timer
5. If timer exists: process immediately (override delay)
6. If no timer: do nothing (changes already saved)

#### handleEditorChangeWithThrottle() (Lines 285-348)

Main handler for editor content changes with throttle delay.

```typescript
// Line 295: Extract current first line
const currentFirstLine = this.extractFirstLineFromEditor(editor, file);

// Line 298: Get last known first line
const tracked = this.activeEditorFiles.get(filePath);

// Line 315: If unchanged, skip throttle
if (lastFirstLine === currentFirstLine) return;

// Line 322: Update tracking
tracked.lastFirstLine = currentFirstLine;

// Line 326: Check if timer already running
if (hasThrottleTimer) return; // Don't start new timer

// Line 333: Start throttle timer
const timer = setTimeout(async () => {
    this.plugin.fileStateManager.clearThrottleTimer(filePath);
    await this.renameEngine.processEditorChangeOptimal(editor, file);
}, this.settings.core.checkInterval);
```

**Throttle Strategy:**
- Only starts timer if first line actually changed
- One timer per file (no duplicate timers)
- Timer cleared on expiration or tab close
- Tab close overrides throttle (processes immediately)

#### extractFirstLineFromEditor() (Lines 403-428)

```typescript
// Skip frontmatter using metadata cache
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
```

**Used for:** Change detection (not actual renaming - that uses different extraction)

### Debugging Strategy

1. **Line 285:** Entry point - log all editor changes
2. **Line 295:** Verify first line extraction accuracy
3. **Line 298:** Check if file tracked (initialized)
4. **Line 315:** Most changes filtered here (title unchanged)
5. **Line 326:** Check for duplicate timer starts
6. **Line 333:** Timer start - verify delay duration
7. **Line 341:** Timer expiration - actual processing

### Common Issues

1. **Too many renames:** Check throttle timer settings (Line 333)
2. **No rename on edit:** Verify file tracked (Line 298)
3. **Rename on tab close only:** Check if timer clearing properly (Line 337)

---

## 5. Page Preview (Hover Popover)

### Status

**Not explicitly implemented** - no specific hover event handlers found in codebase.

### Current Behavior

Hover popovers use standard Obsidian rendering:
- Shows current file title (after rename)
- No custom injection into popover rendering
- Plugin doesn't modify hover preview behavior

### Potential Future Implementation

Would need to register handler for internal Obsidian hover events (not publicly documented in API).

### Investigation Path

If implementing custom hover behavior:
1. Check Obsidian API for hover-related events
2. Look for `HoverParent` or similar interfaces
3. Register event handler in `EventHandlerManager`
4. Inject custom title rendering

---

## 6. Canvas Integration

**Locations:**
- `src/core/workspace-integration.ts:425-456`
- `src/operations/file-operations.ts:138-142`

### Detection Method

```typescript
// Check if canvas is currently active view
const canvasIsActive = this.app.workspace.activeLeaf?.view?.getViewType?.() === 'canvas';
```

### Usage Points

#### Title Insertion for Canvas Files (workspace-integration.ts:425-456)

```typescript
// Line 425: Check if canvas is active
let canvasIsActive = false;
try {
    const activeLeaf = app.workspace.activeLeaf;
    canvasIsActive = activeLeaf?.view?.getViewType?.() === 'canvas';
} catch (error) {
    canvasIsActive = false; // Workspace not ready
}

// Line 436: Skip if no open editor AND canvas not active
if (!hasOpenEditor && !canvasIsActive) {
    verboseLog(plugin, `Skipping - file not in editor and canvas not active`);
    return;
}

// Line 443: Rate limiting for canvas-created files
if (!hasOpenEditor && canvasIsActive) {
    const now = Date.now();
    const timeSinceLastInsertion = now - plugin.workspaceIntegration.lastTitleInsertionTime;

    if (timeSinceLastInsertion < TITLE_INSERTION_RATE_LIMIT_MS) {
        verboseLog(plugin, `Skipping - rate limited`);
        return;
    }

    plugin.workspaceIntegration.lastTitleInsertionTime = now;
}
```

**Rate Limiting:**
- **Line 27:** `TITLE_INSERTION_RATE_LIMIT_MS = 1000` (1 file per second)
- **Purpose:** Prevents mass title insertion if canvas creates multiple files programmatically

#### Template Wait Skip (file-operations.ts:138-142)

```typescript
// Skip template wait if canvas active (Templater doesn't run in canvas)
const canvasIsActive = this.app.workspace.activeLeaf?.view?.getViewType?.() === 'canvas';
if (canvasIsActive) {
    currentContent = initialContent || '';
    verboseLog(this.plugin, `Skipping template wait (canvas active)`);
}
```

**Why skip?** Templater plugin doesn't execute in canvas views, so waiting is pointless.

### Canvas Behavior Summary

1. ✅ Files created in canvas **DO** trigger title insertion
2. ⏭️ Template wait is **SKIPPED** (Templater doesn't work in canvas)
3. ⏱️ Rate limiting prevents bulk operations (1 file/second)
4. 🎯 Canvas file creation detected via active leaf type

### Debugging Canvas Issues

**Check these values:**
- Log: `activeLeaf?.view?.getViewType?.()`
- Check: `lastTitleInsertionTime` timestamp
- Verify: Rate limit threshold (1000ms between insertions)
- Test: Create multiple files rapidly in canvas

**Common Issues:**
1. **Files not processing:** Check `canvasIsActive` detection (Line 425)
2. **Only first file processes:** Verify rate limiting (Line 443)
3. **Template not applied:** This is expected - template wait skipped

---

## Quick Reference: Debugging Entry Points

### Rename on Focus
- `editor-lifecycle.ts:254` - Feature gate (check if enabled)
- `editor-lifecycle.ts:260` - Path change detection
- `editor-lifecycle.ts:273` - Rename trigger (async call)

### Alias Insertion
- `alias-manager.ts:45` - Disable property check (first gate)
- `alias-manager.ts:88` - Fresh frontmatter parsing
- `alias-manager.ts:149` - Actual insertion entry
- `alias-manager.ts:271` - No frontmatter creation path
- `alias-manager.ts:296` - Existing frontmatter update path

### Workspace Events
- `event-handler-manager.ts:273` - Editor change entry point
- `event-handler-manager.ts:302` - YAML detection for templates
- `event-handler-manager.ts:332` - File rename tracking
- `event-handler-manager.ts:361` - File modify handler
- `event-handler-manager.ts:428` - Metadata change handler

### Editor Lifecycle
- `editor-lifecycle.ts:151` - Active editor tracking
- `editor-lifecycle.ts:185` - Tab close detection start
- `editor-lifecycle.ts:223` - Process on tab close (override throttle)
- `editor-lifecycle.ts:285` - Throttle handler entry
- `editor-lifecycle.ts:315` - Change detection filter (skip if unchanged)
- `editor-lifecycle.ts:333` - Throttle timer start

### Canvas
- `workspace-integration.ts:425` - Canvas detection
- `workspace-integration.ts:443` - Rate limiting check
- `file-operations.ts:139` - Template wait skip

### Rate Limiting
- `rename-engine.ts:42` - Per-file time limit check
- `rename-engine.ts:46` - Global rate limit check
- `workspace-integration.ts:27` - Canvas rate limit constant

---

## Debugging Workflow

### Issue: Rename Not Triggering

1. Check automatic rename enabled: `settings.core.renameNotes === "automatically"`
2. Check plugin fully loaded: `plugin.isFullyLoaded === true`
3. Check file not excluded: Debug `shouldProcessFile()` in `utils.ts`
4. Check not in creation delay: `editorLifecycle.isFileInCreationDelay()`
5. Check first line changed: Debug `extractFirstLineFromEditor()` output
6. Check throttle timer: Look for timer in `fileStateManager.throttleTimers`

### Issue: Alias Not Updating

1. Check aliases enabled: `settings.aliases.enableAliases === true`
2. Check disable property: Debug `hasDisablePropertyInFile()` result
3. Check YAML valid: Look for parse errors in `parseYaml()` (Line 94)
4. Check title comparison: Debug `processedLineMatchesFilename` (Line 104)
5. Check ZWSP markers: Look for `\u200B` in existing aliases
6. Check metadata cache: Verify `pendingMetadataUpdates` set cleared

### Issue: Canvas Files Not Processing

1. Check canvas detection: Log `getViewType()` result
2. Check rate limiting: Compare `lastTitleInsertionTime` vs current time
3. Check file open status: Look for `hasOpenEditor` flag
4. Check creation delay: Verify file not in `creationDelayTimers`

---

**Last Updated:** 2025-10-23
**Plugin Version:** 3.5.0+
