import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores([
    "node_modules",
    "dist",
    "esbuild.config.mjs",
    "main.js",
    "data.json",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.test.json",
    "versions.json",
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs", "manifest.json"],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".json"],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: [
            "Slipbox",
            "Canvas",
            "Deck",
            "Desk",
            "Esc",
            "Markdown",
            "Obsidian",
          ],
          acronyms: ["YAML"],
        },
      ],
    },
  },
  {
    files: ["src/settings-tab.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "obsidianmd/no-tfile-tfolder-cast": "off",
    },
  },
);
