import { useState, useEffect, useCallback, useMemo } from 'react';
import { App } from 'antd';
import { useSettings } from '../../../contexts';

/**
 * CLI Server Management Hook
 *
 * Custom hook that encapsulates all CLI API server state management and operations.
 *
 * @param {Object} options
 * @param {boolean} options.active - Whether the CLI tab is currently visible
 * @returns {Object} CLI server state and management functions
 */
export const useCliServer = ({ active = false } = {}) => {
    const { message } = App.useApp();
    const { settings } = useSettings();

    // CLI server state
    const [status, setStatus] = useState({
        running: false, port: 59213, discoveryPath: '',
        token: '', startedAt: null, totalRequests: 0
    });
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    // Log filters
    const [filterMethod, setFilterMethod] = useState(null);
    const [filterEndpoint, setFilterEndpoint] = useState('');
    const [filterStatus, setFilterStatus] = useState(null);

    /**
     * Filtered logs based on current filter state
     */
    const filteredLogs = useMemo(() => {
        return logs.filter(entry => {
            if (filterMethod && entry.method !== filterMethod) return false;
            if (filterEndpoint && !entry.path.includes(filterEndpoint)) return false;
            if (filterStatus !== null) {
                if (filterStatus === 'success' && (entry.statusCode < 200 || entry.statusCode >= 300)) return false;
                if (filterStatus === 'error' && entry.statusCode < 400) return false;
            }
            return true;
        });
    }, [logs, filterMethod, filterEndpoint, filterStatus]);

    /**
     * Load CLI API server status from main process
     */
    const loadStatus = useCallback(async () => {
        try {
            const result = await window.electronAPI.cliApiStatus();
            setStatus(result);
        } catch (error) {
            console.error('Failed to load CLI API status:', error);
        }
    }, []);

    /**
     * Load recent API request logs
     */
    const loadLogs = useCallback(async () => {
        try {
            const result = await window.electronAPI.cliApiGetLogs();
            setLogs(result || []);
        } catch (error) {
            console.error('Failed to load CLI API logs:', error);
        }
    }, []);

    /**
     * Start the CLI API server
     */
    const startServer = useCallback(async () => {
        setLoading(true);
        try {
            const result = await window.electronAPI.cliApiStart(status.port);
            if (result.success) {
                message.success(`CLI API server started on port ${result.port}`);
            } else {
                message.error(result.error || 'Failed to start CLI API server');
            }
            await loadStatus();
        } catch (error) {
            message.error('Failed to start CLI API server');
        } finally {
            setLoading(false);
        }
    }, [message, loadStatus, status.port]);

    /**
     * Update port (only when server is stopped)
     */
    const updatePort = useCallback((port: number) => {
        setStatus(prev => ({ ...prev, port: Number(port) }));
    }, []);

    /**
     * Stop the CLI API server
     */
    const stopServer = useCallback(async () => {
        setLoading(true);
        try {
            const result = await window.electronAPI.cliApiStop();
            if (result.success) {
                message.success('CLI API server stopped');
            } else {
                message.error(result.error || 'Failed to stop CLI API server');
            }
            await loadStatus();
        } catch (error) {
            message.error('Failed to stop CLI API server');
        } finally {
            setLoading(false);
        }
    }, [message, loadStatus]);

    /**
     * Toggle CLI API server on/off
     */
    const toggleServer = useCallback(async () => {
        if (status.running) {
            await stopServer();
        } else {
            await startServer();
        }
    }, [status.running, startServer, stopServer]);

    /**
     * Regenerate the auth token
     */
    const regenerateToken = useCallback(async () => {
        try {
            const result = await window.electronAPI.cliApiRegenerateToken();
            if (result.success) {
                message.success('Token regenerated successfully');
                await loadStatus();
            } else {
                message.error(result.error || 'Failed to regenerate token');
            }
        } catch (error) {
            message.error('Failed to regenerate token');
        }
    }, [message, loadStatus]);

    /**
     * Clear request logs
     */
    const clearLogs = useCallback(async () => {
        try {
            await window.electronAPI.cliApiClearLogs();
            setLogs([]);
            message.success('Logs cleared');
        } catch (error) {
            message.error('Failed to clear logs');
        }
    }, [message]);

    /**
     * Export logs as JSON file
     */
    const exportLogs = useCallback(() => {
        const data = JSON.stringify(filteredLogs, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cli-api-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('Logs exported');
    }, [filteredLogs, message]);

    /**
     * Set log filters
     */
    const setFilters = useCallback(({ method, endpoint, status: statusFilter }: { method?: string | null; endpoint?: string; status?: string | null } = {}) => {
        if (method !== undefined) setFilterMethod(method);
        if (endpoint !== undefined) setFilterEndpoint(endpoint);
        if (statusFilter !== undefined) setFilterStatus(statusFilter);
    }, []);

    /**
     * Clear all log filters
     */
    const clearFilters = useCallback(() => {
        setFilterMethod(null);
        setFilterEndpoint('');
        setFilterStatus(null);
    }, []);

    // Initialize on mount
    useEffect(() => {
        loadStatus().catch(console.error);
        loadLogs().catch(console.error);
    }, [loadStatus, loadLogs]);

    // Refresh status and logs when the tab becomes active
    useEffect(() => {
        if (active) {
            loadStatus().catch(console.error);
            loadLogs().catch(console.error);
        }
    }, [active, loadStatus, loadLogs]);

    // Poll status and logs only while server is running AND the tab is visible
    useEffect(() => {
        if (status.running && active) {
            const interval = setInterval(() => {
                loadStatus().catch(console.error);
                loadLogs().catch(console.error);
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [status.running, active, loadStatus, loadLogs]);

    return {
        // State
        status,
        logs: filteredLogs,
        allLogs: logs,
        loading,
        settings,

        // Filter state
        filterMethod,
        filterEndpoint,
        filterStatus,

        // Actions
        updatePort,
        toggleServer,
        regenerateToken,
        clearLogs,
        exportLogs,
        setFilters,
        clearFilters,

        // Loaders (for manual refresh)
        loadStatus,
        loadLogs
    };
};
