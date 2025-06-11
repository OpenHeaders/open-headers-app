const { createLogger } = require('../utils/logger');
const log = createLogger('RefreshManager');
const NetworkAwareScheduler = require('./NetworkAwareScheduler');
const RefreshCoordinator = require('./RefreshCoordinator');
const timeManager = require('./TimeManager');
const { ConcurrentMap } = require('../utils/ConcurrencyControl');
const { RequestDeduplicator } = require('../utils/ConcurrencyControl');
const { circuitBreakerManager } = require('../utils/CircuitBreaker');

/**
 * Improved RefreshManager with proper type handling and concurrency control
 * ALL sourceIds are converted to strings at entry points
 */
class RefreshManager {
  constructor() {
    this.isInitialized = false;
    this.sources = new ConcurrentMap('sources'); // Thread-safe source storage
    this.lastNetworkState = null;
    
    // Services
    this.httpService = null;
    this.onUpdateCallback = null;
    this.scheduler = new NetworkAwareScheduler();
    this.coordinator = new RefreshCoordinator();
    this.deduplicator = new RequestDeduplicator();
    
    // Event listeners cleanup
    this.eventCleanup = [];
    
    // Bind methods
    this.refreshSource = this.refreshSource.bind(this);
    this.handleNetworkStateSync = this.handleNetworkStateSync.bind(this);
    this.handleSystemWake = this.handleSystemWake.bind(this);
    this.handleSystemSleep = this.handleSystemSleep.bind(this);
  }
  
  /**
   * Ensure sourceId is always a string
   */
  static normalizeSourceId(sourceId) {
    if (sourceId === null || sourceId === undefined) {
      throw new Error('Invalid sourceId: null or undefined');
    }
    return String(sourceId);
  }
  
  /**
   * Initialize the refresh manager
   */
  async initialize(httpService, onUpdateCallback) {
    if (this.isInitialized) return;
    
    this.httpService = httpService;
    this.onUpdateCallback = onUpdateCallback;
    
    // Initialize scheduler with refresh callback
    await this.scheduler.initialize(this.refreshSource);
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Get initial network state
    const networkState = await window.electronAPI.getNetworkState();
    log.debug('RefreshManager initialized');
    
    // Let scheduler know about initial network state
    await this.scheduler.handleNetworkChange(networkState);
    
    this.isInitialized = true;
  }
  
  /**
   * Setup event listeners for system events
   */
  setupEventListeners() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Network state sync from main process
      if (window.electronAPI.onNetworkStateSync) {
        const networkHandler = this.handleNetworkStateSync;
        window.electronAPI.onNetworkStateSync(networkHandler);
        this.eventCleanup.push(() => {
          // TODO: Add removeNetworkStateSync when available
        });
      }
      
      // System events
      if (window.electronAPI.onSystemSuspend) {
        const suspendHandler = this.handleSystemSleep;
        window.electronAPI.onSystemSuspend(suspendHandler);
        this.eventCleanup.push(() => {
          // TODO: Add removeSystemSuspend when available
        });
      }
      
