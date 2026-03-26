/**
 * SourceRefreshService — main-process owner of the source content lifecycle.
 *
 * Responsibilities:
 *  - Eager initial fetch for HTTP sources (eliminates the renderer-latency race)
 *  - Scheduled refresh (timers, intervals)
 *  - Circuit breaker / retry per source
 *  - Network-aware pause/resume
 *  - Notifies WebSocket service and renderer when content changes
 */

import electron from 'electron';
import mainLogger from '../../utils/mainLogger';
import { errorMessage } from '../../types/common';
import { fetchSourceContent } from './SourceFetcher';
import type { FetchResult, RefreshStatusInfo } from '../../types/source-refresh';
import { AdaptiveCircuitBreakerManager } from '../../shared/AdaptiveCircuitBreaker';
import { ConcurrentMap, RequestDeduplicator } from '../../shared/ConcurrencyControl';
import {
    CIRCUIT_BREAKER_CONFIG,
    INITIAL_RETRY_CONFIG,
    OVERDUE_RETRY_CONFIG,
    calculateDelayWithJitter,
    formatCircuitBreakerKey
} from '../../shared/retryConfig';
import type { HttpRequestService } from '../http/HttpRequestService';
import type { Source } from '../../types/source';

const { createLogger } = mainLogger;
const log = createLogger('SourceRefreshService');

// ── Types ────────────────────────────────────────────────────────────

interface NetworkServiceLike {
    getState(): { isOnline: boolean; networkQuality: string };
    on(event: string, cb: (event: { newState?: { isOnline: boolean; networkQuality: string } }) => void): void;
}

interface ScheduleEntry {
    sourceId: string;
    intervalMs: number;
    lastRefresh: number | null;
    nextRefresh: number | null;
    failureCount: number;
    isTemporary?: boolean;
}

type ContentUpdateCallback = (sourceId: string, result: FetchResult) => void;
type StatusChangeCallback = (sourceId: string, status: RefreshStatusInfo) => void;
type ScheduleUpdateCallback = (sourceId: string, lastRefresh: number | null, nextRefresh: number | null) => void;

// ── Service ──────────────────────────────────────────────────────────

class SourceRefreshService {
    private sources: ConcurrentMap<Source>;
    private schedules: ConcurrentMap<ScheduleEntry>;
    private timers: Map<string, ReturnType<typeof setTimeout>>;
    private activeRefreshes: Set<string>;
    private deduplicator: RequestDeduplicator;
    private circuitBreakerManager: AdaptiveCircuitBreakerManager;

    private networkService: NetworkServiceLike | null;
    private httpRequestService: HttpRequestService | null;

    /** Active workspace ID — scopes TOTP cooldowns per workspace. Set by WorkspaceStateService. */
    activeWorkspaceId: string;

    private overdueCheckTimer: ReturnType<typeof setInterval> | null;
    private isDestroyed: boolean;
    private isPaused: boolean;

    // Callbacks
    onContentUpdate: ContentUpdateCallback | null;
    onStatusChange: StatusChangeCallback | null;
    onScheduleUpdate: ScheduleUpdateCallback | null;

