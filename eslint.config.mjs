import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "build/**",
      "snap/**",
      "node_modules/**",
      "src/node_modules/**",
      "src/renderer/svelte-dnd-action/**",
      "src/renderer/Changelog/_data.ts",
      ".jules/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 2021, sourceType: "module" },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "max-len": ["warn", { code: 120 }],
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-use-before-define": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },

  {
    files: ["src/**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  {
    files: [
      "src/renderer/DesktopAPI/webBinding.ts",
      "src/main/preload/**",
      "src/main/Logger/**",
      "src/main/MCP/**",
      "src/main/ExtensionManager.ts",
      "src/main/controllers/registry.ts",
      "src/renderer/Panel/ipc.svelte.ts",
      "src/utils/Render/webBindingsHelpers.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 2021, sourceType: "module" },
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-function": "off",
      "max-len": ["warn", { code: 120 }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  prettier,
];
