/**
 * Source Refresh Manager
 * 
 * Manages refresh status display and timing for source table.
 * Provides consistent status text generation with progressive disclosure.
 */

import { formatTimeRemaining } from './SourceTableUtils';

/**
 * Helper function to get refreshing status text
 * @param {Object} refreshStatus - Refresh status object
 * @param {Object} displayState - Display state object
 * @param {Object} timeManager - Time manager instance
 * @returns {string} Refreshing status text
 */
const getRefreshingText = (refreshStatus, displayState, timeManager) => {
    if (refreshStatus?.isRetry && refreshStatus?.attemptNumber > 0) {
        return `Retrying (attempt ${refreshStatus.attemptNumber} of 3)...`;
    }
    
    if (displayState?.refreshStartTime) {
        const refreshDuration = timeManager.now() - displayState.refreshStartTime;
        if (refreshDuration > 3000) {
            return 'Connecting (retrying)...';
        }
    }
    
    return 'Refreshing...';
};

/**
 * Helper function to get failure message prefix
 * @param {number} failureCount - Number of failures
 * @param {boolean} isManual - Whether this is for manual refresh
 * @returns {string} Failure message prefix
 */
const getFailurePrefix = (failureCount, isManual = true) => {
    if (failureCount === 1) {
        return isManual ? 'Manual refresh failed' : 'Failed';
    }
    return `Failed ${failureCount} times`;
};

/**
 * Helper function to format circuit breaker status
 * @param {Object} circuitBreaker - Circuit breaker status
 * @param {boolean} isManual - Whether this is for manual refresh
 * @returns {string} Formatted status text
 */
const formatCircuitBreakerStatus = (circuitBreaker, isManual = true) => {
    const { timeUntilNextAttemptMs, failureCount } = circuitBreaker;
    
    if (timeUntilNextAttemptMs && timeUntilNextAttemptMs > 0) {
        const prefix = isManual ? 
            `Manual refresh failed ${failureCount}x` : 
            getFailurePrefix(failureCount, false);
        return `${prefix} - ${isManual ? 'Retry' : 'Automatic retry'} in ${formatTimeRemaining(timeUntilNextAttemptMs)}`;
    }
    
    if (isManual) {
        return 'Auto-refresh disabled';
    }
    
    const prefix = getFailurePrefix(failureCount, false);
    return `${prefix} - Auto-refresh paused`;
};

/**
 * Helper function to format retry status
 * @param {number} failureCount - Number of failures
 * @param {number} timeUntilRefresh - Time until next refresh
 * @param {boolean} isManual - Whether this is for manual refresh
 * @returns {string} Formatted retry status
 */
const formatRetryStatus = (failureCount, timeUntilRefresh, isManual = true) => {
    const prefix = getFailurePrefix(failureCount, isManual);
    
    // Always show countdown since we now immediately set nextRefresh
    return `${prefix} - Next attempt in ${formatTimeRemaining(Math.max(timeUntilRefresh, 0))}`;
};

/**
 * Helper function to format HALF_OPEN state
 * @param {number} failureCount - Number of failures
 * @returns {string} Formatted status text
 */
const formatHalfOpenStatus = (failureCount) => {
    const prefix = getFailurePrefix(failureCount, false);
    return `${prefix} - Testing recovery...`;
};

/**
 * Gets refresh status text for a source
 * @param {Object} source - Source object
 * @param {Object} refreshManager - Refresh manager instance
 * @param {Object} refreshDisplayStates - Current display states
 * @param {number} refreshingSourceId - Currently refreshing source ID
 * @param {Object} timeManager - Time manager instance
 * @returns {string|Object} Status text to display or object with text and circuitBreaker info
 */
export const getRefreshStatusText = (source, refreshManager, refreshDisplayStates, refreshingSourceId, timeManager) => {
    // Early returns for invalid sources
    if (!source || source.sourceType !== 'http') {
        return '';
    }
    
    if (source.activationState === 'waiting_for_deps') {
        return 'Waiting for configuration';
    }
    
    // Get current status
    const refreshStatus = refreshManager.getRefreshStatus(source.sourceId);
    const displayState = refreshDisplayStates[source.sourceId];
    const autoRefreshEnabled = source.refreshOptions?.enabled;
    const isRefreshing = refreshStatus?.isRefreshing || refreshingSourceId === source.sourceId;
    const circuitBreaker = refreshStatus?.circuitBreaker;
    
    
    // Priority 1: Currently refreshing
    if (isRefreshing) {
        const text = getRefreshingText(refreshStatus, displayState, timeManager);
        
        return {
            text,
            circuitBreaker,
            isRefreshing: true,
            isRetry: refreshStatus?.isRetry
        };
    }
    
    // Priority 2: Circuit breaker is open
    if (circuitBreaker?.isOpen) {
        const text = formatCircuitBreakerStatus(circuitBreaker, !autoRefreshEnabled);
        return {
            text,
            circuitBreaker,
            isCircuitOpen: true
        };
    }
    
    // Priority 3: Circuit breaker in HALF_OPEN state
    if (circuitBreaker?.state === 'HALF_OPEN') {
        return formatHalfOpenStatus(circuitBreaker.failureCount);
    }
    
    // Priority 4: Has failures (retry logic)
    if (circuitBreaker?.failureCount > 0) {
        const timeUntilRefresh = refreshManager.getTimeUntilRefresh(source.sourceId, source);
        return formatRetryStatus(circuitBreaker.failureCount, timeUntilRefresh, !autoRefreshEnabled);
    }
    
    // Priority 5: Auto-refresh disabled
    if (!autoRefreshEnabled) {
        return 'Auto-refresh disabled';
    }
    
    // Priority 6: Check cache for recent state
    if (displayState && displayState.timestamp > timeManager.now() - 5000) {
        return displayState.text;
    }
    
    // Priority 7: Calculate next refresh time
    const timeUntilRefresh = refreshManager.getTimeUntilRefresh(source.sourceId, source);
    if (timeUntilRefresh > 0) {
        return `Refreshes in ${formatTimeRemaining(timeUntilRefresh)}`;
    }
    
    // Priority 8: Check if recently refreshed
    if (source.refreshOptions?.lastRefresh) {
        const timeSinceLastRefresh = timeManager.now() - source.refreshOptions.lastRefresh;
        if (timeSinceLastRefresh < 5000) {
            return `Auto-refresh: ${source.refreshOptions.interval}m`;
        }
    }
    
    // Fallback: Show configured interval
    return `Auto-refresh: ${source.refreshOptions.interval}m`;
};

