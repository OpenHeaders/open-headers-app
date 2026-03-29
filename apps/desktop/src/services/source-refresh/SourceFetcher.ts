/**
 * SourceFetcher — adapts a Source object into an HttpRequestSpec and
 * delegates execution to HttpRequestService.
 *
 * Owns the Source → request mapping and the "throw on 4xx/5xx" policy
 * that SourceRefreshService expects. No direct HTTP or TOTP logic.
 */

import type { HttpRequestSpec } from '../../types/http';
import type { Source } from '../../types/source';
import type { FetchResult } from '../../types/source-refresh';
import mainLogger from '../../utils/mainLogger';
import type { HttpRequestService } from '../http/HttpRequestService';

const { createLogger } = mainLogger;
const log = createLogger('SourceFetcher');

/**
 * Fetch content for a single HTTP source.
 *
 * Delegates to HttpRequestService for the full pipeline
 * (template resolution, TOTP, HTTP, JSON filter).
 */
export async function fetchSourceContent(
  source: Source,
  httpService: HttpRequestService,
  workspaceId: string,
  timeoutMs: number = 15000,
): Promise<FetchResult> {
  if (!httpService) {
    throw new Error('HttpRequestService not available — cannot fetch source content');
  }

  const sourceId = String(source.sourceId);
  const opts = source.requestOptions || {};

  // Convert Source → HttpRequestSpec
  const spec: HttpRequestSpec = {
    url: source.sourcePath || '',
    method: source.sourceMethod || 'GET',
    headers: opts.headers,
    queryParams: opts.queryParams,
    body: opts.body,
    contentType: opts.contentType,
    totpSecret: opts.totpSecret,
    jsonFilter: source.jsonFilter?.enabled ? { enabled: true, path: source.jsonFilter.path || '' } : undefined,
    sourceId,
    workspaceId,
    timeout: timeoutMs,
  };

  log.info(`Fetching source ${sourceId}: ${spec.method} ${spec.url}`);

  const result = await httpService.execute(spec);

  // SourceRefreshService expects errors on 4xx/5xx
  if (result.statusCode >= 400) {
    throw new Error(`HTTP ${result.statusCode} error`);
  }

  log.info(`Source ${sourceId} fetched: HTTP ${result.statusCode}, ${result.responseSize} bytes, ${result.duration}ms`);

  return {
    content: result.filteredBody ?? result.body,
    originalResponse: result.originalResponse ?? result.body,
    headers: result.headers,
    isFiltered: result.isFiltered,
    filteredWith: result.filteredWith,
  };
}
