import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "coverage/**",
      "*.cjs",
      "scripts/**",
      "tmp/**",
      "count_eslint.js",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Prettier (disables conflicting formatting rules)
  prettier,

  // Global settings for all files
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // React configuration for TSX/JSX files
  {
    files: ["**/*.{tsx,jsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // React 19 JSX transform - no need to import React
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",

      // React hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // React best practices (warn for pre-existing violations)
      "react/prop-types": "off",
      "react/display-name": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },

  // TypeScript-specific overrides - set pre-existing violations to warn
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Downgrade common pre-existing violations to warnings
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/no-inferrable-types": "warn",
      "@typescript-eslint/no-unnecessary-type-constraint": "warn",

      // Keep these as errors (critical issues)
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
    },
  },

  // JavaScript files - relax TypeScript-specific rules
  {
    files: ["**/*.{js,mjs}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },

  // General rule overrides for pre-existing violations
  {
    rules: {
      "no-console": "warn",
      "no-debugger": "error",
      "no-duplicate-imports": "warn",
      "prefer-const": "warn",
      "no-var": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "prefer-rest-params": "warn",
      "no-unused-vars": "off", // Handled by @typescript-eslint/no-unused-vars
    },
  }
);
