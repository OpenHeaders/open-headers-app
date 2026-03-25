/**
 * Source Refresh Manager — computes refresh status display text from current state.
 *
 * Pure function: no caching, no polling, no side effects.
 * Called during render; the 1s tick in SourceTable drives countdown updates.
 */

import { formatTimeRemaining } from './SourceTableUtils';
import type { Source } from '../../../../types/source';

interface CircuitBreakerStatus {
    isOpen?: boolean;
    state?: string;
    failureCount: number;
    timeUntilNextAttemptMs?: number;
    canManualBypass?: boolean;
}

interface RefreshStatus {
    isRefreshing?: boolean;
    isRetry?: boolean;
    attemptNumber?: number;
    circuitBreaker?: CircuitBreakerStatus;
}

interface RefreshManager {
    getRefreshStatus: (sourceId: string) => RefreshStatus | null;
    getTimeUntilRefresh: (sourceId: string, source: Source) => number;
}

export interface RefreshDisplayInfo {
    text: string;
    isCircuitOpen?: boolean;
    circuitBreaker?: CircuitBreakerStatus | null;
}

/**
 * Compute the refresh status display for a source.
 * Returns structured info so the column renderer can style circuit-breaker states.
 */
export function getRefreshStatusText(
    source: Source | null,
    refreshManager: RefreshManager,
    refreshingSourceId: string | null
): RefreshDisplayInfo {
    if (!source || source.sourceType !== 'http') return { text: '' };
    if (source.activationState === 'waiting_for_deps') return { text: 'Waiting for configuration' };

    const status = refreshManager.getRefreshStatus(source.sourceId);
    const autoRefresh = source.refreshOptions?.enabled;
    const isRefreshing = status?.isRefreshing || refreshingSourceId === source.sourceId;
    const cb = status?.circuitBreaker;

    // Currently refreshing
    if (isRefreshing) {
        const text = status?.isRetry && (status.attemptNumber ?? 0) > 0
            ? `Retrying (attempt ${status.attemptNumber} of 3)...`
            : 'Refreshing...';
        return { text, circuitBreaker: cb };
    }

    // Circuit breaker open or has failures — show live countdown to next retry
    if (cb?.isOpen || (cb?.failureCount ?? 0) > 0) {
        const timeUntil = refreshManager.getTimeUntilRefresh(source.sourceId, source);
        const failCount = cb?.failureCount ?? 0;
        const prefix = failCount === 1 ? 'Failed' : `Failed ${failCount}x`;
        const retryLabel = autoRefresh ? 'Automatic retry' : 'Retry';

        if (cb?.state === 'HALF_OPEN') {
            return { text: `${prefix} - Testing recovery...`, isCircuitOpen: true, circuitBreaker: cb };
        }

        if (timeUntil > 0) {
            return {
                text: `${prefix} - ${retryLabel} in ${formatTimeRemaining(timeUntil)}`,
                isCircuitOpen: cb?.isOpen,
                circuitBreaker: cb
            };
        }

        return {
            text: `${prefix} - ${autoRefresh ? 'Auto-refresh paused' : 'Auto-refresh disabled'}`,
            isCircuitOpen: cb?.isOpen,
            circuitBreaker: cb
        };
    }

    // Auto-refresh disabled
    if (!autoRefresh) return { text: 'Auto-refresh disabled' };

    // Countdown to next refresh
    const timeUntil = refreshManager.getTimeUntilRefresh(source.sourceId, source);
    if (timeUntil > 0) return { text: `Refreshes in ${formatTimeRemaining(timeUntil)}` };

    // Fallback
    return { text: `Auto-refresh: ${source.refreshOptions?.interval}m` };
}
