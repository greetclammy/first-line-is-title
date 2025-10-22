import { Notice } from "obsidian";
import FirstLineIsTitle from '../../main';
import { generateSafeLinkTarget, reverseSafeLinkTarget } from '../utils';
import { InternalLinkModal } from '../modals';
import { t } from '../i18n';

export class LinkManager {
    private plugin: FirstLineIsTitle;

    constructor(plugin: FirstLineIsTitle) {
        this.plugin = plugin;
    }

    async addSafeInternalLink(): Promise<void> {
        // Try to get active editor from any view type (markdown, canvas, etc.)
        const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
        if (!activeEditor) {
            new Notice(t('notifications.errorNoActiveNote'));
            return;
        }

        const selection = activeEditor.getSelection();

        if (selection.trim()) {
            const trimmedSelection = selection.trim();

            // Check if selection is a wikilink - if so, toggle it off
            if (trimmedSelection.startsWith('[[') && trimmedSelection.endsWith(']]')) {
                const linkContent = trimmedSelection.slice(2, -2);
                const pipeIndex = linkContent.indexOf('|');

                if (pipeIndex !== -1) {
                    // Has caption: [[target|caption]] → caption
                    const caption = linkContent.slice(pipeIndex + 1);
                    activeEditor.replaceSelection(caption);
                } else {
                    // No caption: [[target]] → reverse(target)
                    const reversedTarget = reverseSafeLinkTarget(linkContent, this.plugin.settings);
                    activeEditor.replaceSelection(reversedTarget);
                }
            } else {
                // Plain text: text → [[safe(text)]]
                const safeLinkTarget = generateSafeLinkTarget(selection, this.plugin.settings);
                const wikiLink = `[[${safeLinkTarget}]]`;
                activeEditor.replaceSelection(wikiLink);
            }
        } else {
            // No selection - show modal
            const modal = new InternalLinkModal(this.plugin.app, this.plugin, (linkTarget: string) => {
                const safeLinkTarget = generateSafeLinkTarget(linkTarget, this.plugin.settings);
                const wikiLink = `[[${safeLinkTarget}]]`;
                activeEditor.replaceSelection(wikiLink);
            });
            modal.open();
        }
    }

    async addSafeInternalLinkWithCaption(): Promise<void> {
        // Try to get active editor from any view type (markdown, canvas, etc.)
        const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
        if (!activeEditor) {
            new Notice(t('notifications.errorNoActiveNote'));
            return;
        }

        const selection = activeEditor.getSelection();

        if (selection.trim()) {
            const trimmedSelection = selection.trim();

            // Check if selection is a wikilink
            if (trimmedSelection.startsWith('[[') && trimmedSelection.endsWith(']]')) {
                const linkContent = trimmedSelection.slice(2, -2);
                const pipeIndex = linkContent.indexOf('|');

                if (pipeIndex !== -1) {
                    // Has caption: [[target|caption]]
                    const target = linkContent.slice(0, pipeIndex);
                    const caption = linkContent.slice(pipeIndex + 1);
                    const reversedTarget = reverseSafeLinkTarget(target, this.plugin.settings);

                    if (reversedTarget === caption) {
                        // [[Heyˆ|Hey^]] → Hey^ (strip when caption matches reversed target)
                        activeEditor.replaceSelection(caption);
                    } else {
                        // [[Heyˆ|Bye]] → [[Heyˆ|Hey^]] (update caption to reversed target)
                        const wikiLink = `[[${target}|${reversedTarget}]]`;
                        activeEditor.replaceSelection(wikiLink);
                    }
                } else {
                    // No caption: [[Heyˆ]] → [[Heyˆ|Hey^]] (add caption as reversed target)
                    const reversedTarget = reverseSafeLinkTarget(linkContent, this.plugin.settings);
                    const wikiLink = `[[${linkContent}|${reversedTarget}]]`;
                    activeEditor.replaceSelection(wikiLink);
                }
            } else {
                // Plain text: Hey^ → [[Heyˆ|Hey^]]
                const safeLinkTarget = generateSafeLinkTarget(selection, this.plugin.settings);
                const wikiLink = `[[${safeLinkTarget}|${selection}]]`;
                activeEditor.replaceSelection(wikiLink);
            }
        } else {
            // No selection - show modal
            const modal = new InternalLinkModal(this.plugin.app, this.plugin, (linkTarget: string, linkCaption?: string) => {
                const safeLinkTarget = generateSafeLinkTarget(linkTarget, this.plugin.settings);
                let wikiLink: string;
                if (linkCaption && linkCaption.trim()) {
                    wikiLink = `[[${safeLinkTarget}|${linkCaption}]]`;
                } else {
                    wikiLink = `[[${safeLinkTarget}|${linkTarget}]]`;
                }
                activeEditor.replaceSelection(wikiLink);
            }, true); // true for withCaption
            modal.open();
        }
    }
}
