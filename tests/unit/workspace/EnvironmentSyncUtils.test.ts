import { describe, it, expect, vi } from 'vitest';

// Mock mainLogger
vi.mock('../../../src/utils/mainLogger.js', () => ({
    default: {
        createLogger: () => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        })
    }
}));

// Mock atomicFileWriter
vi.mock('../../../src/utils/atomicFileWriter.js', () => ({
    default: {
        readFile: vi.fn(),
        writeFile: vi.fn()
    }
}));

import {
    countNonEmptyEnvValues,
    validateEnvironmentWrite,
    ENV_FILE_READ_MAX_RETRIES,
    ENV_FILE_READ_RETRY_DELAY
} from '../../../src/services/workspace/git/utils/EnvironmentSyncUtils';

describe('EnvironmentSyncUtils', () => {
    describe('countNonEmptyEnvValues()', () => {
        it('returns 0 for null/undefined', () => {
            expect(countNonEmptyEnvValues(null)).toBe(0);
            expect(countNonEmptyEnvValues(undefined)).toBe(0);
        });

        it('returns 0 for empty object', () => {
            expect(countNonEmptyEnvValues({})).toBe(0);
        });

        it('counts non-empty values', () => {
            expect(countNonEmptyEnvValues({
                production: {
                    API_KEY: { value: 'abc123', isSecret: false },
                    SECRET: { value: 'def456', isSecret: true }
                }
            })).toBe(2);
        });

        it('counts non-empty and skips empty values', () => {
            expect(countNonEmptyEnvValues({
                staging: {
                    API_KEY: { value: 'abc123', isSecret: false },
                    EMPTY_VAR: { value: '', isSecret: false }
                }
            })).toBe(1);
        });

        it('handles multiple environments', () => {
            expect(countNonEmptyEnvValues({
                dev: { KEY: { value: 'val1', isSecret: false } },
                prod: {
                    KEY: { value: 'val2', isSecret: false },
                    EMPTY: { value: '', isSecret: false }
                }
            })).toBe(2);
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

    describe('constants', () => {
        it('has expected retry defaults', () => {
            expect(ENV_FILE_READ_MAX_RETRIES).toBe(3);
            expect(ENV_FILE_READ_RETRY_DELAY).toBe(500);
        });
    });
});
