// eslint.config.mjs
import { fixupPluginRules } from "@eslint/compat";
import tsparser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";
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
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      obsidianmd: fixupPluginRules(obsidianmdPlugin),
    },
    rules: {
      // TypeScript strict rules (from Obsidian automated scan)
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-redundant-type-constituents": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-prototype-builtins": "error",
      "no-console": [
        "error",
        { allow: ["warn", "error", "debug", "group", "groupEnd"] },
      ],
      "no-useless-escape": "error",

      // Obsidian plugin guidelines
      "obsidianmd/no-sample-code": "error",
      "obsidianmd/no-static-styles-assignment": "warn",
      "obsidianmd/prefer-file-manager-trash-file": "error",
      "obsidianmd/detach-leaves": "error",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/no-view-references-in-plugin": "error",

      // Sentence case
      "obsidianmd/ui/sentence-case": "error",
      "obsidianmd/ui/sentence-case-json": "error",
      "obsidianmd/ui/sentence-case-locale-module": "error",

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
    ignores: [
      "node_modules/**",
      "main.js",
      "*.config.mjs",
      "test/**",
      "vitest.config.ts",
    ],
  },
];
