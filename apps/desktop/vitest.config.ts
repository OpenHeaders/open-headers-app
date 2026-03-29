import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    typecheck: {
      enabled: true,
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
      electron: path.resolve(__dirname, 'tests/__mocks__/electron.ts'),
      'electron-log': path.resolve(__dirname, 'tests/__mocks__/electron-log.ts'),
    },
  },
});
