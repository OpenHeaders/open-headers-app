const { createLogger } = require('../utils/logger');
const timeManager = require('./TimeManager');
const { ConcurrentMap, ConcurrentSet, Semaphore } = require('../utils/ConcurrencyControl');
const { circuitBreakerManager } = require('../utils/CircuitBreaker');
const log = createLogger('NetworkAwareScheduler');

/**
 * Improved NetworkAwareScheduler with proper concurrency control
 * Uses individual timers instead of master timer for better efficiency
 */
class NetworkAwareScheduler {
  constructor() {
    // Use thread-safe data structures
    this.schedules = new ConcurrentMap('schedules');
    this.activeRefreshes = new ConcurrentSet('activeRefreshes');
    this.timers = new Map(); // Timer IDs by sourceId
    
    // Concurrency control
    this.refreshSemaphore = new Semaphore(10, 'refresh'); // Max 10 concurrent refreshes
    this.overdueSemaphore = new Semaphore(3, 'overdue'); // Max 3 concurrent overdue checks
    
    // State
    this.refreshCallback = null;
    this.networkOfflineTime = null;
    this.lastNetworkState = { isOnline: true };
    this.isDestroyed = false;
    this.timeEventUnsubscribe = null;
    
    // Configuration
    this.MAX_CONCURRENT_REFRESHES = 10;
    this.OVERDUE_CHECK_INTERVAL = 30000; // 30 seconds
    this.overdueCheckTimer = null;
  }

  /**
   * Initialize the scheduler with a callback for refresh execution
   */
  async initialize(refreshCallback) {
    this.refreshCallback = refreshCallback;
    
    // Initialize TimeManager
    await timeManager.initialize();
    
    // Subscribe to time events
    this.timeEventUnsubscribe = timeManager.addListener((events) => {
      this.handleTimeEvents(events);
    });
    
    // Start periodic overdue check
    this.startOverdueCheck();
    
    log.info('NetworkAwareScheduler initialized with improved concurrency control');
  }

  /**
   * Schedule a source for refresh with proper type conversion
   */
  async scheduleSource(source) {
    if (!source || !source.sourceId || source.sourceType !== 'http') {
      return;
    }
    
    // ALWAYS convert sourceId to string at entry point
    const sourceId = String(source.sourceId);
    
    const intervalMs = this.parseInterval(source.refreshOptions?.interval);
    if (!intervalMs) {
      await this.unscheduleSource(sourceId);
      return;
    }
    
    // Validate interval limits
    if (intervalMs < 10000 || intervalMs > 24 * 60 * 60 * 1000) {
      log.warn(`Invalid interval for source ${sourceId}: ${intervalMs}ms`);
      return;
    }
    
    // Get existing schedule if any
    const existingSchedule = await this.schedules.get(sourceId);
    
    const schedule = {
      sourceId,
      intervalMs,
      lastRefresh: existingSchedule?.lastRefresh || 
                   (source.refreshOptions?.lastRefresh ? 
                    timeManager.getDate(source.refreshOptions.lastRefresh).getTime() : null),
      nextRefresh: null,
      retryCount: 0,
      maxRetries: 3,
      backoffFactor: 2,
      failureCount: 0,
      maxConsecutiveFailures: 10,
      // Wall-clock alignment options
      alignToMinute: source.refreshOptions?.alignToMinute || false,
      alignToHour: source.refreshOptions?.alignToHour || false,
      alignToDay: source.refreshOptions?.alignToDay || false
    };
    
    // Store schedule
    await this.schedules.set(sourceId, schedule);
    
    // Calculate next refresh time
    const networkState = await window.electronAPI.getNetworkState();
    await this.calculateAndScheduleNextRefresh(sourceId, networkState);
    
    log.info(`Scheduled source ${sourceId} with interval ${intervalMs}ms`);
  }

  /**
   * Unschedule a source
   */
  async unscheduleSource(sourceId) {
    sourceId = String(sourceId);
    
    // Clear any existing timer
    this.clearSourceTimer(sourceId);
    
    // Remove from schedules
    await this.schedules.delete(sourceId);
    
    // Cancel any active refresh
    await this.activeRefreshes.delete(sourceId);
    
    log.debug(`Unscheduled source ${sourceId}`);
  }