    constructor() {
        this.sources = new ConcurrentMap<Source>('refresh-sources');
        this.schedules = new ConcurrentMap<ScheduleEntry>('refresh-schedules');
        this.timers = new Map();
        this.activeRefreshes = new Set();
        this.deduplicator = new RequestDeduplicator();
        this.circuitBreakerManager = new AdaptiveCircuitBreakerManager(CIRCUIT_BREAKER_CONFIG);

        this.networkService = null;
        this.httpRequestService = null;
        this.activeWorkspaceId = 'default-personal';

        this.overdueCheckTimer = null;
        this.isDestroyed = false;
        this.isPaused = false;

        this.onContentUpdate = null;
        this.onStatusChange = null;
        this.onScheduleUpdate = null;
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    /**
     * Called by ServiceRegistry — starts timers and power-monitor listeners.
     * Dependencies must be wired first via configure().
     */
    initialize(): void {
        // Subscribe to system sleep/wake
        try {
            electron.powerMonitor.on('suspend', () => this.handleSystemSleep());
            electron.powerMonitor.on('resume', () => {
                this.handleSystemWake().catch(err => {
                    log.error('Error handling system wake:', errorMessage(err));
                });
            });
        } catch (e) {
            log.debug('Could not subscribe to power monitor:', errorMessage(e));
        }

        // Start overdue checker
        this.overdueCheckTimer = setInterval(() => {
            this.checkOverdueSources().catch(err => {
                log.error('Error in overdue check:', errorMessage(err));
            });
        }, 30000);

        log.info('SourceRefreshService initialized');
    }

    /**
     * Wire dependencies after all services are initialized.
     * Called from lifecycle.ts after serviceRegistry.initializeAll().
     */
    configure(networkService: NetworkServiceLike | null, httpRequestService: HttpRequestService): void {
        this.networkService = networkService;
        this.httpRequestService = httpRequestService;

        if (networkService) {
            networkService.on('state-changed', (event) => {
                if (event.newState) {
                    this.handleNetworkChange(event.newState).catch(err => {
                        log.error('Error handling network change:', errorMessage(err));
                    });
                }
            });
        }

        log.info('SourceRefreshService configured with dependencies');
    }

    async shutdown(): Promise<void> {
        this.isDestroyed = true;

        if (this.overdueCheckTimer) {
            clearInterval(this.overdueCheckTimer);
            this.overdueCheckTimer = null;
        }

        for (const [, timerId] of this.timers) {
            clearTimeout(timerId);
        }
        this.timers.clear();

        await this.sources.clear();
        await this.schedules.clear();

        log.info('SourceRefreshService shut down');
    }

    // ── Source management ────────────────────────────────────────────

    async addSource(source: Source): Promise<void> {
        if (source.sourceType !== 'http') return;
        if (source.activationState === 'waiting_for_deps') return;

        const sourceId = String(source.sourceId);
        await this.sources.set(sourceId, source);

        // If source has refresh enabled, schedule it
        if (source.refreshOptions?.enabled && source.refreshOptions.interval && source.refreshOptions.interval > 0) {
            await this.scheduleSource(source);
        }

        // If source has no content, do an eager initial fetch
        if (source.sourceContent === null || source.sourceContent === undefined) {
            log.info(`Source ${sourceId} has no content, triggering eager initial fetch`);
            this.refreshSource(sourceId, { reason: 'initial' }).catch(err => {
                log.error(`Eager initial fetch failed for source ${sourceId}:`, errorMessage(err));
            });
        }
    }

    async updateSource(source: Source): Promise<void> {
        if (source.sourceType !== 'http') return;

        const sourceId = String(source.sourceId);
        const existing = await this.sources.get(sourceId);

        if (!existing) {
            await this.addSource(source);
            return;
        }

        await this.sources.set(sourceId, source);

        // Handle schedule changes
        const wasEnabled = existing.refreshOptions?.enabled && (existing.refreshOptions.interval ?? 0) > 0;
        const isEnabled = source.refreshOptions?.enabled && (source.refreshOptions.interval ?? 0) > 0;

        if (!wasEnabled && isEnabled) {
            await this.scheduleSource(source);
            if (!source.sourceContent) {
                this.refreshSource(sourceId, { reason: 'auto-refresh-enabled' }).catch(err => {
                    log.error(`Failed refresh for ${sourceId}:`, errorMessage(err));
                });
            }
        } else if (wasEnabled && !isEnabled) {
            this.unscheduleSource(sourceId);
            await this.schedules.delete(sourceId);
        } else if (isEnabled) {
            const oldInterval = existing.refreshOptions?.interval;
            const newInterval = source.refreshOptions!.interval!;
            if (oldInterval !== newInterval) {
                const schedule = await this.schedules.get(sourceId);
                if (schedule && this.timers.has(sourceId)) {
                    // A timer is actively running — let it complete its current cycle.
                    // Update the stored interval so the NEW value is used by
                    // calculateAndScheduleNext after the current timer fires.
                    schedule.intervalMs = this.parseInterval(newInterval) ?? schedule.intervalMs;
                    await this.schedules.set(sourceId, schedule);
                    log.info(`Source ${sourceId} interval changed to ${newInterval}m — active timer preserved, new interval applies after next refresh`);
                } else {
                    // No active timer — schedule from scratch with the new interval
                    await this.scheduleSource(source);
                }
            }
        }
    }

    async removeSource(sourceId: string): Promise<void> {
        sourceId = String(sourceId);
        this.unscheduleSource(sourceId);
        await this.schedules.delete(sourceId);
        await this.sources.delete(sourceId);

        const cbKey = formatCircuitBreakerKey('http', sourceId);
        this.circuitBreakerManager.breakers.delete(cbKey);
    }

    async removeSourcesNotIn(activeIds: Set<string>): Promise<void> {
        const allKeys = await this.sources.keys();
        for (const key of allKeys) {
            if (!activeIds.has(key)) {
                log.info(`Removing source ${key} — no longer in active set`);
                await this.removeSource(key);
            }
        }
    }

    async clearAllSources(): Promise<void> {
        const keys = await this.sources.keys();
        for (const key of keys) {
            this.unscheduleSource(key);
        }
        await this.sources.clear();
        await this.schedules.clear();
        this.circuitBreakerManager.breakers.clear();
        log.info('All sources cleared');
    }

    // ── Refresh execution ───────────────────────────────────────────

    async refreshSource(sourceId: string, options: { reason?: string; bypassCircuitBreaker?: boolean } = {}): Promise<{ success: boolean; error?: string }> {
        sourceId = String(sourceId);
        const { reason = 'auto', bypassCircuitBreaker = false } = options;

        const source = await this.sources.get(sourceId);
        if (!source) {
            return { success: false, error: 'Source not found' };
        }

        if (!this.httpRequestService) {
            return { success: false, error: 'HttpRequestService not available' };
        }

        const dedupKey = `refresh-${sourceId}`;
        return this.deduplicator.execute(dedupKey, async () => {
            if (this.activeRefreshes.has(sourceId)) {
                return { success: false, error: 'Already refreshing' };
            }

            this.activeRefreshes.add(sourceId);
            this.emitStatus(sourceId, {
                isRefreshing: true,
                failureCount: 0,
                circuitBreaker: this.getCircuitBreakerInfo(sourceId)
            });

            try {
                const cbKey = formatCircuitBreakerKey('http', sourceId);
                const breaker = this.circuitBreakerManager.getBreaker(cbKey, CIRCUIT_BREAKER_CONFIG);

                const result = await breaker.execute(
                    () => fetchSourceContent(source, this.httpRequestService!, this.activeWorkspaceId),
                    { bypassIfOpen: bypassCircuitBreaker, reason }
                );

                // Success — update source content and persist lastRefresh
                const now = Date.now();
                source.sourceContent = result.content;
                source.originalResponse = result.originalResponse;
                source.responseHeaders = result.headers;
                source.isFiltered = result.isFiltered;
                source.filteredWith = result.filteredWith ?? null;
                source.needsInitialFetch = false;
                if (source.refreshOptions) {
                    source.refreshOptions.lastRefresh = now;
                }
                await this.sources.set(sourceId, source);

                // Update schedule
                const schedule = await this.schedules.get(sourceId);
                if (schedule) {
                    schedule.lastRefresh = now;
                    schedule.failureCount = 0;
                    await this.schedules.set(sourceId, schedule);

                    // Clean up temporary schedules
                    if (schedule.isTemporary) {
                        this.unscheduleSource(sourceId);
                    } else {
                        this.calculateAndScheduleNext(sourceId);
                    }
                }

                // Notify listeners
                if (this.onContentUpdate) {
                    this.onContentUpdate(sourceId, result);
                }

                this.emitStatus(sourceId, {
                    isRefreshing: false,
                    lastRefresh: now,
                    success: true,
                    failureCount: 0,
                    circuitBreaker: this.getCircuitBreakerInfo(sourceId)
                });

                log.info(`Source ${sourceId} refreshed successfully (reason: ${reason})`);
                return { success: true };

            } catch (error) {
                const cbInfo = this.getCircuitBreakerInfo(sourceId);
                log.error(`Source ${sourceId} refresh failed (reason: ${reason}):`, errorMessage(error));

                this.emitStatus(sourceId, {
                    isRefreshing: false,
                    success: false,
                    error: errorMessage(error),
                    failureCount: cbInfo.failureCount,
                    circuitBreaker: cbInfo
                });

                // Schedule retry and notify renderer of next attempt time
                const now = Date.now();
                let retryDelay: number;

                if (cbInfo.failureCount < INITIAL_RETRY_CONFIG.failuresBeforeCircuitOpen) {
                    retryDelay = calculateDelayWithJitter(INITIAL_RETRY_CONFIG.baseDelay, INITIAL_RETRY_CONFIG.maxJitter);
                } else if (cbInfo.timeUntilNextAttemptMs > 0) {
                    retryDelay = cbInfo.timeUntilNextAttemptMs;
                } else {
                    retryDelay = calculateDelayWithJitter(
                        OVERDUE_RETRY_CONFIG.circuitBreakerRetryDelay.base,
                        OVERDUE_RETRY_CONFIG.circuitBreakerRetryDelay.maxJitter
                    );
                }

                this.scheduleTimer(sourceId, retryDelay);

                // Update schedule so the renderer can show a live countdown
                const schedule = await this.schedules.get(sourceId);
                if (schedule) {
                    schedule.nextRefresh = now + retryDelay;
                    schedule.failureCount = cbInfo.failureCount;
                    await this.schedules.set(sourceId, schedule);
                }
                if (this.onScheduleUpdate) {
                    this.onScheduleUpdate(sourceId, schedule?.lastRefresh ?? null, now + retryDelay);
                }

                return { success: false, error: errorMessage(error) };
            } finally {
                this.activeRefreshes.delete(sourceId);
            }
        });
    }

    async manualRefresh(sourceId: string): Promise<{ success: boolean; error?: string }> {
        return this.refreshSource(sourceId, { reason: 'manual', bypassCircuitBreaker: true });
    }

    /**
     * Reset the circuit breaker for a source. Called when environment variables
     * change — sources that depended on env vars (waiting_for_deps → active) or
     * sources whose templated credentials just changed need a clean slate.
     */
    resetCircuitBreaker(sourceId: string): void {
        const cbKey = formatCircuitBreakerKey('http', sourceId);
        this.circuitBreakerManager.breakers.delete(cbKey);
        log.info(`Circuit breaker reset for source ${sourceId}`);
    }

    // ── Scheduling ──────────────────────────────────────────────────

    private async scheduleSource(source: Source): Promise<void> {
        const sourceId = String(source.sourceId);
        const intervalMs = this.parseInterval(source.refreshOptions?.interval);
        if (!intervalMs) return;

        const existing = await this.schedules.get(sourceId);
        const schedule: ScheduleEntry = {
            sourceId,
            intervalMs,
            // Use the best available lastRefresh timestamp:
            // 1. Internal schedule state (if already running)
            // 2. Persisted refreshOptions.lastRefresh (survives app restart)
            // 3. Persisted refreshStatus.lastRefresh (legacy fallback)
            // 4. null — triggers immediate refresh (source is overdue or never tracked)
            lastRefresh: existing?.lastRefresh
                ?? source.refreshOptions?.lastRefresh
                ?? source.refreshStatus?.lastRefresh
                ?? null,
            nextRefresh: null,
            failureCount: 0
        };

        await this.schedules.set(sourceId, schedule);
        this.calculateAndScheduleNext(sourceId);
    }

    private unscheduleSource(sourceId: string): void {
        const timerId = this.timers.get(sourceId);
        if (timerId) {
            clearTimeout(timerId);
            this.timers.delete(sourceId);
        }
        // Don't delete from this.schedules here — caller decides
    }

    private calculateAndScheduleNext(sourceId: string): void {
        // Fire-and-forget async since we can't make the scheduling synchronous
        this._calculateAndScheduleNextAsync(sourceId).catch(err => {
            log.error(`Error scheduling next refresh for ${sourceId}:`, errorMessage(err));
        });
    }

    private async _calculateAndScheduleNextAsync(sourceId: string): Promise<void> {
        const schedule = await this.schedules.get(sourceId);
        if (!schedule) return;

        const now = Date.now();
        const networkState = this.networkService?.getState();

        if (networkState && !networkState.isOnline) {
            schedule.nextRefresh = (schedule.lastRefresh || now) + schedule.intervalMs;
            await this.schedules.set(sourceId, schedule);
            return; // Don't schedule timer when offline
        }

        // Check circuit breaker
        const cbKey = formatCircuitBreakerKey('http', sourceId);
        const breaker = this.circuitBreakerManager.getBreaker(cbKey, CIRCUIT_BREAKER_CONFIG);
        const cbStatus = breaker.getStatus();

        let nextRefreshTime: number;

        if (cbStatus.failureCount > 0 || breaker.isOpen()) {
            if (breaker.isOpen()) {
                const timeUntil = cbStatus.backoff.timeUntilNextAttemptMs;
                nextRefreshTime = timeUntil > 0
                    ? now + timeUntil
                    : now + calculateDelayWithJitter(OVERDUE_RETRY_CONFIG.circuitBreakerRetryDelay.base, OVERDUE_RETRY_CONFIG.circuitBreakerRetryDelay.maxJitter);
            } else {
                nextRefreshTime = now + calculateDelayWithJitter(INITIAL_RETRY_CONFIG.baseDelay, INITIAL_RETRY_CONFIG.maxJitter);
            }
        } else if (schedule.lastRefresh) {
            const timeSince = now - schedule.lastRefresh;
            if (timeSince > schedule.intervalMs) {
                nextRefreshTime = now + calculateDelayWithJitter(OVERDUE_RETRY_CONFIG.minDelay, OVERDUE_RETRY_CONFIG.maxJitter);
            } else {
                nextRefreshTime = schedule.lastRefresh + schedule.intervalMs;
            }
        } else {
            nextRefreshTime = now + 100;
        }

        if (nextRefreshTime <= now) {
            nextRefreshTime = now + 100;
        }

        schedule.nextRefresh = nextRefreshTime;
        await this.schedules.set(sourceId, schedule);

        const delay = nextRefreshTime - now;
        this.scheduleTimer(sourceId, delay);

        if (this.onScheduleUpdate) {
            this.onScheduleUpdate(sourceId, schedule.lastRefresh, schedule.nextRefresh);
        }
    }

    private scheduleTimer(sourceId: string, delay: number): void {
        this.unscheduleSource(sourceId);
        if (this.isDestroyed || this.isPaused) return;
        if (delay <= 0) delay = 100;

        const timerId = setTimeout(() => {
            if (this.isDestroyed || this.isPaused) return;
            this.refreshSource(sourceId, { reason: 'scheduled' }).catch(err => {
                log.error(`Scheduled refresh failed for ${sourceId}:`, errorMessage(err));
            });
        }, delay);

        this.timers.set(sourceId, timerId);
    }

    private parseInterval(interval: string | number | undefined | null): number | null {
        if (!interval || interval === 'never') return null;
        if (typeof interval === 'number') {
            if (!isFinite(interval) || interval <= 0 || interval > 1440) return null;
            return interval * 60 * 1000;
        }
        const match = interval.toString().match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
        if (!match) return null;
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const multipliers: Record<string, number> = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };
        return value * multipliers[unit];
    }

