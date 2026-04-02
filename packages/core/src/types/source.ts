/**
 * Source domain types.
 *
 * A source provides dynamic values (tokens, secrets) that can be
 * injected into header rules. Sources can be HTTP endpoints, files,
 * or manual entries.
 */

// ── Source types ────────────────────────────────────────────────────

export type SourceType = 'http' | 'file' | 'manual' | 'env';

export type ActivationState = 'active' | 'inactive' | 'error' | 'waiting_for_deps';

export type SourceMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ── HTTP request options ────────────────────────────────────────────

export interface SourceHeader {
  key: string;
  value: string;
}

export interface SourceQueryParam {
  key: string;
  value: string;
}

export interface SourceRequestOptions {
  contentType?: string;
  body?: string;
  headers?: SourceHeader[];
  queryParams?: SourceQueryParam[];
  totpSecret?: string;
}

// ── JSON filter ─────────────────────────────────────────────────────

export interface JsonFilter {
  enabled: boolean;
  path?: string;
}

// ── Refresh options ─────────────────────────────────────────────────

export type RefreshType = 'custom' | 'cron' | 'manual';

export interface RefreshOptions {
  enabled: boolean;
  type?: RefreshType;
  interval?: number;
  lastRefresh?: number | null;
  nextRefresh?: number | null;
  alignToMinute?: boolean;
  alignToHour?: boolean;
  alignToDay?: boolean;
}

export interface RefreshStatus {
  isRefreshing: boolean;
  lastRefresh?: number;
  startTime?: number;
  success?: boolean;
  error?: string;
  reason?: string;
  isRetry?: boolean;
  attemptNumber?: number;
  totalAttempts?: number;
  failureCount?: number;
}

// ── Source ───────────────────────────────────────────────────────────

export interface Source {
  sourceId: string;
  sourceType: SourceType;
  sourcePath?: string;
  sourceMethod?: SourceMethod;
  sourceName?: string;
  sourceTag?: string;
  sourceContent?: string | null;
  requestOptions?: SourceRequestOptions;
  jsonFilter?: JsonFilter;
  refreshOptions?: RefreshOptions;
  refreshStatus?: RefreshStatus;
  activationState?: ActivationState;
  missingDependencies?: string[];
  createdAt?: string;
  updatedAt?: string;
  isFiltered?: boolean;
  filteredWith?: string | null;
  needsInitialFetch?: boolean;
  originalResponse?: string | null;
  responseHeaders?: Record<string, string> | null;
}

/**
 * Partial update payload for Source — allows partial refreshOptions
 * so callers can update individual fields (e.g. lastRefresh) without
 * specifying required fields like enabled.
 */
export type SourceUpdate = Partial<Omit<Source, 'refreshOptions'>> & {
  refreshOptions?: Partial<RefreshOptions>;
};

/** Data produced by the source creation form — no sourceId yet. */
export type NewSourceData = Omit<Source, 'sourceId'> & {
  sourceType: SourceType;
  sourcePath: string;
  sourceTag: string;
};
