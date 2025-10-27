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

        const selections = activeEditor.listSelections();

        // Check if any selection has content
        const hasSelection = selections.some(sel => {
            const from = sel.anchor;
            const to = sel.head;
            const text = activeEditor.getRange(from, to);
            return text.trim().length > 0;
        });

        if (hasSelection) {
            // Sort selections in reverse order (bottom to top) to preserve positions
            selections.sort((a, b) => {
                const aLine = Math.max(a.anchor.line, a.head.line);
                const bLine = Math.max(b.anchor.line, b.head.line);
                if (aLine !== bLine) {
                    return bLine - aLine; // Reverse order
                }
                const aChar = Math.max(a.anchor.ch, a.head.ch);
                const bChar = Math.max(b.anchor.ch, b.head.ch);
                return bChar - aChar; // Reverse order
            });

            // Process selections in reverse order (bottom to top)
            for (const sel of selections) {
                // Normalize selection range (anchor might be after head)
                const from = sel.anchor.line < sel.head.line ||
                    (sel.anchor.line === sel.head.line && sel.anchor.ch <= sel.head.ch)
                    ? sel.anchor : sel.head;
                const to = from === sel.anchor ? sel.head : sel.anchor;

                const selection = activeEditor.getRange(from, to);

                if (selection.trim()) {
                    const trimmedSelection = selection.trim();
                    let replacement: string;

                    // Check if selection is a wikilink - if so, toggle it off
                    if (trimmedSelection.startsWith('[[') && trimmedSelection.endsWith(']]')) {
                        const linkContent = trimmedSelection.slice(2, -2);
                        const pipeIndex = linkContent.indexOf('|');

                        if (pipeIndex !== -1) {
                            // Has caption: [[target|caption]] → caption
                            replacement = linkContent.slice(pipeIndex + 1);
                        } else {
                            // No caption: [[target]] → reverse(target)
                            replacement = reverseSafeLinkTarget(linkContent, this.plugin.settings);
                        }
                    } else {
                        // Plain text: text → [[safe(text)]]
                        const safeLinkTarget = generateSafeLinkTarget(selection, this.plugin.settings);
                        replacement = `[[${safeLinkTarget}]]`;
                    }

                    activeEditor.replaceRange(replacement, from, to);
                }
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

        const selections = activeEditor.listSelections();

        // Check if any selection has content
        const hasSelection = selections.some(sel => {
            const from = sel.anchor;
            const to = sel.head;
            const text = activeEditor.getRange(from, to);
            return text.trim().length > 0;
        });

        if (hasSelection) {
            // Sort selections in reverse order (bottom to top) to preserve positions
            selections.sort((a, b) => {
                const aLine = Math.max(a.anchor.line, a.head.line);
                const bLine = Math.max(b.anchor.line, b.head.line);
                if (aLine !== bLine) {
                    return bLine - aLine; // Reverse order
                }
                const aChar = Math.max(a.anchor.ch, a.head.ch);
                const bChar = Math.max(b.anchor.ch, b.head.ch);
                return bChar - aChar; // Reverse order
            });

            // Process selections in reverse order (bottom to top)
            for (const sel of selections) {
                // Normalize selection range (anchor might be after head)
                const from = sel.anchor.line < sel.head.line ||
                    (sel.anchor.line === sel.head.line && sel.anchor.ch <= sel.head.ch)
                    ? sel.anchor : sel.head;
                const to = from === sel.anchor ? sel.head : sel.anchor;

                const selection = activeEditor.getRange(from, to);

                if (selection.trim()) {
                    const trimmedSelection = selection.trim();
                    let replacement: string;

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
                                replacement = caption;
                            } else {
                                // [[Heyˆ|Bye]] → [[Heyˆ|Hey^]] (update caption to reversed target)
                                replacement = `[[${target}|${reversedTarget}]]`;
                            }
                        } else {
                            // No caption: [[Heyˆ]] → [[Heyˆ|Hey^]] (add caption as reversed target)
                            const reversedTarget = reverseSafeLinkTarget(linkContent, this.plugin.settings);
                            replacement = `[[${linkContent}|${reversedTarget}]]`;
                        }
                    } else {
                        // Plain text: Hey^ → [[Heyˆ|Hey^]]
                        const safeLinkTarget = generateSafeLinkTarget(selection, this.plugin.settings);
                        replacement = `[[${safeLinkTarget}|${selection}]]`;
                    }

                    activeEditor.replaceRange(replacement, from, to);
                }
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