  /**
   * Calculate next refresh time and schedule timer
   */
  async calculateAndScheduleNextRefresh(sourceId, networkState = null) {
    sourceId = String(sourceId);
    
    const schedule = await this.schedules.get(sourceId);
    if (!schedule) return;
    
    if (!networkState) {
      networkState = await window.electronAPI.getNetworkState();
    }
    
    const now = timeManager.now();
    let nextRefreshTime;
    
    // If offline, don't schedule timer but calculate next time
    if (!networkState.isOnline) {
      const baseTime = schedule.lastRefresh || now;
      nextRefreshTime = this.calculateAlignedTime(baseTime + schedule.intervalMs, schedule);
      schedule.nextRefresh = nextRefreshTime;
      await this.schedules.set(sourceId, schedule);
      return;
    }
    
    // Check if source is overdue
    if (schedule.lastRefresh) {
      const timeSinceLastRefresh = now - schedule.lastRefresh;
      const isOverdue = timeSinceLastRefresh > schedule.intervalMs;
      
      if (isOverdue) {
        // Schedule immediate refresh with small delay
        nextRefreshTime = now + 100 + Math.random() * 900; // 100-1000ms
        log.debug(`Source ${sourceId} is overdue, scheduling immediate refresh`);
      } else {
        // Calculate normal next refresh
        const baseTime = schedule.lastRefresh;
        nextRefreshTime = this.calculateAlignedTime(baseTime + schedule.intervalMs, schedule);
      }
    } else {
      // Never refreshed - schedule immediately
      nextRefreshTime = now + 100;
    }
    
    // Ensure next refresh is in the future
    if (nextRefreshTime <= now) {
      nextRefreshTime = now + 1000;
    }
    
    // Update schedule
    schedule.nextRefresh = nextRefreshTime;
    await this.schedules.set(sourceId, schedule);
    
    // Schedule timer
    this.scheduleSourceTimer(sourceId, nextRefreshTime - now);
  }

  /**
   * Calculate wall-clock aligned time if needed
   */
  calculateAlignedTime(targetTime, schedule) {
    if (schedule.alignToMinute || schedule.alignToHour || schedule.alignToDay) {
      return timeManager.getNextAlignedTime(schedule.intervalMs, targetTime, {
        alignToMinute: schedule.alignToMinute,
        alignToHour: schedule.alignToHour,
        alignToDay: schedule.alignToDay
      });
    }
    return targetTime;
  }

  /**
   * Schedule a timer for a specific source
   */
  scheduleSourceTimer(sourceId, delay) {
    // Clear existing timer
    this.clearSourceTimer(sourceId);
    
    // Don't schedule if destroyed
    if (this.isDestroyed) return;
    
    // Schedule new timer
    const timerId = setTimeout(async () => {
      if (this.isDestroyed) return;
      
      try {
        await this.triggerRefresh(sourceId, 'scheduled');
      } catch (error) {
        log.error(`Error triggering scheduled refresh for ${sourceId}:`, error);
      }
    }, delay);
    
    this.timers.set(sourceId, timerId);
  }

  /**
   * Clear timer for a source
   */
  clearSourceTimer(sourceId) {
    const timerId = this.timers.get(sourceId);
    if (timerId) {
      clearTimeout(timerId);
      this.timers.delete(sourceId);
    }
  }

