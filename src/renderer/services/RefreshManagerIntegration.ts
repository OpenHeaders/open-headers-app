/**
 * RefreshManagerIntegration - Handles the integration between RefreshManager and React components
 * This service ensures RefreshManager is initialized once and provides a clean interface
 */

import refreshManager from './RefreshManager';
import { getCentralizedWorkspaceService } from './CentralizedWorkspaceService';
import { getCentralizedEnvironmentService } from './CentralizedEnvironmentService';
import { createLogger } from '../utils/error-handling/logger';
const log = createLogger('RefreshManagerIntegration');

interface SourceData {
    sourceId: string;
    sourceType: string;
    sourcePath?: string;
    sourceMethod?: string;
    sourceContent?: string;
    requestOptions?: Record<string, unknown>;
    jsonFilter?: Record<string, unknown>;
    refreshOptions?: { enabled?: boolean; interval?: number; [key: string]: unknown };
    activationState?: string;
    needsInitialFetch?: boolean;
    [key: string]: unknown;
}

interface ResolvedSourceData {
    sourcePath: string;
    requestOptions: Record<string, unknown>;
}

class RefreshManagerIntegration {
    initialized: boolean;
    initializing: boolean;
    httpService: any;
    updateCallback: ((sourceId: string, content: any, additionalData: Record<string, any>) => void) | null;
    sourceSubscriptionCleanup: (() => void) | null;
    envSubscriptionCleanup: (() => void) | null;
    lastSeenSources: Map<string, any>;
    envChangeDebounceTimer: ReturnType<typeof setTimeout> | null;
    sourceChangeDebounceTimers: Map<string, ReturnType<typeof setTimeout>>;
    sourceActivationCleanup?: (() => void) | null;

    constructor() {
        this.initialized = false;
        this.initializing = false;
        this.httpService = null;
        this.updateCallback = null;
        this.sourceSubscriptionCleanup = null;
        this.envSubscriptionCleanup = null;
        this.lastSeenSources = new Map();
        this.envChangeDebounceTimer = null;
        this.sourceChangeDebounceTimers = new Map();
    }

    /**
     * Initialize the RefreshManager with the required services
     * This should be called once when the app starts
     */
    async initialize(httpService: Record<string, unknown>, updateCallback: (sourceId: string, content: unknown, additionalData: Record<string, unknown>) => void) {
        if (this.initialized || this.initializing) {
            log.debug('RefreshManager already initialized or initializing');
            return;
        }

        this.initializing = true;

        try {
            this.httpService = httpService;
            this.updateCallback = updateCallback;

            // Initialize RefreshManager
            await refreshManager.initialize(this.httpService, this.updateCallback);

            // Subscribe to workspace service to sync sources
            this.subscribeToSourceChanges();

            // Listen for source activation events
            this.setupSourceActivationListener();

            // Add all existing HTTP sources
            await this.syncAllSources();

            this.initialized = true;
            log.info('RefreshManagerIntegration initialized successfully');
        } catch (error) {
            log.error('Failed to initialize RefreshManagerIntegration:', error);
            throw error;
        } finally {
            this.initializing = false;
        }
    }

    /**
     * Subscribe to source changes from CentralizedWorkspaceService
     */
    subscribeToSourceChanges() {
        const workspaceService = getCentralizedWorkspaceService();
        const envService = getCentralizedEnvironmentService();

        // Subscribe to workspace state changes
        this.sourceSubscriptionCleanup = workspaceService.subscribe((state, changedKeys) => {
            if (changedKeys.includes('sources')) {
                this.syncSourceChanges(state.sources as SourceData[]).catch(err => {
                    log.error('Error syncing source changes:', err);
                });
            }
        });

        // Also subscribe to environment changes to detect env var value changes
        this.envSubscriptionCleanup = envService.subscribe(() => {
            // Debounce environment changes to avoid excessive processing
            if (this.envChangeDebounceTimer) {
                clearTimeout(this.envChangeDebounceTimer);
            }

            this.envChangeDebounceTimer = setTimeout(() => {
                // When env vars change, resync sources to update stored resolved values
                // This does NOT trigger immediate refreshes - new values will be used on next scheduled refresh
                const workspaceState = workspaceService.getState();
                this.syncSourceChanges(workspaceState.sources as SourceData[]).catch(err => {
                    log.error('Error syncing sources after env change:', err);
                });
            }, 500); // Wait 500ms after last env change
        });
    }

