const { createLogger } = require('../utils/error-handling/logger');
const timeManager = require('./TimeManager');
const { ConcurrentMap, ConcurrentSet, Semaphore } = require('../utils/error-handling/ConcurrencyControl');
const { adaptiveCircuitBreakerManager } = require('../utils/error-handling/AdaptiveCircuitBreaker');
const { 
    CIRCUIT_BREAKER_CONFIG, 
    INITIAL_RETRY_CONFIG,
    formatCircuitBreakerKey,
    OVERDUE_RETRY_CONFIG, 
    calculateDelayWithJitter 
} = require('../constants/retryConfig');
const log = createLogger('NetworkAwareScheduler');

/**
 * NetworkAwareScheduler - Manages refresh scheduling with network awareness
 */
class NetworkAwareScheduler {
  constructor() {
    this.schedules = new ConcurrentMap('schedules');
    this.activeRefreshes = new ConcurrentSet('activeRefreshes');
    this.timers = new Map();
    
    this.refreshSemaphore = new Semaphore(10, 'refresh');
    this.overdueSemaphore = new Semaphore(3, 'overdue');
    this.refreshCallback = null;
    this.scheduleUpdateCallback = null;
    this.lastNetworkState = { isOnline: true };
    this.isDestroyed = false;
    this.isPaused = false;
    this.timeEventUnsubscribe = null;
    
    this.OVERDUE_CHECK_INTERVAL = 30000; // 30 seconds
    this.overdueCheckTimer = null;
  }


  /**
   * Initialize the scheduler with a callback for refresh execution
   */
  async initialize(refreshCallback, scheduleUpdateCallback = null) {
    this.refreshCallback = refreshCallback;
    this.scheduleUpdateCallback = scheduleUpdateCallback;
    
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
   * Schedule a source for refresh
   */
  async scheduleSource(source) {
    if (!source || !source.sourceId || source.sourceType !== 'http') {
      return;
    }
    
    const sourceId = String(source.sourceId);
    
    const intervalMs = this.parseInterval(source.refreshOptions?.interval);
    if (!intervalMs) {
      await this.unscheduleSource(sourceId);
      return;
    }
    
    if (intervalMs < 10000 || intervalMs > 24 * 60 * 60 * 1000) {
      log.warn(`Invalid interval for source ${sourceId}: ${intervalMs}ms`);
      return;
    }
    
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
      alignToMinute: source.refreshOptions?.alignToMinute || false,
      alignToHour: source.refreshOptions?.alignToHour || false,
      alignToDay: source.refreshOptions?.alignToDay || false
    };
    
    await this.schedules.set(sourceId, schedule);
    await this.calculateAndScheduleNextRefresh(sourceId);
    
    log.info(`Scheduled source ${sourceId} with interval ${intervalMs}ms`);
  }

  /**
   * Unschedule a source
   */
  async unscheduleSource(sourceId) {
    sourceId = String(sourceId);
    
    this.clearSourceTimer(sourceId);
    await this.schedules.delete(sourceId);
    await this.activeRefreshes.delete(sourceId);
    
    log.debug(`Unscheduled source ${sourceId}`);
  }

