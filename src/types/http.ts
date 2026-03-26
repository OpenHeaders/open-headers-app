/**
 * HTTP domain types.
 *
 * Types for the HTTP request/response lifecycle across the IPC boundary
 * (renderer → preload → main).
 */

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

// ── HttpRequestService types (main-process HTTP execution) ───────────

/**
 * Input to HttpRequestService — raw, unresolved templates.
 * ALL string fields may contain {{VAR}} environment variable templates
 * and [[TOTP_CODE]] placeholders. The service resolves everything.
 */
export interface HttpRequestSpec {
  url: string;
  method: string;
  headers?: Array<{ key: string; value: string }>;
  queryParams?: Array<{ key: string; value: string }>;
  body?: string;
  contentType?: string;
  totpSecret?: string;
  jsonFilter?: { enabled: boolean; path: string };
  sourceId: string;
  timeout?: number;
}

/** Rich result from HttpRequestService. */
export interface HttpRequestResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  duration: number;
  responseSize: number;
  filteredBody?: string;
  isFiltered: boolean;
  filteredWith?: string;
  originalResponse?: string;
  error?: string;
}

/** TOTP cooldown state for IPC queries. */
export interface TotpCooldownInfo {
  inCooldown: boolean;
  remainingSeconds: number;
  lastUsedTime: number | null;
}
