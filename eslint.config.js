import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // JSX Accessibility rules (recommended preset)
  jsxA11y.flatConfigs.recommended,

  // React plugin
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },

  // TypeScript rule overrides — relax for production-readiness
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Allow explicit any in non-security code (legacy codebase)
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow unused vars with underscore prefix
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Downgrade to warnings for test/legacy patterns
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      // React display names are not critical
      'react/display-name': 'warn',
      // Allow empty blocks with comments
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Unescaped entities warning
      'react/no-unescaped-entities': 'warn',
      // Prefer const is a style preference
      'prefer-const': 'warn',
      // Allow prefer-rest-params as warning
      'prefer-rest-params': 'warn',
      // No useless escape as warning
      'no-useless-escape': 'warn',
      // No this alias as warning
      '@typescript-eslint/no-this-alias': 'warn',
    },
  },

  // Test file relaxations — tests commonly use any for mocking
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'react/display-name': 'off',
      'no-empty': 'off',
      'jsx-a11y/alt-text': 'off',
      'jsx-a11y/img-redundant-alt': 'off',
    },
  },

  // Accessibility-specific overrides (enforce stricter rules for form elements)
  {
    files: ['**/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/__tests__/**'],
    rules: {
      // Core accessibility rules for form components
      'jsx-a11y/label-has-associated-control': ['warn', {
        required: {
          some: ['nesting', 'id'],
        },
      }],
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
    },
  },

  // Prettier must be last to disable conflicting rules
  prettierConfig,

  // Global settings
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '*.config.js',
      '*.config.ts',
      'apps/web/dist/**',
    ],
  },
];
