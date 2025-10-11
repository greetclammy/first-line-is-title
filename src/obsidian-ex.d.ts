/**
 * Extended type definitions for Obsidian API
 * These extend the official API with unofficial/undocumented properties
 */

import { App, Command, Menu, WorkspaceLeaf } from 'obsidian';

declare module 'obsidian' {
	interface Menu {
		/**
		 * Static method to create a Menu for an event (undocumented)
		 */
		forEvent?(evt: Event): Menu;
	}

	interface App {
		commands: {
			commands: Record<string, Command>;
			executeCommandById(id: string): boolean;
			removeCommand(id: string): void;
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
