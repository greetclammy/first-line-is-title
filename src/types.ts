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

export interface ExcludedProperty {
    key: string;
    value: string;
}

export type OSPreset = 'macOS' | 'Windows' | 'Linux';
export type NotificationMode = 'Always' | 'On title change' | 'Never';
export type ExclusionStrategy = 'Only exclude...' | 'Exclude all except...';
export type TagPropertyExclusionStrategy = 'Only exclude...' | 'Exclude all except...';
export type TagMatchingMode = 'In Properties and note body' | 'In Properties only' | 'In note body only';
export type FileReadMethod = 'Editor' | 'Cache' | 'File';

export type PropertyHidingOption = 'never' | 'always' | 'when_empty';

export interface ExclusionOverrides {
    ignoreFolder?: boolean;
    ignoreTag?: boolean;
    ignoreProperty?: boolean;
}

export interface PluginSettings {
    folderScopeStrategy: ExclusionStrategy;
    tagScopeStrategy: TagPropertyExclusionStrategy;
    propertyScopeStrategy: TagPropertyExclusionStrategy;
    excludedFolders: string[];
    excludedTags: string[];
    excludedProperties: ExcludedProperty[];
    charCount: number;
    checkInterval: number;
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
    stripTemplaterSyntax: boolean;
    enableStripMarkup: boolean;
    stripMarkupSettings: {
        italic: boolean;
        bold: boolean;
        strikethrough: boolean;
        highlight: boolean;
        code: boolean;
        codeBlocks: boolean;
        blockquote: boolean;
        callouts: boolean;
        comments: boolean;
        headings: boolean;
        wikilinks: boolean;
        markdownLinks: boolean;
        htmlTags: boolean;
        tasks: boolean;
        footnotes: boolean;
    };
    stripMarkupInAlias: boolean;
    stripCommentsEntirely: boolean;
    applyCustomRulesInAlias: boolean;
    enableForbiddenCharReplacements: boolean;
    enableCustomReplacements: boolean;
    applyCustomRulesAfterForbiddenChars: boolean;
    applyCustomRulesAfterMarkupStripping: boolean;
    enableSafewords: boolean;
    renameOnFocus: boolean;
    renameOnSave: boolean;
    renameNotes: "automatically" | "manually";
    manualNotificationMode: NotificationMode;
    windowsAndroidEnabled: boolean;
    hasEnabledForbiddenChars: boolean;
    hasEnabledWindowsAndroid: boolean;
    hasEnabledCustomReplacements: boolean;
    hasEnabledSafewords: boolean;
    hasEnabledAliases: boolean;
    grabTitleFromCardLink: boolean;
    excludeSubfolders: boolean;
    tagMatchingMode: TagMatchingMode;
    excludeChildTags: boolean;
    fileReadMethod: FileReadMethod; // Method for reading file content
    verboseLogging: boolean; // Added verbose logging setting
    debugOutputFullContent: boolean; // Output full file content in console when files change
    debugEnabledTimestamp: string; // Timestamp when Debug was last enabled (YYYY-MM-DD HH:mm format)
    hasShownFirstTimeNotice: boolean; // Track if first-time setup notice has been shown
    hasSetupExclusions: boolean; // Track if exclusions tab has been opened for first-time setup
    hasSetPropertyType: boolean; // Track if property type has been set in types.json on first load
    lastUsageDate: string; // Last date the plugin was used (YYYY-MM-DD format)
    currentSettingsTab: string; // Track current settings tab
    commandVisibility: {
        folderPutFirstLineInTitle: boolean;
        folderExclude: boolean;
        folderStopExcluding: boolean;
        filePutFirstLineInTitle: boolean;
        fileExclude: boolean;
        fileStopExcluding: boolean;
        tagPutFirstLineInTitle: boolean;
        tagExclude: boolean;
        tagStopExcluding: boolean;
        addSafeInternalLink: boolean;
        addSafeInternalLinkWithCaption: boolean;
    };
    enableContextMenus: boolean;
    enableVaultSearchContextMenu: boolean;
    vaultSearchContextMenuVisibility: {
        putFirstLineInTitle: boolean;
        disable: boolean;
        enable: boolean;
    };
    enableCommandPalette: boolean;
    commandPaletteVisibility: {
        renameCurrentFileUnlessExcluded: boolean;
        renameCurrentFile: boolean;
        renameAllFiles: boolean;
        disableRenaming: boolean;
        enableRenaming: boolean;
        toggleAutomaticRenaming: boolean;
    };
    enableRibbon: boolean;
    ribbonVisibility: {
        renameCurrentFile: boolean;
        renameAllNotes: boolean;
        toggleAutomaticRenaming: boolean;
    };
    enableAliases: boolean;
    truncateAlias: boolean;
    addAliasOnlyIfFirstLineDiffers: boolean;
    aliasPropertyKey: string;
    hideAliasProperty: PropertyHidingOption;
    hideAliasInSidebar: boolean;
    keepEmptyAliasProperty: boolean;
    whatToPutInTitle: "any_first_line_content" | "headings_only";
    includeSubfolders: boolean;
    includeBodyTags: boolean;
    includeNestedTags: boolean;
    moveCursorToFirstLine: boolean;
    insertTitleOnCreation: boolean;
    placeCursorAtLineEnd: boolean;
    waitForCursorTemplate: boolean;
    suppressMergeNotifications: boolean;
    newNoteDelay: number;
    waitForTemplate: boolean;
    addHeadingToTitle: boolean;
    disableRenamingKey: string;
    disableRenamingValue: string;
    modalCheckboxStates: {
        folderRename: {
            includeSubfolders: boolean;
            renameExcludedFolders: boolean;
            renameExcludedTags: boolean;
            renameExcludedProperties: boolean;
        };
        tagRename: {
            includeChildTags: boolean;
            renameExcludedFolders: boolean;
            renameExcludedTags: boolean;
            renameExcludedProperties: boolean;
        };
        searchRename: {
            renameExcludedFolders: boolean;
            renameExcludedTags: boolean;
            renameExcludedProperties: boolean;
        };
        folderDisable: {
            includeSubfolders: boolean;
        };
        tagDisable: {
            includeChildTags: boolean;
        };
    };
}