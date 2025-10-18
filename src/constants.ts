import { PluginSettings, OSPreset, TagMatchingMode, FileReadMethod, ExcludedProperty } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
    folderScopeStrategy: 'Only exclude...',
    tagScopeStrategy: 'Only exclude...',
    propertyScopeStrategy: 'Only exclude...',
    excludedFolders: [""],
    excludedTags: [""],
    excludedProperties: [],
    charCount: 100,
    checkInterval: 0,
    osPreset: 'macOS',
    charReplacements: {
        slash: ' ∕ ',
        colon: '։',
        asterisk: '∗',
        question: '﹖',
        lessThan: '‹',
        greaterThan: '›',
        quote: '＂',
        pipe: '❘',
        hash: '＃',
        leftBracket: '［',
        rightBracket: '］',
        caret: 'ˆ',
        backslash: '⧵',
        dot: '․'
    },
    charReplacementEnabled: {
        slash: false,
        colon: false,
        asterisk: false,
        question: false,
        lessThan: false,
        greaterThan: false,
        quote: false,
        pipe: false,
        hash: false,
        leftBracket: false,
        rightBracket: false,
        caret: false,
        backslash: false,
        dot: true
    },
    charReplacementTrimLeft: {
        slash: false,
        colon: false,
        asterisk: false,
        question: false,
        lessThan: false,
        greaterThan: false,
        quote: false,
        pipe: false,
        hash: false,
        leftBracket: true,
        rightBracket: true,
        caret: false,
        backslash: false,
        dot: false
    },
    charReplacementTrimRight: {
        slash: false,
        colon: false,
        asterisk: false,
        question: false,
        lessThan: false,
        greaterThan: false,
        quote: false,
        pipe: false,
        hash: false,
        leftBracket: true,
        rightBracket: true,
        caret: false,
        backslash: false,
        dot: false
    },
    customReplacements: [
        { searchText: '- [ ] ', replaceText: '✔️ ', onlyAtStart: true, onlyWholeLine: false, enabled: false },
        { searchText: '- [x] ', replaceText: '✅ ', onlyAtStart: true, onlyWholeLine: false, enabled: false }
    ],
    safewords: [
        { text: 'To do', onlyAtStart: false, onlyWholeLine: false, enabled: false, caseSensitive: false }
    ],
    omitComments: false,
    omitHtmlTags: false,
    stripTemplaterSyntax: true,
    enableStripMarkup: true,
    stripMarkupSettings: {
        headings: true,
        bold: true,
        italic: true,
        strikethrough: true,
        highlight: true,
        wikilinks: true,
        markdownLinks: true,
        quote: true,
        callouts: true,
        unorderedLists: true,
        orderedLists: true,
        taskLists: true,
        code: true,
        codeBlocks: true,
        footnotes: true,
        comments: true,
        htmlTags: true,
    },
    stripMarkupInAlias: false,
    stripCommentsEntirely: true,
    applyCustomRulesInAlias: false,
    enableForbiddenCharReplacements: false,
    enableCustomReplacements: false,
    applyCustomRulesAfterForbiddenChars: false,
    applyCustomRulesAfterMarkupStripping: false,
    enableSafewords: false,
    renameOnFocus: false,
    renameOnSave: false,
    renameNotes: "automatically",
    manualNotificationMode: 'Always',
    windowsAndroidEnabled: false,
    hasEnabledForbiddenChars: false,
    hasEnabledWindowsAndroid: false,
    hasEnabledCustomReplacements: false,
    hasEnabledSafewords: false,
    hasEnabledAliases: false,
    grabTitleFromCardLink: true,
    stripTableMarkup: true,
    excludeSubfolders: true,
    tagMatchingMode: 'In Properties and note body' as TagMatchingMode,
    excludeChildTags: true,
    fileReadMethod: 'Editor', // Default to editor method
    verboseLogging: false, // Added default for verbose logging
    debugOutputFullContent: false, // Default OFF for debug content output
    debugEnabledTimestamp: '', // No debug enabled timestamp yet
    hasShownFirstTimeNotice: false, // First-time notice not shown yet
    hasSetupExclusions: false, // Exclusions tab not opened yet
    hasSetPropertyType: false, // Property type not set yet
    lastUsageDate: '', // No usage date yet
    currentSettingsTab: 'general', // Default to general tab
    commandVisibility: {
        folderPutFirstLineInTitle: true,
        folderExclude: true,
        folderStopExcluding: true,
        filePutFirstLineInTitle: true,
        fileExclude: true,
        fileStopExcluding: true,
        tagPutFirstLineInTitle: true,
        tagExclude: true,
        tagStopExcluding: true,
        addSafeInternalLink: true,
        addSafeInternalLinkWithCaption: true
    },
    enableContextMenus: true,
    enableVaultSearchContextMenu: true,
    vaultSearchContextMenuVisibility: {
        putFirstLineInTitle: true,
        disable: true,
        enable: true
    },
    enableCommandPalette: true,
    commandPaletteVisibility: {
        renameCurrentFileUnlessExcluded: true,
        renameCurrentFile: true,
        renameAllFiles: true,
        disableRenaming: true,
        enableRenaming: true,
        toggleAutomaticRenaming: true
    },
    enableRibbon: true,
    ribbonVisibility: {
        renameCurrentFile: true,
        renameAllNotes: false,
        toggleAutomaticRenaming: false
    },
    enableAliases: false,
    truncateAlias: false,
    addAliasOnlyIfFirstLineDiffers: false,
    aliasPropertyKey: 'aliases',
    hideAliasProperty: 'never' as const,
    hideAliasInSidebar: false,
    keepEmptyAliasProperty: true,
    whatToPutInTitle: "any_first_line_content",
    includeSubfolders: true,
    includeBodyTags: true,
    includeNestedTags: true,
    moveCursorToFirstLine: false,
    insertTitleOnCreation: false,
    placeCursorAtLineEnd: true,
    disableCursorInExcludedFolders: false,
    waitForCursorTemplate: false,
    suppressMergeNotifications: false,
    newNoteDelay: 0,
    waitForTemplate: false,
    addHeadingToTitle: false,
    disableRenamingKey: "no rename",
    disableRenamingValue: "true",
    modalCheckboxStates: {
        folderRename: {
            includeSubfolders: true,
            renameExcludedFolders: false,
            renameExcludedTags: false,
            renameExcludedProperties: false
        },
        tagRename: {
            includeChildTags: true,
            renameExcludedFolders: false,
            renameExcludedTags: false,
            renameExcludedProperties: false
        },
        searchRename: {
            renameExcludedFolders: false,
            renameExcludedTags: false,
            renameExcludedProperties: false
        },
        folderDisable: {
            includeSubfolders: true
        },
        tagDisable: {
            includeChildTags: true
        }
    }
};