  /**
   * Trigger refresh for a source with proper concurrency control
   */
  async triggerRefresh(sourceId, reason = 'scheduled') {
    sourceId = String(sourceId);
    
    if (this.isDestroyed) return;
    
    // Check if already refreshing
    if (await this.activeRefreshes.has(sourceId)) {
      log.debug(`Source ${sourceId} already refreshing, skipping`);
      return;
    }
    
    // Get schedule
    const schedule = await this.schedules.get(sourceId);
    if (!schedule) {
      log.warn(`No schedule found for source ${sourceId}`);
      return;
    }
    
    // Check failure count
    if (schedule.failureCount >= schedule.maxConsecutiveFailures) {
      log.warn(`Source ${sourceId} has failed ${schedule.failureCount} times, unscheduling`);
      await this.unscheduleSource(sourceId);
      return;
    }
    
    // Use circuit breaker
    const circuitBreaker = circuitBreakerManager.getBreaker(`source-${sourceId}`, {
      failureThreshold: 5,
      resetTimeout: 60000
    });
    
    try {
      await circuitBreaker.execute(async () => {
        // Acquire semaphore permit
        await this.refreshSemaphore.withPermit(async () => {
          // Mark as active
          await this.activeRefreshes.add(sourceId);
          
          try {
            // Execute refresh
            await this._performRefresh(sourceId, reason);
          } finally {
            // Always clean up
            await this.activeRefreshes.delete(sourceId);
          }
        });
      });
    } catch (error) {
      if (error.message.includes('Circuit breaker')) {
        log.warn(`Circuit breaker open for source ${sourceId}`);
      } else {
        log.error(`Refresh failed for source ${sourceId}:`, error);
      }
    }
  }

  /**
   * Perform the actual refresh
   */
  async _performRefresh(sourceId, reason) {
    const schedule = await this.schedules.get(sourceId);
    if (!schedule || !this.refreshCallback) return;
    
    log.info(`Triggering refresh for source ${sourceId}, reason: ${reason}`);
    
    try {
      const result = await this.refreshCallback(sourceId, { reason });
      
      // Handle success
      if (result && result.success !== false) {
        await this.updateScheduleOnSuccess(sourceId);
      } else {
        await this.updateScheduleOnFailure(sourceId);
      }
    } catch (error) {
      await this.updateScheduleOnFailure(sourceId);
      throw error;
    }
    
    // Schedule next refresh
    const networkState = await window.electronAPI.getNetworkState();
    await this.calculateAndScheduleNextRefresh(sourceId, networkState);
  }

  /**
   * Update schedule on successful refresh
   */
  async updateScheduleOnSuccess(sourceId) {
    const schedule = await this.schedules.get(sourceId);
    if (!schedule) return;
    
    schedule.lastRefresh = timeManager.now();
    schedule.retryCount = 0;
    schedule.failureCount = 0;
    
    await this.schedules.set(sourceId, schedule);
  }

  /**
   * Update schedule on failed refresh
   */
  async updateScheduleOnFailure(sourceId) {
    const schedule = await this.schedules.get(sourceId);
    if (!schedule) return;
    
    schedule.failureCount++;
    schedule.retryCount = Math.min(schedule.retryCount + 1, schedule.maxRetries);
    
    await this.schedules.set(sourceId, schedule);
  }

  /**
   * Handle network state change
   */
  async handleNetworkChange(networkState) {
    if (this.isDestroyed) return;
    
    const wasOffline = !this.lastNetworkState.isOnline;
    const isNowOnline = networkState.isOnline;
    
    this.lastNetworkState = networkState;
    
    if (!wasOffline || !isNowOnline) {
      return; // Only care about offline -> online transition
    }
    
    log.info('Network recovered from offline');
    
    // Check all sources and reschedule
    const schedules = await this.schedules.entries();
    
    for (const [sourceId, schedule] of schedules) {
      await this.calculateAndScheduleNextRefresh(sourceId, networkState);
    }
  }

  /**
   * Handle time events from TimeManager
   */
  handleTimeEvents(events) {
    if (this.isDestroyed) return;
    
    log.info('Time events detected', { count: events.length });
    
    // Reschedule all sources on significant time changes
    this.rescheduleAllSources().catch(err => {
      log.error('Error rescheduling sources after time event:', err);
    });
  }

  /**
   * Reschedule all sources
   */
  async rescheduleAllSources() {
    const schedules = await this.schedules.entries();
    const networkState = await window.electronAPI.getNetworkState();
    
    for (const [sourceId] of schedules) {
      await this.calculateAndScheduleNextRefresh(sourceId, networkState);
    }
  }

