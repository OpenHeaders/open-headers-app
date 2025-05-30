// WebSocketContext.jsx - FIXED to respect granular broadcast suppression

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useSources } from './SourceContext';

// Create context
const WebSocketContext = createContext();

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
            console.log(`WebSocketContext: Source count changed from ${prevSources.length} to ${currentSources.length}`);
            return true;
        }

        // Check for meaningful content changes in each source
        for (let i = 0; i < currentSources.length; i++) {
            const currentSource = currentSources[i];
            // Find matching source by ID
            const prevSource = prevSources.find(s => s.sourceId === currentSource.sourceId);

            // If source not found, it's a change
            if (!prevSource) {
                console.log(`WebSocketContext: New source detected ${currentSource.sourceId}`);
                return true;
            }

            // ENHANCED: Check for actual content changes, not just timing updates
            if (prevSource.sourceContent !== currentSource.sourceContent) {
                console.log(`WebSocketContext: Content changed for source ${currentSource.sourceId}`);
                console.log(`WebSocketContext: Previous: ${prevSource.sourceContent?.substring(0, 50)}...`);
                console.log(`WebSocketContext: Current: ${currentSource.sourceContent?.substring(0, 50)}...`);
                return true;
            }

            // ENHANCED: Check for changes in non-timing related fields that matter to clients
            const significantFields = ['sourceTag', 'sourcePath', 'sourceType', 'isFiltered', 'filteredWith'];
            for (const field of significantFields) {
                if (prevSource[field] !== currentSource[field]) {
                    console.log(`WebSocketContext: ${field} changed for source ${currentSource.sourceId}`);
                    return true;
                }
            }

            // ENHANCED: Check JSON filter changes (but not timing changes)
            if (prevSource.jsonFilter?.enabled !== currentSource.jsonFilter?.enabled ||
                prevSource.jsonFilter?.path !== currentSource.jsonFilter?.path) {
                console.log(`WebSocketContext: JSON filter changed for source ${currentSource.sourceId}`);
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
            console.log(`WebSocketContext: Broadcast suppressed for reason: ${reason} (granular suppression)`);
            return;
        }

        // Clear any existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Calculate how long to wait based on time since last broadcast
        const now = Date.now();
        const timeSinceLastBroadcast = now - lastBroadcastTimeRef.current;
        const debounceTime = timeSinceLastBroadcast < 1000 ? 300 : 50; // Longer debounce if recent broadcast

        // Set a new timer
        debounceTimerRef.current = setTimeout(() => {
            // FIXED: Double-check suppression right before broadcasting
            if (shouldSuppressBroadcast && shouldSuppressBroadcast(sourcesToBroadcast)) {
                console.log(`WebSocketContext: Broadcast suppressed at broadcast time for reason: ${reason} (granular suppression)`);
                return;
            }

            console.log(`WebSocketContext: Broadcasting ${sourcesToBroadcast.length} source(s) after ${reason}`);

            // ENHANCED: Filter out any temporary status data before broadcasting
            const cleanedSources = sourcesToBroadcast.map(source => {
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

            window.electronAPI.updateWebSocketSources(cleanedSources);
            lastBroadcastTimeRef.current = Date.now();
            debounceTimerRef.current = null;
        }, debounceTime);
    };

    // Send sources to main process for WebSocket broadcasting
    useEffect(() => {
        // Only proceed if we have sources and the electron API
        if (!sources || !Array.isArray(sources) || !window.electronAPI?.updateWebSocketSources) return;

        // Always broadcast on first render to initialize clients
        if (!initialBroadcastDoneRef.current && sources.length > 0) {
            console.log(`WebSocketContext: Initial broadcast of ${sources.length} source(s)`);

            // FIXED: Check suppression even for initial broadcast (but it should rarely be suppressed)
            if (shouldSuppressBroadcast && shouldSuppressBroadcast(sources)) {
                console.log(`WebSocketContext: Initial broadcast suppressed (granular suppression)`);
                initialBroadcastDoneRef.current = true;
                prevSourcesRef.current = JSON.parse(JSON.stringify(sources));
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

            window.electronAPI.updateWebSocketSources(cleanedSources);
            initialBroadcastDoneRef.current = true;
            lastBroadcastTimeRef.current = Date.now();
            prevSourcesRef.current = JSON.parse(JSON.stringify(sources)); // Deep clone
            return;
        }

        // Check if sources have meaningfully changed
        if (haveSourcesChanged(prevSourcesRef.current, sources)) {
            // Use debounced broadcast instead of immediate broadcast
            debouncedBroadcast(sources, "change detected");

            // Update our reference to the current sources - do this immediately
            prevSourcesRef.current = JSON.parse(JSON.stringify(sources)); // Deep clone
        } else {
            // ADDED: Log when changes are detected but not considered significant
            console.log(`WebSocketContext: Sources updated but no significant changes detected`);
        }

        // Clean up on unmount
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [sources, shouldSuppressBroadcast]);

    return (
        <WebSocketContext.Provider value={{}}>
            {children}
        </WebSocketContext.Provider>
    );
}

// Custom hook for using the WebSocket context
export function useWebSocket() {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }
    return context;
}