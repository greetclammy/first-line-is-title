/**
 * Extended type definitions for Obsidian API
 * These extend the official API with unofficial/undocumented properties
 */

import { App, Command, Menu, WorkspaceLeaf, MetadataCache } from 'obsidian';

declare module 'obsidian' {
	interface Menu {
		/**
		 * Static method to create a Menu for an event (undocumented)
		 */
		forEvent?(evt: Event): Menu;
	}

	interface MetadataCache {
		/**
		 * Get all tags in the vault (undocumented)
		 */
		getTags(): Record<string, number>;
	}

	interface App {
		commands: {
			commands: Record<string, Command>;
			executeCommandById(id: string): boolean;
			removeCommand(id: string): void;
		};
		plugins: {
			enabledPlugins: Set<string>;
			getPlugin(id: string): any;
		};
	}

	interface WorkspaceLeaf {
		/**
		 * Internal leaf ID (undocumented)
		 */
		id?: string;
	}

	interface Event {
		/**
		 * Obsidian context menu cache (undocumented)
		 */
		obsidian_contextmenu?: Menu;
	}
}

// Error type extensions
export interface NodeError extends Error {
	code?: string;
}

// Global Window interface extensions
declare global {
	interface Window {
		FLIT?: {
			debug: {
				enable: () => Promise<void>;
				disable: () => Promise<void>;
			};
		};
		DEBUG?: {
			enable: (namespace?: string) => Promise<void>;
			disable: (namespace?: string) => Promise<void>;
		};
	}
}
