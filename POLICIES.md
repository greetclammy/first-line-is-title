# Plugin Policies

## ⚠️ PROCESSING POLICY

First Line is Title SHALL only processFile() if:

1. **renameNotes = "Automatically" AND first line modified in open editor:**
   - No disable property present
   - File passes folder/tag/excluded-properties checks
   - checkInterval = 0: process immediately on change
   - checkInterval > 0: start timer on change, process when timer expires OR file's tab closes (whichever first). Timer cancels if tab closes before expiration.
   - New note delay > 0: process when delay expires.

2. **"Put first line in title" command:**
   - Single file:
     - Disable property still blocks
     - Ignores folder/tag/property exclusions
   - Multi-file:
     - Disable property still blocks
     - Checkboxes control folder/tag/property exclusions

## ⚠️ CONSOLE LOG POLICY

This plugin implements comprehensive debug logging with the following requirements:

### 1. DEBUG LOGGING
All plugin settings changes MUST be logged to console when the `Debug` setting is ON:
- Every onChange handler in settings.ts must call this.plugin.debugLog(settingName, value)
- This includes:
  - Toggles (.addToggle)
  - Dropdowns (.addDropdown)
  - Text inputs (.addText and manual createEl('input'))
  - Sliders (.addSlider)
  - Array modifications (add/remove items)
  - Manual controls (createEl('select'), addEventListener('change'))
- The debugLog helper function is implemented in main.ts

### 2. DEBUG STATE RESET
The `Debug` setting MUST be reverted to OFF on plugin onload if it's been ≥24 h since it was last enabled.

### 3. CONSOLE LOG FORMATTING
Console log messages must NOT contain plugin name:
- Do NOT put prefixes like "First Line Is Title" or "FLIT" in any console log messages
- Keep messages clean and generic.

### 4. LOGGING LEVELS AND METHODS

**NON-VERBOSE LOGS** (always shown, regardless of `Debug` setting state):
- Use console.log() to log rate limits and batch operation results (e.g., "Batch operation: 15/20 files processed, 2 errors").
- Use console.error() to log any and all errors during operations.

**VERBOSE LOGS** (shown only when Debug mode is ON):
- Use console.debug() for all other logging.

## ⚠️ CODE COMMENTS POLICY

- Prioritize clarity and brevity.
- Add comments ONLY when they meaningfully help with understanding or maintenance.
- Do NOT comment on the obvious.
- Avoid unnecessary, redundant, or overly verbose explanations.
