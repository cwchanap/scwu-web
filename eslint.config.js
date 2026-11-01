import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import svelteConfig from './svelte.config.js';

export default ts.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'scwu-web-handoff/**',
      '**/generated/**',
      '**/__fixtures__/**',
      '.husky/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: ts.parser, svelteConfig } },
  },
  prettier,
  ...svelte.configs.prettier,
);
