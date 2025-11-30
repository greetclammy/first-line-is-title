import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/**/*.d.ts",
        "src/obsidian-ex.d.ts",
        "main.ts",
        "**/*.config.{js,ts}",
        "**/mockObsidian.ts",
      ],
    },
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "./test/mockObsidian.ts"),
    },
  },
});
