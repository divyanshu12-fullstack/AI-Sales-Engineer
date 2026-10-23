import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/coverage/**', '.agents/**']),
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: [
          './apps/api/tsconfig.json',
          './apps/api/tsconfig.test.json',
          './apps/web/tsconfig.json',
          './packages/contracts/tsconfig.json',
          './packages/contracts/tsconfig.test.json',
          './scripts/database/tsconfig.json',
        ],
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  prettier,
);
