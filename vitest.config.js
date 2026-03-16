import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        // Run tests in Node environment (for main process / services tests)
        environment: 'node',

        // Global setup — mocks electron, electron-log before any test
        setupFiles: ['./tests/setup.js'],

        // Test file patterns
        include: ['tests/**/*.test.{js,ts}'],

        // Inline CJS dependencies so vi.mock() can intercept require() calls
        deps: {
            inline: [/src\//, 'electron', 'electron-log'],
        },

        // Timeouts
        testTimeout: 10000,

        // Coverage (run with --coverage flag)
        coverage: {
            provider: 'v8',
            include: ['src/services/**', 'src/utils/**', 'src/main/**'],
            exclude: ['src/renderer/**'],
        },
    },

    resolve: {
        alias: {
            // Replace electron with a mock when running outside Electron
            'electron': path.resolve(__dirname, 'tests/__mocks__/electron.mjs'),
            '@services': path.resolve(__dirname, 'src/services'),
            '@utils': path.resolve(__dirname, 'src/utils'),
        },
    },
});