/**
 * Simplified helper to get status text for updateRefreshDisplayStates
 * @param {Object} params - Parameters object
 * @returns {string} Status text
 */
const getStatusTextForUpdate = ({
    source,
    refreshStatus,
    refreshManager,
    refreshDisplayStates,
    refreshingSourceId,
    timeManager
}) => {
    // Special states
    if (source.activationState === 'waiting_for_deps') {
        return 'Waiting for configuration';
    }
    
    const autoRefreshEnabled = source.refreshOptions?.enabled;
    const isRefreshing = refreshStatus?.isRefreshing || refreshingSourceId === source.sourceId;
    const circuitBreaker = refreshStatus?.circuitBreaker;
    
    // Currently refreshing
    if (isRefreshing) {
        const currentState = refreshDisplayStates[source.sourceId];
        return getRefreshingText(refreshStatus, currentState, timeManager);
    }
    
    // Circuit breaker open
    if (circuitBreaker?.isOpen) {
        return formatCircuitBreakerStatus(circuitBreaker, !autoRefreshEnabled);
    }
    
    // Circuit breaker half-open
    if (circuitBreaker?.state === 'HALF_OPEN') {
        return formatHalfOpenStatus(circuitBreaker.failureCount);
    }
    
    // Has failures
    if (circuitBreaker?.failureCount > 0) {
        const timeUntilRefresh = refreshManager.getTimeUntilRefresh(source.sourceId, source);
        return formatRetryStatus(circuitBreaker.failureCount, timeUntilRefresh, !autoRefreshEnabled);
    }
    
    // Auto-refresh disabled
    if (!autoRefreshEnabled) {
        return 'Auto-refresh disabled';
    }
    
    // Calculate next refresh
    const timeUntilRefresh = refreshManager.getTimeUntilRefresh(source.sourceId, source);
    if (timeUntilRefresh > 0) {
        return `Refreshes in ${formatTimeRemaining(timeUntilRefresh)}`;
    }
    
    // Fallback to interval
    return `Auto-refresh: ${source.refreshOptions.interval}m`;
};

/**
 * Updates refresh display states for all sources
 * @param {Array} sources - Array of source objects
 * @param {Object} refreshManager - Refresh manager instance
 * @param {Object} refreshDisplayStates - Current display states
 * @param {number} refreshingSourceId - Currently refreshing source ID
 * @param {Object} timeManager - Time manager instance
 * @returns {Object} Updated display states
 */
export const updateRefreshDisplayStates = (sources, refreshManager, refreshDisplayStates, refreshingSourceId, timeManager) => {
    const now = timeManager.now();
    const newDisplayStates = {};
    let needsUpdate = false;
    
    sources.forEach(source => {
        if (source.sourceType !== 'http') return;
        
        const refreshStatus = refreshManager.getRefreshStatus(source.sourceId);
        const statusText = getStatusTextForUpdate({
            source,
            refreshStatus,
            refreshManager,
            refreshDisplayStates,
            refreshingSourceId,
            timeManager
        });
        
        // Only update if status changed
        const currentState = refreshDisplayStates[source.sourceId];
        if (!currentState || currentState.text !== statusText) {
            newDisplayStates[source.sourceId] = {
                text: statusText,
                timestamp: now,
                refreshStartTime: (refreshStatus?.isRefreshing || refreshingSourceId === source.sourceId) 
                    ? (currentState?.refreshStartTime || now) 
                    : null
            };
            needsUpdate = true;
        }
    });
    
    return needsUpdate ? { ...refreshDisplayStates, ...newDisplayStates } : refreshDisplayStates;
};

/**
 * Cleans up display states for removed sources
 * @param {Array} sources - Current sources array
 * @param {Object} refreshDisplayStates - Current display states
 * @param {Object} log - Logger instance
 * @returns {Object} Cleaned display states
 */
export const cleanupDisplayStates = (sources, refreshDisplayStates, log) => {
    const sourceIds = new Set(sources.map(s => s.sourceId));
    const filtered = {};
    let hasChanges = false;
    
    Object.keys(refreshDisplayStates).forEach(sourceId => {
        if (sourceIds.has(parseInt(sourceId))) {
            filtered[sourceId] = refreshDisplayStates[sourceId];
        } else {
            hasChanges = true;
            log.debug(`[RefreshTable] Removing display state for deleted source ${sourceId}`);
        }
    });
    
    return hasChanges ? filtered : refreshDisplayStates;
};