  /**
   * Calculate next refresh time and schedule timer
   */
  async calculateAndScheduleNextRefresh(sourceId, networkState = null) {
    sourceId = String(sourceId);
    
    const schedule = await this.schedules.get(sourceId);
    if (!schedule) {
      log.warn(`No schedule found for source ${sourceId} in calculateAndScheduleNextRefresh`);
      return;
    }
    
    if (!networkState) {
      networkState = await window.electronAPI.getNetworkState();
      log.debug(`Fetched network state: isOnline=${networkState.isOnline}, quality=${networkState.networkQuality}`);
    } else {
      log.debug(`Using provided network state: isOnline=${networkState.isOnline}, quality=${networkState.networkQuality}`);
    }
    
    const now = timeManager.now();
    let nextRefreshTime;
    
    if (!networkState.isOnline) {
      const baseTime = schedule.lastRefresh || now;
      nextRefreshTime = this.calculateAlignedTime(baseTime + schedule.intervalMs, schedule);
      schedule.nextRefresh = nextRefreshTime;
      await this.schedules.set(sourceId, schedule);
      log.warn(`Source ${sourceId} offline (isOnline=${networkState.isOnline}), next refresh time set to ${nextRefreshTime} (no timer scheduled)`);
      return;
    }
    
    // Always check circuit breaker state first for retry logic
    const circuitBreakerKey = formatCircuitBreakerKey('http', sourceId);
    const circuitBreaker = adaptiveCircuitBreakerManager.getBreaker(circuitBreakerKey, CIRCUIT_BREAKER_CONFIG);
    const circuitStatus = circuitBreaker.getStatus();
    
    // If circuit breaker has failures, handle retry timing
    if (circuitStatus.failureCount > 0 || circuitBreaker.isOpen()) {
      if (circuitBreaker.isOpen()) {
        const timeUntilNextAttempt = circuitStatus.backoff.timeUntilNextAttempt;
        
        if (timeUntilNextAttempt > 0) {
          nextRefreshTime = now + timeUntilNextAttempt;
          log.info(`Source ${sourceId} circuit breaker is open, next attempt in ${timeUntilNextAttempt}ms`);
        } else {
          const delay = calculateDelayWithJitter(
            OVERDUE_RETRY_CONFIG.circuitBreakerRetryDelay.base,
            OVERDUE_RETRY_CONFIG.circuitBreakerRetryDelay.maxJitter
          );
          nextRefreshTime = now + delay;
          log.info(`Source ${sourceId} circuit breaker timer expired, scheduling retry in ${delay}ms`);
        }
      } else {
        // Circuit not open yet but has failures - use initial retry config
        const delay = calculateDelayWithJitter(
          INITIAL_RETRY_CONFIG.baseDelay,
          INITIAL_RETRY_CONFIG.maxJitter
        );
        nextRefreshTime = now + delay;
        log.info(`Source ${sourceId} has ${circuitStatus.failureCount} failures, scheduling retry in ${delay}ms`);
      }
    } else if (schedule.lastRefresh) {
      const timeSinceLastRefresh = now - schedule.lastRefresh;
      const isOverdue = timeSinceLastRefresh > schedule.intervalMs;
      
      log.debug(`Source ${sourceId}: lastRefresh=${schedule.lastRefresh}, now=${now}, timeSince=${timeSinceLastRefresh}ms, interval=${schedule.intervalMs}ms, overdue=${isOverdue}`);
      
      if (isOverdue) {
        const delay = calculateDelayWithJitter(
          OVERDUE_RETRY_CONFIG.minDelay,
          OVERDUE_RETRY_CONFIG.maxJitter
        );
        nextRefreshTime = now + delay;
        log.info(`Source ${sourceId} is overdue by ${timeSinceLastRefresh - schedule.intervalMs}ms, scheduling refresh with delay of ${delay}ms`);
      } else {
        const baseTime = schedule.lastRefresh;
        nextRefreshTime = this.calculateAlignedTime(baseTime + schedule.intervalMs, schedule);
        log.debug(`Source ${sourceId} not overdue, next refresh at ${nextRefreshTime}`);
      }
    } else {
      nextRefreshTime = now + 100;
      log.info(`Source ${sourceId} never refreshed, scheduling immediate refresh`);
    }
    
    if (nextRefreshTime <= now) {
      log.warn(`Next refresh time ${nextRefreshTime} is in the past, adjusting to ${now + 1000}`);
      nextRefreshTime = now + 1000;
    }

    schedule.nextRefresh = nextRefreshTime;
    await this.schedules.set(sourceId, schedule);
    
    const delay = nextRefreshTime - now;
    log.info(`Updated schedule for source ${sourceId}: nextRefresh=${nextRefreshTime}, delay=${delay}ms, existing timer: ${this.timers.has(sourceId)}`);
    
    if (this.scheduleUpdateCallback) {
      this.scheduleUpdateCallback(sourceId, schedule);
    }
    
    this.scheduleSourceTimer(sourceId, delay);
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
    this.clearSourceTimer(sourceId);
    
    if (this.isDestroyed || this.isPaused) return;
    
    if (delay <= 0) {
      log.warn(`Invalid delay ${delay}ms for source ${sourceId}, using minimum delay`);
      delay = 100;
    }
    log.info(`Scheduling timer for source ${sourceId} with delay ${delay}ms`);
    const timerId = setTimeout(async () => {
      log.info(`Timer fired for source ${sourceId}`);
      if (this.isDestroyed || this.isPaused) {
        log.warn(`Scheduler ${this.isDestroyed ? 'destroyed' : 'paused'}, skipping refresh for ${sourceId}`);
        return;
      }
      
      try {
        await this.triggerRefresh(sourceId, 'scheduled');
      } catch (error) {
        log.error(`Error triggering scheduled refresh for ${sourceId}:`, error);
      }
    }, delay);
    
    this.timers.set(sourceId, timerId);
    log.debug(`Timer ${timerId} stored for source ${sourceId}`);
  }

