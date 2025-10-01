import { App, Setting } from "obsidian";
import { PluginSettings } from '../types';
import { UNIVERSAL_FORBIDDEN_CHARS, WINDOWS_ANDROID_CHARS } from '../constants';
import { detectOS } from '../utils';

export interface FirstLineIsTitlePlugin {
    app: App;
    settings: PluginSettings;
    saveSettings(): Promise<void>;
    debugLog(settingName: string, value: any): void;
}

export abstract class SettingsTabBase {
    protected plugin: FirstLineIsTitlePlugin;
    protected containerEl: HTMLElement;

    constructor(plugin: FirstLineIsTitlePlugin, containerEl: HTMLElement) {
        this.plugin = plugin;
        this.containerEl = containerEl;
    }

    abstract render(): void;

    protected addForbiddenCharProtection(inputElement: HTMLInputElement, forceWindowsAndroidProtection: boolean = false): void {
        inputElement.addEventListener('input', (e) => {
            const inputEl = e.target as HTMLInputElement;
            let value = inputEl.value;

            // Define forbidden characters
            const universalForbidden = UNIVERSAL_FORBIDDEN_CHARS;
            const windowsAndroidForbidden = WINDOWS_ANDROID_CHARS;

            let forbiddenChars = [...universalForbidden];

            // Add Windows/Android chars if forced (for Windows/Android section) or if current OS requires it
            if (forceWindowsAndroidProtection) {
                forbiddenChars.push(...windowsAndroidForbidden);
            } else {
                const currentOS = detectOS();
                if (currentOS === 'Windows') {
                    forbiddenChars.push(...windowsAndroidForbidden);
                }
            }

            // Filter out forbidden characters
            let filteredValue = '';
            for (let i = 0; i < value.length; i++) {
                const char = value[i];

                // Special case for dot: forbidden only at start
                if (char === '.' && i === 0) {
                    continue; // Skip dot at start
                }

                // Skip other forbidden characters
                if (forbiddenChars.includes(char)) {
                    continue;
                }

                filteredValue += char;
            }

            // Update input if value changed
            if (filteredValue !== value) {
                inputEl.value = filteredValue;
                // Restore cursor position
                const cursorPos = Math.min(inputEl.selectionStart || 0, filteredValue.length);
                inputEl.setSelectionRange(cursorPos, cursorPos);

                // Trigger input event to ensure the value is saved
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }
}