  /**
   * Check for overdue sources
   */
  async checkOverdueSources() {
    if (this.isDestroyed) return;
    
    await this.overdueSemaphore.withPermit(async () => {
      const now = timeManager.now();
      const schedules = await this.schedules.entries();
      const networkState = await window.electronAPI.getNetworkState();
      
      if (!networkState.isOnline) return;
      
      const overdueSources = [];
      
      for (const [sourceId, schedule] of schedules) {
        if (!schedule.lastRefresh) {
          overdueSources.push({ sourceId, priority: 1 });
        } else {
          const expectedRefreshTime = schedule.lastRefresh + schedule.intervalMs;
          const overdueBy = now - expectedRefreshTime;
          if (overdueBy > 60000) { // 1 minute buffer
            overdueSources.push({ sourceId, overdueBy, priority: 2 });
          }
        }
      }
      
      if (overdueSources.length > 0) {
        log.info(`Found ${overdueSources.length} overdue sources`);
        
        // Sort by priority and overdue time
        overdueSources.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return (b.overdueBy || 0) - (a.overdueBy || 0);
        });
        
        // Trigger refreshes with rate limiting
        for (let i = 0; i < Math.min(3, overdueSources.length); i++) {
          const { sourceId } = overdueSources[i];
          this.triggerRefresh(sourceId, 'overdue').catch(err => {
            log.error(`Error refreshing overdue source ${sourceId}:`, err);
          });
          
          // Small delay between triggers
          if (i < 2) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }
    });
  }

  /**
   * Start periodic overdue check
   */
  startOverdueCheck() {
    this.overdueCheckTimer = setInterval(() => {
      this.checkOverdueSources().catch(err => {
        log.error('Error in periodic overdue check:', err);
      });
    }, this.OVERDUE_CHECK_INTERVAL);
  }

  /**
   * Stop periodic overdue check
   */
  stopOverdueCheck() {
    if (this.overdueCheckTimer) {
      clearInterval(this.overdueCheckTimer);
      this.overdueCheckTimer = null;
    }
  }

  /**
   * Update last refresh time
   */
  async updateLastRefresh(sourceId, timestamp = null) {
    sourceId = String(sourceId);
    
    const schedule = await this.schedules.get(sourceId);
    if (!schedule) return;
    
    schedule.lastRefresh = timestamp || timeManager.now();
    await this.schedules.set(sourceId, schedule);
    
    // Reschedule
    const networkState = await window.electronAPI.getNetworkState();
    await this.calculateAndScheduleNextRefresh(sourceId, networkState);
  }

  /**
   * Parse refresh interval to milliseconds
   */
  parseInterval(interval) {
    if (!interval || interval === 'never') return null;
    
    if (typeof interval === 'number') {
      if (!isFinite(interval) || interval <= 0 || interval > 1440) {
        return null;
      }
      return interval * 60 * 1000;
    }
    
    const match = interval.toString().match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000
    };
    
    return value * multipliers[unit];
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    const schedules = await this.schedules.entries();
    const activeCount = await this.activeRefreshes.size();
    
    return {
      totalScheduled: schedules.length,
      activeRefreshes: activeCount,
      semaphoreStats: this.refreshSemaphore.getStats(),
      circuitBreakerStatus: circuitBreakerManager.getAllStatus()
    };
  }

  /**
   * Clean up scheduler resources
   */
  async destroy() {
    this.isDestroyed = true;
    
    // Stop overdue check
    this.stopOverdueCheck();
    
    // Clear all timers
    for (const [sourceId, timerId] of this.timers) {
      clearTimeout(timerId);
    }
    this.timers.clear();
    
    // Unsubscribe from time events
    if (this.timeEventUnsubscribe) {
      this.timeEventUnsubscribe();
      this.timeEventUnsubscribe = null;
    }
    
    // Wait for active operations
    const activeCount = await this.activeRefreshes.size();
    if (activeCount > 0) {
      log.info(`Waiting for ${activeCount} active refreshes to complete`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Clear data structures
    await this.schedules.clear();
    await this.activeRefreshes.clear();
    
    log.debug('Scheduler destroyed');
  }

  /**
   * Check if source is overdue
   */
  async isSourceOverdue(sourceId) {
    sourceId = String(sourceId);
    
    const schedule = await this.schedules.get(sourceId);
    if (!schedule) return false;
    
    if (!schedule.lastRefresh) return true;
    
    const now = timeManager.now();
    const expectedRefreshTime = schedule.lastRefresh + schedule.intervalMs;
    return (now - expectedRefreshTime) > 60000;
  }
}

module.exports = NetworkAwareScheduler;