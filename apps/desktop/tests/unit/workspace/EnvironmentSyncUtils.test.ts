import { describe, expect, it, vi } from 'vitest';

// Mock mainLogger
vi.mock('../../../src/utils/mainLogger.js', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Mock atomicFileWriter
vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import {
  countNonEmptyEnvValues,
  ENV_FILE_READ_MAX_RETRIES,
  ENV_FILE_READ_RETRY_DELAY,
  validateEnvironmentWrite,
} from '@/services/workspace/git/utils/EnvironmentSyncUtils';

describe('EnvironmentSyncUtils', () => {
  describe('countNonEmptyEnvValues()', () => {
    it('returns 0 for null/undefined', () => {
      expect(countNonEmptyEnvValues(null)).toBe(0);
      expect(countNonEmptyEnvValues(undefined)).toBe(0);
    });

    it('returns 0 for empty object', () => {
      expect(countNonEmptyEnvValues({})).toBe(0);
    });

    it('counts non-empty values in single environment', () => {
      expect(
        countNonEmptyEnvValues({
          Production: {
            API_GATEWAY_TOKEN: {
              value: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig',
              isSecret: true,
            },
            OAUTH2_CLIENT_SECRET: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: true },
          },
        }),
      ).toBe(2);
    });

    it('counts non-empty and skips empty values', () => {
      expect(
        countNonEmptyEnvValues({
          Staging: {
            API_KEY: { value: 'staging-key-abc123', isSecret: false },
            PENDING_SECRET: { value: '', isSecret: true },
          },
        }),
      ).toBe(1);
    });

    it('handles multiple environments (enterprise setup)', () => {
      expect(
        countNonEmptyEnvValues({
          Development: {
            API_URL: { value: 'https://api.dev.openheaders.io', isSecret: false },
            DB_PASSWORD: { value: 'dev-pass-123', isSecret: true },
          },
          Staging: {
            API_URL: { value: 'https://api.staging.openheaders.io', isSecret: false },
            DB_PASSWORD: { value: '', isSecret: true },
          },
          Production: {
            API_URL: { value: 'https://api.openheaders.io', isSecret: false },
            DB_PASSWORD: { value: 'prod-secure-pass', isSecret: true },
            EMPTY_PLACEHOLDER: { value: '', isSecret: false },
          },
        }),
      ).toBe(5); // 2 dev + 1 staging + 2 prod (3 empties skipped)
    });
  });

  describe('validateEnvironmentWrite()', () => {
    it('allows write when no existing values', () => {
      const result = validateEnvironmentWrite(0, 5);
      expect(result.safe).toBe(true);
      expect(result.shouldBackup).toBe(false);
      expect(result.shouldBlock).toBe(false);
      expect(result.lossPercentage).toBe(0);
    });

    it('blocks write when new count is 0', () => {
      const result = validateEnvironmentWrite(10, 0);
      expect(result.safe).toBe(false);
      expect(result.lossPercentage).toBe(100);
      expect(result.shouldBackup).toBe(true);
      expect(result.shouldBlock).toBe(true);
    });

    it('allows write with small loss (<50%)', () => {
      const result = validateEnvironmentWrite(10, 8);
      expect(result.safe).toBe(true);
      expect(result.lossPercentage).toBe(20);
      expect(result.shouldBackup).toBe(false);
      expect(result.shouldBlock).toBe(false);
    });

    it('marks unsafe with large loss (>=50%)', () => {
      const result = validateEnvironmentWrite(10, 3);
      expect(result.safe).toBe(false);
      expect(result.lossPercentage).toBe(70);
      expect(result.shouldBackup).toBe(true);
      expect(result.shouldBlock).toBe(false);
    });

    it('allows write when gaining values', () => {
      const result = validateEnvironmentWrite(5, 10);
      expect(result.safe).toBe(true);
      expect(result.lossPercentage).toBe(0);
    });

    it('allows write when counts are equal', () => {
      const result = validateEnvironmentWrite(5, 5);
      expect(result.safe).toBe(true);
      expect(result.lossPercentage).toBe(0);
    });
  });

  describe('validateEnvironmentWrite() — boundary cases', () => {
    it('allows write at exactly 50% loss boundary', () => {
      const result = validateEnvironmentWrite(10, 5);
      // 50% loss = exactly at boundary, lossPercentage rounds to 50
      expect(result.lossPercentage).toBe(50);
    });

    it('allows write with 1 value gain', () => {
      const result = validateEnvironmentWrite(10, 11);
      expect(result.safe).toBe(true);
      expect(result.lossPercentage).toBe(0);
    });

    it('handles large environment sets (50+ variables)', () => {
      const result = validateEnvironmentWrite(50, 48);
      expect(result.safe).toBe(true);
      expect(result.lossPercentage).toBe(4);
    });

    it('blocks total wipeout of large environment', () => {
      const result = validateEnvironmentWrite(100, 0);
      expect(result.safe).toBe(false);
      expect(result.lossPercentage).toBe(100);
      expect(result.shouldBlock).toBe(true);
    });
  });

  describe('constants', () => {
    it('has expected retry defaults', () => {
      expect(ENV_FILE_READ_MAX_RETRIES).toBe(3);
      expect(ENV_FILE_READ_RETRY_DELAY).toBe(500);
    });
  });
});
