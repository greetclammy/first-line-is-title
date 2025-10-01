import { TFile } from "obsidian";
import { PluginSettings } from '../types';
import FirstLineIsTitle from '../../main';

export class DebugUtils {
    constructor(private plugin: FirstLineIsTitle) {}

    get app() {
        return this.plugin.app;
    }

    get settings(): PluginSettings {
        return this.plugin.settings;
    }

    /**
     * Logs setting changes to console when debug mode is enabled
     * @param settingName The name of the setting that changed
     * @param value The new value of the setting
     */
    debugLog(settingName: string, value: any): void {
        if (this.settings.verboseLogging) {
            console.debug(`Setting changed: ${settingName} = ${JSON.stringify(value)}`);
        }
    }

    /**
     * Outputs complete file content for debugging purposes
     * @param file The file to output content for
     * @param action The action being performed (e.g., "MODIFIED", "CREATED")
     */
    async outputDebugFileContent(file: TFile, action: string): Promise<void> {
        if (!this.settings.verboseLogging || !this.settings.debugOutputFullContent) {
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            console.debug(`CONTENT [${action}] ${file.path}:`);
            console.debug('--- FILE CONTENT START ---');
            console.debug(content);
            console.debug('--- FILE CONTENT END ---');
        } catch (error) {
            console.debug(`CONTENT [${action}] ${file.path}: Failed to read file:`, error);
        }
    }

    /**
     * Outputs complete plugin settings for debugging purposes
     */
    outputAllSettings(): void {
        if (!this.settings.verboseLogging) {
            return;
        }

        console.debug('SETTINGS: Complete configuration dump:');
        console.debug('--- SETTINGS START ---');
        console.debug(JSON.stringify(this.settings, null, 2));
        console.debug('--- SETTINGS END ---');
    }
}