const { createLogger } = require('../utils/error-handling/logger');
const log = createLogger('RefreshManager');
const NetworkAwareScheduler = require('./NetworkAwareScheduler');
const RefreshCoordinator = require('./RefreshCoordinator');
const timeManager = require('./TimeManager');
const { ConcurrentMap } = require('../utils/error-handling/ConcurrencyControl');
const { RequestDeduplicator } = require('../utils/error-handling/ConcurrencyControl');
const { adaptiveCircuitBreakerManager } = require('../utils/error-handling/AdaptiveCircuitBreaker');
const { CIRCUIT_BREAKER_CONFIG, formatCircuitBreakerKey } = require('../constants/retryConfig');

/**
 * RefreshManager - Coordinates source refreshing with circuit breaker protection
 */
class RefreshManager {
  constructor() {
    this.isInitialized = false;
    this.sources = new ConcurrentMap('sources');

    this.httpService = null;
    this.onUpdateCallback = null;
    this.scheduler = new NetworkAwareScheduler();
    this.coordinator = new RefreshCoordinator();
    this.deduplicator = new RequestDeduplicator();

    this.eventCleanup = [];

    this._cachedSchedules = new Map();
    this._statusCache = new Map();
    this.refreshSource = this.refreshSource.bind(this);
    this.handleNetworkStateSync = this.handleNetworkStateSync.bind(this);
    this.handleSystemWake = this.handleSystemWake.bind(this);
    this.handleSystemSleep = this.handleSystemSleep.bind(this);
    this.updateScheduleCache = this.updateScheduleCache.bind(this);

    this.lastCacheUpdate = 0;
    this.cacheUpdateInterval = null;
    this.startCacheUpdateInterval();
  }

  /**
   * Start the cache update interval
   */
  startCacheUpdateInterval() {
    if (this.cacheUpdateInterval) {
      clearInterval(this.cacheUpdateInterval);
    }

    this.cacheUpdateInterval = setInterval(async () => {
      try {
        const currentScheduleCount = await this.scheduler.schedules.size();
        if (currentScheduleCount > 0) {
          const now = Date.now();
          if (now - this.lastCacheUpdate > 10000) {
            await this.updateScheduleCache();
            this.lastCacheUpdate = now;
          }
        }
      } catch (error) {
        log.debug('Error updating cache in interval:', error);
      }
    }, 5000); // Changed from 1000ms to 5000ms to reduce overhead
  }

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

    const scheduleUpdateCallback = (sourceId, schedule) => {
      if (schedule.nextRefresh) {
        this.notifyUI(sourceId, undefined, {
          refreshOptions: {
            lastRefresh: schedule.lastRefresh,
            nextRefresh: schedule.nextRefresh,
            interval: schedule.intervalMs ? Math.floor(schedule.intervalMs / 60000) : null
          }
        });
      }
    };

    await this.scheduler.initialize(this.refreshSource, scheduleUpdateCallback);

    this.setupEventListeners();

    try {
      const networkState = await window.electronAPI.getNetworkState();
      if (networkState) {
        await this.scheduler.handleNetworkChange(networkState);
      }
    } catch (error) {
      log.warn('Failed to get initial network state:', error);
    }

    await this.updateScheduleCache();

