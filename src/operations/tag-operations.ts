import { Notice, TFile } from "obsidian";
import { verboseLog } from '../utils';
import { PluginSettings } from '../types';
import { RenameEngine } from '../core/rename-engine';

export class TagOperations {
    constructor(
        private app: any,
        private settings: PluginSettings,
        private renameEngine: RenameEngine,
        private saveSettings: () => Promise<void>,
        private debugLog: (settingName: string, value: any) => void
    ) {}

    async putFirstLineInTitleForTag(tagName: string, omitBodyTags: boolean = false, omitNestedTags: boolean = false): Promise<void> {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const files = this.app.vault.getMarkdownFiles();
        const matchingFiles: TFile[] = [];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            let hasTag = false;
            let tagFoundInBody = false;

            // Check YAML frontmatter tags
            if (cache?.frontmatter?.tags) {
                const frontmatterTags = Array.isArray(cache.frontmatter.tags)
                    ? cache.frontmatter.tags
                    : [cache.frontmatter.tags];

                hasTag = frontmatterTags.some((tag: string) => {
                    if (omitNestedTags) {
                        // Exact match only
                        return tag === tagName || tag === tagToFind;
                    } else {
                        // Include nested tags
                        return tag === tagName || tag === tagToFind ||
                               tag.startsWith(tagName + '/') || tag.startsWith(tagToFind + '/');
                    }
                });
            }

            // Check metadata cache tags (includes both frontmatter and body tags)
            if (!hasTag && cache?.tags) {
                cache.tags.forEach(tagCache => {
                    const cacheTag = tagCache.tag;
                    let tagMatches = false;

                    if (omitNestedTags) {
                        // Exact match only
                        tagMatches = cacheTag === tagToFind || cacheTag === `#${tagName}`;
                    } else {
                        // Include nested tags
                        tagMatches = cacheTag === tagToFind || cacheTag === `#${tagName}` ||
                                   cacheTag.startsWith(tagToFind + '/') || cacheTag.startsWith(`#${tagName}/`);
                    }

                    if (tagMatches) {
                        hasTag = true;
                        // Check if this tag appears in the body (not frontmatter)
                        if (tagCache.position.start.line > 0) {
                            // If the tag is found after line 0, it's likely in the body
                            // We need to check if there's frontmatter to be more precise
                            if (cache.frontmatterPosition) {
                                // If tag is after frontmatter, it's in body
                                if (tagCache.position.start.line > cache.frontmatterPosition.end.line) {
                                    tagFoundInBody = true;
                                }
                            } else {
                                // No frontmatter, so any tag after line 0 is in body
                                tagFoundInBody = true;
                            }
                        }
                    }
                });
            }

            // Apply omitBodyTags filter
            if (hasTag && omitBodyTags && tagFoundInBody) {
                // Skip this file because it has the tag in the body and we want to omit such files
                continue;
            }

            if (hasTag) {
                matchingFiles.push(file);
            }
        }

        if (matchingFiles.length === 0) {
            verboseLog(this, `Showing notice: No files found with tag ${tagToFind}.`);
            new Notice(`No notes found with #${tagToFind}.`);
            return;
        }

        verboseLog(this, `Showing notice: Renaming ${matchingFiles.length} files with tag ${tagToFind}...`);
        new Notice(`Renaming ${matchingFiles.length} notes...`);

        let processedCount = 0;
        let errorCount = 0;

        const exclusionOverrides = { ignoreFolder: true, ignoreTag: true, ignoreProperty: true };

        for (const file of matchingFiles) {
            try {
                await this.renameEngine.processFile(file, true, false, undefined, true, exclusionOverrides);
                processedCount++;
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
                errorCount++;
            }
        }

        if (errorCount > 0) {
            verboseLog(this, `Showing notice: Renamed ${processedCount}/${matchingFiles.length} notes with ${errorCount} errors. Check console for details.`);
            new Notice(`Renamed ${processedCount}/${matchingFiles.length} notes with ${errorCount} errors. Check console for details.`, 0);
        } else {
            verboseLog(this, `Showing notice: Successfully processed ${processedCount} files with tag ${tagToFind}.`);
            new Notice(`Renamed ${processedCount}/${matchingFiles.length} notes.`, 0);
        }
    }

    async toggleTagExclusion(tagName: string): Promise<void> {
        const tagToFind = tagName.startsWith('#') ? tagName : `#${tagName}`;
        const isInList = this.settings.excludedTags.includes(tagToFind);
        const isInverted = this.settings.tagScopeStrategy === 'Exclude all except...';

        if (isInList) {
            // Remove from list
            this.settings.excludedTags = this.settings.excludedTags.filter(tag => tag !== tagToFind);
            // Ensure there's always at least one entry (even if empty)
            if (this.settings.excludedTags.length === 0) {
                this.settings.excludedTags.push("");
            }

            // Determine action based on scope strategy
            if (isInverted) {
                // In inverted mode, removing from list = disabling renaming
                verboseLog(this, `Showing notice: Renaming disabled for ${tagToFind}`);
                new Notice(`Disabled renaming for ${tagToFind}.`);
            } else {
                // In normal mode, removing from list = enabling renaming
                verboseLog(this, `Showing notice: Renaming enabled for ${tagToFind}`);
                new Notice(`Enabled renaming for ${tagToFind}.`);
            }
        } else {
            // Add to list
            if (this.settings.excludedTags.length === 1 && this.settings.excludedTags[0] === "") {
                this.settings.excludedTags[0] = tagToFind;
            } else {
                this.settings.excludedTags.push(tagToFind);
            }

            // Determine action based on scope strategy
            if (isInverted) {
                // In inverted mode, adding to list = enabling renaming
                verboseLog(this, `Showing notice: Renaming enabled for ${tagToFind}`);
                new Notice(`Enabled renaming for ${tagToFind}.`);
            } else {
                // In normal mode, adding to list = disabling renaming
                verboseLog(this, `Showing notice: Renaming disabled for ${tagToFind}`);
                new Notice(`Disabled renaming for ${tagToFind}.`);
            }
        }

        this.debugLog('excludedTags', this.settings.excludedTags);
        await this.saveSettings();
        verboseLog(this, `Tag exclusion toggled for: ${tagToFind}`, { isNowInList: !isInList });
    }
}