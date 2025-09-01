import React, { createContext, useContext, useEffect, useRef } from 'react';
import refreshManagerIntegration from '../../services/RefreshManagerIntegration';
import { useHttp } from '../../hooks/useHttp';
import { useSources } from '../../hooks/workspace';
import { getCentralizedWorkspaceService } from '../../services/CentralizedWorkspaceService';
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('RefreshManagerContext');

/**
 * RefreshManager Context
 * Provides RefreshManager functionality to the entire app
 */
export const RefreshManagerContext = createContext(null);

export const RefreshManagerProvider = ({ children }) => {
    const { updateSource } = useSources();
    const http = useHttp();
    const initializationRef = useRef(false);
    const httpServiceRef = useRef(null);
    
    // Update HTTP service reference when http changes
    useEffect(() => {
        httpServiceRef.current = {
            request: async (sourceId, url, method, options, jsonFilter) => {
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
        
        const updateCallback = (sourceId, content, additionalData) => {
            log.debug('RefreshManager update callback:', { sourceId, hasContent: !!content, additionalData });
            
            // Get the source to check if it has a JSON filter
            const source = getCentralizedWorkspaceService().getState().sources.find(s => s.sourceId === String(sourceId));
            
            // Build updates object
            const updates = {};
            
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
        const handleWorkspaceSync = async (event) => {
            log.info(`Workspace sync detected (${event.detail?.reason}), cleaning up RefreshManager sources`);
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
    const value = {
        isReady: () => refreshManagerIntegration.isReady(),
        manualRefresh: (sourceId) => refreshManagerIntegration.manualRefresh(sourceId),
        addSource: (source) => refreshManagerIntegration.addSource(source),
        updateSource: (source) => refreshManagerIntegration.updateSource(source),
        removeSource: (sourceId) => refreshManagerIntegration.removeSource(sourceId),
        getTimeUntilRefresh: (sourceId, sourceData) => refreshManagerIntegration.getTimeUntilRefresh(sourceId, sourceData),
        getRefreshStatus: (sourceId) => refreshManagerIntegration.getRefreshStatus(sourceId)
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
export const useRefreshManager = () => {
    const context = useContext(RefreshManagerContext);
    if (!context) {
        throw new Error('useRefreshManager must be used within RefreshManagerProvider');
    }
    return context;
};