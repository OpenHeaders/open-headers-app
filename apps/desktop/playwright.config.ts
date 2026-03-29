import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    outputDir: './tests/e2e/test-results',
    timeout: 90000,
    retries: 0,
    workers: 1, // Electron tests must run serially
    reporter: 'list',
    use: {
        trace: 'on-first-retry',
    },
});