  clearSourceTimer(sourceId) {
    const timerId = this.timers.get(sourceId);
    if (timerId) {
      log.debug(`Clearing timer ${timerId} for source ${sourceId}`);
      clearTimeout(timerId);
      this.timers.delete(sourceId);
    }
  }

  /**
   * Trigger refresh for a source
   */
  async triggerRefresh(sourceId, reason = 'scheduled') {
    sourceId = String(sourceId);
    
    if (this.isDestroyed) return;
    
    if (await this.activeRefreshes.has(sourceId)) {
      log.debug(`Source ${sourceId} already refreshing, skipping`);
      return;
    }
    
    const schedule = await this.schedules.get(sourceId);
    if (!schedule) {
      log.warn(`No schedule found for source ${sourceId}`);
      return;
    }
    
    // Skip overdue triggers during HALF_OPEN to prevent duplicate test requests
    if (reason === 'overdue') {
      const circuitBreakerKey = formatCircuitBreakerKey('http', sourceId);
      const circuitBreaker = adaptiveCircuitBreakerManager.getBreaker(circuitBreakerKey, CIRCUIT_BREAKER_CONFIG);
      const status = circuitBreaker.getStatus();
      
      if (status.state === 'HALF_OPEN') {
        log.info(`Source ${sourceId} circuit breaker is HALF_OPEN, skipping ${reason} trigger to prevent duplicate test request`);
        return;
      }
    }
    
    try {
      await this.refreshSemaphore.withPermit(async () => {
        await this.activeRefreshes.add(sourceId);
        
        try {
          await this._performRefresh(sourceId, reason);
        } finally {
          await this.activeRefreshes.delete(sourceId);
        }
      });
    } catch (error) {
      log.error(`Refresh failed for source ${sourceId}:`, error);
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
      
      if (result && result.success !== false) {
        await this.updateScheduleOnSuccess(sourceId);
      } else {
        await this.updateScheduleOnFailure(sourceId);
      }
    } catch (error) {
      await this.updateScheduleOnFailure(sourceId);
      throw error;
    }
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
      return;
    }
    
    log.info('Network recovered from offline');
    
    const schedules = await this.schedules.entries();
    
