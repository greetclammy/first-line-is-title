import { Notice } from "obsidian";
import FirstLineIsTitle from '../../main';
import { generateSafeLinkTarget } from '../utils';
import { InternalLinkModal } from '../modals';

export class LinkManager {
    private plugin: FirstLineIsTitle;

    constructor(plugin: FirstLineIsTitle) {
        this.plugin = plugin;
    }

    async addSafeInternalLink(): Promise<void> {
        // Try to get active editor from any view type (markdown, canvas, etc.)
        const activeEditor = this.plugin.app.workspace.activeEditor?.editor;
        if (!activeEditor) {
            new Notice("Error: no active note.");
            return;
        }

        const selection = activeEditor.getSelection();

        if (selection.trim()) {
            // Selection exists - process directly
            const safeLinkTarget = generateSafeLinkTarget(selection, this.plugin.settings);
            const wikiLink = `[[${safeLinkTarget}]]`;
            activeEditor.replaceSelection(wikiLink);
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
            new Notice("Error: no active note.");
            return;
        }

        const selection = activeEditor.getSelection();

        if (selection.trim()) {
            // Selection exists - use selection as caption and create safe target
            const safeLinkTarget = generateSafeLinkTarget(selection, this.plugin.settings);
            const wikiLink = `[[${safeLinkTarget}|${selection}]]`;
            activeEditor.replaceSelection(wikiLink);
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
