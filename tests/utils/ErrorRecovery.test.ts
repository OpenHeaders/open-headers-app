import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorRecoveryClass, ErrorTypes } from '../../src/utils/ErrorRecovery';

describe('ErrorRecovery', () => {
    let recovery: InstanceType<typeof ErrorRecoveryClass>;

    beforeEach(() => {
        recovery = new ErrorRecoveryClass();
    });

    describe('classifyError()', () => {
        it('classifies ENOTFOUND as NETWORK', () => {
            const err = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies ETIMEDOUT as NETWORK', () => {
            const err = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies ECONNREFUSED as NETWORK', () => {
            const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies ENETUNREACH as NETWORK', () => {
            const err = Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies "network" in message as NETWORK', () => {
            const err = new Error('Network request failed');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies "offline" in message as NETWORK', () => {
            const err = new Error('Device is offline');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.NETWORK);
        });

        it('classifies code 401 as AUTH', () => {
            const err = Object.assign(new Error('Unauthorized'), { code: '401' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.AUTH);
        });

        it('classifies code 403 as AUTH', () => {
            const err = Object.assign(new Error('Forbidden'), { code: '403' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.AUTH);
        });

        it('classifies "unauthorized" in message as AUTH', () => {
            const err = new Error('Request unauthorized');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.AUTH);
        });

        it('classifies "forbidden" in message as AUTH', () => {
            const err = new Error('Access forbidden');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.AUTH);
        });

        it('classifies "authentication" in message as AUTH', () => {
            const err = new Error('Authentication required');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.AUTH);
        });

        it('classifies "permission" in message as AUTH', () => {
            const err = new Error('Permission denied');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.AUTH);
        });

        it('classifies "timeout" in code as TIMEOUT', () => {
            const err = Object.assign(new Error('op timed out'), { code: 'ETIMEOUT' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.TIMEOUT);
        });

        it('classifies "timed out" in message as TIMEOUT', () => {
            const err = new Error('Request timed out');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.TIMEOUT);
        });

        it('classifies code 429 as RATE_LIMIT', () => {
            const err = Object.assign(new Error('Too many requests'), { code: '429' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.RATE_LIMIT);
        });

        it('classifies "rate limit" in message as RATE_LIMIT', () => {
            const err = new Error('Rate limit exceeded');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.RATE_LIMIT);
        });

        it('classifies "too many requests" in message as RATE_LIMIT', () => {
            const err = new Error('Too many requests');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.RATE_LIMIT);
        });

        it('classifies code 500 as SERVER_ERROR', () => {
            const err = Object.assign(new Error('Internal'), { code: '500' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.SERVER_ERROR);
        });

        it('classifies code 502 as SERVER_ERROR', () => {
            const err = Object.assign(new Error('Bad Gateway'), { code: '502' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.SERVER_ERROR);
        });

        it('classifies code 503 as SERVER_ERROR', () => {
            const err = Object.assign(new Error('Service Unavailable'), { code: '503' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.SERVER_ERROR);
        });

        it('classifies code 504 as TIMEOUT when message contains "timeout"', () => {
            // Note: "Gateway Timeout" contains "timeout" which matches TIMEOUT before SERVER_ERROR
            const err = Object.assign(new Error('Gateway Timeout'), { code: '504' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.TIMEOUT);
        });

        it('classifies code 504 as SERVER_ERROR when message has no timeout keyword', () => {
            const err = Object.assign(new Error('Bad gateway response'), { code: '504' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.SERVER_ERROR);
        });

        it('classifies "server error" in message as SERVER_ERROR', () => {
            const err = new Error('Server error occurred');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.SERVER_ERROR);
        });

        it('classifies code 409 as CONFLICT', () => {
            const err = Object.assign(new Error('Conflict'), { code: '409' });
            expect(recovery.classifyError(err)).toBe(ErrorTypes.CONFLICT);
        });

        it('classifies "already exists" in message as CONFLICT', () => {
            const err = new Error('Resource already exists');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.CONFLICT);
        });

        it('classifies "memory" in message as RESOURCE_EXHAUSTED', () => {
            const err = new Error('Out of memory');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.RESOURCE_EXHAUSTED);
        });

        it('classifies "disk space" in message as RESOURCE_EXHAUSTED', () => {
            const err = new Error('Not enough disk space');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.RESOURCE_EXHAUSTED);
        });

        it('classifies "quota" in message as RESOURCE_EXHAUSTED', () => {
            const err = new Error('Storage quota exceeded');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.RESOURCE_EXHAUSTED);
        });

        it('classifies unknown errors as UNKNOWN', () => {
            const err = new Error('Something completely different');
            expect(recovery.classifyError(err)).toBe(ErrorTypes.UNKNOWN);
        });
    });

    describe('shouldRetry()', () => {
        it('returns true when no attempts have been made', () => {
            expect(recovery.shouldRetry('op1')).toBe(true);
        });

        it('returns true when under max retries', () => {
            recovery.retryAttempts.set('op1', 2);
            expect(recovery.shouldRetry('op1')).toBe(true);
        });

        it('returns false when at max retries', () => {
            recovery.retryAttempts.set('op1', 3);
            expect(recovery.shouldRetry('op1')).toBe(false);
        });

        it('returns false when over max retries', () => {
            recovery.retryAttempts.set('op1', 5);
            expect(recovery.shouldRetry('op1')).toBe(false);
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
            expect(delay1).toBeLessThan(2100); // 1000 + up to 1000 jitter

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
            recovery.retryAttempts.set('op1', 20); // Very high attempt count
            const delay = recovery.getRetryDelay('op1');
            expect(delay).toBeLessThanOrEqual(recovery.maxDelay + 1000); // maxDelay + jitter
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
            recovery.retryAttempts.set('op1', 3);
            recovery.resetRetryCount('op1');
            expect(recovery.retryAttempts.has('op1')).toBe(false);
        });

        it('does nothing for undefined operationId', () => {
            recovery.retryAttempts.set('op1', 3);
            recovery.resetRetryCount(undefined);
            expect(recovery.retryAttempts.has('op1')).toBe(true);
        });
    });

    describe('getStrategy()', () => {
        it('returns a function for each known error type', () => {
            const types = Object.values(ErrorTypes);
            for (const type of types) {
                expect(typeof recovery.getStrategy(type)).toBe('function');
            }
        });

        it('returns handleUnknownError for unrecognized types', () => {
            const strategy = recovery.getStrategy('nonexistent' as any);
            expect(typeof strategy).toBe('function');
        });
    });

    describe('sleep()', () => {
        it('resolves after specified time', async () => {
            const start = Date.now();
            await recovery.sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(40); // Allow small timing variance
        });
    });

    describe('withRetry()', () => {
        it('returns the result on success', async () => {
            const fn = vi.fn().mockResolvedValue('success');
            const wrapped = recovery.withRetry(fn);
            const result = await wrapped();
            expect(result).toBe('success');
        });

        it('retries on failure and returns on eventual success', async () => {
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('Server error'))
                .mockResolvedValue('success');

            // Use small delays for testing
            recovery.baseDelay = 10;
            const wrapped = recovery.withRetry(fn, { maxRetries: 3, operationId: 'test-retry' });
            const result = await wrapped();

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('does not retry AUTH errors', async () => {
            const err = new Error('Unauthorized');
            const fn = vi.fn().mockRejectedValue(err);

            recovery.baseDelay = 10;
            const wrapped = recovery.withRetry(fn, { maxRetries: 3, operationId: 'auth-test' });

            await expect(wrapped()).rejects.toThrow('Unauthorized');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('does not retry CONFLICT errors', async () => {
            const err = new Error('Resource already exists');
            const fn = vi.fn().mockRejectedValue(err);

            recovery.baseDelay = 10;
            const wrapped = recovery.withRetry(fn, { maxRetries: 3, operationId: 'conflict-test' });

            await expect(wrapped()).rejects.toThrow('already exists');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('throws after exhausting all retries', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('Server error'));

            recovery.baseDelay = 10;
            const wrapped = recovery.withRetry(fn, { maxRetries: 2, operationId: 'exhaust-test' });

            await expect(wrapped()).rejects.toThrow('Server error');
            expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
        });
    });

    describe('ErrorTypes constants', () => {
        it('has all expected error types', () => {
            expect(ErrorTypes.NETWORK).toBe('network');
            expect(ErrorTypes.AUTH).toBe('auth');
            expect(ErrorTypes.CONFLICT).toBe('conflict');
            expect(ErrorTypes.TIMEOUT).toBe('timeout');
            expect(ErrorTypes.RATE_LIMIT).toBe('rate_limit');
            expect(ErrorTypes.SERVER_ERROR).toBe('server_error');
            expect(ErrorTypes.RESOURCE_EXHAUSTED).toBe('resource_exhausted');
            expect(ErrorTypes.UNKNOWN).toBe('unknown');
        });
    });
});
