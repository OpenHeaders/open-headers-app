// src/services/RefreshManager.js

/**
 * Enhanced RefreshManager with comprehensive network detection and overdue handling
 *
 * Key features:
 * - Immediate refresh for any overdue sources (exit app → open later)
 * - Intelligent network quality detection and adaptation
 * - Corporate environment and VPN awareness
 * - Proper handling of sleep/wake/network scenarios
 * - Startup concurrency control to prevent thundering herd
 * - Consistent error handling and adaptive backoff
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
            lastNetworkOnlineTime: Date.now(),
            networkQuality: 'good',
            corporateEnvironment: 'unknown',
            vpnActive: false
        };

        // Services
        this.httpService = null;
        this.onUpdateCallback = null;

        // Enhanced configuration with network-aware settings
        this.config = {
            IMMEDIATE_REFRESH_DELAY: 1000,      // 1 second for immediate refreshes
            STARTUP_STAGGER_DELAY: 500,         // Stagger startup refreshes by 500ms
            OVERDUE_THRESHOLD_MULTIPLIER: 3,    // 3x interval = very stale
            MAX_STARTUP_CONCURRENT: 3,          // Max concurrent refreshes during startup

            // Network-aware delays
            NETWORK_STABILIZATION_DELAY: {
                excellent: 500,    // Fast network
                good: 2000,        // Normal network
                fair: 5000,        // Slow network
                poor: 10000,       // Very slow network
                corporate: 10000   // Corporate network (conservative)
            },

            WAKE_STABILIZATION_DELAY: 3000,     // Wait 3s after system wake

            // Corporate environment settings
            CORPORATE_TIMEOUT_MULTIPLIER: 2,
            CORPORATE_MAX_CONCURRENT: 2,
            CORPORATE_RETRY_DELAY: 5000
        };

        // Startup management
        this.startup = {
            inProgress: false,
            processedSources: new Set(),
            overdueQueue: [],
            currentConcurrency: 0
        };

        // Network state tracking
        this.networkState = {
            lastOnlineCheck: Date.now(),
            consecutiveNetworkFailures: 0,
            networkFlapping: false,
            stableNetworkSince: Date.now()
        };

        // Bind methods
        this.handleNetworkChange = this.handleNetworkChange.bind(this);
        this.handleNetworkStatusChange = this.handleNetworkStatusChange.bind(this);
        this.handleVPNChange = this.handleVPNChange.bind(this);
        this.handleSystemWake = this.handleSystemWake.bind(this);
        this.handleSystemSleep = this.handleSystemSleep.bind(this);
    }

    /**
     * Get current time - ALWAYS use Date.now() for consistency
     */
    now() {
        return Date.now();
    }

    /**
     * Initialize the refresh manager with optional network monitoring
     */
    async initialize(httpService, onUpdateCallback) {
        if (this.isInitialized) return;

        this.httpService = httpService;
        this.onUpdateCallback = onUpdateCallback;

        // Try to initialize network monitor if available
        await this.initializeNetworkMonitor();

        // Setup native Electron monitoring
        this.setupNativeMonitoring();

        this.isInitialized = true;

        console.log('[RefreshManager] Initialized with comprehensive overdue handling and network monitoring');

        // End startup phase after 60 seconds
        setTimeout(() => {
            this.systemState.startupPhase = false;
            this.startup.inProgress = false;
            console.log('[RefreshManager] Startup phase ended');
        }, 60000);

        // Return a promise that resolves when truly ready
        return new Promise((resolve) => {
            // Give a small delay to ensure everything is set up
            setTimeout(() => {
                console.log('[RefreshManager] Fully initialized and ready');
                resolve();
            }, 100);
        });
    }

    /**
     * Initialize network monitor if NetworkMonitor class is available
     */
    async initializeNetworkMonitor() {
        try {
            // Use IPC instead of direct NetworkMonitor
            if (window.electronAPI && window.electronAPI.getNetworkState) {
                console.log('[RefreshManager] Using IPC-based network monitoring');

                const initialState = await window.electronAPI.getNetworkState();

                this.systemState.online = initialState.isOnline;
                this.systemState.networkQuality = initialState.networkQuality;
                this.systemState.corporateEnvironment = initialState.corporateEnvironment;
                this.systemState.vpnActive = initialState.vpnActive;

                console.log('[RefreshManager] Initial network state from IPC:', initialState);
            } else {
                console.log('[RefreshManager] IPC network monitoring not available, using basic detection');
            }
        } catch (error) {
            console.log('[RefreshManager] Network monitoring initialization failed:', error.message);
        }
    }

    /**
     * Get network-aware timeout
     */
    getNetworkTimeout(baseTimeout = 15000) {
        const { networkQuality, corporateEnvironment } = this.systemState;

        let timeout = baseTimeout;

        // Adjust for network quality
        switch (networkQuality) {
            case 'excellent':
                timeout = baseTimeout * 0.8;
                break;
            case 'good':
                timeout = baseTimeout;
                break;
            case 'fair':
                timeout = baseTimeout * 1.5;
                break;
            case 'poor':
                timeout = baseTimeout * 2;
                break;
            default:
                timeout = baseTimeout;
        }

        // Additional adjustment for corporate environment
        if (corporateEnvironment === 'corporate' || corporateEnvironment === 'mixed') {
            timeout *= this.config.CORPORATE_TIMEOUT_MULTIPLIER;
        }

        // Cap at 60 seconds
        return Math.min(timeout, 60000);
    }

    /**
     * Get network-aware concurrency limit
     */
    getMaxConcurrency() {
        const { networkQuality, corporateEnvironment } = this.systemState;

        if (corporateEnvironment === 'corporate') {
            return this.config.CORPORATE_MAX_CONCURRENT;
        }

        switch (networkQuality) {
            case 'excellent':
                return 5;
            case 'good':
                return 3;
            case 'fair':
                return 2;
            case 'poor':
                return 1;
            default:
                return this.config.MAX_STARTUP_CONCURRENT;
        }
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
        console.log('[RefreshManager] addSource called:', {
            sourceId: source.sourceId,
            sourceType: source.sourceType,
            refreshEnabled: source.refreshOptions?.enabled,
            interval: source.refreshOptions?.interval,
            hasLastRefresh: !!source.refreshOptions?.lastRefresh,
            hasNextRefresh: !!source.refreshOptions?.nextRefresh,
            nextRefresh: source.refreshOptions?.nextRefresh,
            currentTime: this.now()
        });

        if (!this.isInitialized) {
            console.log('[RefreshManager] Not initialized, skipping source');
            return;
        }

        if (source.sourceType !== 'http') {
            console.log('[RefreshManager] Not HTTP source, skipping');
            return;
        }

        const sourceId = source.sourceId;
        const refreshOptions = source.refreshOptions || {};

        // Only manage sources with refresh enabled
        if (!refreshOptions.enabled || !refreshOptions.interval || refreshOptions.interval <= 0) {
            console.log('[RefreshManager] Refresh not enabled or invalid interval, removing source');
            this.removeSource(sourceId);
            return;
        }

        // Classify timing state - all sources treated equally
        const timingInfo = this.classifySourceTiming(source, refreshOptions);
        console.log(`[RefreshManager] Source ${sourceId} timing state: ${timingInfo.state}`);

        // Create refresh state with network context
        const refreshState = this.createRefreshState(source, timingInfo);

        // Add network context
        refreshState.networkContext = {
            addedDuringQuality: this.systemState.networkQuality,
            addedInCorporate: this.systemState.corporateEnvironment === 'corporate'
        };

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
            lastSuccessfulRefresh: null,
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
     * Process startup queue with network-aware concurrency control
     */
    processStartupQueue() {
        if (this.startup.overdueQueue.length === 0) {
            this.startup.inProgress = false;
            return;
        }

        // Get dynamic concurrency limit based on network
        const maxConcurrency = this.getMaxConcurrency();

        // Sort by how overdue they are (most overdue first)
        this.startup.overdueQueue.sort((a, b) => {
            return (b.overdueTime || 0) - (a.overdueTime || 0);
        });

        // Process sources with concurrency limit
        const batchSize = Math.min(
            maxConcurrency - this.startup.currentConcurrency,
            this.startup.overdueQueue.length
        );

        console.log(`[RefreshManager] Processing ${batchSize} sources (max concurrency: ${maxConcurrency})`);

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
     * Force a network check via IPC
     * This replaces the direct NetworkMonitor.forceCheck() calls
     */
    async forceNetworkCheck() {
        try {
            if (window.electronAPI && window.electronAPI.forceNetworkCheck) {
                console.log('[RefreshManager] Forcing network check via IPC');

                const state = await window.electronAPI.forceNetworkCheck();

                if (state) {
                    // Update all system state properties from the network check
                    this.systemState.online = state.isOnline;
                    this.systemState.networkQuality = state.networkQuality || this.systemState.networkQuality;
                    this.systemState.corporateEnvironment = state.corporateEnvironment || this.systemState.corporateEnvironment;
                    this.systemState.vpnActive = state.vpnActive || this.systemState.vpnActive;

                    console.log('[RefreshManager] Network check results:', {
                        online: state.isOnline,
                        quality: state.networkQuality,
                        corporate: state.corporateEnvironment,
                        vpn: state.vpnActive
                    });

                    return state;
                }
            } else {
                console.log('[RefreshManager] forceNetworkCheck API not available');

                // Fallback to navigator.onLine
                const isOnline = navigator.onLine;
                this.systemState.online = isOnline;

                return {
                    isOnline,
                    networkQuality: 'unknown',
                    corporateEnvironment: 'unknown',
                    vpnActive: false
                };
            }
        } catch (error) {
            console.error('[RefreshManager] Error during force network check:', error);
            return null;
        }
    }

    /**
     * Handle network change events (from NetworkMonitor)
     */
    handleNetworkChange(event) {
        console.log('[RefreshManager] Network change detected:', event.type);

        // Update system state
        if (event.state) {
            this.systemState.networkQuality = event.state.networkQuality;
            this.systemState.corporateEnvironment = event.state.corporateEnvironment;
        }

        // Check if this is a significant change
        if (event.analysis && event.analysis.significantChange) {
            this.handleSignificantNetworkChange(event);
        }
    }

    /**
     * Handle network status changes (online/offline)
     */
    handleNetworkStatusChange(event) {
        const wasOnline = this.systemState.online;
        const isOnline = event.state.isOnline;

        console.log(`[RefreshManager] Network status change: ${wasOnline ? 'online' : 'offline'} -> ${isOnline ? 'online' : 'offline'}`);

        this.systemState.online = isOnline;
        this.systemState.networkQuality = event.state.networkQuality || this.systemState.networkQuality;

        if (!wasOnline && isOnline) {
            // Network restored
            this.handleNetworkRestore(event.state);
        } else if (wasOnline && !isOnline) {
            // Network lost
            this.handleNetworkLoss();
        }
    }

    /**
     * Handle VPN state changes
     */
    handleVPNChange(event) {
        const wasActive = this.systemState.vpnActive;
        this.systemState.vpnActive = event.active;

        console.log(`[RefreshManager] VPN state changed: ${wasActive ? 'active' : 'inactive'} -> ${event.active ? 'active' : 'inactive'}`);

        if (wasActive !== event.active) {
            // VPN state changed - might need to re-evaluate timeouts and strategies
            if (event.active) {
                console.log('[RefreshManager] VPN connected - using conservative settings');
                this.adjustForVPN(true);
            } else {
                console.log('[RefreshManager] VPN disconnected - using normal settings');
                this.adjustForVPN(false);
            }

            // Refresh overdue sources with new network context
            setTimeout(() => {
                this.refreshAllOverdue('vpn_change');
            }, 2000);
        }
    }

    /**
     * Adjust settings for VPN
     */
    adjustForVPN(vpnActive) {
        if (vpnActive) {
            // VPN might be slower, use conservative settings
            this.config.MAX_STARTUP_CONCURRENT = 2;
        } else {
            // Normal settings
            this.config.MAX_STARTUP_CONCURRENT = 3;
        }
    }

    /**
     * Handle significant network changes
     */
    handleSignificantNetworkChange(event) {
        console.log('[RefreshManager] Significant network change:', event.analysis);

        // Debounce rapid changes
        if (this.networkChangeDebounceTimer) {
            clearTimeout(this.networkChangeDebounceTimer);
        }

        this.networkChangeDebounceTimer = setTimeout(() => {
            if (event.analysis.likelyOnline && this.systemState.online) {
                // Network interfaces changed but we're still online
                console.log('[RefreshManager] Network reconfigured - checking overdue sources');
                this.refreshAllOverdue('network_reconfiguration');
            }
        }, 1000);
    }

    /**
     * Handle network restore with intelligent recovery
     */
    handleNetworkRestore(networkState) {
        console.log('[RefreshManager] 🌐 Network restored:', {
            quality: networkState?.networkQuality || this.systemState.networkQuality,
            corporate: networkState?.corporateEnvironment || this.systemState.corporateEnvironment,
            confidence: networkState?.confidence
        });

        this.systemState.lastNetworkOnlineTime = this.now();
        this.networkState.consecutiveNetworkFailures = 0;

        // Determine stabilization delay based on network quality
        const delay = this.getNetworkStabilizationDelay(networkState || {});

        console.log(`[RefreshManager] Waiting ${delay}ms for network to stabilize`);

        setTimeout(() => {
            if (this.systemState.online) {
                console.log('[RefreshManager] Network stabilized - refreshing overdue sources');
                this.refreshAllOverdue('network_restore');
                this.resumeAll();
            }
        }, delay);
    }

    /**
     * Get network stabilization delay based on quality
     */
    getNetworkStabilizationDelay(networkState) {
        const networkQuality = networkState.networkQuality || this.systemState.networkQuality;
        const corporateEnvironment = networkState.corporateEnvironment || this.systemState.corporateEnvironment;

        if (corporateEnvironment === 'corporate') {
            return this.config.NETWORK_STABILIZATION_DELAY.corporate;
        }

        return this.config.NETWORK_STABILIZATION_DELAY[networkQuality] ||
            this.config.NETWORK_STABILIZATION_DELAY.good;
    }

    /**
     * Handle network loss
     */
    handleNetworkLoss() {
        console.log('[RefreshManager] 🌐 Network lost');
        this.pauseAll();
        this.networkState.consecutiveNetworkFailures++;
    }

    /**
     * Enhanced system wake handling
     */
    handleSystemWake() {
        console.log('[RefreshManager] System wake - checking network and overdue sources');
        this.systemState.awake = true;
        this.systemState.lastWakeTime = this.now();

        // Clear all timers as system time may have jumped
        this.clearAllTimers();

        // Force network check
        this.forceNetworkCheck().then(state => {
            console.log('[RefreshManager] Post-wake network state:', state);

            if (state && state.isOnline) {
                // Wait for system to stabilize, then refresh overdue sources
                setTimeout(() => {
                    this.refreshAllOverdue('system_wake');
                    this.resumeAll();
                }, this.config.WAKE_STABILIZATION_DELAY);
            } else {
                // Fallback if no network monitor or offline
                setTimeout(() => {
                    this.refreshAllOverdue('system_wake');
                    this.resumeAll();
                }, this.config.WAKE_STABILIZATION_DELAY);
            }
        });
    }

    /**
     * Enhanced refresh with network-aware features
     */
    async performRefresh(sourceId) {
        const refreshState = this.sources.get(sourceId);
        if (!refreshState || refreshState.isRefreshing || !this.systemState.online) {
            return;
        }

        const now = this.now();

        // Check network stability
        if (!this.isNetworkStable()) {
            console.log(`[RefreshManager] Delaying refresh for source ${sourceId} - network unstable`);
            setTimeout(() => this.performRefresh(sourceId), 5000);
            return;
        }

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
            console.log(`[RefreshManager] Refreshing source ${sourceId} (network: ${this.systemState.networkQuality}, timeout: ${this.getNetworkTimeout()}ms)`);

            // Add network context to request options
            const requestOptions = {
                ...refreshState.source.requestOptions,
                timeout: this.getNetworkTimeout(),
                networkContext: {
                    confidence: this.systemState.confidence || 0,
                    corporateEnvironment: this.systemState.corporateEnvironment
                }
            };

            const result = await this.httpService.request(
                refreshState.source.sourceId,
                refreshState.source.sourcePath,
                refreshState.source.sourceMethod,
                requestOptions,
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
                lastSuccessfulContent: result.content,
                lastSuccessfulRefresh: now
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

            // Analyze error type
            const errorType = this.analyzeError(error);

            const errorState = {
                ...refreshingState,
                isRefreshing: false,
                consecutiveErrors: refreshState.consecutiveErrors + 1,
                lastError: error,
                retryCount: refreshState.retryCount + 1,
                lastErrorType: errorType
            };

            // Apply intelligent backoff based on error type and network state
            errorState.backoffMultiplier = this.calculateBackoff(
                refreshState,
                errorType,
                this.systemState.networkQuality
            );

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
                    error: error.message,
                    errorType
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
     * Analyze error type for intelligent retry
     */
    analyzeError(error) {
        const message = error.message?.toLowerCase() || '';

        if (message.includes('network') || message.includes('econnrefused') ||
            message.includes('etimedout') || message.includes('enotfound')) {
            return 'network';
        } else if (message.includes('401') || message.includes('403')) {
            return 'auth';
        } else if (message.includes('429')) {
            return 'rate_limit';
        } else if (message.includes('500') || message.includes('502') ||
            message.includes('503') || message.includes('504')) {
            return 'server';
        }

        return 'unknown';
    }

    /**
     * Calculate intelligent backoff
     */
    calculateBackoff(refreshState, errorType, networkQuality) {
        let baseMultiplier = Math.min((refreshState.backoffMultiplier || 1) * 2, 8);

        // Adjust based on error type
        switch (errorType) {
            case 'network':
                // Network errors: aggressive backoff if network is poor
                if (networkQuality === 'poor') {
                    baseMultiplier *= 2;
                }
                break;
            case 'auth':
                // Auth errors: maximum backoff
                baseMultiplier = 16;
                break;
            case 'rate_limit':
                // Rate limit: respect the limit
                baseMultiplier = Math.max(baseMultiplier, 4);
                break;
            case 'server':
                // Server errors: moderate backoff
                baseMultiplier = Math.max(baseMultiplier, 2);
                break;
        }

        return Math.min(baseMultiplier, 16);
    }

    /**
     * Check if network is stable
     */
    isNetworkStable() {
        // Simple time-based check since we can't directly check stability
        const timeSinceLastChange = this.now() - this.systemState.lastNetworkOnlineTime;

        // Network should be stable for at least 5 seconds
        return timeSinceLastChange > 5000;
    }

    /**
     * Refresh all overdue sources with network awareness
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
                    intervalMs: refreshState.intervalMs,
                    priority: this.calculateRefreshPriority(refreshState, overdueTime)
                });
            }
        }

        if (overdueSources.length === 0) {
            console.log(`[RefreshManager] ✅ No overdue sources found after ${reason}`);
            return;
        }

        console.log(`[RefreshManager] 🔄 Found ${overdueSources.length} overdue sources after ${reason}:`);
        overdueSources.forEach(item => {
            console.log(`[RefreshManager]   → Source ${item.sourceId}: ${Math.round(item.overdueTime/1000)}s overdue (priority: ${item.priority})`);
        });

        // Sort by priority (higher priority first)
        overdueSources.sort((a, b) => b.priority - a.priority);

        // Get stagger delay based on network quality
        const staggerDelay = this.getStaggerDelay();

        console.log(`[RefreshManager] Staggering ${overdueSources.length} overdue refreshes (${staggerDelay}ms between each)`);

        // Stagger refreshes to prevent thundering herd
        overdueSources.forEach((item, index) => {
            const delay = index * staggerDelay;

            console.log(`[RefreshManager] Source ${item.sourceId}: will refresh in ${delay}ms`);
            setTimeout(() => {
                this.performRefresh(item.sourceId);
            }, delay);
        });
    }

    /**
     * Calculate refresh priority based on various factors
     */
    calculateRefreshPriority(refreshState, overdueTime) {
        let priority = 0;

        // Base priority on how overdue it is
        priority += Math.min(overdueTime / refreshState.intervalMs, 10);

        // Boost priority if it hasn't been successfully refreshed in a while
        if (refreshState.lastSuccessfulRefresh) {
            const timeSinceSuccess = this.now() - refreshState.lastSuccessfulRefresh;
            priority += Math.min(timeSinceSuccess / (refreshState.intervalMs * 5), 5);
        }

        // Lower priority for sources with many consecutive errors
        priority -= refreshState.consecutiveErrors * 2;

        return Math.max(priority, 0);
    }

    /**
     * Get stagger delay based on network quality
     */
    getStaggerDelay() {
        const { networkQuality, corporateEnvironment } = this.systemState;

        let delay = 200; // Default 200ms

        switch (networkQuality) {
            case 'excellent':
                delay = 100;
                break;
            case 'good':
                delay = 200;
                break;
            case 'fair':
                delay = 500;
                break;
            case 'poor':
                delay = 1000;
                break;
        }

        // Double delay for corporate environment
        if (corporateEnvironment === 'corporate') {
            delay *= 2;
        }

        return delay;
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
                window.electronAPI.onNetworkStateChanged((isOnline) => {
                    this.handleNetworkStatusChange({
                        state: { isOnline }
                    });
                });
            }
            if (window.electronAPI.onNetworkChange) {
                window.electronAPI.onNetworkChange(this.handleNetworkChange);
            }
            if (window.electronAPI.onVPNStateChanged) {
                window.electronAPI.onVPNStateChanged(this.handleVPNChange);
            }

            // Initial network state check
            this.checkNetworkState();
        }
    }

    /**
     * Check network state using NetworkMonitor if available
     */
    async checkNetworkState() {
        // Use IPC-based network check
        const state = await this.forceNetworkCheck();
        if (state && this.systemState.online !== state.isOnline) {
            this.handleNetworkStatusChange({
                state: { isOnline: state.isOnline }
            });
        }
    }

    /**
     * Enhanced cleanup
     */
    destroy() {
        this.clearAllTimers();

        // No NetworkMonitor to destroy since it's in main process

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