      if (window.electronAPI.onSystemResume) {
        const resumeHandler = this.handleSystemWake;
        window.electronAPI.onSystemResume(resumeHandler);
        this.eventCleanup.push(() => {
          // TODO: Add removeSystemResume when available
        });
      }
    }
  }
  
  /**
   * Handle network state sync from main process
   */
  async handleNetworkStateSync(event) {
    // Only log significant state changes
    if (event.state && (!this.lastNetworkState || 
        this.lastNetworkState.isOnline !== event.state.isOnline ||
        this.lastNetworkState.networkQuality !== event.state.networkQuality)) {
      log.debug('Network state updated', {
        online: event.state.isOnline,
        quality: event.state.networkQuality
      });
    }
    
    this.lastNetworkState = event.state;
    
    // Let scheduler handle network changes
    await this.scheduler.handleNetworkChange(event.state);
  }
  
  /**
   * Handle system wake
   */
  async handleSystemWake() {
    log.info('System wake detected');
    
    // Wait for network to stabilize
    setTimeout(async () => {
      const networkState = await window.electronAPI.getNetworkState();
      if (networkState.isOnline) {
        await this.scheduler.checkOverdueSources();
      }
    }, 3000);
  }
  
  /**
   * Handle system sleep
   */
  handleSystemSleep() {
    log.info('System sleep detected');
    // Scheduler will handle cleanup automatically
  }
  
  /**
   * Add a source to management
   */
  async addSource(source) {
    if (!this.isInitialized || source.sourceType !== 'http') {
      return;
    }
    
    // Normalize sourceId
    const sourceId = RefreshManager.normalizeSourceId(source.sourceId);
    
    // Create normalized source object
    const normalizedSource = {
      ...source,
      sourceId // Ensure sourceId is string
    };
    
    // Store source data - ALL HTTP sources are stored for manual refresh
    await this.sources.set(sourceId, normalizedSource);
    
    // Only schedule if auto-refresh is enabled
    if (source.refreshOptions?.enabled && source.refreshOptions?.interval > 0) {
      // Schedule the source for auto-refresh
      await this.scheduler.scheduleSource(normalizedSource);
      log.debug(`Added source ${sourceId} with auto-refresh enabled`);
    } else {
      log.debug(`Added source ${sourceId} for manual refresh only`);
    }
  }
  
  /**
   * Update a source
   */
  async updateSource(source) {
    if (source.sourceType !== 'http') return;
    
    // Normalize sourceId
    const sourceId = RefreshManager.normalizeSourceId(source.sourceId);
    
    // Create normalized source object
    const normalizedSource = {
      ...source,
      sourceId // Ensure sourceId is string
    };
    
    const existingSource = await this.sources.get(sourceId);
    
    if (!existingSource) {
      await this.addSource(normalizedSource);
      return;
    }
    
    // Update source data
    await this.sources.set(sourceId, normalizedSource);
    
    // Handle scheduling based on refresh settings
    const wasEnabled = existingSource.refreshOptions?.enabled && existingSource.refreshOptions?.interval > 0;
    const isEnabled = normalizedSource.refreshOptions?.enabled && normalizedSource.refreshOptions?.interval > 0;
    
    if (!wasEnabled && isEnabled) {
      // Auto-refresh was enabled
      log.info(`Auto-refresh enabled for ${sourceId}`);
      await this.scheduler.scheduleSource(normalizedSource);
    } else if (wasEnabled && !isEnabled) {
      // Auto-refresh was disabled
      log.info(`Auto-refresh disabled for ${sourceId}, keeping for manual refresh`);
      await this.scheduler.unscheduleSource(sourceId);
    } else if (isEnabled) {
      // Auto-refresh settings changed
      const oldInterval = existingSource.refreshOptions?.interval;
      const newInterval = normalizedSource.refreshOptions.interval;
      
      if (oldInterval !== newInterval) {
        log.info(`Interval changed for ${sourceId}: ${oldInterval} -> ${newInterval}`);
      }
      
      // Always reschedule to ensure correct timing
      await this.scheduler.scheduleSource(normalizedSource);
    }
  }
  
  /**
   * Remove a source from management
   */
  async removeSource(sourceId) {
    // Normalize sourceId
    sourceId = RefreshManager.normalizeSourceId(sourceId);
    
    if (!(await this.sources.has(sourceId))) return;
    
    await this.sources.delete(sourceId);
    await this.scheduler.unscheduleSource(sourceId);
    await this.coordinator.cancelRefresh(sourceId);
    
    log.debug(`Removed source ${sourceId}`);
  }
  
  /**
   * Refresh a single source with deduplication
   */
  async refreshSource(sourceId, options = {}) {
    // Normalize sourceId
    sourceId = RefreshManager.normalizeSourceId(sourceId);
    
    const source = await this.sources.get(sourceId);
    if (!source) {
      log.warn(`Source ${sourceId} not found`);
      return { success: false, error: 'Source not found' };
    }
    
    // Create deduplication key
    const dedupKey = `refresh-${sourceId}`;
    
    // Use deduplicator to prevent duplicate refreshes
    return this.deduplicator.execute(dedupKey, async () => {
      // Use coordinator to manage execution
      const result = await this.coordinator.executeRefresh(
        sourceId,
        async (id) => this.performRefresh(id, source),
        {
          ...options,
          timeout: await this.getNetworkTimeout()
        }
      );
      
      // Update scheduler with refresh result
      if (result.success) {
        const forceRecalculate = options.reason === 'manual';
        await this.scheduler.updateLastRefresh(sourceId, result.timestamp, forceRecalculate);
      }
      
      return result;
    });
  }
  
  /**
   * Perform the actual refresh operation
   */
  async performRefresh(sourceId, source) {
    const startTime = timeManager.now();
    
    // Notify UI of refresh start
    this.notifyUI(sourceId, null, {
      refreshStatus: {
        isRefreshing: true,
        startTime
      }
    });
    
    try {
      // Use circuit breaker for the HTTP request
      const circuitBreaker = circuitBreakerManager.getBreaker(`http-${sourceId}`, {
        failureThreshold: 3,
        resetTimeout: 30000
      });
      
      const result = await circuitBreaker.execute(async () => {
        // Get network-aware timeout
        const timeout = await this.getNetworkTimeout();
        
        log.debug(`Performing HTTP request for source ${sourceId}`);
        
        // Perform HTTP request
        const httpResult = await this.httpService.request(
          source.sourceId,
          source.sourcePath,
          source.sourceMethod,
          {
            ...source.requestOptions,
            timeout
          },
          source.jsonFilter
        );
        
        log.debug(`HTTP request completed for source ${sourceId}`, {
          hasContent: !!httpResult?.content,
          hasOriginalResponse: !!httpResult?.originalResponse
        });
        
        return httpResult;
      });
      
      // Calculate next refresh time based on the interval
      const now = timeManager.now();
      const intervalMs = source.refreshOptions?.interval ? source.refreshOptions.interval * 60 * 1000 : 0;
      const nextRefresh = intervalMs > 0 ? now + intervalMs : undefined;
      
      // Update UI with result
      this.notifyUI(sourceId, result.content, {
        originalResponse: result.originalResponse,
        headers: result.headers,
        refreshStatus: {
          isRefreshing: false,
          lastRefresh: now,
          success: true
        },
        refreshOptions: {
          ...source.refreshOptions,
          lastRefresh: now,
          nextRefresh: nextRefresh,
          interval: source.refreshOptions?.interval
        }
      });
      
      return result;
      
    } catch (error) {
      log.error(`Failed to refresh ${sourceId}:`, error);
      
      // Update UI with error
      this.notifyUI(sourceId, null, {
        refreshStatus: {
          isRefreshing: false,
          lastRefresh: timeManager.now(),
          success: false,
          error: error.message
        }
      });
      
      throw error;
    }
  }
  
  /**
   * Get network-aware timeout
   */
  async getNetworkTimeout(baseTimeout = 15000) {
    const networkState = await window.electronAPI.getNetworkState();
    
    let timeout = baseTimeout;
    
    // Adjust for network quality
    switch (networkState.networkQuality) {
      case 'excellent':
        timeout = baseTimeout * 0.8;
        break;
      case 'good':
        timeout = baseTimeout;
        break;
      case 'moderate':
        timeout = baseTimeout * 1.5;
        break;
      case 'poor':
        timeout = baseTimeout * 2;
        break;
    }
    
    // Cap at 60 seconds
    return Math.min(timeout, 60000);
  }
  
  /**
   * Manual refresh - bypasses schedule
   */
  async manualRefresh(sourceId) {
    // Normalize sourceId
    sourceId = RefreshManager.normalizeSourceId(sourceId);
    
    log.info(`Manual refresh requested for ${sourceId}`);
    
    const result = await this.refreshSource(sourceId, {
      reason: 'manual',
      priority: 'high',
      skipIfActive: false
    });
    
    return result.success;
  }
  
  /**
   * Refresh all sources with proper rate limiting
   */
  async refreshAll(reason = 'manual_all') {
    log.info(`Refreshing all sources, reason: ${reason}`);
    
    const sources = await this.sources.entries();
    const refreshOperations = sources.map(([sourceId, source]) => ({
      sourceId,
      refreshFn: (id) => this.performRefresh(id, source)
    }));
    
    const results = await this.coordinator.executeBatch(refreshOperations, {
      maxConcurrent: 3,
      continueOnError: true
    });
    
    return results;
  }
  
  /**
   * Get refresh status for a source (async version)
   */
  async getRefreshStatusAsync(sourceId) {
    // Normalize sourceId
    sourceId = RefreshManager.normalizeSourceId(sourceId);
    
    const isRefreshing = await this.coordinator.isRefreshing(sourceId);
    const isOverdue = await this.scheduler.isSourceOverdue(sourceId);
    const stats = await this.scheduler.getStatistics();
    
    // Find schedule info
    const schedules = await this.scheduler.schedules.entries();
    const schedule = schedules.find(([id]) => id === sourceId)?.[1];
    
    return {
      isRefreshing,
      isOverdue,
      isPaused: false,
      lastRefresh: schedule?.lastRefresh,
      nextRefresh: schedule?.nextRefresh,
      intervalMs: schedule?.intervalMs
    };
  }
  
  /**
   * Get time until next refresh for a source (synchronous for UI updates)
   * Note: This method relies on the source data being passed from the UI
   */
  getTimeUntilRefresh(sourceId, sourceData = null) {
    // Normalize sourceId
    sourceId = RefreshManager.normalizeSourceId(sourceId);
    
    // We don't store sources here, so we need the source data
    // The UI should pass the source data for accurate timing
    if (!sourceData) {
      // Try to get from scheduler's schedule data
      const schedules = this._cachedSchedules || new Map();
      const schedule = schedules.get(sourceId);
      if (schedule && schedule.nextRefresh) {
        const now = timeManager.now();
        return Math.max(0, schedule.nextRefresh - now);
      }
      return 0;
    }
    
    if (!sourceData.refreshOptions?.enabled) {
      return 0;
    }
    
    // Get the next refresh time from the source data
    const nextRefresh = sourceData.refreshOptions?.nextRefresh;
    if (!nextRefresh) {
      return 0;
    }
    
    const now = timeManager.now();
    const timeRemaining = nextRefresh - now;
    
    return Math.max(0, timeRemaining);
  }
  
  /**
   * Get refresh status for a source (synchronous version for UI)
   * Returns cached data for performance
   */
  getRefreshStatus(sourceId) {
    // Normalize sourceId
    sourceId = RefreshManager.normalizeSourceId(sourceId);
    
    // Return cached status for synchronous UI updates
    if (!this._statusCache) {
      this._statusCache = new Map();
    }
    const cachedStatus = this._statusCache.get(sourceId);
    if (cachedStatus) {
      return cachedStatus;
    }
    
    // Return default status
    return {
      isRefreshing: false,
      isOverdue: false,
      isPaused: false,
      consecutiveErrors: 0
    };
  }
  
  
  /**
   * Get overall statistics
   */
  async getStatistics() {
    return {
      scheduler: await this.scheduler.getStatistics(),
      coordinator: await this.coordinator.getMetrics(),
      totalSources: await this.sources.size(),
      deduplicator: {
        pendingRequests: await this.deduplicator.getPendingCount()
      },
      circuitBreakers: circuitBreakerManager.getAllStatus()
    };
  }
  
  /**
   * Notify UI of changes
   */
  notifyUI(sourceId, content, additionalData = {}) {
    if (!this.onUpdateCallback) return;
    
    // sourceId is already normalized
    this.onUpdateCallback(sourceId, content, additionalData);
  }
  
  /**
   * Cleanup and destroy
   */
  async destroy() {
    // Cancel all active operations
    await this.coordinator.destroy();
    
    // Clear all schedules
    await this.scheduler.destroy();
    
    // Clear sources
    await this.sources.clear();
    
    // Clean up event listeners
    this.eventCleanup.forEach(cleanup => cleanup());
    this.eventCleanup = [];
    
    // Clear callbacks
    this.httpService = null;
    this.onUpdateCallback = null;
    
    this.isInitialized = false;
    
    log.debug('RefreshManager destroyed');
  }
}

// Export singleton instance
const refreshManager = new RefreshManager();
export default refreshManager;