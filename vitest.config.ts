import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.test.{js,ts,tsx}'],
        typecheck: {
            enabled: false, // typecheck available via: npx tsc -p tsconfig.test.json --noEmit
            tsconfig: './tsconfig.test.json',
            include: ['tests/**/*.test.{ts,tsx}'],
        },
        deps: {
            optimizer: {
                ssr: {
                    include: ['electron', 'electron-log'],
                },
            },
        },
        testTimeout: 10000,
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            exclude: ['src/renderer/components/**', 'src/renderer/App.tsx', 'src/renderer/index.tsx'],
            reporter: ['text', 'text-summary', 'html'],
            reportsDirectory: 'coverage',
        },
    },

    resolve: {
        alias: {
            'electron': path.resolve(__dirname, 'tests/__mocks__/electron.mjs'),
            '@services': path.resolve(__dirname, 'src/services'),
            '@utils': path.resolve(__dirname, 'src/utils'),
        },
        extensions: ['.ts', '.tsx'],
    },
});
