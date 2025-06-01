const { createLogger } = require('../utils/logger');
const log = createLogger('RefreshManager');
const NetworkAwareScheduler = require('./NetworkAwareScheduler');
const RefreshCoordinator = require('./RefreshCoordinator');

/**
 * RefreshManager - Simplified to focus only on coordinating refresh operations.
 * Delegates scheduling to NetworkAwareScheduler and execution coordination to RefreshCoordinator.
 */
class RefreshManager {
  constructor() {
    this.isInitialized = false;
    this.sources = new Map(); // sourceId -> source data
    this.lastNetworkState = null;
    
    // Services
    this.httpService = null;
    this.onUpdateCallback = null;
    this.scheduler = new NetworkAwareScheduler();
    this.coordinator = new RefreshCoordinator();
    
    // Bind methods
    this.refreshSource = this.refreshSource.bind(this);
    this.handleNetworkStateSync = this.handleNetworkStateSync.bind(this);
    this.handleSystemWake = this.handleSystemWake.bind(this);
    this.handleSystemSleep = this.handleSystemSleep.bind(this);
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
    log.debug('Initialized');
    
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
        window.electronAPI.onNetworkStateSync(this.handleNetworkStateSync);
      }
      
      // System events
      if (window.electronAPI.onSystemSuspend) {
        window.electronAPI.onSystemSuspend(this.handleSystemSleep);
      }
      if (window.electronAPI.onSystemResume) {
        window.electronAPI.onSystemResume(this.handleSystemWake);
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
        await this.scheduler.checkOverdueSources('system_wake');
      }
    }, 3000);
  }
  
  /**
   * Handle system sleep
   */
  handleSystemSleep() {
    log.info('System sleep detected');
    // Scheduler timers will be cleared automatically
  }
  
  /**
   * Add a source to management
   */
  addSource(source) {
    if (!this.isInitialized || source.sourceType !== 'http') {
      return;
    }
    
    // Convert sourceId to string to ensure consistency
    const sourceId = String(source.sourceId);
    
    // Check if refresh is enabled
    if (!source.refreshOptions?.enabled || !source.refreshOptions?.interval) {
      this.removeSource(sourceId);
      return;
    }
    
    // Store source data with string key
    this.sources.set(sourceId, source);
    
    // Schedule the source
    this.scheduler.scheduleSource(source).catch(err => {
      log.error(`Error scheduling source ${sourceId}:`, err);
    });
    
    log.debug(`Added source ${sourceId}`);
  }
  
  /**
   * Update a source
   */
  updateSource(source) {
    if (source.sourceType !== 'http') return;
    
    // Convert sourceId to string to ensure consistency
    const sourceId = String(source.sourceId);
    const existingSource = this.sources.get(sourceId);
    
    if (!existingSource) {
      this.addSource(source);
      return;
    }
    
    // Check if refresh settings changed
    if (!source.refreshOptions?.enabled || !source.refreshOptions?.interval) {
      this.removeSource(sourceId);
      return;
    }
    
    // Update source data
    this.sources.set(sourceId, source);
    
    // Reschedule if interval changed
    const oldInterval = existingSource.refreshOptions?.interval;
    const newInterval = source.refreshOptions.interval;
    
    if (oldInterval !== newInterval) {
      log.info(`Interval changed for ${sourceId}: ${oldInterval} -> ${newInterval}`);
      this.scheduler.scheduleSource(source).catch(err => {
        log.error(`Error rescheduling source ${sourceId}:`, err);
      });
    }
  }
  
  /**
   * Remove a source from management
   */
  removeSource(sourceId) {
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    if (!this.sources.has(sourceId)) return;
    
    this.sources.delete(sourceId);
    this.scheduler.unscheduleSource(sourceId);
    this.coordinator.cancelRefresh(sourceId);
    
    log.debug(`Removed source ${sourceId}`);
  }
  
  /**
   * Refresh a single source (called by scheduler or manually)
   */
  async refreshSource(sourceId, options = {}) {
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    const source = this.sources.get(sourceId);
    if (!source) {
      log.warn(`Source ${sourceId} not found`);
      return false;
    }
    
    // Use coordinator to prevent overlapping refreshes
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
      this.scheduler.updateLastRefresh(sourceId, result.timestamp);
    }
    
    return result;
  }
  
  /**
   * Perform the actual refresh operation
   */
  async performRefresh(sourceId, source) {
    const startTime = Date.now();
    
    // Notify UI of refresh start (sourceId already converted to string)
    this.notifyUI(sourceId, null, {
      refreshStatus: {
        isRefreshing: true,
        startTime
      }
    });
    
    try {
      // Get network-aware timeout
      const timeout = await this.getNetworkTimeout();
      
      // Perform HTTP request
      const result = await this.httpService.request(
        source.sourceId,
        source.sourcePath,
        source.sourceMethod,
        {
          ...source.requestOptions,
          timeout
        },
        source.jsonFilter
      );
      
      // Update UI with result
      this.notifyUI(sourceId, result.content, {
        originalResponse: result.originalResponse,
        headers: result.headers,
        refreshStatus: {
          isRefreshing: false,
          lastRefresh: Date.now(),
          success: true
        },
        refreshOptions: {
          ...source.refreshOptions,
          lastRefresh: Date.now()
        }
      });
      
      // Source refreshed successfully
      return result;
      
    } catch (error) {
      log.error(`Failed to refresh ${sourceId}:`, error);
      
      // Update UI with error
      this.notifyUI(sourceId, null, {
        refreshStatus: {
          isRefreshing: false,
          lastRefresh: Date.now(),
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
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    log.info(`Manual refresh requested for ${sourceId}`);
    
    const result = await this.refreshSource(sourceId, {
      reason: 'manual',
      priority: 'high',
      skipIfActive: false
    });
    
    return result.success;
  }
  
  /**
   * Refresh all sources
   */
  async refreshAll(reason = 'manual_all') {
    log.info(`Refreshing all sources, reason: ${reason}`);
    
    const refreshOperations = Array.from(this.sources.values()).map(source => ({
      sourceId: source.sourceId,
      refreshFn: (id) => this.performRefresh(id, source)
    }));
    
    const results = await this.coordinator.executeBatch(refreshOperations, {
      maxConcurrent: 3,
      continueOnError: true
    });
    
    return results;
  }
  
  /**
   * Get refresh status for a source
   */
  getRefreshStatus(sourceId) {
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    const isRefreshing = this.coordinator.isRefreshing(sourceId);
    const isOverdue = this.scheduler.isSourceOverdue(sourceId);
    const stats = this.scheduler.getStatistics();
    const schedule = stats.schedules.find(s => s.sourceId === sourceId);
    
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
   * Get time until next refresh in milliseconds
   */
  getTimeUntilRefresh(sourceId) {
    // Convert sourceId to string to ensure consistency
    sourceId = String(sourceId);
    const stats = this.scheduler.getStatistics();
    const schedule = stats.schedules.find(s => s.sourceId === sourceId);
    
    if (!schedule || !schedule.nextRefresh) {
      return 0;
    }
    
    const now = Date.now();
    const timeUntil = schedule.nextRefresh - now;
    
    return Math.max(0, timeUntil);
  }
  
  /**
   * Get overall statistics
   */
  getStatistics() {
    return {
      scheduler: this.scheduler.getStatistics(),
      coordinator: this.coordinator.getMetrics(),
      totalSources: this.sources.size
    };
  }
  
  /**
   * Notify UI of changes
   */
  notifyUI(sourceId, content, additionalData = {}) {
    if (!this.onUpdateCallback) return;
    
    // Note: sourceId is already a string at this point, but ensure consistency
    this.onUpdateCallback(String(sourceId), content, additionalData);
  }
  
  /**
   * Cleanup and destroy
   */
  destroy() {
    // Cancel all active operations
    this.coordinator.destroy();
    
    // Clear all schedules
    this.scheduler.destroy();
    
    // Clear sources
    this.sources.clear();
    
    // Clear callbacks
    this.httpService = null;
    this.onUpdateCallback = null;
    
    this.isInitialized = false;
    
    log.debug('Destroyed');
  }
}

// Export singleton instance
const refreshManager = new RefreshManager();
export default refreshManager;