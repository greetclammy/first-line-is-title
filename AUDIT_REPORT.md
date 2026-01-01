# Comprehensive Code Audit Report

Audit of changes made to FLIT plugin settings UI restructuring.

---

## Critical Issues (Fix Immediately)

### 1. Unsafe querySelector Type Assertions

**Files affected:**
- `tab-exclusions.ts`: Lines 43-45, 269-271, 530-532, 796-798
- `tab-replace-characters.ts`: Lines 275, 542
- `tab-custom-rules.ts`: Lines 126-128
- `tab-safewords.ts`: Lines 38-40
- `tab-strip-markup.ts`: Lines 47-52

**Issue:** All files use `querySelector<HTMLElement>(...) as HTMLElement` without null checks. If SettingGroup DOM structure changes, these crash at runtime.

**Fix:** Add null guards:
```typescript
const container = this.containerEl.querySelector<HTMLElement>(".flit-group .setting-items");
if (!container) {
  console.error("Failed to find settings container");
  return;
}
```

---

### 2. Early Return Skips UI Update (tab-replace-characters.ts)

**Location:** Lines 505-519

**Issue:** When first enabling Windows/Android section, early return on line 518 skips `updateWindowsAndroidUI()`.

**Fix:** Call `updateWindowsAndroidUI()` before the return statement.

---

## Important Issues (Should Fix)

### 4. Unused mainToggle Variables

**Files:**
- `tab-replace-characters.ts`: Line 14
- `tab-safewords.ts`: Line 12

**Issue:** Variables assigned but never referenced. Causes lint warnings.

**Fix:** Remove variable assignment, call Setting constructor directly.

---

### 5. Massive Code Duplication in tab-exclusions.ts

**Location:** Lines 83-234, 334-471, 557-762

**Issue:** `renderExcludedFolders`, `renderExcludedTags`, `renderExcludedProperties` are 95%+ identical.

**Fix:** Extract generic list renderer factory function.

---

### 6. Duplicate Table Generation in tab-replace-characters.ts

**Location:** Lines 321-483 vs 596-755

**Issue:** ~160 lines of near-identical code for All OSes and Windows/Android tables.

**Fix:** Extract shared `createCharacterTable()` function.

---

### 7. Triple DOM Rebuild on Toggle (tab-replace-characters.ts)

**Location:** Lines 80-82

**Issue:** Three UI update functions called when one suffices:
```typescript
updateCharacterSettings(); // Rebuilds everything
updateCharacterReplacementUI(); // Redundant
updateWindowsAndroidUI(); // Redundant
```

**Fix:** Only call `updateCharacterSettings()`.

---

### 8. Orphaned Locale Key

**Location:** `en.json` line 106, `ru.json` line 112

**Issue:** `notifications.renamingDisabledForNote` not referenced in code.

**Fix:** Remove if confirmed unused.

---

### 9. Semantic CSS Class Name Error

**Location:** `tab-exclusions.ts` lines 427, 709

**Issue:** Tag and property settings use `flit-excluded-folder-setting` class name.

**Fix:** Rename to `flit-exclusion-item-setting`.

---

## CSS Issues

### 10. Dead CSS - Unused Section Header Modifiers

**Location:** `styles.css` lines 58-92

**Issue:** `.flit-char-replacement-section-header.windows-android`, `.command-palette`, `.ribbon`, `.context-menu` never used.

**Fix:** Remove 35 lines.

---

### 11. Duplicate CSS Selectors

**Duplicates:**
- `.flit-section-title`: Lines 94 and 391
- `.flit-settings-tab-name`: Lines 614 and 722 (conflicting values!)
- `.flit-custom-replacement-setting, .flit-safeword-setting`: Lines 413 and 484

**Fix:** Merge or remove earlier occurrences.

---

### 12. Invalid CSS Values

**Location:** Lines 1412, 1430-1443

**Issue:** `-empty` utility variants use empty string values which are invalid CSS:
```css
.flit-display-empty { display: ""; }  /* Invalid */
```

**Fix:** Remove invalid utility classes.

---

### 13. Unused CSS Classes

- `.flit-double-indent`: Lines 1118-1133 (not referenced)
- `.flit-state-disabled/enabled`: Lines 1535-1543 (not referenced)

**Fix:** Remove ~25 lines.

---

## Minor Issues

### 14. Redundant classList Operations

**Location:** `tab-exclusions.ts` lines 602-604, 776-777

**Issue:** Multiple sequential `classList.add()` calls.

**Fix:** Use variadic form: `classList.add("class1", "class2", "class3")`

---

### 15. Inconsistent Timeout Values

**Location:** `tab-exclusions.ts` lines 635, 649, 849, 863

**Issue:** Uses `setTimeout(..., 0)` instead of `TIMING.NEXT_TICK_MS` constant.

**Fix:** Use timing constant consistently.

---

## Summary by Severity

| Severity | Count | Est. Lines to Fix |
|----------|-------|-------------------|
| Critical | 2 | ~40 |
| Important | 6 | ~100 |
| CSS | 4 | ~75 |
| Minor | 2 | ~15 |

**Total estimated lines affected:** ~230

---

## Recommended Fix Priority

1. **First:** Null safety for querySelector (all affected files)
2. **Second:** Early return bug in tab-replace-characters.ts
3. **Third:** Remove unused mainToggle variables
4. **Fourth:** Clean up dead/duplicate CSS
5. **Fifth:** Refactor duplicated table code (optional, major effort)
