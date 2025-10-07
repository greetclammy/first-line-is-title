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

    /**
     * Updates the interactive state of all elements within a container
     * @param container - The container element
     * @param enabled - Whether elements should be enabled (true) or disabled (false)
     */
    protected updateInteractiveState(container: HTMLElement, enabled: boolean): void {
        if (enabled) {
            container.classList.remove('flit-master-disabled');
            container.removeAttribute('inert');

            // Re-enable all interactive elements (including links and dropdowns)
            // Note: input selector includes checkboxes, which is what we want
            const interactiveElements = container.querySelectorAll('input, button, a, select, .dropdown, textarea');
            interactiveElements.forEach((el: HTMLElement) => {
                // Only restore tabindex if it wasn't explicitly set to -1 originally
                if (el.getAttribute('data-original-tabindex') !== null) {
                    const originalTabIndex = el.getAttribute('data-original-tabindex');
                    if (originalTabIndex === 'remove') {
                        el.removeAttribute('tabindex');
                    } else {
                        el.tabIndex = parseInt(originalTabIndex || '0');
                    }
                    el.removeAttribute('data-original-tabindex');
                }
                el.removeAttribute('aria-disabled');
                el.style.pointerEvents = '';
            });

            // Also update disabled rows within the container
            this.updateDisabledRowsAccessibility(container);
        } else {
            container.classList.add('flit-master-disabled');
            // Use inert attribute to remove entire container from tab order and interaction
            container.setAttribute('inert', '');

            // Also explicitly disable all interactive elements as fallback
            // Note: input selector includes checkboxes, which is what we want
            const interactiveElements = container.querySelectorAll('input, button, a, select, .dropdown, textarea');
            interactiveElements.forEach((el: HTMLElement) => {
                // Store original tabindex to restore later
                if (el.hasAttribute('tabindex')) {
                    el.setAttribute('data-original-tabindex', el.getAttribute('tabindex') || '0');
                } else {
                    el.setAttribute('data-original-tabindex', 'remove');
                }
                el.tabIndex = -1;
                el.setAttribute('aria-disabled', 'true');
                el.style.pointerEvents = 'none';
            });
        }
    }

    /**
     * Updates accessibility for disabled rows (removes them from tab order)
     * @param container - The container element to search for disabled rows
     */
    protected updateDisabledRowsAccessibility(container: HTMLElement): void {
        const disabledRows = container.querySelectorAll('.flit-row-disabled');
        disabledRows.forEach((row: HTMLElement) => {
            const interactiveElements = row.querySelectorAll('input, button, a, select, .dropdown, textarea');
            interactiveElements.forEach((el: HTMLElement) => {
                // Skip enable column toggles and action buttons (they should remain interactive)
                if (el.closest('.flit-enable-column') || el.closest('.flit-actions-column')) {
                    return;
                }
                el.tabIndex = -1;
                el.setAttribute('aria-disabled', 'true');
            });
        });
    }

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