/**
 * Source refresh types — shared between main process and renderer.
 *
 * These types cross the IPC boundary: main-process SourceRefreshService
 * produces them, renderer consumes them via IPC events.
 */

/** Result of a single source content fetch */
export interface FetchResult {
    content: string;
    originalResponse: string;
    headers: Record<string, string>;
    isFiltered: boolean;
    filteredWith?: string;
}

/** Circuit breaker state exposed to the renderer */
export interface CircuitBreakerInfo {
    state: string;
    isOpen: boolean;
    timeUntilNextAttemptMs: number;
    failureCount: number;
}

/** Refresh status for a single source */
export interface RefreshStatusInfo {
    isRefreshing: boolean;
    lastRefresh?: number;
    nextRefresh?: number;
    success?: boolean;
    error?: string;
    failureCount: number;
    circuitBreaker: CircuitBreakerInfo;
}

/** IPC payload: content updated */
export interface ContentUpdatedPayload {
    sourceId: string;
    content: string;
    originalResponse: string;
    headers: Record<string, string>;
    isFiltered: boolean;
    filteredWith?: string;
    lastRefresh: number;
}

/** IPC payload: status changed */
export interface StatusChangedPayload {
    sourceId: string;
    status: RefreshStatusInfo;
}

/** IPC payload: schedule updated */
export interface ScheduleUpdatedPayload {
    sourceId: string;
    lastRefresh: number | null;
    nextRefresh: number | null;
}
