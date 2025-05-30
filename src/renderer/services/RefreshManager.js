/**
 * RefreshManager with comprehensive overdue handling
 *
 * Key improvements:
 * - Immediate refresh for any overdue sources (exit app → open later)
 * - Proper handling of sleep/wake/network scenarios
 * - Startup concurrency control to prevent thundering herd
 * - Consistent error handling and backoff for all sources
 */
class RefreshManager {
    constructor() {
        this.sources = new Map(); // sourceId -> SourceRefreshState
        this.timers = new Map();  // sourceId -> timer
        this.isInitialized = false;
        this.isPaused = false;

        // System state
        this.systemState = {
            online: true,
            awake: true,
            startupPhase: true,
            lastWakeTime: Date.now(),
            lastNetworkOnlineTime: Date.now()
        };

        // Services
        this.httpService = null;
        this.onUpdateCallback = null;

        // Enhanced configuration
        this.config = {
            IMMEDIATE_REFRESH_DELAY: 1000,      // 1 second for immediate refreshes
            STARTUP_STAGGER_DELAY: 500,         // Stagger startup refreshes by 500ms
            OVERDUE_THRESHOLD_MULTIPLIER: 3,    // 3x interval = very stale
            MAX_STARTUP_CONCURRENT: 3,          // Max concurrent refreshes during startup
            NETWORK_STABILIZATION_DELAY: 2000,  // Wait 2s after network comes online
            WAKE_STABILIZATION_DELAY: 3000      // Wait 3s after system wake
        };

        // Startup management
        this.startup = {
            inProgress: false,
            processedSources: new Set(),
            overdueQueue: [],
            currentConcurrency: 0
        };

        // Bind methods
        this.handleNetworkChange = this.handleNetworkChange.bind(this);
        this.handleSystemWake = this.handleSystemWake.bind(this);
        this.handleSystemSleep = this.handleSystemSleep.bind(this);

        this.setupNativeMonitoring();
    }

    /**
     * Get current time - ALWAYS use Date.now() for consistency
     */
    now() {
        return Date.now();
    }

    /**
     * Initialize the refresh manager
     */
    initialize(httpService, onUpdateCallback) {
        if (this.isInitialized) return;

        this.httpService = httpService;
        this.onUpdateCallback = onUpdateCallback;
        this.isInitialized = true;

        console.log('[RefreshManager] Initialized with comprehensive overdue handling');

        // End startup phase after 60 seconds
        setTimeout(() => {
            this.systemState.startupPhase = false;
            this.startup.inProgress = false;
            console.log('[RefreshManager] Startup phase ended');
        }, 60000);
    }

    /**
     * Classify the timing state of a source
     */
    classifySourceTiming(source, refreshOptions) {
        const now = this.now();
        const intervalMs = (refreshOptions.interval || 0) * 60 * 1000;

        if (!refreshOptions.nextRefresh) {
            console.log(`[RefreshManager] Source ${source.sourceId}: NEW source (no previous timing)`);
            return { state: 'new' };
        }

        const timeDiff = refreshOptions.nextRefresh - now;
        const overdueTime = Math.abs(timeDiff);

        // Future refresh - normal scheduling
        if (timeDiff > 0) {
            console.log(`[RefreshManager] Source ${source.sourceId}: SCHEDULED (${Math.round(timeDiff/1000)}s until refresh)`);
            return { state: 'scheduled', nextRefresh: refreshOptions.nextRefresh };
        }

        // Determine state based on how overdue - all treated equally as critical
        if (overdueTime <= intervalMs) {
            console.log(`[RefreshManager] Source ${source.sourceId}: OVERDUE by ${Math.round(overdueTime/1000)}s (interval: ${Math.round(intervalMs/60000)}m)`);
            return { state: 'overdue', overdueTime };
        } else if (overdueTime <= intervalMs * this.config.OVERDUE_THRESHOLD_MULTIPLIER) {
            console.log(`[RefreshManager] Source ${source.sourceId}: VERY OVERDUE by ${Math.round(overdueTime/1000)}s (${Math.round(overdueTime/60000)}m)`);
            return { state: 'very_overdue', overdueTime };
        } else {
            console.log(`[RefreshManager] Source ${source.sourceId}: STALE by ${Math.round(overdueTime/1000)}s (${Math.round(overdueTime/60000)}m) - will refresh immediately`);
            return { state: 'stale', overdueTime };
        }
    }

