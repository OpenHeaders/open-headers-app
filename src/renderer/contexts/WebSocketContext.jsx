import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useSources } from './SourceContext';

// Create context
const WebSocketContext = createContext();

export function WebSocketProvider({ children }) {
    const { sources } = useSources();

    // Use a ref to track previous sources for comparison
    const prevSourcesRef = useRef([]);
    // Use a ref to track if initial broadcast has been done
    const initialBroadcastDoneRef = useRef(false);
    // Add a debounce timer ref
    const debounceTimerRef = useRef(null);
    // Track last broadcast time for more aggressive debouncing
    const lastBroadcastTimeRef = useRef(0);

    // Helper function to check if sources have meaningfully changed
    const haveSourcesChanged = (prevSources, currentSources) => {
        // Different number of sources means a source was added or removed
        if (prevSources.length !== currentSources.length) {
            console.log(`WebSocketContext: Source count changed from ${prevSources.length} to ${currentSources.length}`);
            return true;
        }

        // Check for content changes in each source
        for (let i = 0; i < currentSources.length; i++) {
            const currentSource = currentSources[i];
            // Find matching source by ID
            const prevSource = prevSources.find(s => s.sourceId === currentSource.sourceId);

            // If source not found or content changed
            if (!prevSource || prevSource.sourceContent !== currentSource.sourceContent) {
                console.log(`WebSocketContext: Content changed for source ${currentSource.sourceId}`);
                return true;
            }
        }

        return false;
    };

    // Debounced broadcast function
    const debouncedBroadcast = (sourcesToBroadcast, reason) => {
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
            console.log(`WebSocketContext: Broadcasting ${sourcesToBroadcast.length} source(s) after ${reason}`);
            window.electronAPI.updateWebSocketSources(sourcesToBroadcast);
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
            window.electronAPI.updateWebSocketSources(sources);
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
        }

        // Clean up on unmount
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [sources]);

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