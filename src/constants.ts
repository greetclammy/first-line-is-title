import { PluginSettings, OSPreset } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
    scopeStrategy: 'Enable in all notes except below',
    excludedFolders: [""],
    excludedTags: [""],
    charCount: 100,
    checkInterval: 600,
    disableRenamingKey: 'rename',
    disableRenamingValue: 'off',
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
        dot: false
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
    enableForbiddenCharReplacements: false,
    enableCustomReplacements: false,
    enableSafewords: false,
    renameOnFocus: false,
    renameOnSave: false,
    renameNotes: "automatically",
    manualNotificationMode: 'On title change',
    windowsAndroidEnabled: false,
    hasEnabledForbiddenChars: false,
    hasEnabledWindowsAndroid: false,
    hasEnabledCustomReplacements: false,
    hasEnabledSafewords: false,
    skipExcalidrawFiles: false,
    grabTitleFromCardLink: false,
    excludeSubfolders: true,
    excludeInlineTags: false,
    excludeChildTags: true,
    useDirectFileRead: false, // Default to cached read for performance
    verboseLogging: false, // Added default for verbose logging
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
        tagStopExcluding: true
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
        enableRenaming: true
    },
    enableRibbon: true,
    ribbonVisibility: {
        renameCurrentFile: true,
        renameAllNotes: false
    },
    enableAliases: false,
    truncateAlias: false,
    addAliasOnlyIfFirstLineDiffers: false,
    aliasPropertyKey: 'aliases',
    hideAliasProperty: 'never' as const,
    showAliasInSidebar: true,
    keepEmptyAliasProperty: false,
    whatToPutInTitle: "any_first_line_content",
    includeSubfolders: true,
    includeBodyTags: true,
    includeNestedTags: true,
    moveCursorToFirstLine: false,
    placeCursorAtLineEnd: false,
    suppressMergeNotifications: false
};

// OS-specific forbidden characters
export const UNIVERSAL_FORBIDDEN_CHARS = ['/', ':', '|', String.fromCharCode(92), '#', '[', ']', '^'];
export const WINDOWS_ANDROID_CHARS = ['*', '?', '<', '>', '"'];

export const OS_FORBIDDEN_CHARS: Record<OSPreset, string[]> = {
    'macOS': UNIVERSAL_FORBIDDEN_CHARS,
    'Windows': [...UNIVERSAL_FORBIDDEN_CHARS, ...WINDOWS_ANDROID_CHARS],
    'Linux': UNIVERSAL_FORBIDDEN_CHARS
};