    /**
     * Enhanced source addition with comprehensive overdue handling
     */
    addSource(source) {
        if (!this.isInitialized || source.sourceType !== 'http') {
            return;
        }

        const sourceId = source.sourceId;
        const refreshOptions = source.refreshOptions || {};

        // Only manage sources with refresh enabled
        if (!refreshOptions.enabled || !refreshOptions.interval || refreshOptions.interval <= 0) {
            this.removeSource(sourceId);
            return;
        }

        // Classify timing state - all sources treated equally
        const timingInfo = this.classifySourceTiming(source, refreshOptions);
        console.log(`[RefreshManager] Source ${sourceId} timing state: ${timingInfo.state}`);

        // Create refresh state
        const refreshState = this.createRefreshState(source, timingInfo);
        this.sources.set(sourceId, refreshState);

        // Handle based on timing state and system state
        this.handleSourceAddition(sourceId, refreshState, timingInfo);

        console.log(`[RefreshManager] Added source ${sourceId} - ${timingInfo.state}`);
    }

    /**
     * Create enhanced refresh state - all sources treated equally
     */
    createRefreshState(source, timingInfo) {
        const now = this.now();
        const refreshOptions = source.refreshOptions;
        const intervalMs = refreshOptions.interval * 60 * 1000;

        let nextRefresh, lastRefresh;

        switch (timingInfo.state) {
            case 'scheduled':
                // Valid future timing
                nextRefresh = timingInfo.nextRefresh;
                lastRefresh = refreshOptions.lastRefresh;
                break;

            case 'overdue':
            case 'very_overdue':
                // Schedule immediate refresh but preserve last refresh time
                nextRefresh = now + this.config.IMMEDIATE_REFRESH_DELAY;
                lastRefresh = refreshOptions.lastRefresh;
                break;

            case 'stale':
            case 'new':
            default:
                // Create fresh timing
                nextRefresh = now + intervalMs;
                lastRefresh = null;
                break;
        }

        return {
            sourceId: source.sourceId,
            source: { ...source },
            nextRefresh,
            lastRefresh,
            intervalMs,
            isRefreshing: false,
            retryCount: 0,
            consecutiveErrors: 0,
            lastError: null,
            backoffMultiplier: 1,
            maxRetries: 5,
            lastSuccessfulContent: null,
            timingInfo,
            addedAt: now
        };
    }

    /**
     * Handle source addition based on state
     */
    handleSourceAddition(sourceId, refreshState, timingInfo) {
        // Update UI with timing info
        this.notifyUI(sourceId, null, {
            updateTimingOnly: true,
            statusOnly: true,
            refreshOptions: {
                ...refreshState.source.refreshOptions,
                lastRefresh: refreshState.lastRefresh,
                nextRefresh: refreshState.nextRefresh
            }
        });

        // Handle immediate refresh scenarios
        if (['overdue', 'very_overdue', 'stale'].includes(timingInfo.state)) {
            this.scheduleImmediateRefresh(sourceId, refreshState, timingInfo);
        } else {
            // Normal scheduling
            this.scheduleRefresh(sourceId);
        }
    }

    /**
     * Schedule immediate refresh with smart concurrency control
     */
    scheduleImmediateRefresh(sourceId, refreshState, timingInfo) {
        if (this.systemState.startupPhase) {
            // During startup, queue overdue sources for controlled processing
            console.log(`[RefreshManager] Source ${sourceId}: QUEUED for startup refresh (${Math.round((timingInfo.overdueTime || 0)/1000)}s overdue)`);
            this.startup.overdueQueue.push({
                sourceId,
                overdueTime: timingInfo.overdueTime || 0,
                addedAt: refreshState.addedAt
            });

            if (!this.startup.inProgress) {
                this.startup.inProgress = true;
                console.log(`[RefreshManager] Starting startup queue processing in ${this.config.STARTUP_STAGGER_DELAY}ms`);
                setTimeout(() => this.processStartupQueue(), this.config.STARTUP_STAGGER_DELAY);
            }
        } else {
            // Normal immediate refresh - all sources treated equally
            console.log(`[RefreshManager] Source ${sourceId}: SCHEDULING immediate refresh in ${this.config.IMMEDIATE_REFRESH_DELAY}ms`);
            setTimeout(() => {
                this.performRefresh(sourceId);
            }, this.config.IMMEDIATE_REFRESH_DELAY);
        }
    }