// OS-specific forbidden characters
export const UNIVERSAL_FORBIDDEN_CHARS = ['/', ':', '|', String.fromCharCode(92), '#', '[', ']', '^'];
export const WINDOWS_ANDROID_CHARS = ['*', '?', '<', '>', '"'];

// Character reversal mapping for title insertion (reverse forbidden char replacements)
export const TITLE_CHAR_REVERSAL_MAP: Record<string, string> = {
    '∕': '/', // Unicode: \u2215 -> slash
    '։': ':', // Unicode: \u0589 -> colon
    '∗': '*', // Unicode: \u2217 -> asterisk
    '﹖': '?', // Unicode: \uFE56 -> question
    '‹': '<', // Unicode: \u2039 -> lessThan
    '›': '>', // Unicode: \u203A -> greaterThan
    '＂': '"', // Unicode: \uFF02 -> quote
    '❘': '|', // Unicode: \u2758 -> pipe
    '＃': '#', // Unicode: \uFF03 -> hash
    '［': '[', // Unicode: \uFF3B -> leftBracket
    '］': ']', // Unicode: \uFF3D -> rightBracket
    'ˆ': '^', // Unicode: \u02C6 -> caret
    '⧵': '\\', // Unicode: \u29F5 -> backslash
    '․': '.' // Unicode: \u2024 -> dot
};

