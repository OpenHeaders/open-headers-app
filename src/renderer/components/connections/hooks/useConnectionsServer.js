import { useState, useEffect, useCallback } from 'react';

/**
 * Connections Server Hook
 *
 * Manages WebSocket server connection status and connected browser clients.
 * Subscribes to real-time push updates and polls as a safety net.
 *
 * @param {Object} options
 * @param {boolean} options.active - Whether the Connections tab is currently visible
 * @returns {Object} Connection status and client data
 */
export const useConnectionsServer = ({ active = false } = {}) => {
    const [status, setStatus] = useState({
        totalConnections: 0,
        browserCounts: {},
        clients: [],
        wsServerRunning: false,
        wssServerRunning: false,
        wsPort: 59210,
        wssPort: 59211,
        certificateFingerprint: null
    });

    /**
     * Fetch current connection status from main process
     */
    const loadStatus = useCallback(async () => {
        try {
            const result = await window.electronAPI.wsGetConnectionStatus();
            if (result) setStatus(result);
        } catch (error) {
            console.error('Failed to load WebSocket connection status:', error);
        }
    }, []);

    // Subscribe to real-time push updates
    useEffect(() => {
        const unsubscribe = window.electronAPI.onWsConnectionStatusChanged((data) => {
            if (data) setStatus(data);
        });
        return unsubscribe;
    }, []);

    // Load on mount
    useEffect(() => {
        loadStatus().catch(console.error);
    }, [loadStatus]);

    // Refresh when tab becomes active
    useEffect(() => {
        if (active) {
            loadStatus().catch(console.error);
        }
    }, [active, loadStatus]);

    // Poll every 5s while tab is active (safety net for missed push updates)
    useEffect(() => {
        if (active) {
            const interval = setInterval(() => {
                loadStatus().catch(console.error);
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [active, loadStatus]);

    return { status, loadStatus };
};