    /**
     * Process startup queue with concurrency control - all sources treated equally
     */
    processStartupQueue() {
        if (this.startup.overdueQueue.length === 0) {
            this.startup.inProgress = false;
            return;
        }

        // Sort by how overdue they are (most overdue first)
        this.startup.overdueQueue.sort((a, b) => {
            return (b.overdueTime || 0) - (a.overdueTime || 0);
        });

        // Process sources with concurrency limit
        const batchSize = Math.min(
            this.config.MAX_STARTUP_CONCURRENT - this.startup.currentConcurrency,
            this.startup.overdueQueue.length
        );

        for (let i = 0; i < batchSize; i++) {
            const item = this.startup.overdueQueue.shift();
            if (item && this.sources.has(item.sourceId)) {
                this.startup.currentConcurrency++;
                this.startup.processedSources.add(item.sourceId);

                console.log(`[RefreshManager] Startup refresh ${item.sourceId} (${Math.round((item.overdueTime || 0) / 1000)}s overdue)`);

                // Stagger the refreshes slightly
                setTimeout(() => {
                    this.performRefresh(item.sourceId).finally(() => {
                        this.startup.currentConcurrency--;

                        // Process next batch
                        setTimeout(() => this.processStartupQueue(), this.config.STARTUP_STAGGER_DELAY);
                    });
                }, i * 200); // 200ms stagger between refreshes
            }
        }

        // Continue processing if there are more items
        if (this.startup.overdueQueue.length > 0) {
            setTimeout(() => this.processStartupQueue(), this.config.STARTUP_STAGGER_DELAY * 2);
        } else {
            this.startup.inProgress = false;
        }
    }

    /**
     * Enhanced system wake handling
     */
    handleSystemWake() {
        console.log('[RefreshManager] System wake - checking for overdue sources');
        this.systemState.awake = true;
        this.systemState.lastWakeTime = this.now();

        // Clear all timers as system time may have jumped
        this.clearAllTimers();

        // Wait for system to stabilize, then refresh overdue sources
        setTimeout(() => {
            this.refreshAllOverdue('system_wake');
            this.resumeAll();
        }, this.config.WAKE_STABILIZATION_DELAY);
    }

    /**
     * Enhanced network change handling
     */
    handleNetworkChange(isOnline) {
        const wasOnline = this.systemState.online;
        this.systemState.online = isOnline;

        if (!wasOnline && isOnline) {
            console.log(`[RefreshManager] 🌐 NETWORK ONLINE - was offline, now reconnected`);
            console.log(`[RefreshManager] Will refresh overdue sources after ${this.config.NETWORK_STABILIZATION_DELAY}ms stabilization delay`);
            this.systemState.lastNetworkOnlineTime = this.now();

            // Wait for network to stabilize
            setTimeout(() => {
                console.log(`[RefreshManager] Network stabilized - checking for overdue sources...`);
                this.refreshAllOverdue('network_online');
                this.resumeAll();
            }, this.config.NETWORK_STABILIZATION_DELAY);
        } else if (wasOnline && !isOnline) {
            console.log(`[RefreshManager] 🌐 NETWORK OFFLINE - pausing all refreshes`);
            this.pauseAll();
        } else if (isOnline) {
            console.log(`[RefreshManager] 🌐 Network check: still online`);
        } else {
            console.log(`[RefreshManager] 🌐 Network check: still offline`);
        }
    }

