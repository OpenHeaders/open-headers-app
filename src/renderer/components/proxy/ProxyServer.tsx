import React from 'react';
import { useProxyServer } from './hooks';
import { ProxyServerControls, ProxyRulesSection, ProxyCacheSection } from './components';


/**
 * ProxyServer - Main proxy server management component
 * 
 * Modernized proxy server control panel that manages HTTP proxy functionality
 * for browser workflow recordings and authentication header injection. This component
 * has been refactored into a modular architecture for better maintainability.
 * 
 * Architecture Changes:
 * - Extracted business logic into useProxyServer custom hook
 * - Separated UI into modular components (ProxyServerControls, ProxyRulesSection, ProxyCacheSection)
 * - Moved utility functions to dedicated utility modules
 * - Improved separation of concerns and reusability
 * 
 * Core Functionality:
 * - Proxy server start/stop operations with configurable port
 * - Proxy rule management (custom headers and header rule references)
 * - Resource cache management for improved replay performance
 * - Real-time cache statistics and monitoring
 * - Integration with workspace-based header rules
 * 
 * Component Structure:
 * - ProxyServerControls: Server start/stop, port config, educational content
 * - ProxyRulesSection: Complete rule management with table and forms
 * - ProxyCacheSection: Cache statistics, controls, and detailed entries
 * 
 * Technical Notes:
 * - Uses custom hook for state management and business logic
 * - Event-driven updates for rule synchronization across components
 * - Integrates with global settings for cache enable/disable state
 * - Modular design allows for easy testing and maintenance
 * 
 * @returns {JSX.Element} Proxy server management interface
 */
const ProxyServer = () => {
    const {
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
        toggleCacheDetails
    } = useProxyServer();

    return (
        <div style={{ padding: '24px' }}>
            <ProxyServerControls
                proxyStatus={proxyStatus}
                loading={loading}
                tutorialMode={settings?.tutorialMode}
                onToggleProxy={toggleProxy}
                onUpdatePort={updatePort}
            />

            <ProxyRulesSection
                rules={rules}
                sources={sources}
                headerRules={headerRules}
                onSaveRule={saveRule}
                onDeleteRule={deleteRule}
                onToggleRule={toggleRule}
            />

            {proxyStatus.running && (
                <ProxyCacheSection
                    cacheStats={cacheStats}
                    cacheEnabled={cacheEnabled}
                    cacheEntries={cacheEntries}
                    showCacheDetails={showCacheDetails}
                    onToggleCache={toggleCache}
                    onClearCache={clearCache}
                    onToggleCacheDetails={toggleCacheDetails}
                />
            )}
        </div>
    );
};

export default ProxyServer;