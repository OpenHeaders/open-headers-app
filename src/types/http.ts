/**
 * HTTP domain types.
 *
 * Types for the HTTP request/response lifecycle across the IPC boundary
 * (renderer → preload → main) and the renderer-side processing pipeline.
 */

// ── IPC wire format (what crosses the preload bridge) ────────────────

export interface HttpConnectionOptions {
  keepAlive?: boolean;
  timeout?: number;
  requestId?: string;
}

/** Options sent from renderer → main via `makeHttpRequest`. */
export interface HttpRequestOptions {
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: string | Record<string, unknown>;
  contentType?: string;
  enableRetries?: boolean;
  connectionOptions?: HttpConnectionOptions;
}

/** JSON payload returned by main → renderer (stringified over IPC). */
export interface HttpResponsePayload {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  networkContext?: {
    isOnline: boolean;
    networkQuality?: string;
  };
}

// ── Renderer-side processed result ───────────────────────────────────

/** Result returned by `useHttp().request()` after response processing. */
export interface HttpResult {
  content: string;
  originalResponse?: string;
  headers?: Record<string, string>;
  rawResponse?: string;
  filteredWith?: string;
  isFiltered?: boolean;
  duration?: number;
}

// ── Shared callback signatures ───────────────────────────────────────

/** Progress callback used throughout the HTTP test flow. */
export type HttpProgressCallback = (current: number, total: number) => void;

// ── Test response (what ResponsePreviewCard displays) ────────────────

export interface TestResponseContent {
  statusCode?: number;
  duration?: number;
  error?: string;
  details?: string;
  retryStrategy?: { reason: string };
  filteredWith?: string;
  body?: string;
  headers?: Record<string, string>;
  originalResponse?: string;
}

// ── Environment context subset ───────────────────────────────────────
// Minimal shape that HTTP-related modules need from the environment
// context. Avoids coupling to the full useCentralizedEnvironments return.

export interface EnvironmentContextLike {
  environmentsReady: boolean;
  activeEnvironment: string;
  getAllVariables: () => Record<string, string>;
  resolveTemplate: (text: string) => string;
}