    this.isInitialized = true;
  }

  setupEventListeners() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      if (window.electronAPI.onNetworkStateSync) {
        const networkHandler = this.handleNetworkStateSync;
        const cleanup = window.electronAPI.onNetworkStateSync(networkHandler);
        this.eventCleanup.push(cleanup);
      }

      if (window.electronAPI.onSystemSuspend) {
        const suspendHandler = this.handleSystemSleep;
        const cleanup = window.electronAPI.onSystemSuspend(suspendHandler);
        this.eventCleanup.push(cleanup);
      }

      if (window.electronAPI.onSystemResume) {
        const resumeHandler = this.handleSystemWake;
        const cleanup = window.electronAPI.onSystemResume(resumeHandler);
        this.eventCleanup.push(cleanup);
      }
    }
  }

  async handleNetworkStateSync(event) {
    if (!event || !event.state || typeof event.state.isOnline !== 'boolean') {
      log.warn('Invalid network state event received:', event);
      return;
    }

    await this.scheduler.handleNetworkChange(event.state);
  }

  async handleSystemWake() {
    log.info('System wake detected');

    try {
      const currentTimeInfo = await timeManager.getCurrentTimeInfo();
      log.info(`System wake in timezone: ${currentTimeInfo.timezone}`);
    } catch (error) {
      log.error('Failed to get timezone info on wake:', error);
    }

    timeManager.resumeMonitoring();
    this.lastCacheUpdate = 0;
    this.startCacheUpdateInterval();
    await this.scheduler.resumeAfterSleep();
    await this.checkNetworkAndRefresh();
  }

  async checkNetworkAndRefresh() {
    let networkReady = false;
    let retries = 0;
    const maxRetries = 15;
    const baseDelay = 3000; // Start with 3 seconds for corporate network scenarios
    let consecutiveGoodChecks = 0;
    const requiredGoodChecks = 2; // Require 2 consecutive good checks for stability

    log.info('Starting post-wake network stabilization check');

    while (!networkReady && retries < maxRetries) {
      try {
        const networkState = await window.electronAPI.getNetworkState();
        const isOnline = networkState && networkState.isOnline;
        const networkQuality = networkState?.networkQuality || 'unknown';
        const confidence = networkState?.confidence || 0;

        if (isOnline && (networkQuality === 'good' || networkQuality === 'excellent' || confidence > 0.6)) {
          consecutiveGoodChecks++;
          log.info(`Good network detected (${consecutiveGoodChecks}/${requiredGoodChecks} consecutive checks)`);

          if (consecutiveGoodChecks >= requiredGoodChecks) {
            networkReady = true;
            log.info('Network is stable and ready');
          }
        } else {
          if (consecutiveGoodChecks > 0) {
            log.info('Network quality dropped, resetting stability counter');
          }
          consecutiveGoodChecks = 0;
        }

        if (!networkReady) {
          const jitter = Math.random() * 1000;
          const delay = Math.min(baseDelay * Math.pow(1.5, retries), 30000) + jitter;
          log.info(`Network not stable yet, retry ${retries + 1}/${maxRetries} in ${Math.round(delay)}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
        }
      } catch (error) {
        log.error('Error checking network state:', error);
        consecutiveGoodChecks = 0;
        await new Promise(resolve => setTimeout(resolve, baseDelay));
        retries++;
      }
    }

    if (networkReady) {
      log.info('Network stable, waiting 2s for final settling before triggering refreshes');
      await new Promise(resolve => setTimeout(resolve, 2000));

      log.info('Network ready after wake, rescheduling sources');
      await this.scheduler.rescheduleAllSources();
      await this.scheduler.checkOverdueSources();
    } else {
      log.warn('Network stability not achieved within timeout, deferring refreshes');
    }
  }

  async handleSystemSleep() {
    log.info('System sleep detected');

    if (this.cacheUpdateInterval) {
      clearInterval(this.cacheUpdateInterval);
      this.cacheUpdateInterval = null;
    }

    await this.scheduler.pauseAllTimers();
    timeManager.pauseMonitoring();
  }

  async addSource(source) {
    if (!this.isInitialized || source.sourceType !== 'http') {
      return;
    }

    if (source.activationState === 'waiting_for_deps') {
      log.info(`Source ${source.sourceId} is waiting for dependencies: ${source.missingDependencies?.join(', ')}. Skipping refresh setup.`);
      return;
    }

    const sourceId = RefreshManager.normalizeSourceId(source.sourceId);

    const normalizedSource = {
      ...source,
      sourceId
    };

    await this.sources.set(sourceId, normalizedSource);

    if (source.refreshOptions?.enabled && source.refreshOptions?.interval > 0) {
      await this.scheduler.scheduleSource(normalizedSource);

      if (!source.refreshOptions?.lastRefresh) {
        log.info(`Triggering immediate refresh for new source ${sourceId}`);
        this.refreshSource(sourceId, { reason: 'initial' }).catch(err => {
          log.error(`Failed to perform initial refresh for ${sourceId}:`, err);
        });
      }

      this.lastCacheUpdate = 0;
      await this.updateScheduleCache();
    }
  }

  async updateSource(source) {
    if (source.sourceType !== 'http') return;

    if (source.activationState === 'waiting_for_deps') {
      log.info(`Source ${source.sourceId} is waiting for dependencies. Removing from refresh schedule if present.`);
      const sourceId = RefreshManager.normalizeSourceId(source.sourceId);
      await this.scheduler.unscheduleSource(sourceId);
      return;
    }

    const sourceId = RefreshManager.normalizeSourceId(source.sourceId);

    const normalizedSource = {
      ...source,
      sourceId
    };

    const existingSource = await this.sources.get(sourceId);

    if (!existingSource) {
      await this.addSource(normalizedSource);
      return;
    }

    await this.sources.set(sourceId, normalizedSource);

    const wasEnabled = existingSource.refreshOptions?.enabled && existingSource.refreshOptions?.interval > 0;
    const isEnabled = normalizedSource.refreshOptions?.enabled && normalizedSource.refreshOptions?.interval > 0;

    if (!wasEnabled && isEnabled) {
      log.info(`Auto-refresh enabled for ${sourceId}`);
      await this.scheduler.scheduleSource(normalizedSource);

      if (!normalizedSource.refreshOptions?.lastRefresh || !normalizedSource.sourceContent) {
        log.info(`Triggering immediate refresh for source ${sourceId} after enabling auto-refresh`);
        this.refreshSource(sourceId, { reason: 'auto-refresh-enabled' }).catch(err => {
          log.error(`Failed to perform initial refresh for ${sourceId}:`, err);
        });
      }
    } else if (wasEnabled && !isEnabled) {
      log.info(`Auto-refresh disabled for ${sourceId}, keeping for manual refresh`);
      await this.scheduler.unscheduleSource(sourceId);

      this.notifyUI(sourceId, undefined, {
        refreshOptions: {
          ...normalizedSource.refreshOptions,
          lastRefresh: null,
          nextRefresh: null
        }
      });

      this.lastCacheUpdate = 0;
      await this.updateScheduleCache();
    } else if (isEnabled) {
      const oldInterval = existingSource.refreshOptions?.interval;
      const newInterval = normalizedSource.refreshOptions.interval;

      if (oldInterval !== newInterval) {
        log.info(`Interval changed for ${sourceId}: ${oldInterval} -> ${newInterval}`);

        const lastRefresh = normalizedSource.refreshOptions?.lastRefresh || existingSource.refreshOptions?.lastRefresh;
        if (lastRefresh) {
          const now = timeManager.now();
          const newIntervalMs = newInterval * 60 * 1000;
          const timeSinceLastRefresh = now - lastRefresh;

          if (timeSinceLastRefresh > newIntervalMs) {
            log.info(`Source ${sourceId} is overdue according to new interval, triggering refresh`);
            this.refreshSource(sourceId, { reason: 'interval-changed-overdue' }).catch(err => {
              log.error(`Failed to refresh overdue source ${sourceId}:`, err);
            });
          }
        }
      }

      if (!normalizedSource.refreshOptions?.preserveTiming) {
        await this.scheduler.scheduleSource(normalizedSource);
        log.info(`Rescheduled source ${sourceId} with new interval`);
      } else {
        log.info(`Preserving existing timer for ${sourceId}, only updating interval`);
        const schedule = await this.scheduler.schedules.get(sourceId);
        if (schedule) {
          const oldIntervalMs = schedule.intervalMs;
          const newIntervalMs = newInterval * 60 * 1000;
          schedule.intervalMs = newIntervalMs;

          if (oldIntervalMs !== newIntervalMs && schedule.lastRefresh) {
            const now = timeManager.now();

            if (normalizedSource.refreshOptions?.preserveTiming) {
              schedule.nextRefresh = now + newIntervalMs;
              schedule.lastRefresh = now;
              log.info(`Interval changed without immediate refresh for ${sourceId}: resetting timer to full ${newInterval}m from now`);
            } else {
              schedule.nextRefresh = schedule.lastRefresh + newIntervalMs;

              if (schedule.nextRefresh <= now) {
                log.info(`Source ${sourceId} would be overdue with new interval, scheduling immediate refresh`);
                schedule.nextRefresh = now + 1000;
              }
            }

            log.info(`Updated nextRefresh for ${sourceId}: lastRefresh=${schedule.lastRefresh}, newInterval=${newInterval}m, nextRefresh=${schedule.nextRefresh}, timeSinceNow=${schedule.nextRefresh - now}ms`);
          }

          await this.scheduler.schedules.set(sourceId, schedule);

          normalizedSource.refreshOptions.lastRefresh = schedule.lastRefresh;
          normalizedSource.refreshOptions.nextRefresh = schedule.nextRefresh;
          await this.sources.set(sourceId, normalizedSource);

          await this.scheduler.calculateAndScheduleNextRefresh(sourceId);

          if (this.scheduler.scheduleUpdateCallback) {
            this.scheduler.scheduleUpdateCallback(sourceId, schedule);
          }

          this.notifyUI(sourceId, undefined, {
            refreshOptions: {
              ...normalizedSource.refreshOptions,
              lastRefresh: schedule.lastRefresh,
              nextRefresh: schedule.nextRefresh,
              interval: newInterval
            }
          });
        }
      }

      this.lastCacheUpdate = 0;
      await this.updateScheduleCache();
    }
  }

  async removeSource(sourceId) {
    sourceId = RefreshManager.normalizeSourceId(sourceId);

    if (!(await this.sources.has(sourceId))) return;

    await this.sources.delete(sourceId);
    await this.scheduler.unscheduleSource(sourceId);
    await this.coordinator.cancelRefresh(sourceId);

    this._cachedSchedules.delete(sourceId);
    this._statusCache.delete(sourceId);

    // Clean up circuit breaker for this source
    const circuitBreakerKey = formatCircuitBreakerKey('http', sourceId);
    if (adaptiveCircuitBreakerManager.breakers.has(circuitBreakerKey)) {
      adaptiveCircuitBreakerManager.breakers.delete(circuitBreakerKey);
      log.debug(`Removed circuit breaker for source ${sourceId}`);
    }

    log.debug(`Removed source ${sourceId}`);
  }

  async refreshSource(sourceId, options = {}) {
    sourceId = RefreshManager.normalizeSourceId(sourceId);

    const source = await this.sources.get(sourceId);
    if (!source) {
      log.warn(`Source ${sourceId} not found`);
      return { success: false, error: 'Source not found' };
    }

    const dedupKey = `refresh-${sourceId}`;

    return this.deduplicator.execute(dedupKey, async () => {
      const result = await this.coordinator.executeRefresh(
          sourceId,
          async (id) => this.performRefresh(id, source, options),
          {
            ...options,
            timeout: await this.getNetworkTimeout()
          }
      );

      if (result.success) {
        this.lastCacheUpdate = 0;
        await this.updateScheduleCache();

        const manualReasons = ['manual', 'env-change', 'interval-changed-overdue', 'auto-refresh-enabled'];
        if (manualReasons.includes(options.reason) && source.refreshOptions?.enabled) {
          log.info(`Manual-type refresh completed for ${sourceId} (reason: ${options.reason}), updating schedule`);
          await this.scheduler.updateLastRefresh(sourceId, timeManager.now());
        }
      }

      return result;
    });
  }

  async performRefresh(sourceId, source, options = {}) {
    const startTime = timeManager.now();
    const { reason = 'auto' } = options;
    const isManualRefresh = reason === 'manual';


    const circuitBreakerKey = formatCircuitBreakerKey('http', sourceId);
    const circuitBreaker = adaptiveCircuitBreakerManager.getBreaker(circuitBreakerKey, CIRCUIT_BREAKER_CONFIG);

    const circuitStatus = circuitBreaker.getStatus();
    const isRetry = reason === 'circuit-breaker-retry' ||
        (reason === 'overdue' && circuitStatus.failureCount > 0) ||
        (reason === 'scheduled' && circuitStatus.failureCount > 0);

    const attemptNumber = isRetry ? Math.min(circuitStatus.failureCount + 1, 3) : 0;

    this.notifyUI(sourceId, undefined, {
      refreshStatus: {
        isRefreshing: true,
        startTime,
        reason: reason,
        isRetry: isRetry,
        attemptNumber: attemptNumber,
        totalAttempts: 3
      }
    });

    if (!this._statusCache.has(sourceId)) {
      this._statusCache.set(sourceId, {});
    }
    const statusCache = this._statusCache.get(sourceId);
    statusCache.isRefreshing = true;
    statusCache.isRetry = isRetry;
    statusCache.attemptNumber = attemptNumber;

    try {
      if (isManualRefresh && circuitBreaker.isOpen()) {
        log.info(`Manual refresh for ${sourceId} will bypass open circuit breaker`);
      }

      log.info(`Circuit breaker executing for ${sourceId}, current state: ${circuitBreaker.getStatus().state}`);

      const result = await circuitBreaker.execute(async () => {
        const timeout = await this.getNetworkTimeout();

        log.info(`Performing HTTP request for source ${sourceId} (reason: ${reason})`);

        const requestOptions = {
          ...source.requestOptions,
          timeout
        };

        const httpResult = await this.httpService.request(
            source.sourceId,
            source.sourcePath,
            source.sourceMethod,
            requestOptions,
            source.jsonFilter
        );

        log.info(`HTTP request completed successfully for source ${sourceId}`, {
          hasContent: !!httpResult?.content,
          hasOriginalResponse: !!httpResult?.originalResponse,
          hasRawResponse: !!httpResult?.rawResponse,
          contentPreview: httpResult?.content ? httpResult.content.substring(0, 100) : 'no content'
        });

        return httpResult;
      }, {
        bypassIfOpen: isManualRefresh,
        reason: reason
      });

      const now = timeManager.now();
      
      // Check if this was a temporary schedule for retry (source without auto-refresh)
      const schedule = await this.scheduler.schedules.get(sourceId);
      if (schedule?.isTemporary) {
        log.info(`Cleaning up temporary retry schedule for source ${sourceId}`);
        await this.scheduler.unscheduleSource(sourceId);
      }
      
      // Don't immediately set next refresh to full interval - let scheduler handle it
      // This ensures retry logic continues to work after failures
      this.notifyUI(sourceId, result.content, {
        originalResponse: result.originalResponse,
        headers: result.headers,
        refreshStatus: {
          isRefreshing: false,
          lastRefresh: now,
          success: true,
          isRetry: false,
          attemptNumber: 0
        },
        refreshOptions: {
          ...source.refreshOptions,
          lastRefresh: now,
          // Don't set nextRefresh here - let scheduler calculate it
          interval: source.refreshOptions?.interval
        }
      });

      if (this._statusCache.has(sourceId)) {
        const statusCache = this._statusCache.get(sourceId);
        statusCache.isRefreshing = false;
        statusCache.isRetry = false;
        statusCache.attemptNumber = 0;
      }

      log.info(`Circuit breaker execution succeeded for ${sourceId}`);
      return result;

    } catch (error) {
      log.error(`Failed to refresh ${sourceId}:`, error);

      const circuitStatusAfter = circuitBreaker.getStatus();
      log.info(`Circuit breaker state after failure: ${circuitStatusAfter.state}, failure count: ${circuitStatusAfter.failureCount}`);

      this.notifyUI(sourceId, null, {
        refreshStatus: {
          isRefreshing: false,
          lastRefresh: timeManager.now(),
          success: false,
          error: error.message,
          failureCount: circuitStatusAfter.failureCount
        }
      });

      if (this._statusCache.has(sourceId)) {
        const statusCache = this._statusCache.get(sourceId);
        statusCache.isRefreshing = false;
        statusCache.failureCount = circuitStatusAfter.failureCount;
      }

      // Schedule retry after failure
      // For manual refreshes without auto-refresh, we still want to retry on failures
      if (circuitStatusAfter.failureCount < 3 || (source.refreshOptions?.enabled && source.refreshOptions?.interval > 0)) {
        log.info(`Scheduling retry after failure for source ${sourceId} (failure count: ${circuitStatusAfter.failureCount}, auto-refresh: ${source.refreshOptions?.enabled})`);
        
        // For sources without auto-refresh, we need to temporarily add them to scheduler for retry
        if (!source.refreshOptions?.enabled || source.refreshOptions?.interval <= 0) {
          // Calculate retry delay immediately based on failure count
          const { INITIAL_RETRY_CONFIG } = require('../constants/retryConfig');
          const baseDelay = INITIAL_RETRY_CONFIG.baseDelay;
          const maxJitter = INITIAL_RETRY_CONFIG.maxJitter;
          const delay = baseDelay + Math.random() * maxJitter;
          
          // Create a temporary schedule just for retry attempts
          const tempSchedule = {
            sourceId,
            intervalMs: 60000, // Dummy interval, won't be used for regular scheduling
            lastRefresh: timeManager.now(),
            nextRefresh: timeManager.now() + delay, // Set immediate next refresh time
            retryCount: circuitStatusAfter.failureCount,
            maxRetries: 3,
            failureCount: circuitStatusAfter.failureCount,
            isTemporary: true // Mark as temporary for cleanup after success
          };
          await this.scheduler.schedules.set(sourceId, tempSchedule);
          
          // Also update the cached schedule immediately
          if (this._cachedSchedules) {
            this._cachedSchedules.set(sourceId, tempSchedule);
          }
        }
        
        await this.scheduler.calculateAndScheduleNextRefresh(sourceId);
      } else if (!source.refreshOptions?.enabled) {
        log.info(`Manual refresh failed ${circuitStatusAfter.failureCount} times for source ${sourceId}, circuit breaker will handle recovery`);
      }

      throw error;
    }
  }

  async getNetworkTimeout(baseTimeout = 15000) {
    const networkState = await window.electronAPI.getNetworkState();

    let timeout = baseTimeout;

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

    return Math.min(timeout, 60000);
  }

  async manualRefresh(sourceId) {
    sourceId = RefreshManager.normalizeSourceId(sourceId);

    log.info(`Manual refresh requested for ${sourceId}`);

    const result = await this.refreshSource(sourceId, {
      reason: 'manual',
      priority: 'high',
      skipIfActive: false
    });

    return result.success;
  }


  getTimeUntilRefresh(sourceId, sourceData = null) {
    sourceId = RefreshManager.normalizeSourceId(sourceId);

    const schedule = this._cachedSchedules.get(sourceId);
    if (schedule && schedule.nextRefresh) {
      const now = timeManager.now();
      const timeRemaining = schedule.nextRefresh - now;

      if (timeRemaining > 0) {
        return timeRemaining;
      } else if (timeRemaining < -1000 && !schedule.isTemporary) {
        // Only recalculate for non-temporary schedules (sources with auto-refresh)
        const overdueKey = `overdue-${sourceId}`;
        const now = timeManager.now();

        if (!this._overdueChecks) {
          this._overdueChecks = new Map();
        }

        const lastCheck = this._overdueChecks.get(overdueKey);
        if (!lastCheck || now - lastCheck > 2000) {
          this._overdueChecks.set(overdueKey, now);
          log.warn(`Source ${sourceId} is overdue by ${-timeRemaining}ms, triggering recalculation`);
          this.scheduler.calculateAndScheduleNextRefresh(sourceId).catch(err => {
            log.error(`Failed to recalculate schedule for overdue source ${sourceId}:`, err);
          });
        }
      }
    }

    if (sourceData) {
      if (!sourceData.refreshOptions?.enabled) {
        return 0;
      }

      const nextRefresh = sourceData.refreshOptions?.nextRefresh;
      if (nextRefresh) {
        const now = timeManager.now();
        const timeRemaining = nextRefresh - now;

        if (timeRemaining > 0) {
          return timeRemaining;
        } else if (timeRemaining < -1000) {
          const overdueKey = `overdue-${sourceId}`;
          const now = timeManager.now();

          if (!this._overdueChecks) {
            this._overdueChecks = new Map();
          }

          const lastCheck = this._overdueChecks.get(overdueKey);
          if (!lastCheck || now - lastCheck > 5000) {
            this._overdueChecks.set(overdueKey, now);
            log.warn(`Source ${sourceId} is overdue by ${-timeRemaining}ms (from sourceData), triggering recalculation`);
            this.scheduler.calculateAndScheduleNextRefresh(sourceId).catch(err => {
              log.error(`Failed to recalculate schedule for overdue source ${sourceId}:`, err);
            });
          }
        }
      }
    }

    return 0;
  }

  getRefreshStatus(sourceId) {
    sourceId = RefreshManager.normalizeSourceId(sourceId);

    const circuitBreakerKey = formatCircuitBreakerKey('http', sourceId);
    const circuitBreaker = adaptiveCircuitBreakerManager.getBreaker(circuitBreakerKey, CIRCUIT_BREAKER_CONFIG);
    const circuitStatus = circuitBreaker.getStatus();

    if (!this._statusCache) {
      this._statusCache = new Map();
    }
    const cachedStatus = this._statusCache.get(sourceId);

    return {
      isRefreshing: cachedStatus?.isRefreshing || false,
      isOverdue: cachedStatus?.isOverdue || false,
      isPaused: cachedStatus?.isPaused || false,
      consecutiveErrors: cachedStatus?.consecutiveErrors || 0,
      isRetry: cachedStatus?.isRetry || false,
      attemptNumber: cachedStatus?.attemptNumber || 0,
      failureCount: cachedStatus?.failureCount || 0,
      circuitBreaker: {
        state: circuitStatus.state,
        isOpen: circuitBreaker.isOpen(),
        canManualBypass: circuitBreaker.canManualBypass(),
        timeUntilNextAttempt: circuitBreaker.getTimeUntilNextAttempt(),
        timeUntilNextAttemptMs: circuitStatus.backoff.timeUntilNextAttemptMs,
        consecutiveOpenings: circuitStatus.backoff.consecutiveOpenings,
        currentTimeout: circuitStatus.backoff.currentTimeout,
        failureCount: circuitStatus.totalFailuresInCycle || circuitStatus.failureCount
      }
    };
  }


  notifyUI(sourceId, content, additionalData = {}) {
    if (!this.onUpdateCallback) return;
    this.onUpdateCallback(sourceId, content, additionalData);
  }
  async updateScheduleCache() {
    try {
      const schedules = await this.scheduler.schedules.entries();
      this._cachedSchedules.clear();
      schedules.forEach(([sourceId, schedule]) => {
        this._cachedSchedules.set(sourceId, schedule);
      });

      const sources = await this.sources.entries();
      sources.forEach(([sourceId, source]) => {
        if (source.sourceType === 'http') {
          const isRefreshing = this._statusCache.get(sourceId)?.isRefreshing || false;
          const circuitBreakerKey = formatCircuitBreakerKey('http', sourceId);
          const circuitBreaker = adaptiveCircuitBreakerManager.getBreaker(circuitBreakerKey, CIRCUIT_BREAKER_CONFIG);
          const circuitStatus = circuitBreaker.getStatus();

          this._statusCache.set(sourceId, {
            isRefreshing,
            isOverdue: false,
            isPaused: false,
            consecutiveErrors: circuitStatus.failureCount,
            circuitBreaker: {
              state: circuitStatus.state,
              isOpen: circuitBreaker.isOpen(),
              canManualBypass: circuitBreaker.canManualBypass(),
              timeUntilNextAttempt: circuitBreaker.getTimeUntilNextAttempt(),
              timeUntilNextAttemptMs: circuitStatus.backoff.timeUntilNextAttemptMs,
              consecutiveOpenings: circuitStatus.backoff.consecutiveOpenings,
              currentTimeout: circuitStatus.backoff.currentTimeout,
              failureCount: circuitStatus.totalFailuresInCycle || circuitStatus.failureCount
            }
          });
        }
      });

      if (this._cachedSchedules.size > 0) {
        log.debug(`Schedule cache updated: ${this._cachedSchedules.size} sources`);
      }
    } catch (error) {
      log.debug('Error updating schedule cache:', error);
    }
  }

  async destroy() {
    if (this.cacheUpdateInterval) {
      clearInterval(this.cacheUpdateInterval);
      this.cacheUpdateInterval = null;
    }

    await this.coordinator.destroy();
    await this.scheduler.destroy();
    
    // Clean up all circuit breakers
    const sourceIds = await this.sources.keys();
    for (const sourceId of sourceIds) {
      const circuitBreakerKey = formatCircuitBreakerKey('http', sourceId);
      if (adaptiveCircuitBreakerManager.breakers.has(circuitBreakerKey)) {
        adaptiveCircuitBreakerManager.breakers.delete(circuitBreakerKey);
      }
    }
    
    await this.sources.clear();

    this.eventCleanup.forEach(cleanup => cleanup());
    this.eventCleanup = [];

    this._cachedSchedules.clear();
    this._statusCache.clear();
    if (this._overdueChecks) {
      this._overdueChecks.clear();
    }

    this.httpService = null;
    this.onUpdateCallback = null;

    this.isInitialized = false;

    log.debug('RefreshManager destroyed');
  }
}

const refreshManager = new RefreshManager();
export default refreshManager;