    // ── Overdue check ───────────────────────────────────────────────

    private async checkOverdueSources(): Promise<void> {
        if (this.isDestroyed || this.isPaused) return;

        const networkState = this.networkService?.getState();
        if (networkState && !networkState.isOnline) return;

        const now = Date.now();
        const entries = await this.schedules.entries();

        for (const [sourceId, schedule] of entries) {
            if (this.activeRefreshes.has(sourceId)) continue;
            if (!schedule.lastRefresh) continue;

            const expectedTime = schedule.lastRefresh + schedule.intervalMs;
            const overdueBy = now - expectedTime;

            if (overdueBy > OVERDUE_RETRY_CONFIG.overdueBuffer) {
                // Check circuit breaker state
                const cbKey = formatCircuitBreakerKey('http', sourceId);
                const breaker = this.circuitBreakerManager.getBreaker(cbKey, CIRCUIT_BREAKER_CONFIG);
                if (breaker.getStatus().state === 'HALF_OPEN') continue;

                log.info(`Source ${sourceId} overdue by ${overdueBy}ms, triggering refresh`);
                this.refreshSource(sourceId, { reason: 'overdue' }).catch(err => {
                    log.error(`Overdue refresh failed for ${sourceId}:`, errorMessage(err));
                });
            }
        }
    }

