import React, { createContext, useContext, useEffect, useRef } from 'react';
import refreshManagerIntegration from '../../services/RefreshManagerIntegration';
import { useHttp } from '../../hooks/useHttp';
import { useSources } from '../../hooks/workspace';
import { getCentralizedWorkspaceService } from '../../services/CentralizedWorkspaceService';
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('RefreshManagerContext');

interface RefreshManagerContextValue {
  isReady: () => boolean;
  manualRefresh: (sourceId: string) => Promise<any>;
  addSource: (source: any) => void;
  updateSource: (source: any) => void;
  removeSource: (sourceId: string) => Promise<void>;
  getTimeUntilRefresh: (sourceId: string, sourceData: any) => number;
  getRefreshStatus: (sourceId: string) => any;
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
    const httpServiceRef = useRef<any>(null);

    // Update HTTP service reference when http changes
    useEffect(() => {
        httpServiceRef.current = {
            request: async (sourceId: string, url: string, method: string, options: any, jsonFilter: any) => {
                return await http.request(sourceId, url, method, options, jsonFilter);
            }
        };
    }, [http]);

    // Initialize RefreshManager once when the provider mounts
    useEffect(() => {
        if (initializationRef.current) {
            return;
        }

        initializationRef.current = true;

        const updateCallback = (sourceId: string, content: any, additionalData: any) => {
            log.debug('RefreshManager update callback:', { sourceId, hasContent: !!content, additionalData });

            // Get the source to check if it has a JSON filter
            const source = getCentralizedWorkspaceService().getState().sources.find((s: any) => s.sourceId === String(sourceId));

            // Build updates object
            const updates: any = {};

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
                    updates.filteredWith = source?.jsonFilter?.path || null;
                } else if (source?.jsonFilter?.enabled === false) {
                    updates.originalResponse = null;
                    updates.isFiltered = false;
                    updates.filteredWith = null;
                }

                // Merge refreshOptions to preserve all settings
                if (additionalData.refreshOptions) {
                    updates.refreshOptions = {
                        ...(source?.refreshOptions || {}),
                        ...additionalData.refreshOptions
                    };
                }

                if (additionalData.refreshStatus) {
                    updates.refreshStatus = additionalData.refreshStatus;
                }
            }

            void updateSource(sourceId, updates);
        };

        const initialize = async () => {
            try {
                // Wait a bit to ensure services are ready
                await new Promise(resolve => setTimeout(resolve, 100));

                await refreshManagerIntegration.initialize(
                    httpServiceRef.current,
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
        addSource: (source: any) => refreshManagerIntegration.addSource(source),
        updateSource: (source: any) => refreshManagerIntegration.updateSource(source),
        removeSource: (sourceId: string) => refreshManagerIntegration.removeSource(sourceId),
        getTimeUntilRefresh: (sourceId: string, sourceData: any) => refreshManagerIntegration.getTimeUntilRefresh(sourceId, sourceData),
        getRefreshStatus: (sourceId: string) => refreshManagerIntegration.getRefreshStatus(sourceId)
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
