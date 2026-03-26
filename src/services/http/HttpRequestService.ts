/**
 * HttpRequestService — main-process owner of HTTP request execution.
 *
 * Single entry point for all HTTP requests: test requests, initial fetch,
 * and scheduled refreshes. Resolves environment variable templates,
 * generates TOTP codes, executes HTTP via electron.net, applies JSON filters,
 * and returns rich response metadata.
 *
 * Stateless per-request — no scheduling, retry, or circuit breaker logic.
 * Those concerns belong in SourceRefreshService.
 */

import electron from 'electron';
import mainLogger from '../../utils/mainLogger';
import { TOTPGenerator } from '../../shared/totpGenerator';
import { applyJsonFilter } from '../../shared/jsonFilter';
import type { HttpRequestSpec, HttpRequestResult } from '../../types/http';
import type { TotpCooldownTracker } from './TotpCooldownTracker';

const { net } = electron;
const { createLogger } = mainLogger;
const log = createLogger('HttpRequestService');

const totpGenerator = new TOTPGenerator();

interface EnvironmentResolver {
    loadEnvironmentVariables(): Record<string, string>;
    resolveTemplate(template: string, variables: Record<string, string>): string;
}

/**
 * Encode a form body from UI formats into application/x-www-form-urlencoded.
 */
function encodeFormBody(body: string): string {
    // Already in key=value& format
    if (body.includes('=') && body.includes('&')) {
        return body;
    }
    // key=value with newline separators
    if (body.includes('=') && body.includes('\n')) {
        return body.split('\n')
            .filter(line => line.trim() !== '' && line.includes('='))
            .join('&');
    }
    // key:value with newline separators (standard UI format)
    if (body.includes(':')) {
        const params = new URLSearchParams();
        for (const line of body.split('\n')) {
            const trimmed = line.trim();
            if (trimmed === '') continue;
            const colonPos = trimmed.indexOf(':');
            if (colonPos > 0) {
                const key = trimmed.substring(0, colonPos).trim();
                params.append(key, trimmed.substring(colonPos + 1).trim());
            }
        }
        return params.toString();
    }
    return body;
}

class HttpRequestService {
    private envResolver: EnvironmentResolver;
    private totpTracker: TotpCooldownTracker;

    constructor(envResolver: EnvironmentResolver, totpTracker: TotpCooldownTracker) {
        this.envResolver = envResolver;
        this.totpTracker = totpTracker;
    }

    /**
     * Execute an HTTP request with full template resolution, TOTP, and optional JSON filter.
     * Does NOT throw on HTTP 4xx/5xx — returns statusCode in result.
     */
    async execute(spec: HttpRequestSpec): Promise<HttpRequestResult> {
        const startTime = Date.now();
        const envVars = this.envResolver.loadEnvironmentVariables();

        // ── TOTP handling ────────────────────────────────────────────
        let totpCode: string | null = null;
        if (spec.totpSecret) {
            // Check cooldown
            const cooldown = this.totpTracker.checkCooldown(spec.sourceId);
            if (cooldown.inCooldown) {
                throw new Error(`TOTP cooldown active. Please wait ${cooldown.remainingSeconds} seconds before making another request.`);
            }

            // Resolve variables in secret and generate code
            const resolvedSecret = this.resolveString(spec.totpSecret, envVars);
            const normalizedSecret = resolvedSecret.replace(/\s/g, '').replace(/=/g, '');
            totpCode = await totpGenerator.generate(normalizedSecret, 30, 6, 0);

            if (!totpCode || totpCode === 'ERROR') {
                throw new Error('Failed to generate TOTP code');
            }

            this.totpTracker.recordUsage(spec.sourceId, spec.totpSecret, totpCode);
            log.debug(`TOTP code generated for source ${spec.sourceId}`);
        }

        // ── Resolve all template strings ─────────────────────────────
        const url = this.resolveString(spec.url, envVars, totpCode);
        if (!url || url === 'https://' || url === 'http://') {
            throw new Error(`Invalid URL after variable substitution: "${url}". Check that all environment variables are defined.`);
        }

        const headers: Record<string, string> = {};
        if (spec.headers) {
            for (const h of spec.headers) {
                if (h.key) {
                    headers[this.resolveString(h.key, envVars, totpCode)] =
                        this.resolveString(h.value, envVars, totpCode);
                }
            }
        }

        const parsedUrl = new URL(url);
        if (spec.queryParams) {
            for (const p of spec.queryParams) {
                if (p.key) {
                    parsedUrl.searchParams.append(
                        this.resolveString(p.key, envVars, totpCode),
                        this.resolveString(p.value, envVars, totpCode)
                    );
                }
            }
        }

        let body: string | undefined;
        const method = spec.method || 'GET';
        if (spec.body) {
            body = this.resolveString(spec.body, envVars, totpCode);
        }

        const contentType = spec.contentType || 'application/json';

        // Encode form body
        if (body && contentType === 'application/x-www-form-urlencoded') {
            body = encodeFormBody(body);
        }

        const timeoutMs = spec.timeout || 15000;

        log.info(`Executing ${method} ${parsedUrl.href} (source: ${spec.sourceId})`);
        log.debug(`Request details — Content-Type: ${contentType}, headers: ${JSON.stringify(Object.keys(headers))}, bodyLength: ${body?.length ?? 0}, hasTOTP: ${!!totpCode}`);

        // ── Execute HTTP request ─────────────────────────────────────
        const { responseBody, responseHeaders, statusCode } = await this.executeHttp(
            method, parsedUrl.toString(), headers, body, contentType, timeoutMs
        );

        const duration = Date.now() - startTime;
        const responseSize = Buffer.byteLength(responseBody, 'utf8');

        log.info(`Response: HTTP ${statusCode}, ${responseSize} bytes, ${duration}ms (source: ${spec.sourceId})`);

        // ── Apply JSON filter ────────────────────────────────────────
        let filteredBody: string | undefined;
        let isFiltered = false;
        let filteredWith: string | undefined;

        if (spec.jsonFilter?.enabled && spec.jsonFilter.path) {
            const resolvedPath = this.resolveString(spec.jsonFilter.path, envVars, totpCode);
            const filtered = applyJsonFilter(responseBody, { enabled: true, path: resolvedPath });
            filteredBody = typeof filtered === 'string' ? filtered : JSON.stringify(filtered, null, 2);
            isFiltered = true;
            filteredWith = resolvedPath;
        }

        return {
            statusCode,
            headers: responseHeaders,
            body: responseBody,
            duration,
            responseSize,
            filteredBody,
            isFiltered,
            filteredWith,
            originalResponse: isFiltered ? responseBody : undefined
        };
    }