    /**
     * Refresh all overdue sources - all treated equally
     */
    refreshAllOverdue(reason) {
        const now = this.now();
        const overdueSources = [];

        for (const [sourceId, refreshState] of this.sources) {
            if (refreshState.nextRefresh < now) {
                const overdueTime = now - refreshState.nextRefresh;

                overdueSources.push({
                    sourceId,
                    overdueTime,
                    intervalMs: refreshState.intervalMs
                });
            }
        }

        if (overdueSources.length === 0) {
            console.log(`[RefreshManager] ✅ No overdue sources found after ${reason}`);
            return;
        }

        console.log(`[RefreshManager] 🔄 Found ${overdueSources.length} overdue sources after ${reason}:`);
        overdueSources.forEach(item => {
            console.log(`[RefreshManager]   → Source ${item.sourceId}: ${Math.round(item.overdueTime/1000)}s overdue (interval: ${Math.round(item.intervalMs/60000)}m)`);
        });

        // Sort by how overdue they are (most overdue first)
        overdueSources.sort((a, b) => {
            return b.overdueTime - a.overdueTime;
        });

        console.log(`[RefreshManager] Staggering ${overdueSources.length} overdue refreshes (200ms between each)...`);

        // Stagger refreshes to prevent thundering herd - all sources get same treatment
        overdueSources.forEach((item, index) => {
            const delay = index * 200; // 200ms stagger between all sources

            console.log(`[RefreshManager] Source ${item.sourceId}: will refresh in ${delay}ms`);
            setTimeout(() => {
                this.performRefresh(item.sourceId);
            }, delay);
        });
    }

    /**
     * Enhanced refresh performance with better error handling
     */
    async performRefresh(sourceId) {
        const refreshState = this.sources.get(sourceId);
        if (!refreshState || refreshState.isRefreshing || !this.systemState.online) {
            return;
        }

        const now = this.now();

        // Update state to refreshing
        const refreshingState = {
            ...refreshState,
            isRefreshing: true,
            lastRefresh: now,
            nextRefresh: now + refreshState.intervalMs
        };

        this.sources.set(sourceId, refreshingState);

        // Status-only update
        this.notifyUI(sourceId, null, {
            updateTimingOnly: true,
            statusOnly: true,
            refreshStatus: {
                isRefreshing: true,
                startTime: now
            },
            refreshOptions: {
                ...refreshState.source.refreshOptions,
                lastRefresh: now,
                nextRefresh: refreshingState.nextRefresh
            }
        });

        try {
            console.log(`[RefreshManager] Refreshing source ${sourceId}`);

            const result = await this.httpService.request(
                refreshState.source.sourceId,
                refreshState.source.sourcePath,
                refreshState.source.sourceMethod,
                refreshState.source.requestOptions,
                refreshState.source.jsonFilter
            );

            // Success - reset error state
            const successState = {
                ...refreshingState,
                isRefreshing: false,
                retryCount: 0,
                consecutiveErrors: 0,
                lastError: null,
                backoffMultiplier: 1,
                lastSuccessfulContent: result.content
            };

            this.sources.set(sourceId, successState);

            // Only update content if it changed
            const shouldUpdateContent = result.content !== refreshState.lastSuccessfulContent;

            this.notifyUI(sourceId, shouldUpdateContent ? result.content : null, {
                originalResponse: result.originalResponse,
                headers: result.headers,
                forceUpdateContent: shouldUpdateContent,
                refreshStatus: {
                    isRefreshing: false,
                    lastRefresh: now,
                    success: true
                },
                refreshOptions: {
                    ...refreshState.source.refreshOptions,
                    lastRefresh: now,
                    nextRefresh: successState.nextRefresh
                }
            });

            console.log(`[RefreshManager] Successfully refreshed source ${sourceId}${shouldUpdateContent ? ' (content changed)' : ' (content unchanged)'}`);

        } catch (error) {
            console.error(`[RefreshManager] Error refreshing source ${sourceId}:`, error);

            const errorState = {
                ...refreshingState,
                isRefreshing: false,
                consecutiveErrors: refreshState.consecutiveErrors + 1,
                lastError: error,
                retryCount: refreshState.retryCount + 1
            };

            errorState.backoffMultiplier = Math.min(refreshState.backoffMultiplier * 2, 8);

            // Apply backoff
            if (errorState.consecutiveErrors > 1) {
                errorState.nextRefresh = now + (refreshState.intervalMs * errorState.backoffMultiplier);
            }

            this.sources.set(sourceId, errorState);

            // Status-only error update
            this.notifyUI(sourceId, null, {
                statusOnly: true,
                refreshStatus: {
                    isRefreshing: false,
                    lastRefresh: now,
                    success: false,
                    error: error.message
                },
                refreshOptions: {
                    ...refreshState.source.refreshOptions,
                    lastRefresh: now,
                    nextRefresh: errorState.nextRefresh
                }
            });
        }

        // Always schedule next refresh
        this.scheduleRefresh(sourceId);
    }

