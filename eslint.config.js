import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
    {
        ignores: ['**/dist/', '**/dev-dist/', '**/.wrangler/', 'public/', 'src-tauri/', 'data/', '.claude/'],
    },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        rules: {
            // `catch (e) {}` and `_`-prefixed names are deliberate.
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
            ],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            globals: globals.browser,
        },
    },
    {
        files: ['**/*.{js,cjs,mjs}', 'vite.config.ts'],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        files: ['**/*.cjs'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    {
        files: ['src/**/*.{ts,tsx}', 'index.tsx'],
        extends: [reactHooks.configs.flat.recommended],
        rules: {
            // React Compiler checks. The app does not use the compiler, and
            // many existing components do not meet them yet.
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/purity': 'warn',
            'react-hooks/refs': 'warn',
            'react-hooks/immutability': 'warn',
        },
    },

    // Existing code that does not meet a rule yet. These only warn, and only
    // in the files listed, so new code anywhere else is held to the rule.
    // Remove a file from its list once it is cleaned up.
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
    {
        files: ['logic.ts', 'src/components/CustomSelect.tsx'],
        rules: {
            'no-useless-assignment': 'warn',
        },
    },
    {
        files: ['logic.ts'],
        rules: {
            'no-case-declarations': 'warn',
        },
    },
    {
        files: ['worker.ts'],
        rules: {
            'prefer-const': 'warn',
        },
    },
    {
        files: ['src/services/export.ts'],
        rules: {
            '@typescript-eslint/ban-ts-comment': 'warn',
        },
    },
    {
        files: ['src/pages/Admin.tsx', 'src/pages/Settings.tsx'],
        rules: {
            'react-hooks/globals': 'warn',
        },
    },
    {
        files: ['src/hooks/useCloudSync.ts'],
        rules: {
            'react-hooks/preserve-manual-memoization': 'warn',
        },
    },
);
