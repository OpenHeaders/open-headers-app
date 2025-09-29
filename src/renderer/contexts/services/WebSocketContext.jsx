// WebSocketContext.jsx - FIXED to respect granular broadcast suppression

import React, { createContext, useEffect, useRef } from 'react';
import { useSources } from '../../hooks/workspace';
import timeManager from '../../services/TimeManager';

// Note: This provider only exists to sync sources to ws-service via side effects
// The context value is empty and no components consume it
const WebSocketContext = createContext();

const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('WebSocketContext');

export function WebSocketProvider({ children }) {
    const { sources, shouldSuppressBroadcast } = useSources();

    // Use a ref to track previous sources for comparison
    const prevSourcesRef = useRef([]);
    // Use a ref to track if initial broadcast has been done
    const initialBroadcastDoneRef = useRef(false);
    // Add a debounce timer ref
    const debounceTimerRef = useRef(null);
    // Track last broadcast time for more aggressive debouncing
    const lastBroadcastTimeRef = useRef(0);

    // Helper function to check if sources have meaningfully changed
    // ENHANCED: More sophisticated change detection to prevent unnecessary broadcasts
    const haveSourcesChanged = (prevSources, currentSources) => {
        // Different number of sources means a source was added or removed
        if (prevSources.length !== currentSources.length) {
            return true;
        }

        // Check for meaningful content changes in each source
        for (let i = 0; i < currentSources.length; i++) {
            const currentSource = currentSources[i];
            // Find matching source by ID
            const prevSource = prevSources.find(s => s.sourceId === currentSource.sourceId);

            // If source not found, it's a change
            if (!prevSource) {
                return true;
            }

            // ENHANCED: Check for actual content changes, not just timing updates
            if (prevSource.sourceContent !== currentSource.sourceContent) {
                return true;
            }

            // ENHANCED: Check for changes in non-timing related fields that matter to clients
            const significantFields = ['sourceTag', 'sourcePath', 'sourceType', 'isFiltered', 'filteredWith'];
            for (const field of significantFields) {
                if (prevSource[field] !== currentSource[field]) {
                    return true;
                }
            }

            // ENHANCED: Check JSON filter changes (but not timing changes)
            if (prevSource.jsonFilter?.enabled !== currentSource.jsonFilter?.enabled ||
                prevSource.jsonFilter?.path !== currentSource.jsonFilter?.path) {
                return true;
            }
        }

        return false;
    };

    // Debounced broadcast function
    // FIXED: Uses granular suppression check
    const debouncedBroadcast = (sourcesToBroadcast, reason) => {
        // FIXED: Check if this specific set of sources should be suppressed
        if (shouldSuppressBroadcast && shouldSuppressBroadcast(sourcesToBroadcast)) {
            return;
        }

        // Clear any existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Calculate how long to wait based on time since last broadcast
        const now = timeManager.now();
        const timeSinceLastBroadcast = now - lastBroadcastTimeRef.current;
        // Use longer debounce during initial load or rapid updates
        const debounceTime = timeSinceLastBroadcast < 2000 ? 500 : 100; // Much longer debounce for rapid updates

        // Set a new timer
        debounceTimerRef.current = setTimeout(() => {
            // FIXED: Double-check suppression right before broadcasting
            // BUT don't suppress if sources have content that wasn't broadcast yet
            const hasUnbroadcastContent = sourcesToBroadcast.some(source => 
                source.sourceType === 'http' && 
                source.sourceContent && 
                !prevSourcesRef.current.find(prev => 
                    prev.sourceId === source.sourceId && 
                    prev.sourceContent === source.sourceContent
                )
            );
            
            if (!hasUnbroadcastContent && shouldSuppressBroadcast && shouldSuppressBroadcast(sourcesToBroadcast)) {
                log.debug('Broadcast suppressed by shouldSuppressBroadcast check');
                return;
            }


            // ENHANCED: Filter out any temporary status data before broadcasting
            const cleanedSources = sourcesToBroadcast.map(source => {
                // Debug log to check source content before cleaning
                if (source.sourceType === 'http') {
                    log.info(`  Cleaning source ${source.sourceId}: hasContent=${!!source.sourceContent}, contentLength=${source.sourceContent?.length || 0}`);
                    // Log the actual content to verify it exists
                    if (source.sourceContent) {
                        log.info(`    Content preview: ${source.sourceContent.substring(0, 50)}...`);
                    } else {
                        log.warn(`    WARNING: sourceContent is ${source.sourceContent === null ? 'null' : 'undefined'}`);
                        // Log all properties to see what's available
                        log.warn(`    Available properties: ${Object.keys(source).join(', ')}`);
                    }
                }
                
                // Create a clean copy without internal status fields
                const cleanSource = {
                    sourceId: source.sourceId,
                    sourceType: source.sourceType,
                    sourcePath: source.sourcePath,
                    sourceTag: source.sourceTag,
                    sourceContent: source.sourceContent,
                    sourceMethod: source.sourceMethod
                };

                // Add JSON filter info if relevant
                if (source.jsonFilter?.enabled) {
                    cleanSource.jsonFilter = {
                        enabled: source.jsonFilter.enabled,
                        path: source.jsonFilter.path
                    };
                }

                // Add filtering status if applicable
                if (source.isFiltered) {
                    cleanSource.isFiltered = true;
                    cleanSource.filteredWith = source.filteredWith;
                }

                // FIXED: Remove internal tracking fields
                delete cleanSource._lastUpdateId;

                return cleanSource;
            });

            log.info(`WebSocketContext: Sending ${cleanedSources.length} sources to main process`);
            cleanedSources.forEach(source => {
                log.info(`  Source ${source.sourceId}: hasContent=${!!source.sourceContent}, contentLength=${source.sourceContent?.length || 0}`);
            });
            window.electronAPI.updateWebSocketSources(cleanedSources);
            lastBroadcastTimeRef.current = timeManager.now();
            debounceTimerRef.current = null;
        }, debounceTime);
    };

    // Send sources to main process for WebSocket broadcasting
    useEffect(() => {
        // Only proceed if we have sources and the electron API
        if (!sources || !Array.isArray(sources) || !window.electronAPI?.updateWebSocketSources) return;

        // Check if we should suppress broadcasting during workspace switching
        const workspaceService = require('../../services/CentralizedWorkspaceService').getCentralizedWorkspaceService();
        const isWorkspaceSwitching = workspaceService?.getState?.()?.isWorkspaceSwitching || false;
        
        if (isWorkspaceSwitching) {
            log.debug('Suppressing WebSocket broadcast during workspace switch');
            // Update our reference to current sources but don't broadcast
            prevSourcesRef.current = JSON.parse(JSON.stringify(sources));
            return;
        }

        // Always broadcast on first render to initialize clients
        if (!initialBroadcastDoneRef.current && sources.length > 0) {

            // FIXED: Check suppression even for initial broadcast (but it should rarely be suppressed)
            if (shouldSuppressBroadcast && shouldSuppressBroadcast(sources)) {
                initialBroadcastDoneRef.current = true;
                prevSourcesRef.current = JSON.parse(JSON.stringify(sources));
                return;
            }

            // Check if HTTP sources have content - if not, delay initial broadcast
            const httpSourcesWithoutContent = sources.filter(s => 
                s.sourceType === 'http' && 
                !s.sourceContent && 
                s.activationState !== 'waiting_for_deps'
            );
            
            if (httpSourcesWithoutContent.length > 0) {
                log.warn(`Delaying initial broadcast: ${httpSourcesWithoutContent.length} HTTP sources lack content`);
                // Don't mark as done yet, will retry when sources have content
                return;
            }
            
            // ENHANCED: Clean sources for initial broadcast too
            const cleanedSources = sources.map(source => {
                const cleanSource = {
                    sourceId: source.sourceId,
                    sourceType: source.sourceType,
                    sourcePath: source.sourcePath,
                    sourceTag: source.sourceTag,
                    sourceContent: source.sourceContent,
                    sourceMethod: source.sourceMethod
                };

                // Add optional fields
                if (source.jsonFilter?.enabled) {
                    cleanSource.jsonFilter = {
                        enabled: source.jsonFilter.enabled,
                        path: source.jsonFilter.path
                    };
                }

                if (source.isFiltered) {
                    cleanSource.isFiltered = true;
                    cleanSource.filteredWith = source.filteredWith;
                }

                return cleanSource;
            });

            log.info(`WebSocketContext: Initial broadcast - sending ${cleanedSources.length} sources to main process`);
            cleanedSources.forEach(source => {
                log.info(`  Source ${source.sourceId}: hasContent=${!!source.sourceContent}, contentLength=${source.sourceContent?.length || 0}`);
            });
            window.electronAPI.updateWebSocketSources(cleanedSources);
            initialBroadcastDoneRef.current = true;
            lastBroadcastTimeRef.current = timeManager.now();
            prevSourcesRef.current = JSON.parse(JSON.stringify(sources)); // Deep clone
            return;
        }

        // Check if sources have meaningfully changed
        if (haveSourcesChanged(prevSourcesRef.current, sources)) {
            log.info(`WebSocketContext: Detected source change, ${sources.length} sources`);
            sources.forEach(source => {
                log.info(`  Before broadcast - Source ${source.sourceId}: hasContent=${!!source.sourceContent}, contentLength=${source.sourceContent?.length || 0}`);
            });
            
            // Check again if we're in workspace switching mode
            if (isWorkspaceSwitching) {
                log.debug('Suppressing WebSocket broadcast during workspace switch (source change)');
                // Update our reference to current sources but don't broadcast
                prevSourcesRef.current = JSON.parse(JSON.stringify(sources));
                return;
            }
            
            // Check if HTTP sources are missing content that they should have
            const httpSourcesWithoutContent = sources.filter(s => 
                s.sourceType === 'http' && 
                !s.sourceContent && 
                s.activationState !== 'waiting_for_deps'
            );
            
            if (httpSourcesWithoutContent.length > 0) {
                log.warn(`Detected ${httpSourcesWithoutContent.length} HTTP sources without content, suppressing broadcast until content is available`);
                // Don't update prevSourcesRef yet - we want to detect when content arrives
                return;
            }
            
            // CRITICAL: Capture sources at the moment of change detection
            // This prevents issues where sources might be modified during debounce
            const sourcesSnapshot = JSON.parse(JSON.stringify(sources)); // Deep clone immediately
            
            // Use debounced broadcast with the snapshot
            debouncedBroadcast(sourcesSnapshot, "change detected");

            // Update our reference to the current sources
            prevSourcesRef.current = sourcesSnapshot;
        }

        // Clean up on unmount ONLY - don't clear timer on re-renders
        // This is critical to ensure pending broadcasts complete
        return () => {
            // Only clear timer if component is actually unmounting
            // Check if sources dependency has changed significantly
            if (!sources || sources.length === 0) {
                // Component is likely unmounting or workspace switching
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = null;
                }
            }
            // Otherwise, let the timer complete even if there's a re-render
        };
    }, [sources, shouldSuppressBroadcast]);

    return (
        <WebSocketContext.Provider value={{}}>
            {children}
        </WebSocketContext.Provider>
    );
}

