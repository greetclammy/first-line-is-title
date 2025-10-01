import FirstLineIsTitle from '../../main';
import { verboseLog } from '../utils';

/**
 * PluginInitializer
 *
 * Handles plugin initialization logic including:
 * - First-enable logic for settings
 * - CSS loading
 * - Settings migrations
 *
 * Responsibilities:
 * - Initialize first-enable states for custom replacements, safewords, forbidden chars
 * - Load external CSS styles
 * - Handle settings defaults and migrations
 */
export class PluginInitializer {
    constructor(private plugin: FirstLineIsTitle) {}

    get settings() {
        return this.plugin.settings;
    }

    /**
     * Initialize first-enable logic for sections
     * Ensures that when features are enabled for the first time, their items are enabled
     */
    async initializeFirstEnableLogic(): Promise<void> {
        let settingsChanged = false;

        // Custom replacements first-enable logic
        if (this.settings.enableCustomReplacements && !this.settings.hasEnabledCustomReplacements) {
            this.settings.customReplacements.forEach(replacement => {
                replacement.enabled = true;
            });
            this.settings.hasEnabledCustomReplacements = true;
            settingsChanged = true;
            verboseLog(this.plugin, 'Initialized custom replacements on first enable');
        }

        // Safewords first-enable logic
        if (this.settings.enableSafewords && !this.settings.hasEnabledSafewords) {
            this.settings.safewords.forEach(safeword => {
                safeword.enabled = true;
            });
            this.settings.hasEnabledSafewords = true;
            settingsChanged = true;
            verboseLog(this.plugin, 'Initialized safewords on first enable');
        }

        // Forbidden chars first-enable logic
        if (this.settings.enableForbiddenCharReplacements && !this.settings.hasEnabledForbiddenChars) {
            const allOSesKeys = ['leftBracket', 'rightBracket', 'hash', 'caret', 'pipe', 'backslash', 'slash', 'colon', 'dot'];
            allOSesKeys.forEach(key => {
                this.settings.charReplacementEnabled[key as keyof typeof this.settings.charReplacementEnabled] = true;
            });
            this.settings.hasEnabledForbiddenChars = true;
            settingsChanged = true;
            verboseLog(this.plugin, 'Initialized forbidden char replacements on first enable');
        }

        if (settingsChanged) {
            await this.plugin.saveSettings();
        }
    }

    /**
     * Load external CSS styles
     */
    async loadStyles(): Promise<void> {
        try {
            const css = await this.plugin.app.vault.adapter.read(`${this.plugin.manifest.dir}/styles.css`);
            const styleEl = document.createElement('style');
            styleEl.textContent = css;
            document.head.appendChild(styleEl);
        } catch (error) {
            // Fallback: styles.css not found, silently continue
        }
    }
}