    /**
     * Clear all timers (used during wake/network events)
     */
    clearAllTimers() {
        for (const sourceId of this.timers.keys()) {
            this.clearTimer(sourceId);
        }
    }

    /**
     * Enhanced schedule refresh with better timing
     */
    scheduleRefresh(sourceId) {
        this.clearTimer(sourceId);

        const refreshState = this.sources.get(sourceId);
        if (!refreshState || this.isPaused) {
            return;
        }

        const now = this.now();
        const delay = Math.max(0, refreshState.nextRefresh - now);

        if (delay === 0) {
            this.performRefresh(sourceId);
        } else {
            const timer = setTimeout(() => {
                this.performRefresh(sourceId);
            }, delay);

            this.timers.set(sourceId, timer);
        }
    }

    /**
     * Manual refresh - bypass scheduling with immediate execution
     */
    async refreshSource(sourceId) {
        const refreshState = this.sources.get(sourceId);
        if (!refreshState) return false;

        console.log(`[RefreshManager] Manual refresh requested for source ${sourceId}`);

        // Reset retry state for manual refresh - all sources treated equally
        const resetState = {
            ...refreshState,
            retryCount: 0,
            backoffMultiplier: 1
        };
        this.sources.set(sourceId, resetState);

        // Clear timer and perform refresh immediately
        this.clearTimer(sourceId);
        await this.performRefresh(sourceId);
        return true;
    }

    /**
     * Enhanced update source - all sources treated equally
     */
    updateSource(source) {
        if (source.sourceType !== 'http') return;

        const sourceId = source.sourceId;
        const refreshState = this.sources.get(sourceId);

        if (!refreshState) {
            this.addSource(source);
            return;
        }

        // Check if refresh settings changed
        const oldInterval = refreshState.intervalMs;
        const newInterval = (source.refreshOptions?.interval || 0) * 60 * 1000;
        const refreshEnabled = source.refreshOptions?.enabled;

        if (!refreshEnabled || newInterval <= 0) {
            this.removeSource(sourceId);
            return;
        }

        // Recalculate timing info
        const timingInfo = this.classifySourceTiming(source, source.refreshOptions);

        // Update source data
        const updatedState = {
            ...refreshState,
            source: { ...source },
            intervalMs: newInterval,
            timingInfo
        };

        // If interval changed significantly, recalculate timing
        if (Math.abs(oldInterval - newInterval) > 60000) { // > 1 minute difference
            const now = this.now();
            updatedState.nextRefresh = now + newInterval;
            updatedState.lastRefresh = null;
            console.log(`[RefreshManager] Interval changed for source ${sourceId}: ${Math.round(oldInterval/60000)}m -> ${Math.round(newInterval/60000)}m`);
        }

        this.sources.set(sourceId, updatedState);
        this.scheduleRefresh(sourceId);

        // Status-only update
        this.notifyUI(sourceId, null, {
            updateTimingOnly: true,
            statusOnly: true,
            refreshOptions: {
                ...updatedState.source.refreshOptions,
                lastRefresh: updatedState.lastRefresh,
                nextRefresh: updatedState.nextRefresh
            }
        });
    }

    /**
     * Remove source from management
     */
    removeSource(sourceId) {
        this.clearTimer(sourceId);
        this.sources.delete(sourceId);

        // Clean up startup queue
        this.startup.overdueQueue = this.startup.overdueQueue.filter(item => item.sourceId !== sourceId);
        this.startup.processedSources.delete(sourceId);

        console.log(`[RefreshManager] Removed source ${sourceId} from management`);
    }

