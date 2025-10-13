# First Line is Title Plugin Policies

## ⚠️ PROCESSING POLICY

First Line is Title SHALL only processFile() if:

1. **renameNotes = "Automatically" AND (first line modified in open editor OR file focused in open editor if renameOnFocus is ON):**
   - No 'Property to disable renaming' present
   - File passes folder/tag/excluded-properties checks
   - checkInterval = 0: process immediately on change
   - checkInterval > 0: start timer on change, process when timer expires OR file's tab closes (whichever first). Timer cancels if tab closes before expiration.
   - New note delay > 0: process when delay expires.

2. **"Put first line in title" command:**
   - Single file:
     - 'Property to disable renaming' still blocks
     - Ignores folder/tag/property exclusions
   - Multi-file:
     - 'Property to disable renaming' still blocks
     - Checkboxes control folder/tag/property exclusions

## ⚠️ CODE QUALITY POLICY

- Strive to maximally consolidate and compartmentilize code to ease maintenance and conserve AI agent tokens.
- Clean up any unused, deprecated, dead, commented-out, and legacy code.

### CODE COMMENTS

- Prioritize clarity and brevity.
- Add comments ONLY when they meaningfully help with understanding or maintenance.
- Do NOT comment on the obvious.
- Avoid unnecessary, redundant, or verbose explanations.

## ⚠️ CONSOLE LOG POLICY

This plugin implements comprehensive debug logging with the following requirements:

### DEBUG LOGGING

When the `Debug` setting is ON, the following MUST be logged:

**Settings changes:**
- Every onChange handler must call this.plugin.debugLog(settingName, value)
- Includes: toggles, dropdowns, text inputs, sliders, array modifications, manual controls

**Operations:**
- Every plugin operation (file processing, renaming, alias updates, etc.)
- Every Notice sent to user
- Use verboseLog() utility function

### DEBUG STATE RESET

The `Debug` setting MUST be reverted to OFF on plugin onload if it's been ≥24 h since it was last enabled.

### CONSOLE LOG FORMATTING

Console log messages must NOT contain plugin name:
- Do NOT put prefixes like "First Line Is Title" or "FLIT" in any console log messages
- Keep messages clean and generic.

### LOGGING LEVELS AND METHODS

**NON-VERBOSE LOGS** (always shown, regardless of `Debug` setting state):
- Use console.log() to log rate limits and batch operation results.
- Use console.error() to log any and all errors during operations.

**VERBOSE LOGS** (shown only when Debug mode is ON):
- Use console.debug() for all other logging.