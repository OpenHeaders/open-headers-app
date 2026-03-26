/**
 * useHttp — thin IPC wrapper for HttpRequestService in main process.
 *
 * All template resolution, TOTP generation, and HTTP execution happen in main.
 * This hook just sends raw specs over IPC and returns results.
 */

import { useCallback } from 'react';
import { createLogger } from '../utils/error-handling/logger';
import type { HttpRequestSpec, HttpRequestResult, TestResponseContent } from '../../types/http';

const log = createLogger('useHttp');

interface UseHttpReturn {
    request: (spec: HttpRequestSpec) => Promise<HttpRequestResult>;
    testRequest: (spec: HttpRequestSpec) => Promise<TestResponseContent>;
}

export function useHttp(): UseHttpReturn {
    const request = useCallback(async (spec: HttpRequestSpec): Promise<HttpRequestResult> => {
        log.debug(`Making HTTP request: ${spec.method} ${spec.url}`);
        return window.electronAPI.httpRequest.executeRequest(spec);
    }, []);

    const testRequest = useCallback(async (spec: HttpRequestSpec): Promise<TestResponseContent> => {
        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000);
            });

            const testSpec: HttpRequestSpec = {
                ...spec,
                sourceId: spec.sourceId.startsWith('test-') ? spec.sourceId : `test-${spec.sourceId}`
            };

            const result = await Promise.race([
                request(testSpec),
                timeoutPromise
            ]);

            return {
                statusCode: result.statusCode,
                body: result.filteredBody ?? result.body,
                headers: result.headers,
                originalResponse: result.originalResponse,
                filteredWith: result.filteredWith,
                duration: result.duration
            };
        } catch (error: unknown) {
            log.error('Test request error:', error);
            const message = error instanceof Error ? error.message : String(error);
            return { error: message, statusCode: 0 };
        }
    }, [request]);

    return { request, testRequest };
}
