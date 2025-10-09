import { Notice } from 'obsidian';

/**
 * ProgressNotice
 *
 * Displays a persistent notice with text progress counter for batch operations.
 *
 * Usage:
 *   const progress = new ProgressNotice('Processing files');
 *   progress.show(totalFiles);
 *
 *   for (let i = 0; i < files.length; i++) {
 *     await processFile(files[i]);
 *     progress.update(i + 1, totalFiles);
 *   }
 *
 *   progress.hide();
 */
export class ProgressNotice {
    private notice: Notice | null = null;
    private baseMessage: string;

    constructor(baseMessage: string) {
        this.baseMessage = baseMessage;
    }

    /**
     * Show the progress notice
     * @param total - Total number of items to process
     */
    show(total: number): void {
        this.notice = new Notice(`${this.baseMessage} (0/${total})`, 0);
    }

    /**
     * Update progress
     * @param current - Current progress count
     * @param total - Total number of items
     */
    update(current: number, total: number): void {
        if (!this.notice) return;
        this.notice.setMessage(`${this.baseMessage} (${current}/${total})`);
    }

    /**
     * Hide and clean up the notice
     */
    hide(): void {
        if (this.notice) {
            this.notice.hide();
            this.notice = null;
        }
    }
}
