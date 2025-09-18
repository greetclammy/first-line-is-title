export interface CustomReplacement {
    searchText: string;
    replaceText: string;
    onlyAtStart: boolean;
    onlyWholeLine: boolean;
    enabled: boolean;
}

export interface Safeword {
    text: string;
    onlyAtStart: boolean;
    onlyWholeLine: boolean;
    enabled: boolean;
    caseSensitive: boolean;
}

export type OSPreset = 'macOS' | 'Windows' | 'Linux';
export type NotificationMode = 'Always' | 'On title change' | 'Never';

export interface PluginSettings {
    excludedFolders: string[];
    excludedTags: string[];
    charCount: number;
    checkInterval: number;
    disableRenamingKey: string;
    disableRenamingValue: string;
    osPreset: OSPreset;
    charReplacements: {
        slash: string;
        colon: string;
        asterisk: string;
        question: string;
        lessThan: string;
        greaterThan: string;
        quote: string;
        pipe: string;
        hash: string;
        leftBracket: string;
        rightBracket: string;
        caret: string;
        backslash: string;
        dot: string;
    };
    charReplacementEnabled: {
        slash: boolean;
        colon: boolean;
        asterisk: boolean;
        question: boolean;
        lessThan: boolean;
        greaterThan: boolean;
        quote: boolean;
        pipe: boolean;
        hash: boolean;
        leftBracket: boolean;
        rightBracket: boolean;
        caret: boolean;
        backslash: boolean;
        dot: boolean;
    };
    charReplacementTrimLeft: {
        slash: boolean;
        colon: boolean;
        asterisk: boolean;
        question: boolean;
        lessThan: boolean;
        greaterThan: boolean;
        quote: boolean;
        pipe: boolean;
        hash: boolean;
        leftBracket: boolean;
        rightBracket: boolean;
        caret: boolean;
        backslash: boolean;
        dot: boolean;
    };
    charReplacementTrimRight: {
        slash: boolean;
        colon: boolean;
        asterisk: boolean;
        question: boolean;
        lessThan: boolean;
        greaterThan: boolean;
        quote: boolean;
        pipe: boolean;
        hash: boolean;
        leftBracket: boolean;
        rightBracket: boolean;
        caret: boolean;
        backslash: boolean;
        dot: boolean;
    };
    customReplacements: CustomReplacement[];
    safewords: Safeword[];
    omitComments: boolean;
    omitHtmlTags: boolean;
    enableForbiddenCharReplacements: boolean;
    enableCustomReplacements: boolean;
    enableSafewords: boolean;
    renameOnFocus: boolean;
    renameAutomatically: boolean;
    manualNotificationMode: NotificationMode;
    windowsAndroidEnabled: boolean;
    hasEnabledForbiddenChars: boolean;
    hasEnabledWindowsAndroid: boolean;
    hasEnabledSafewords: boolean;
    skipExcalidrawFiles: boolean;
    grabTitleFromCardLink: boolean;
    excludeSubfolders: boolean;
    useDirectFileRead: boolean; // Use direct file read instead of cache (slower but may resolve issues)
    verboseLogging: boolean; // Added verbose logging setting
    currentSettingsTab: string; // Track current settings tab
    commandVisibility: {
        folderPutFirstLineInTitle: boolean;
        folderExclude: boolean;
        folderStopExcluding: boolean;
        filePutFirstLineInTitle: boolean;
    };
}