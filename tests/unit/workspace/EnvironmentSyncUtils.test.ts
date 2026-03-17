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
    extractVarData,
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

        it('counts non-empty string values', () => {
            expect(countNonEmptyEnvValues({
                production: {
                    API_KEY: 'abc123',
                    SECRET: 'def456'
                }
            })).toBe(2);
        });

        it('counts non-empty object values', () => {
            expect(countNonEmptyEnvValues({
                staging: {
                    API_KEY: { value: 'abc123' },
                    EMPTY_VAR: { value: '' }
                }
            })).toBe(1);
        });

        it('skips null and undefined values', () => {
            expect(countNonEmptyEnvValues({
                prod: {
                    VAR_A: { value: null },
                    VAR_B: { value: undefined },
                    VAR_C: { value: 'real' }
                }
            })).toBe(1);
        });

        it('handles mixed formats across environments', () => {
            expect(countNonEmptyEnvValues({
                dev: { KEY: 'val1' },
                prod: { KEY: { value: 'val2' }, EMPTY: { value: '' } }
            })).toBe(2);
        });

        it('returns 0 for non-object input', () => {
            expect(countNonEmptyEnvValues('string' as any)).toBe(0);
            expect(countNonEmptyEnvValues(42 as any)).toBe(0);
        });
    });

    describe('extractVarData()', () => {
        it('extracts string value', () => {
            const result = extractVarData('hello');
            expect(result.value).toBe('hello');
            expect(result.isSecret).toBe(false);
            expect(result.hasNonEmptyValue).toBe(true);
        });

        it('extracts object value', () => {
            const result = extractVarData({ value: 'secret', isSecret: true });
            expect(result.value).toBe('secret');
            expect(result.isSecret).toBe(true);
            expect(result.hasNonEmptyValue).toBe(true);
        });

        it('handles empty string', () => {
            const result = extractVarData('');
            expect(result.value).toBe('');
            expect(result.hasNonEmptyValue).toBe(false);
        });

        it('handles null/undefined', () => {
            const nullResult = extractVarData(null);
            expect(nullResult.value).toBe('');
            expect(nullResult.hasNonEmptyValue).toBe(false);

            const undefResult = extractVarData(undefined);
            expect(undefResult.value).toBe('');
            expect(undefResult.hasNonEmptyValue).toBe(false);
        });

        it('defaults isSecret to false', () => {
            const result = extractVarData({ value: 'v' });
            expect(result.isSecret).toBe(false);
        });

        it('handles object with undefined value', () => {
            const result = extractVarData({ isSecret: true });
            expect(result.value).toBe('');
            expect(result.isSecret).toBe(true);
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
