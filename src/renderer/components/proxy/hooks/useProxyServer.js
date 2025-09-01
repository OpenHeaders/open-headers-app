import { useState, useEffect } from 'react';
import { App } from 'antd';
import { useSources, useWorkspaces, useSettings } from '../../../contexts';

/**
 * Proxy Server Management Hook
 * 
 * Custom hook that encapsulates all proxy server state management and operations.
 * Provides a clean interface for proxy server control, rule management, and cache operations.
 * 
 * Features:
 * - Proxy server start/stop operations with port configuration
 * - Proxy rule management (create, edit, delete, toggle)
 * - Resource cache management and statistics
 * - Event-driven updates and synchronization
 * - Integration with workspace and settings contexts
 * 
 * @returns {Object} Proxy server state and management functions
 */
export const useProxyServer = () => {
    const { message } = App.useApp();
    
    // Context dependencies
    const { sources } = useSources();
    const { activeWorkspaceId } = useWorkspaces();
    const { settings, saveSettings } = useSettings();
    
    // Proxy server state
    const [proxyStatus, setProxyStatus] = useState({ running: false, port: 59212 });
    const [rules, setRules] = useState([]);
    const [headerRules, setHeaderRules] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Cache management state
    const [cacheStats, setCacheStats] = useState(null);
    const [cacheEnabled, setCacheEnabled] = useState(true);
    const [cacheEntries, setCacheEntries] = useState([]);
    const [showCacheDetails, setShowCacheDetails] = useState(false);

    /**
     * Load proxy server status from main process
     */
    const loadProxyStatus = async () => {
        const status = await window.electronAPI.proxyStatus();
        setProxyStatus(status);
    };

    /**
     * Load proxy rules from storage
     */
    const loadRules = async () => {
        const loadedRules = await window.electronAPI.proxyGetRules();
        setRules(loadedRules);
    };

    /**
     * Load header rules from current workspace
     */
    const loadHeaderRules = async () => {
        try {
            const rulesPath = `workspaces/${activeWorkspaceId}/rules.json`;
            const rulesData = await window.electronAPI.loadFromStorage(rulesPath);
            if (rulesData) {
                const parsed = JSON.parse(rulesData);
                const headerRules = parsed.rules?.header || [];
                setHeaderRules(headerRules);
                
                // Send header rules to proxy manager
                await window.electronAPI.proxyUpdateHeaderRules(headerRules);
            }
        } catch (error) {
            console.error('Failed to load header rules:', error);
        }
    };

    /**
     * Load cache statistics from proxy server
     */
    const loadCacheStats = async () => {
        const stats = await window.electronAPI.proxyGetCacheStats();
        setCacheStats(stats);
    };

    /**
     * Load detailed cache entries for display
     */
    const loadCacheEntries = async () => {
        const entries = await window.electronAPI.proxyGetCacheEntries();
        setCacheEntries(entries);
    };

    /**
     * Toggle proxy server on/off
     */
    const toggleProxy = async () => {
        setLoading(true);
        try {
            if (proxyStatus.running) {
                await window.electronAPI.proxyStop();
                message.success('Proxy server stopped');
            } else {
                const result = await window.electronAPI.proxyStart(proxyStatus.port);
                if (result.success) {
                    message.success(`Proxy server started on port ${result.port}`);
                } else {
                    message.error(result.error);
                }
            }
            await loadProxyStatus();
        } finally {
            setLoading(false);
        }
    };

    /**
     * Save a proxy rule (create or update)
     */
    const saveRule = async (rule) => {
        const result = await window.electronAPI.proxySaveRule(rule);
        if (result.success) {
            message.success('Rule saved');
            await loadRules();

            // Emit event for other components
            window.dispatchEvent(new CustomEvent('proxy-rules-updated', {
                detail: { action: 'save', ruleId: rule.id }
            }));
            return true;
        } else {
            message.error(result.error);
            return false;
        }
    };

    /**
     * Delete a proxy rule
     */
    const deleteRule = async (ruleId) => {
        const result = await window.electronAPI.proxyDeleteRule(ruleId);
        if (result.success) {
            message.success('Rule deleted');
            await loadRules();

            // Emit event for other components
            window.dispatchEvent(new CustomEvent('proxy-rules-updated', {
                detail: { action: 'delete', ruleId: ruleId }
            }));
            return true;
        } else {
            message.error(result.error);
            return false;
        }
    };

    /**
     * Toggle rule enabled/disabled state
     */
    const toggleRule = async (ruleId, enabled) => {
        const rule = rules.find(r => r.id === ruleId);
        if (!rule) return false;
        
        const updatedRule = { ...rule, enabled };
        const result = await window.electronAPI.proxySaveRule(updatedRule);
        
        if (result.success) {
            await loadRules();
            
            // Emit event for other components
            window.dispatchEvent(new CustomEvent('proxy-rules-updated', {
                detail: { action: 'toggle', ruleId: ruleId, enabled: enabled }
            }));
            return true;
        } else {
            message.error(result.error);
            return false;
        }
    };

    /**
     * Clear proxy cache
     */
    const clearCache = async () => {
        const result = await window.electronAPI.proxyClearCache();
        if (result.success) {
            message.success('Cache cleared');
            await loadCacheStats();
            if (showCacheDetails) {
                await loadCacheEntries();
            }
            return true;
        } else {
            message.error(result.error);
            return false;
        }
    };

    /**
     * Toggle cache enabled/disabled state
     */
    const toggleCache = async (enabled) => {
        const result = await window.electronAPI.proxySetCacheEnabled(enabled);
        if (result.success) {
            setCacheEnabled(enabled);
            // Save to global settings
            await saveSettings({
                ...settings,
                proxyCacheEnabled: enabled
            });
            message.success(`Cache ${enabled ? 'enabled' : 'disabled'}`);
            return true;
        } else {
            message.error(result.error);
            return false;
        }
    };

    /**
     * Update proxy server port configuration
     */
    const updatePort = (port) => {
        setProxyStatus(prev => ({
            running: prev.running,
            port: Number(port)
        }));
    };

    /**
     * Toggle cache details visibility and load entries if needed
     */
    const toggleCacheDetails = async () => {
        const newState = !showCacheDetails;
        setShowCacheDetails(newState);
        if (newState) {
            // Refresh cache stats when showing details to ensure they're up to date
            await loadCacheStats();
            await loadCacheEntries();
        }
    };

    // Initialize data and settings
    useEffect(() => {
        loadProxyStatus().catch(console.error);
        loadRules().catch(console.error);
        loadHeaderRules().catch(console.error);
        loadCacheStats().catch(console.error);

        // Initialize cache enabled state from settings
        if (settings.proxyCacheEnabled !== undefined) {
            setCacheEnabled(settings.proxyCacheEnabled);
            // Apply the setting to the proxy server
            window.electronAPI.proxySetCacheEnabled(settings.proxyCacheEnabled).catch(console.error);
        }
    }, [settings.proxyCacheEnabled]);

    // Listen for proxy rules and workspace update events
    useEffect(() => {
        const handleProxyRulesUpdate = () => {
            loadRules().catch(console.error);
        };
        
        const handleWorkspaceSwitch = () => {
            console.log('Workspace switched, reloading proxy rules');
            loadRules().catch(console.error);
            loadHeaderRules().catch(console.error);
        };

        const handleHeaderRulesUpdate = () => {
            console.log('Header rules updated, reloading');
            loadHeaderRules().catch(console.error);
        };

        // Add event listeners
        window.addEventListener('proxy-rules-updated', handleProxyRulesUpdate);
        window.addEventListener('workspace-switched', handleWorkspaceSwitch);
        window.addEventListener('rules-updated', handleHeaderRulesUpdate);
        window.addEventListener('workspace-data-applied', handleWorkspaceSwitch);

        // Cleanup
        return () => {
            window.removeEventListener('proxy-rules-updated', handleProxyRulesUpdate);
            window.removeEventListener('workspace-switched', handleWorkspaceSwitch);
            window.removeEventListener('rules-updated', handleHeaderRulesUpdate);
            window.removeEventListener('workspace-data-applied', handleWorkspaceSwitch);
        };
    }, [activeWorkspaceId]);

    // Reload cache stats periodically when proxy is running
    useEffect(() => {
        if (proxyStatus.running) {
            const interval = setInterval(loadCacheStats, 5000);
            return () => clearInterval(interval);
        }
    }, [proxyStatus.running]);

    return {
        // State
        proxyStatus,
        rules,
        headerRules,
        sources,
        loading,
        cacheStats,
        cacheEnabled,
        cacheEntries,
        showCacheDetails,
        settings,
        
        // Actions
        toggleProxy,
        updatePort,
        saveRule,
        deleteRule,
        toggleRule,
        clearCache,
        toggleCache,
        toggleCacheDetails,
        
        // Loaders (for manual refresh)
        loadProxyStatus,
        loadRules,
        loadHeaderRules,
        loadCacheStats,
        loadCacheEntries
    };
};