    /**
     * Track source data in lastSeenSources map
     */
    trackSourceData(source: SourceData) {
        const resolvedData = this.resolveSourceData(source);
        this.lastSeenSources.set(source.sourceId, {
            sourcePath: source.sourcePath,
            sourceMethod: source.sourceMethod,
            requestOptions: source.requestOptions ? {...source.requestOptions} : null,
            jsonFilter: source.jsonFilter ? {...source.jsonFilter} : null,
            refreshOptions: source.refreshOptions ? {...source.refreshOptions} : null,
            activationState: source.activationState,
            resolvedData: resolvedData
        });
    }

    /**
     * Resolve environment variables in source data
     */
    resolveSourceData(source: SourceData): ResolvedSourceData {
        const envService = getCentralizedEnvironmentService();

        // Helper to resolve object templates
        const resolveObjectTemplate = (obj: unknown): unknown => {
            if (!obj || typeof obj !== 'object') {
                return obj;
            }

            if (Array.isArray(obj)) {
                return obj.map(item => resolveObjectTemplate(item));
            }

            const resolved: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'string') {
                    resolved[key] = envService.resolveTemplate(value);
                } else if (typeof value === 'object') {
                    resolved[key] = resolveObjectTemplate(value);
                } else {
                    resolved[key] = value;
                }
            }
            return resolved;
        };

        // Resolve URL
        const resolvedPath = envService.resolveTemplate(source.sourcePath || '');

        // Resolve headers and other request options
        const resolvedRequestOptions: Record<string, unknown> = source.requestOptions ? {...source.requestOptions} : {};
        if (resolvedRequestOptions.headers) {
            resolvedRequestOptions.headers = resolveObjectTemplate(resolvedRequestOptions.headers) as Record<string, string>;
        }
        if (resolvedRequestOptions.body && typeof resolvedRequestOptions.body === 'string') {
            resolvedRequestOptions.body = envService.resolveTemplate(resolvedRequestOptions.body);
        }

        return {
            sourcePath: resolvedPath,
            requestOptions: resolvedRequestOptions
        };
    }

    /**
     * Sync source changes with RefreshManager
     * This updates source configurations but does NOT trigger immediate refreshes
     * Environment variable changes will be applied on the next scheduled refresh
     */
    async syncSourceChanges(sources: SourceData[]) {
        if (!this.initialized || !refreshManager.isInitialized) {
            return;
        }

        // Debounce rapid successive calls
        if (this.sourceChangeDebounceTimers.has('global')) {
            clearTimeout(this.sourceChangeDebounceTimers.get('global'));
        }

        this.sourceChangeDebounceTimers.set('global', setTimeout(async () => {
            await this._performSourceSync(sources);
            this.sourceChangeDebounceTimers.delete('global');
        }, 100));
    }

    async _performSourceSync(sources: SourceData[]) {
        // Track which sources we've seen to detect real changes
        const currentSourceIds = new Set();

        for (const source of sources) {
            if (source.sourceType === 'http') {
                currentSourceIds.add(source.sourceId);

                const lastSeen = this.lastSeenSources.get(source.sourceId);

                // Check if this is a new source or if any relevant fields have changed
                const sourceDataChanged = !lastSeen ||
                    lastSeen.sourcePath !== source.sourcePath ||
                    lastSeen.sourceMethod !== source.sourceMethod ||
                    JSON.stringify(lastSeen.requestOptions) !== JSON.stringify(source.requestOptions) ||
                    JSON.stringify(lastSeen.jsonFilter) !== JSON.stringify(source.jsonFilter);

                // Check if activation state changed
                const activationStateChanged = !lastSeen || lastSeen.activationState !== source.activationState;

                // Check if resolved values changed (after env var substitution)
                let resolvedValuesChanged = false;
                if (lastSeen && (source.sourcePath?.includes('{{') || JSON.stringify(source.requestOptions || {}).includes('{{'))) {
                    const currentResolved = this.resolveSourceData(source);
                    const lastResolved = lastSeen.resolvedData;

                    if (lastResolved) {
                        resolvedValuesChanged =
                            currentResolved.sourcePath !== lastResolved.sourcePath ||
                            JSON.stringify(currentResolved.requestOptions) !== JSON.stringify(lastResolved.requestOptions);

                        if (resolvedValuesChanged) {
                            log.info(`Environment variable values changed for source ${source.sourceId}`);
                        }
                    }
                }

                // Only check enabled and interval, ignore timing fields like lastRefresh/nextRefresh
                const refreshSettingsChanged = !lastSeen ||
                    lastSeen.refreshOptions?.enabled !== source.refreshOptions?.enabled ||
                    lastSeen.refreshOptions?.interval !== source.refreshOptions?.interval;

                if (!lastSeen || sourceDataChanged || refreshSettingsChanged || resolvedValuesChanged || activationStateChanged) {
                    // Log what changed
                    if (!lastSeen) {
                        log.debug(`Source ${source.sourceId} is new`);
                    } else {
                        if (sourceDataChanged) {
                            log.debug(`Source ${source.sourceId} data changed`, {
                                pathChanged: lastSeen.sourcePath !== source.sourcePath,
                                methodChanged: lastSeen.sourceMethod !== source.sourceMethod,
                                requestOptionsChanged: JSON.stringify(lastSeen.requestOptions) !== JSON.stringify(source.requestOptions),
                                jsonFilterChanged: JSON.stringify(lastSeen.jsonFilter) !== JSON.stringify(source.jsonFilter)
                            });
                        }
                        if (refreshSettingsChanged) {
                            log.debug(`Source ${source.sourceId} refresh settings changed`, {
                                enabledChanged: lastSeen.refreshOptions?.enabled !== source.refreshOptions?.enabled,
                                intervalChanged: lastSeen.refreshOptions?.interval !== source.refreshOptions?.interval
                            });
                        }
                        if (resolvedValuesChanged) {
                            log.debug(`Source ${source.sourceId} resolved values changed`);
                        }
                    }

                    // Update the source in RefreshManager
                    await refreshManager.updateSource(source);

                    // Log environment variable changes but don't trigger immediate refresh
                    // The new values will be used on the next scheduled refresh
                    if (resolvedValuesChanged && lastSeen) {
                        if (source.refreshOptions?.enabled) {
                            log.info(`Environment variables changed for source ${source.sourceId}, new values will be used on next scheduled refresh`);
                        } else {
                            log.info(`Environment variables changed for source ${source.sourceId}, but auto-refresh is disabled`);
                        }
                    }

                    // Store a complete copy of the source data we've seen, including resolved values
                    this.trackSourceData(source);
                }
            }
        }

        // Remove sources that no longer exist
        for (const [sourceId] of this.lastSeenSources) {
            if (!currentSourceIds.has(sourceId)) {
                await refreshManager.removeSource(sourceId);
                this.lastSeenSources.delete(sourceId);
            }
        }
    }

    /**
     * Setup listener for source activation events
     */
    setupSourceActivationListener() {
        const handleSourceActivation = async (event: CustomEvent<{ sourceId: string; source: SourceData }>) => {
            const { sourceId, source } = event.detail;
            log.info(`Source ${sourceId} activated, adding to RefreshManager`);

            // Add the newly activated source
            await refreshManager.addSource(source);

            // Track it
            this.trackSourceData(source);

            // Trigger immediate refresh only if this is truly the first fetch
            // or if the source was activated due to dependency resolution
            if (source.needsInitialFetch) {
                log.info(`Source ${sourceId} activated and needs initial fetch, triggering immediate refresh`);
                refreshManager.refreshSource(sourceId).catch(error => {
                    log.error(`Failed to refresh newly activated source ${sourceId}:`, error);
                });
            } else if (!source.sourceContent && source.refreshOptions?.enabled) {
                // Source is active but has no content yet (e.g., after workspace import)
                log.info(`Source ${sourceId} activated but has no content, triggering immediate refresh`);
                refreshManager.refreshSource(sourceId).catch(error => {
                    log.error(`Failed to refresh newly activated source ${sourceId}:`, error);
                });
            }
        };

        window.addEventListener('source-activated', handleSourceActivation as unknown as EventListener);

        // Store cleanup function
        if (!this.sourceActivationCleanup) {
            this.sourceActivationCleanup = () => {
                window.removeEventListener('source-activated', handleSourceActivation as unknown as EventListener);
            };
        }
    }

    /**
     * Sync all sources on initialization
     */
    async syncAllSources() {
        const workspaceService = getCentralizedWorkspaceService();
        const { sources } = workspaceService.getState();

        for (const source of sources) {
            if (source.sourceType === 'http') {
                // Add all HTTP sources (even if auto-refresh is disabled)
                await refreshManager.addSource(source as never);

                // Track complete source data including resolved values
                this.trackSourceData(source as never);
            }
        }
    }

    /**
     * Add a new source to RefreshManager
     */
    async addSource(source: SourceData) {
        if (!this.initialized) {
            log.warn('RefreshManagerIntegration not initialized');
            return;
        }

        if (source.sourceType === 'http') {
            await refreshManager.addSource(source);
        }
    }

    /**
     * Update a source in RefreshManager
     */
    async updateSource(source: SourceData) {
        if (!this.initialized) {
            log.warn('RefreshManagerIntegration not initialized');
            return;
        }

        if (source.sourceType === 'http') {
            await refreshManager.updateSource(source);
        }
    }

    /**
     * Remove a source from RefreshManager
     */
    async removeSource(sourceId: string) {
        if (!this.initialized) {
            log.warn('RefreshManagerIntegration not initialized');
            return;
        }

        await refreshManager.removeSource(sourceId);
    }

    /**
     * Manually refresh a source
     */
    async manualRefresh(sourceId: string) {
        if (!this.initialized) {
            log.warn('RefreshManagerIntegration not initialized');
            return false;
        }

        return await refreshManager.manualRefresh(sourceId);
    }

    /**
     * Clean up all sources before workspace switch
     */
    async cleanupAllSources() {
        if (!this.initialized || !refreshManager.isInitialized) {
            return;
        }

        log.info('Cleaning up all sources before workspace switch');

        // Remove all sources from RefreshManager
        for (const [sourceId] of this.lastSeenSources) {
            await refreshManager.removeSource(sourceId);
        }

        // Clear our tracking
        this.lastSeenSources.clear();
    }

    /**
     * Cleanup and destroy
     */
    async destroy() {
        // Clear any pending debounce timers
        if (this.envChangeDebounceTimer) {
            clearTimeout(this.envChangeDebounceTimer);
            this.envChangeDebounceTimer = null;
        }

        // Clear all source change debounce timers
        for (const [, timer] of this.sourceChangeDebounceTimers) {
            clearTimeout(timer);
        }
        this.sourceChangeDebounceTimers.clear();

        if (this.sourceSubscriptionCleanup) {
            this.sourceSubscriptionCleanup();
            this.sourceSubscriptionCleanup = null;
        }

        if (this.envSubscriptionCleanup) {
            this.envSubscriptionCleanup();
            this.envSubscriptionCleanup = null;
        }

        if (this.sourceActivationCleanup) {
            this.sourceActivationCleanup();
            this.sourceActivationCleanup = null;
        }

        if (refreshManager.isInitialized) {
            await refreshManager.destroy();
        }

        this.initialized = false;
        this.httpService = null;
        this.updateCallback = null;
        this.lastSeenSources.clear();

        log.info('RefreshManagerIntegration destroyed');
    }

    /**
     * Check if integration is ready
     */
    isReady() {
        return this.initialized && refreshManager.isInitialized;
    }

    /**
     * Get time until next refresh for a source
     */
    getTimeUntilRefresh(sourceId: string, sourceData: SourceData | null = null) {
        if (!this.initialized) {
            return 0;
        }
        return refreshManager.getTimeUntilRefresh(sourceId, sourceData);
    }

    /**
     * Get refresh status for a source
     */
    getRefreshStatus(sourceId: string) {
        if (!this.initialized) {
            return {
                isRefreshing: false,
                isOverdue: false,
                isPaused: false,
                consecutiveErrors: 0
            };
        }
        return refreshManager.getRefreshStatus(sourceId);
    }
}

// Export singleton instance
const refreshManagerIntegration = new RefreshManagerIntegration();
export default refreshManagerIntegration;
