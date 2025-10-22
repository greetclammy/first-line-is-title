# First Line is Title Plugin Policies

## 📋 PROCESSING POLICY

First Line is Title SHALL only processFile() if:

1. **Automatic mode trigger conditions:**

   ALL of the following MUST be true:
   - renameNotes = "automatically"
   - Note content below YAML modified in open editor OR note focused in open editor (if renameOnFocus is ON)
   - No 'Property to disable renaming' present
   - Note passes folder/tag/excluded-properties checks

   Processing timing:
   - checkInterval = 0: process immediately on change
   - checkInterval > 0: start timer on change, process when timer expires OR file's tab closes (whichever first). Timer cancels if tab closes before expiration.
   - New note delay > 0: process when delay expires (after note creation)

2. **"Put first line in title" command:**
   - Single note:
     - 'Property to disable renaming' still blocks
     - Ignores folder/tag/property exclusions
   - Multiple notes:
     - 'Property to disable renaming' still blocks
     - Checkboxes control folder/tag/property exclusions

## 📋 CODE QUALITY POLICY

- Strive to maximally consolidate and compartmentalize code to ease maintenance and conserve AI agent tokens.
- Clean up any unused, deprecated, dead, commented-out, and legacy code.

### Code comments

Keep: WHY (policy, timing, edge case, backward compat, and the like):
- Prioritize clarity and brevity.
- Add comments ONLY when they meaningfully help with understanding or maintenance.

Forgo: WHAT (when code is self-documenting):
- Do NOT comment on the obvious.
- Avoid unnecessary, redundant, or verbose explanations.

## 📋 CONSOLE LOG POLICY

This plugin implements comprehensive debug logging with the following requirements:

### Debug logging

When the `Debug` setting is ON, the following MUST be logged:

**Settings changes:**
- Every onChange handler must call this.plugin.debugLog(settingName, value)
- Includes: toggles, dropdowns, text inputs, sliders, array modifications, manual controls

**Operations:**
- Every plugin operation (note processing, renaming, alias updates, etc.)
- Every Notice sent to user
- Use verboseLog() utility function

### Debug state reset

The `Debug` setting MUST be reverted to OFF on plugin onload if it's been ≥24 h since it was last enabled.

### Console log formatting

Console log messages must NOT contain plugin name:
- Do NOT put prefixes like "First Line Is Title" or "FLIT" in any console log messages
- Keep messages clean and generic.

### Logging levels and methods

**NON-VERBOSE LOGS** (always shown, regardless of `Debug` setting state):
- Use console.log() to log:
   - Rate limit reached
   - Batch operation results
   - Original filename upon first rename or manual rename command execution
- Use console.error() to log any and all errors during operations.

**VERBOSE LOGS** (shown only when Debug mode is ON):
- Use console.debug() for all other logging.

## 📋 STYLE MANUAL

This applies to user-facing text only.

- Prefer the term 'note' over 'file'.
- Prefer the term 'Properties' or 'Properties block' (both capitalized) over 'YAML' or 'frontmatter'.
- Prefer the verb 'set' over 'configure', 'control', 'choose' or 'specify'.
- Prefer the term 'forbidden characters' over 'illegal characters'.

## Setting descriptions

- Prefer the term 'filename' over 'title'.
- English: Italicize names of commands and names of plugin settings sections.
- Russian: Wrap names of commands and names of plugin settings sections in «».