// eslint.config.mjs
import { fixupPluginRules } from "@eslint/compat";
import tsparser from "@typescript-eslint/parser";
import obsidianmdPlugin from "eslint-plugin-obsidianmd";

const obsidianmd = {
  plugins: {
    obsidianmd: fixupPluginRules(obsidianmdPlugin),
  },
};

export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    ...obsidianmd,
    rules: {
      // Obsidian plugin guidelines
      "obsidianmd/no-sample-code": "error",
      "obsidianmd/no-static-styles-assignment": "warn",
      "obsidianmd/prefer-file-manager-trash-file": "error",
      "obsidianmd/detach-leaves": "error",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/no-view-references-in-plugin": "error",

      // Sentence case - already enforced via CLAUDE.md
      "obsidianmd/ui/sentence-case": "warn",
      "obsidianmd/ui/sentence-case-json": "warn",
      "obsidianmd/ui/sentence-case-locale-module": "warn",

      // Commands
      "obsidianmd/commands/no-command-in-command-id": "warn",
      "obsidianmd/commands/no-command-in-command-name": "warn",
      "obsidianmd/commands/no-plugin-id-in-command-id": "warn",
      "obsidianmd/commands/no-plugin-name-in-command-name": "warn",

      // Settings
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
    },
  },
  {
    ignores: ["node_modules/**", "main.js", "*.config.mjs"],
  },
];
