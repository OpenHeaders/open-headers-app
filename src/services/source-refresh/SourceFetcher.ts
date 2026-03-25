/**
 * SourceFetcher — performs a single HTTP fetch for a source in the main process.
 *
 * Resolves env-var templates, generates TOTP codes, makes the HTTP request
 * via electron.net, and applies JSON filters. No scheduling or retry logic —
 * that belongs in SourceRefreshService.
 */

import electron from 'electron';
import mainLogger from '../../utils/mainLogger';
import { TOTPGenerator } from '../../shared/totpGenerator';
import { applyJsonFilter } from '../../shared/jsonFilter';
import type { Source, SourceRequestOptions } from '../../types/source';
import type { FetchResult } from '../../types/source-refresh';

const { net } = electron;
const { createLogger } = mainLogger;
const log = createLogger('SourceFetcher');

const totpGenerator = new TOTPGenerator();

interface EnvironmentResolver {
    loadEnvironmentVariables(): Record<string, string>;
    resolveTemplate(template: string, variables: Record<string, string>): string;
}

/**
 * Resolve all {{VAR}} placeholders in a string using environment variables.
 */
function resolveTemplateString(
    text: string | undefined | null,
    envVars: Record<string, string>,
    resolver: EnvironmentResolver,
    totpCode: string | null = null
): string {
    if (!text) return '';
    let result = resolver.resolveTemplate(text, envVars);
    if (totpCode) {
        result = result.replace(/\[\[TOTP_CODE]]/g, totpCode);
    }
    return result;
}

/**
 * Fetch content for a single HTTP source.
 */
export async function fetchSourceContent(
    source: Source,
    envResolver: EnvironmentResolver,
    timeoutMs: number = 15000
): Promise<FetchResult> {
    const envVars = envResolver.loadEnvironmentVariables();
    const opts = source.requestOptions || {} as SourceRequestOptions;

    // Generate TOTP if needed
    let totpCode: string | null = null;
    if (opts.totpSecret) {
        const resolved = resolveTemplateString(opts.totpSecret, envVars, envResolver);
        const normalizedSecret = resolved.replace(/\s/g, '').replace(/=/g, '');
        totpCode = await totpGenerator.generate(normalizedSecret, 30, 6, 0);
        if (!totpCode || totpCode === 'ERROR') {
            throw new Error('Failed to generate TOTP code');
        }
    }

    // Resolve URL
    const url = resolveTemplateString(source.sourcePath, envVars, envResolver, totpCode);
    if (!url || url === 'https://' || url === 'http://') {
        throw new Error(`Invalid URL after variable substitution: "${url}"`);
    }

    // Build headers
    const headers: Record<string, string> = {};
    if (opts.headers) {
        for (const h of opts.headers) {
            if (h.key) {
                headers[h.key] = resolveTemplateString(h.value, envVars, envResolver, totpCode);
            }
        }
    }

    // Build query params
    const parsedUrl = new URL(url);
    if (opts.queryParams) {
        for (const p of opts.queryParams) {
            if (p.key) {
                parsedUrl.searchParams.append(
                    resolveTemplateString(p.key, envVars, envResolver, totpCode),
                    resolveTemplateString(p.value, envVars, envResolver, totpCode)
                );
            }
        }
    }

    // Build body
    let body: string | undefined;
    const method = source.sourceMethod || 'GET';
    if (['POST', 'PUT', 'PATCH'].includes(method) && opts.body) {
        body = resolveTemplateString(opts.body, envVars, envResolver, totpCode);
    }

    const contentType = opts.contentType || 'application/json';

    log.info(`Fetching source ${source.sourceId}: ${method} ${parsedUrl.href}`);

    // Make the HTTP request using electron.net
    const { responseBody, responseHeaders, statusCode } = await new Promise<{
        responseBody: string;
        responseHeaders: Record<string, string>;
        statusCode: number;
    }>((resolve, reject) => {
        try {
            const request = net.request({
                method,
                url: parsedUrl.toString(),
                redirect: 'follow'
            });

            const timeoutId = setTimeout(() => {
                request.abort();
                reject(new Error(`Request timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            // Set headers
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
                // Electron headers are Record<string, string[]> — flatten to first value
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

    if (statusCode >= 400) {
        throw new Error(`HTTP ${statusCode} error`);
    }

    log.info(`Source ${source.sourceId} fetched: HTTP ${statusCode}, ${responseBody.length} bytes`);

    // Apply JSON filter if configured
    const jsonFilter = source.jsonFilter;
    let content = responseBody;
    let isFiltered = false;
    let filteredWith: string | undefined;

    if (jsonFilter?.enabled && jsonFilter.path) {
        const resolvedPath = resolveTemplateString(jsonFilter.path, envVars, envResolver, totpCode);
        const filtered = applyJsonFilter(responseBody, { enabled: true, path: resolvedPath });
        content = typeof filtered === 'string' ? filtered : JSON.stringify(filtered, null, 2);
        isFiltered = true;
        filteredWith = resolvedPath;
    }

    return {
        content,
        originalResponse: responseBody,
        headers: responseHeaders,
        isFiltered,
        filteredWith
    };
}