    /**
     * Get refresh status for UI
     */
    getRefreshStatus(sourceId) {
        const refreshState = this.sources.get(sourceId);
        if (!refreshState) return null;

        return {
            isRefreshing: refreshState.isRefreshing,
            isPaused: this.isPaused,
            lastRefresh: refreshState.lastRefresh,
            nextRefresh: refreshState.nextRefresh,
            consecutiveErrors: refreshState.consecutiveErrors,
            lastError: refreshState.lastError,
            retryCount: refreshState.retryCount,
            timingState: refreshState.timingInfo?.state
        };
    }

    /**
     * Get time until next refresh in milliseconds
     */
    getTimeUntilRefresh(sourceId) {
        const refreshState = this.sources.get(sourceId);
        if (!refreshState) return 0;

        return Math.max(0, refreshState.nextRefresh - this.now());
    }

    /**
     * Notify UI of changes
     */
    notifyUI(sourceId, content, additionalData = {}) {
        if (!this.onUpdateCallback) return;

        const refreshState = this.sources.get(sourceId);
        if (!refreshState) return;

        const updateData = {
            ...additionalData,
            refreshOptions: {
                ...refreshState.source.refreshOptions,
                lastRefresh: refreshState.lastRefresh,
                nextRefresh: refreshState.nextRefresh
            }
        };

        this.onUpdateCallback(sourceId, content, updateData);
    }

    /**
     * Clear timer for source
     */
    clearTimer(sourceId) {
        const timer = this.timers.get(sourceId);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(sourceId);
        }
    }

    /**
     * Handle system sleep
     */
    handleSystemSleep() {
        console.log('[RefreshManager] System sleep - pausing refreshes');
        this.systemState.awake = false;
        this.pauseAll();
    }

    /**
     * Pause all refreshes
     */
    pauseAll() {
        this.isPaused = true;
        this.clearAllTimers();
    }

    /**
     * Resume all refreshes
     */
    resumeAll() {
        this.isPaused = false;
        for (const sourceId of this.sources.keys()) {
            this.scheduleRefresh(sourceId);
        }
    }

    /**
     * Setup native monitoring
     */
    setupNativeMonitoring() {
        console.log('[RefreshManager] Setting up enhanced native monitoring');

        if (typeof window !== 'undefined' && window.electronAPI) {
            if (window.electronAPI.onSystemSuspend) {
                window.electronAPI.onSystemSuspend(this.handleSystemSleep);
            }
            if (window.electronAPI.onSystemResume) {
                window.electronAPI.onSystemResume(this.handleSystemWake);
            }
            if (window.electronAPI.onNetworkStateChanged) {
                window.electronAPI.onNetworkStateChanged(this.handleNetworkChange);
            }

            // Enhanced network monitoring
            this.checkNetworkState();
            setInterval(() => this.checkNetworkState(), 30000);
        }
    }

    /**
     * Enhanced network state checking
     */
    async checkNetworkState() {
        let isOnline = navigator.onLine;

        if (window.electronAPI?.checkNetworkConnectivity) {
            try {
                isOnline = await window.electronAPI.checkNetworkConnectivity();
            } catch (error) {
                console.log('[RefreshManager] Network check failed, using navigator.onLine');
            }
        }

        if (this.systemState.online !== isOnline) {
            this.handleNetworkChange(isOnline);
        }
    }

    /**
     * Get comprehensive system status
     */
    getSystemStatus() {
        return {
            ...this.systemState,
            totalSources: this.sources.size,
            activeTimers: this.timers.size,
            startup: {
                inProgress: this.startup.inProgress,
                queueLength: this.startup.overdueQueue.length,
                processedCount: this.startup.processedSources.size,
                currentConcurrency: this.startup.currentConcurrency
            },
            overdueSources: Array.from(this.sources.values()).filter(s => s.nextRefresh < this.now()).length
        };
    }

    /**
     * Enhanced cleanup
     */
    destroy() {
        this.clearAllTimers();
        this.sources.clear();
        this.timers.clear();
        this.startup.overdueQueue = [];
        this.startup.processedSources.clear();
        this.startup.inProgress = false;
        this.isInitialized = false;
        console.log('[RefreshManager] Destroyed with comprehensive cleanup');
    }
}

// Export singleton instance
const refreshManager = new RefreshManager();
export default refreshManager;