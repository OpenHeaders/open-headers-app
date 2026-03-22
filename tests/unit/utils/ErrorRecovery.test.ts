import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorRecoveryClass, ErrorTypes } from '../../../src/utils/ErrorRecovery';

describe('ErrorRecovery', () => {
    let recovery: InstanceType<typeof ErrorRecoveryClass>;

    beforeEach(() => {
        recovery = new ErrorRecoveryClass();
    });

    describe('classifyError()', () => {
        // Network errors
        it('classifies ENOTFOUND as NETWORK', () => {
            const err = Object.assign(new Error('getaddrinfo ENOTFOUND api.openheaders.io'), { code: 'ENOTFOUND' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies ETIMEDOUT as NETWORK', () => {
            const err = Object.assign(new Error('connect ETIMEDOUT 34.120.55.100:443'), { code: 'ETIMEDOUT' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies ECONNREFUSED as NETWORK', () => {
            const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8443'), { code: 'ECONNREFUSED' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies ENETUNREACH as NETWORK', () => {
            const err = Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies "network" in message as NETWORK', () => {
            expect(recovery.classifyError(new Error('Network request failed for https://auth.openheaders.io/oauth2/token')))
                .toBe(ErrorTypes.NETWORK);
        });

        it('classifies "offline" in message as NETWORK', () => {
            expect(recovery.classifyError(new Error('Device is offline — cannot sync workspace')))
                .toBe(ErrorTypes.NETWORK);
        });

        // Auth errors
        it('classifies code 401 as AUTH', () => {
            const err = Object.assign(new Error('Unauthorized — expired GitHub PAT'), { code: '401' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.AUTH);
        });

        it('classifies code 403 as AUTH', () => {
            const err = Object.assign(new Error('Forbidden — insufficient repo permissions'), { code: '403' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.AUTH);
        });

        it('classifies "unauthorized" in message as AUTH', () => {
            expect(recovery.classifyError(new Error('Request unauthorized for gitlab.openheaders.io')))
                .toBe(ErrorTypes.AUTH);
        });

        it('classifies "forbidden" in message as AUTH', () => {
            expect(recovery.classifyError(new Error('Access forbidden to private repository')))
                .toBe(ErrorTypes.AUTH);
        });

        it('classifies "authentication" in message as AUTH', () => {
            expect(recovery.classifyError(new Error('Authentication required for workspace sync')))
                .toBe(ErrorTypes.AUTH);
        });

        it('classifies "permission" in message as AUTH', () => {
            expect(recovery.classifyError(new Error('Permission denied writing to team workspace config')))
                .toBe(ErrorTypes.AUTH);
        });

        // Timeout errors
        it('classifies "timeout" in code as TIMEOUT', () => {
            const err = Object.assign(new Error('Git operation timed out'), { code: 'ETIMEOUT' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.TIMEOUT);
        });

        it('classifies "timed out" in message as TIMEOUT', () => {
            expect(recovery.classifyError(new Error('Request timed out after 30000ms for source refresh')))
                .toBe(ErrorTypes.TIMEOUT);
        });

        // Rate limiting
        it('classifies code 429 as RATE_LIMIT', () => {
            const err = Object.assign(new Error('Too many requests to GitHub API'), { code: '429' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.RATE_LIMIT);
        });

        it('classifies "rate limit" in message as RATE_LIMIT', () => {
            expect(recovery.classifyError(new Error('Rate limit exceeded for api.openheaders.io')))
                .toBe(ErrorTypes.RATE_LIMIT);
        });

        it('classifies "too many requests" in message as RATE_LIMIT', () => {
            expect(recovery.classifyError(new Error('Too many requests — retry after 60s')))
                .toBe(ErrorTypes.RATE_LIMIT);
        });

        // Server errors
        it('classifies code 500 as SERVER_ERROR', () => {
            const err = Object.assign(new Error('Internal Server Error'), { code: '500' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.SERVER_ERROR);
        });

        it('classifies code 502 as SERVER_ERROR', () => {
            const err = Object.assign(new Error('Bad Gateway'), { code: '502' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.SERVER_ERROR);
        });

        it('classifies code 503 as SERVER_ERROR', () => {
            const err = Object.assign(new Error('Service Unavailable — maintenance window'), { code: '503' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.SERVER_ERROR);
        });

        it('classifies code 504 as TIMEOUT when message contains "timeout"', () => {
            const err = Object.assign(new Error('Gateway Timeout'), { code: '504' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.TIMEOUT);
        });

        it('classifies code 504 as SERVER_ERROR when message has no timeout keyword', () => {
            const err = Object.assign(new Error('Bad gateway response from upstream'), { code: '504' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.SERVER_ERROR);
        });

        // Conflict errors
        it('classifies code 409 as CONFLICT', () => {
            const err = Object.assign(new Error('Merge conflict in workspace config'), { code: '409' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.CONFLICT);
        });

        it('classifies "already exists" in message as CONFLICT', () => {
            expect(recovery.classifyError(new Error('Workspace "Production" already exists')))
                .toBe(ErrorTypes.CONFLICT);
        });

        // Resource exhausted
        it('classifies "memory" in message as RESOURCE_EXHAUSTED', () => {
            expect(recovery.classifyError(new Error('JavaScript heap out of memory during recording export')))
                .toBe(ErrorTypes.RESOURCE_EXHAUSTED);
        });

        it('classifies "disk space" in message as RESOURCE_EXHAUSTED', () => {
            expect(recovery.classifyError(new Error('Not enough disk space to save recording')))
                .toBe(ErrorTypes.RESOURCE_EXHAUSTED);
        });

        it('classifies "quota" in message as RESOURCE_EXHAUSTED', () => {
            expect(recovery.classifyError(new Error('Storage quota exceeded for workspace data')))
                .toBe(ErrorTypes.RESOURCE_EXHAUSTED);
        });

        // Unknown
        it('classifies unknown errors as UNKNOWN', () => {
            expect(recovery.classifyError(new Error('Something completely unexpected happened')))
                .toBe(ErrorTypes.UNKNOWN);
        });
    });

    describe('shouldRetry()', () => {
        it('returns true when no attempts have been made', () => {
            expect(recovery.shouldRetry('sync-a1b2c3d4')).toBe(true);
        });

        it('returns true when under max retries', () => {
            recovery.retryAttempts.set('sync-a1b2c3d4', 2);
            expect(recovery.shouldRetry('sync-a1b2c3d4')).toBe(true);
        });

        it('returns false when at max retries', () => {
            recovery.retryAttempts.set('sync-a1b2c3d4', 3);
            expect(recovery.shouldRetry('sync-a1b2c3d4')).toBe(false);
        });

        it('returns false when over max retries', () => {
            recovery.retryAttempts.set('sync-a1b2c3d4', 5);
            expect(recovery.shouldRetry('sync-a1b2c3d4')).toBe(false);
        });

        it('returns true for undefined operationId (new op)', () => {
            expect(recovery.shouldRetry(undefined)).toBe(true);
        });
    });

    describe('getRetryDelay()', () => {
        it('returns delay with exponential backoff', () => {
            // First call: baseDelay * 2^0 = 1000 + jitter
            const delay1 = recovery.getRetryDelay('op1');
            expect(delay1).toBeGreaterThanOrEqual(1000);
            expect(delay1).toBeLessThan(2100);

            // Second call: baseDelay * 2^1 = 2000 + jitter
            const delay2 = recovery.getRetryDelay('op1');
            expect(delay2).toBeGreaterThanOrEqual(2000);
            expect(delay2).toBeLessThan(3100);

            // Third call: baseDelay * 2^2 = 4000 + jitter
            const delay3 = recovery.getRetryDelay('op1');
            expect(delay3).toBeGreaterThanOrEqual(4000);
            expect(delay3).toBeLessThan(5100);
        });

        it('caps delay at maxDelay', () => {
            recovery.retryAttempts.set('op1', 20);
            const delay = recovery.getRetryDelay('op1');
            expect(delay).toBeLessThanOrEqual(recovery.maxDelay + 1000);
        });

        it('increments attempt count', () => {
            expect(recovery.retryAttempts.get('op2')).toBeUndefined();
            recovery.getRetryDelay('op2');
            expect(recovery.retryAttempts.get('op2')).toBe(1);
            recovery.getRetryDelay('op2');
            expect(recovery.retryAttempts.get('op2')).toBe(2);
        });
    });

    describe('resetRetryCount()', () => {
        it('removes retry count for operationId', () => {
            recovery.retryAttempts.set('sync-a1b2c3d4', 3);
            recovery.resetRetryCount('sync-a1b2c3d4');
            expect(recovery.retryAttempts.has('sync-a1b2c3d4')).toBe(false);
        });

        it('does nothing for undefined operationId', () => {
            recovery.retryAttempts.set('sync-a1b2c3d4', 3);
            recovery.resetRetryCount(undefined);
            expect(recovery.retryAttempts.has('sync-a1b2c3d4')).toBe(true);
        });
    });

    describe('getStrategy()', () => {
        it('returns a function for each known error type', () => {
            const types = Object.values(ErrorTypes);
            for (const type of types) {
                expect(typeof recovery.getStrategy(type)).toBe('function');
            }
        });

        it('returns handleUnknownError for unrecognized type', () => {
            const strategy = recovery.getStrategy('nonexistent' as 'unknown');
            expect(typeof strategy).toBe('function');
        });
    });

    describe('sleep()', () => {
        it('resolves after specified time', async () => {
            const start = Date.now();
            await recovery.sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(40);
        });
    });

    describe('withRetry()', () => {
        it('returns the result on success', async () => {
            const fn = vi.fn().mockResolvedValue({ token: 'Bearer eyJhbG...' });
            const wrapped = recovery.withRetry(fn);
            const result = await wrapped();
            expect(result).toEqual({ token: 'Bearer eyJhbG...' });
        });

        it('retries on failure and returns on eventual success', async () => {
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('Server error on auth.openheaders.io'))
                .mockResolvedValue({ status: 'ok' });

            recovery.baseDelay = 10;
            const wrapped = recovery.withRetry(fn, { maxRetries: 3, operationId: 'test-retry' });
            const result = await wrapped();

            expect(result).toEqual({ status: 'ok' });
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('does not retry AUTH errors', async () => {
            const err = new Error('Unauthorized — expired token for gitlab.openheaders.io');
            const fn = vi.fn().mockRejectedValue(err);

            recovery.baseDelay = 10;
            const wrapped = recovery.withRetry(fn, { maxRetries: 3, operationId: 'auth-test' });

            await expect(wrapped()).rejects.toThrow('Unauthorized');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('does not retry CONFLICT errors', async () => {
            const err = new Error('Workspace already exists in team config');
            const fn = vi.fn().mockRejectedValue(err);

            recovery.baseDelay = 10;
            const wrapped = recovery.withRetry(fn, { maxRetries: 3, operationId: 'conflict-test' });

            await expect(wrapped()).rejects.toThrow('already exists');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('throws after exhausting all retries', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('Server error 502 from api.openheaders.io'));

            recovery.baseDelay = 10;
            const wrapped = recovery.withRetry(fn, { maxRetries: 2, operationId: 'exhaust-test' });

            await expect(wrapped()).rejects.toThrow('Server error');
            expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
        });

        it('passes through arguments to wrapped function', async () => {
            const fn = vi.fn().mockResolvedValue('ok');
            recovery.baseDelay = 10;
            const wrapped = recovery.withRetry(fn);
            await wrapped('arg1', 'arg2');
            expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
        });
    });

    describe('ErrorTypes constants', () => {
        it('has all expected error types with correct values', () => {
            expect(ErrorTypes).toEqual({
                NETWORK: 'network',
                AUTH: 'auth',
                CONFLICT: 'conflict',
                TIMEOUT: 'timeout',
                RATE_LIMIT: 'rate_limit',
                SERVER_ERROR: 'server_error',
                RESOURCE_EXHAUSTED: 'resource_exhausted',
                UNKNOWN: 'unknown'
            });
        });
    });

    describe('constructor defaults', () => {
        it('initializes with expected configuration', () => {
            expect(recovery.maxRetries).toBe(3);
            expect(recovery.baseDelay).toBe(1000);
            expect(recovery.maxDelay).toBe(30000);
            expect(recovery.retryAttempts).toBeInstanceOf(Map);
            expect(recovery.retryAttempts.size).toBe(0);
        });
    });
});