    /**
     * Generate a TOTP code for preview display — no cooldown recording.
     */
    async generateTotpPreview(secret: string): Promise<string> {
        const envVars = this.envResolver.loadEnvironmentVariables();
        const resolvedSecret = this.resolveString(secret, envVars);
        const normalizedSecret = resolvedSecret.replace(/\s/g, '').replace(/=/g, '');
        const code = await totpGenerator.generate(normalizedSecret, 30, 6, 0);
        if (!code || code === 'ERROR') {
            throw new Error('Failed to generate TOTP code. Check your secret key.');
        }
        return code;
    }

    // ── Private helpers ──────────────────────────────────────────────

    private resolveString(
        text: string | undefined | null,
        envVars: Record<string, string>,
        totpCode: string | null = null
    ): string {
        if (!text) return '';
        let result = this.envResolver.resolveTemplate(text, envVars);
        if (totpCode) {
            result = result.replace(/\[\[TOTP_CODE]]/g, totpCode);
        }
        return result;
    }

    private executeHttp(
        method: string,
        url: string,
        headers: Record<string, string>,
        body: string | undefined,
        contentType: string,
        timeoutMs: number
    ): Promise<{ responseBody: string; responseHeaders: Record<string, string>; statusCode: number }> {
        return new Promise((resolve, reject) => {
            try {
                const request = net.request({
                    method,
                    url,
                    redirect: 'follow'
                });

                const timeoutId = setTimeout(() => {
                    request.abort();
                    reject(new Error(`Request timed out after ${timeoutMs}ms`));
                }, timeoutMs);

                for (const [key, value] of Object.entries(headers)) {
                    request.setHeader(key, value);
                }

                if (body && contentType) {
                    request.setHeader('Content-Type', contentType);
                }

                request.setHeader('User-Agent', `OpenHeaders/${electron.app.getVersion()}`);

                let data = '';
                let status = 0;
                let respHeaders: Record<string, string> = {};

                request.on('response', (response) => {
                    clearTimeout(timeoutId);
                    status = response.statusCode;

                    const rawHeaders = response.headers as Record<string, string | string[]>;
                    for (const [key, val] of Object.entries(rawHeaders)) {
                        respHeaders[key] = Array.isArray(val) ? val[0] : val;
                    }

                    response.on('data', (chunk: Buffer) => {
                        data += chunk.toString();
                    });

                    response.on('end', () => {
                        resolve({ responseBody: data, responseHeaders: respHeaders, statusCode: status });
                    });
                });

                request.on('error', (error: Error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                });

                if (body) {
                    request.write(Buffer.from(body));
                }

                request.end();
            } catch (error) {
                reject(error);
            }
        });
    }
}

export { HttpRequestService, encodeFormBody };
export type { EnvironmentResolver };
