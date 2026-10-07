// @ts-check
// ESLint 10 flat config (v0.2.6 R4) — 구 `.eslintrc.cjs`의 규칙을 그대로 옮겼다.
// 대상은 `src/**/*.ts`만(구 `eslint src --ext ts`와 동일 범위).
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**', 'dist-test/**', 'node_modules/**', '.vscode-test/**'] },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': 'off',
    },
  },
);
