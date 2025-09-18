import { PluginSettings, OSPreset } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
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
        { searchText: '- [ ] ', replaceText: '✔️ ', onlyAtStart: true, onlyWholeLine: false, enabled: true },
        { searchText: '- [x] ', replaceText: '✅ ', onlyAtStart: true, onlyWholeLine: false, enabled: true }
    ],
    safewords: [
        { text: 'Title', onlyAtStart: false, onlyWholeLine: false, enabled: false, caseSensitive: false }
    ],
    omitComments: false,
    omitHtmlTags: false,
    enableForbiddenCharReplacements: false,
    enableCustomReplacements: false,
    enableSafewords: false,
    renameOnFocus: false,
    renameAutomatically: true,
    manualNotificationMode: 'On title change',
    windowsAndroidEnabled: false,
    hasEnabledForbiddenChars: false,
    hasEnabledWindowsAndroid: false,
    hasEnabledSafewords: false,
    skipExcalidrawFiles: false,
    grabTitleFromCardLink: false,
    excludeSubfolders: true,
    useDirectFileRead: false, // Default to cached read for performance
    verboseLogging: false, // Added default for verbose logging
    currentSettingsTab: 'general', // Default to general tab
    commandVisibility: {
        folderPutFirstLineInTitle: true,
        folderExclude: true,
        folderStopExcluding: true,
        filePutFirstLineInTitle: true
    }
};

// OS-specific forbidden characters
export const UNIVERSAL_FORBIDDEN_CHARS = ['/', ':', '|', String.fromCharCode(92), '#', '[', ']', '^'];
export const WINDOWS_ANDROID_CHARS = ['*', '?', '<', '>', '"'];

export const OS_FORBIDDEN_CHARS: Record<OSPreset, string[]> = {
    'macOS': UNIVERSAL_FORBIDDEN_CHARS,
    'Windows': [...UNIVERSAL_FORBIDDEN_CHARS, ...WINDOWS_ANDROID_CHARS],
    'Linux': UNIVERSAL_FORBIDDEN_CHARS
};