    for (const [sourceId] of schedules) {
      await this.calculateAndScheduleNextRefresh(sourceId);
    }
  }

  /**
   * Handle time events from TimeManager
   */
  handleTimeEvents(events) {
    if (this.isDestroyed || this.isPaused) return;
    
    log.info('Time events detected', { count: events.length });
    
    this.rescheduleAllSources().catch(err => {
      log.error('Error rescheduling sources after time event:', err);
    });
  }

  /**
   * Reschedule all sources
   */
  async rescheduleAllSources() {
    const schedules = await this.schedules.entries();

    for (const [sourceId] of schedules) {
      await this.calculateAndScheduleNextRefresh(sourceId);
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
        if (await this.activeRefreshes.has(sourceId)) {
          log.debug(`Source ${sourceId} is already refreshing, skipping overdue check`);
          continue;
        }
        
        // Skip HALF_OPEN sources to prevent duplicate test requests
        const circuitBreakerKey = formatCircuitBreakerKey('http', sourceId);
        const circuitBreaker = adaptiveCircuitBreakerManager.getBreaker(circuitBreakerKey, CIRCUIT_BREAKER_CONFIG);
        const status = circuitBreaker.getStatus();
        if (status.state === 'HALF_OPEN') {
          log.debug(`Source ${sourceId} circuit breaker is HALF_OPEN, skipping overdue check to prevent duplicate requests`);
          continue;
        }
        
        if (!schedule.lastRefresh) {
          log.debug(`Source ${sourceId} never refreshed, marking as overdue`);
          overdueSources.push({ sourceId, priority: 1 });
        } else {
          const expectedRefreshTime = schedule.lastRefresh + schedule.intervalMs;
          const overdueBy = now - expectedRefreshTime;
          log.debug(`Source ${sourceId}: lastRefresh=${schedule.lastRefresh}, intervalMs=${schedule.intervalMs}, overdueBy=${overdueBy}ms`);
          if (overdueBy > OVERDUE_RETRY_CONFIG.overdueBuffer) {
            log.debug(`Source ${sourceId} is overdue by ${overdueBy}ms`);
            overdueSources.push({ sourceId, overdueBy, priority: 2 });
          }
        }
      }
      
      const sourcesWithOpenCircuits = [];
      for (const [sourceId] of schedules) {
        const circuitBreakerKey = formatCircuitBreakerKey('http', sourceId);
        const circuitBreaker = adaptiveCircuitBreakerManager.getBreaker(circuitBreakerKey, CIRCUIT_BREAKER_CONFIG);
        if (circuitBreaker.isOpen()) {
          const status = circuitBreaker.getStatus();
          const timeUntilNextAttempt = status.backoff.timeUntilNextAttempt;
          
          if (timeUntilNextAttempt <= 1000) {
            log.info(`Circuit breaker for source ${sourceId} timer expired/expiring, adding to retry queue`);
            sourcesWithOpenCircuits.push({ 
              sourceId, 
              priority: 0,
              reason: 'circuit-breaker-retry'
            });
          }
        }
      }
      
      const allSourcesToRefresh = [...sourcesWithOpenCircuits, ...overdueSources];
      
      if (allSourcesToRefresh.length > 0) {
        log.info(`Found ${allSourcesToRefresh.length} sources to refresh (${sourcesWithOpenCircuits.length} circuit retries, ${overdueSources.length} overdue)`);
        
        // Sort by priority and overdue time
        allSourcesToRefresh.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return (b.overdueBy || 0) - (a.overdueBy || 0);
        });
        
        // Process in batches with rate limiting
        const batchSize = 3;
        const batchDelay = 5000;
        
        for (let i = 0; i < allSourcesToRefresh.length; i += batchSize) {
          const batch = allSourcesToRefresh.slice(i, i + batchSize);
          
          log.info(`Processing batch of ${batch.length} sources`);
          
          for (const item of batch) {
            const { sourceId, reason } = item;
            const jitter = Math.random() * 2000;
            const currentSourceId = sourceId;
            const currentReason = reason || 'overdue';
            setTimeout(() => {
              log.info(`Triggering refresh for source ${currentSourceId} (reason: ${currentReason})`);
              this.triggerRefresh(currentSourceId, currentReason).catch(err => {
                log.error(`Error refreshing source ${currentSourceId}:`, err);
              });
            }, Math.floor(jitter));
          }
          
          if (i + batchSize < allSourcesToRefresh.length) {
            log.debug(`Waiting ${batchDelay}ms before next batch`);
            await new Promise(resolve => setTimeout(resolve, batchDelay));
          }
        }
      } else {
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
   * Pause all timers (for system sleep)
   */
  async pauseAllTimers() {
    log.info('Pausing all refresh timers');
    
    this.isPaused = true;
    
    for (const [, timerId] of this.timers) {
      clearTimeout(timerId);
    }
    this.timers.clear();
    
    this.stopOverdueCheck();
  }

  /**
   * Resume after system sleep
   */
  async resumeAfterSleep() {
    log.info('Resuming after system sleep');
    
    this.isPaused = false;
    this.startOverdueCheck();
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
    
    await this.calculateAndScheduleNextRefresh(sourceId);
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
   * Clean up scheduler resources
   */
  async destroy() {
    this.isDestroyed = true;
    
    this.stopOverdueCheck();
    
    for (const [, timerId] of this.timers) {
      clearTimeout(timerId);
    }
    this.timers.clear();
    
    if (this.timeEventUnsubscribe) {
      this.timeEventUnsubscribe();
      this.timeEventUnsubscribe = null;
    }
    
    const activeCount = await this.activeRefreshes.size();
    if (activeCount > 0) {
      log.info(`Waiting for ${activeCount} active refreshes to complete`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    await this.schedules.clear();
    await this.activeRefreshes.clear();
    
    log.debug('Scheduler destroyed');
  }

}

module.exports = NetworkAwareScheduler;