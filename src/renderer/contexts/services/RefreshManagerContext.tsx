import React, { createContext, useContext, useEffect, useRef } from 'react';
import refreshManagerIntegration from '../../services/RefreshManagerIntegration';
import type { HttpService, SourceUpdateData } from '../../services/RefreshManager';
import { useHttp } from '../../hooks/useHttp';
import { useSources } from '../../hooks/workspace';
import { getCentralizedWorkspaceService } from '../../services/CentralizedWorkspaceService';
import { createLogger } from '../../utils/error-handling/logger';
import type { Source } from '../../../types/source';
const log = createLogger('RefreshManagerContext');

interface RefreshStatus {
  isRefreshing: boolean;
  isOverdue: boolean;
  isPaused: boolean;
  consecutiveErrors: number;
  isRetry: boolean;
  attemptNumber: number;
  failureCount: number;
  circuitBreaker: {
    state: string;
    isOpen: boolean;
    canManualBypass: boolean;
    timeUntilNextAttempt: number;
    timeUntilNextAttemptMs: number;
    consecutiveOpenings: number;
    currentTimeout: number;
    failureCount: number;
  };
}

interface RefreshManagerContextValue {
  isReady: () => boolean;
  manualRefresh: (sourceId: string) => Promise<boolean>;
  addSource: (source: Source) => void;
  updateSource: (source: Source) => void;
  removeSource: (sourceId: string) => Promise<void>;
  getTimeUntilRefresh: (sourceId: string, sourceData: Source | null) => number;
  getRefreshStatus: (sourceId: string) => RefreshStatus;
}

/**
 * RefreshManager Context
 * Provides RefreshManager functionality to the entire app
 */
export const RefreshManagerContext = createContext<RefreshManagerContextValue | null>(null);

export const RefreshManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { updateSource } = useSources();
    const http = useHttp();
    const initializationRef = useRef(false);
    const httpServiceRef = useRef<HttpService | null>(null);

    // Update HTTP service reference when http changes
    useEffect(() => {
        httpServiceRef.current = {
            request: http.request
        };
    }, [http]);

    // Initialize RefreshManager once when the provider mounts
    useEffect(() => {
        if (initializationRef.current) {
            return;
        }

        initializationRef.current = true;

        const updateCallback = (sourceId: string, content: string | null | undefined, additionalData: SourceUpdateData) => {
            log.debug('RefreshManager update callback:', { sourceId, hasContent: !!content, additionalData });

            // Get the source to check if it has a JSON filter
            const source = (getCentralizedWorkspaceService().getState().sources).find((s) => s.sourceId === String(sourceId));

            // Build updates object
            const updates: Partial<Source> = {};

            // Only update content if it's explicitly provided (not undefined)
            // This prevents schedule updates from clearing content
            // Note: null is considered an explicit clear (e.g., on errors)
            if (content !== undefined) {
                updates.sourceContent = content;
            }

            // Copy over additional data
            if (additionalData) {
                if (additionalData.originalResponse) {
                    updates.originalResponse = additionalData.originalResponse;
                    updates.isFiltered = true;
                    updates.filteredWith = source?.jsonFilter?.path ?? null;
                } else {
                    if (source?.jsonFilter?.enabled === false) {
                        updates.originalResponse = null;
                        updates.isFiltered = false;
                        updates.filteredWith = null;
                    }
                }

                // Merge refreshOptions to preserve all settings
                if (additionalData.refreshOptions) {
                    updates.refreshOptions = {
                        ...(source?.refreshOptions ?? { enabled: false }),
                        ...additionalData.refreshOptions
                    };
                }

                if (additionalData.refreshStatus) {
                    updates.refreshStatus = additionalData.refreshStatus as Source['refreshStatus'];
                }

                // Store HTTP response headers for ContentViewer
                if (additionalData.headers) {
                    updates.responseHeaders = additionalData.headers;
                }
            }

            void updateSource(sourceId, updates);
        };

        const initialize = async () => {
            try {
                // Wait a bit to ensure services are ready
                await new Promise(resolve => setTimeout(resolve, 100));

                await refreshManagerIntegration.initialize(
                    httpServiceRef.current!,
                    updateCallback
                );

                log.info('RefreshManager initialized successfully');
            } catch (error) {
                log.error('Failed to initialize RefreshManager:', error);
                initializationRef.current = false; // Allow retry
            }
        };

        void initialize();

        // Listen for workspace switch events
        const handleWorkspaceSwitch = async () => {
            log.info('Workspace switch detected, cleaning up RefreshManager sources');
            try {
                await refreshManagerIntegration.cleanupAllSources();
            } catch (error) {
                log.error('Error cleaning up sources during workspace switch:', error);
            }
        };

        // Listen for workspace sync events
        const handleWorkspaceSync = async (event: Event) => {
            log.info(`Workspace sync detected (${(event as CustomEvent).detail?.reason}), cleaning up RefreshManager sources`);
            try {
                await refreshManagerIntegration.cleanupAllSources();
            } catch (error) {
                log.error('Error cleaning up sources during workspace sync:', error);
            }
        };

        window.addEventListener('workspace-switching', handleWorkspaceSwitch);
        window.addEventListener('workspace-syncing', handleWorkspaceSync);

        // Cleanup on unmount
        return () => {
            window.removeEventListener('workspace-switching', handleWorkspaceSwitch);
            window.removeEventListener('workspace-syncing', handleWorkspaceSync);

            const cleanup = async () => {
                try {
                    await refreshManagerIntegration.destroy();
                    log.info('RefreshManager cleaned up');
                } catch (error) {
                    log.error('Error cleaning up RefreshManager:', error);
                }
            };
            void cleanup();
        };
    }, [updateSource]);

    // Context value with all RefreshManager methods
    const value: RefreshManagerContextValue = {
        isReady: () => refreshManagerIntegration.isReady(),
        manualRefresh: (sourceId: string) => refreshManagerIntegration.manualRefresh(sourceId),
        addSource: (source: Source) => refreshManagerIntegration.addSource(source),
        updateSource: (source: Source) => refreshManagerIntegration.updateSource(source),
        removeSource: (sourceId: string) => refreshManagerIntegration.removeSource(sourceId),
        getTimeUntilRefresh: (sourceId: string, sourceData: Source | null) => refreshManagerIntegration.getTimeUntilRefresh(sourceId, sourceData),
        getRefreshStatus: (sourceId: string) => refreshManagerIntegration.getRefreshStatus(sourceId) as RefreshStatus
    };

    return (
        <RefreshManagerContext.Provider value={value}>
            {children}
        </RefreshManagerContext.Provider>
    );
};

/**
 * Hook to use RefreshManager functionality
 */
export const useRefreshManager = (): RefreshManagerContextValue => {
    const context = useContext(RefreshManagerContext);
    if (!context) {
        throw new Error('useRefreshManager must be used within RefreshManagerProvider');
    }
    return context;
};