    // ── Network / power events ──────────────────────────────────────

    private async handleNetworkChange(state: { isOnline: boolean }): Promise<void> {
        if (!state.isOnline) return;

        log.info('Network recovered, rescheduling all sources');
        const entries = await this.schedules.entries();
        for (const [sourceId] of entries) {
            this.calculateAndScheduleNext(sourceId);
        }
    }

    private handleSystemSleep(): void {
        log.info('System sleep — pausing all timers');
        this.isPaused = true;
        for (const [, timerId] of this.timers) {
            clearTimeout(timerId);
        }
        this.timers.clear();
    }

    private async handleSystemWake(): Promise<void> {
        log.info('System wake — resuming timers');
        this.isPaused = false;

        const entries = await this.schedules.entries();
        for (const [sourceId] of entries) {
            this.calculateAndScheduleNext(sourceId);
        }
    }

    // ── Status queries ──────────────────────────────────────────────

    getRefreshStatus(sourceId: string): RefreshStatusInfo {
        sourceId = String(sourceId);
        const cbInfo = this.getCircuitBreakerInfo(sourceId);
        return {
            isRefreshing: this.activeRefreshes.has(sourceId),
            failureCount: cbInfo.failureCount,
            circuitBreaker: cbInfo
        };
    }

    async getTimeUntilRefresh(sourceId: string): Promise<number> {
        sourceId = String(sourceId);
        const schedule = await this.schedules.get(sourceId);
        if (!schedule?.nextRefresh) return 0;
        return Math.max(0, schedule.nextRefresh - Date.now());
    }

    private getCircuitBreakerInfo(sourceId: string) {
        const cbKey = formatCircuitBreakerKey('http', sourceId);
        const breaker = this.circuitBreakerManager.getBreaker(cbKey, CIRCUIT_BREAKER_CONFIG);
        const status = breaker.getStatus();
        return {
            state: status.state,
            isOpen: breaker.isOpen(),
            timeUntilNextAttemptMs: status.backoff.timeUntilNextAttemptMs,
            failureCount: status.totalFailuresInCycle || status.failureCount
        };
    }

    private emitStatus(sourceId: string, status: RefreshStatusInfo): void {
        if (this.onStatusChange) {
            this.onStatusChange(sourceId, status);
        }
    }
}

const sourceRefreshService = new SourceRefreshService();
export { SourceRefreshService, sourceRefreshService };
export default sourceRefreshService;
