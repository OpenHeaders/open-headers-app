import React, { useState, useEffect } from 'react';
import { Tag, Tooltip, Button } from 'antd';
import {
    WifiOutlined,
    DisconnectOutlined,
    GlobalOutlined,
    LockOutlined,
    LoadingOutlined,
    ReloadOutlined
} from '@ant-design/icons';

const { createLogger } = require('../utils/logger');
const log = createLogger('NetworkStatus');

const NetworkStatus = () => {
    const [networkState, setNetworkState] = useState({
        isOnline: true,
        networkQuality: 'unknown',
        vpnActive: false,
        loading: true
    });
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        log.info('NetworkStatus component mounted');
        
        // Listen for network state changes
        const handleNetworkStateSync = (event) => {
            log.info('Network state sync event received:', event);
            if (event && event.state) {
                const newState = {
                    isOnline: event.state.isOnline ?? false,
                    networkQuality: event.state.networkQuality || 'unknown',
                    vpnActive: event.state.vpnActive ?? false,
                    loading: false
                };
                log.info('Updating network state to:', newState);
                setNetworkState(newState);
            }
        };

        // Get initial state
        log.info('Requesting initial network state...');
        window.electronAPI.getNetworkState().then(state => {
            log.info('Initial network state received:', state);
            if (state) {
                const initialState = {
                    isOnline: state.isOnline ?? false,
                    networkQuality: state.networkQuality || 'unknown',
                    vpnActive: state.vpnActive ?? false,
                    loading: false
                };
                log.info('Setting initial network state:', initialState);
                setNetworkState(initialState);
            }
        }).catch(err => {
            log.error('Failed to get initial network state:', err);
            setNetworkState(prev => ({ ...prev, loading: false }));
        });

        // Subscribe to network state changes
        log.info('Subscribing to network state sync events...');
        const unsubscribe = window.electronAPI.onNetworkStateSync(handleNetworkStateSync);

        // Also listen for simple network state changes (legacy)
        const handleLegacyNetworkChange = (isOnline) => {
            log.info('Legacy network state change:', isOnline);
            setNetworkState(prev => ({
                ...prev,
                isOnline: isOnline,
                networkQuality: isOnline ? 'unknown' : 'offline',
                loading: false
            }));
        };
        
        const unsubscribeLegacy = window.electronAPI.onNetworkStateChanged(handleLegacyNetworkChange);

        // Force refresh network state periodically on Windows
        let refreshInterval;
        if (navigator.platform.includes('Win')) {
            log.info('Windows detected, setting up periodic network state refresh');
            refreshInterval = setInterval(() => {
                window.electronAPI.getNetworkState().then(state => {
                    if (state) {
                        const refreshedState = {
                            isOnline: state.isOnline ?? false,
                            networkQuality: state.networkQuality || 'unknown',
                            vpnActive: state.vpnActive ?? false,
                            loading: false
                        };
                        setNetworkState(refreshedState);
                    }
                }).catch(err => {
                    log.error('Failed to refresh network state:', err);
                });
            }, 5000); // Refresh every 5 seconds on Windows
        }

        return () => {
            log.info('NetworkStatus component unmounting');
            if (unsubscribe) unsubscribe();
            if (unsubscribeLegacy) unsubscribeLegacy();
            if (refreshInterval) clearInterval(refreshInterval);
        };
    }, []);

    // Manual refresh function
    const handleManualRefresh = async () => {
        log.info('Manual network state refresh requested');
        setRefreshing(true);
        
        try {
            // Force a network check on the main process
            const forceCheckedState = await window.electronAPI.forceNetworkCheck();
            log.info('Force network check result:', forceCheckedState);
            
            if (forceCheckedState) {
                const newState = {
                    isOnline: forceCheckedState.isOnline ?? false,
                    networkQuality: forceCheckedState.networkQuality || 'unknown',
                    vpnActive: forceCheckedState.vpnActive ?? false,
                    loading: false
                };
                setNetworkState(newState);
            }
        } catch (err) {
            log.error('Failed to force network check:', err);
        } finally {
            setRefreshing(false);
        }
    };

    if (networkState.loading) {
        return (
            <Tag icon={<LoadingOutlined spin />} color="default">
                Checking network...
            </Tag>
        );
    }

    // Determine icon and color based on state
    const getStatusConfig = () => {
        if (!networkState.isOnline) {
            return {
                icon: <DisconnectOutlined />,
                color: 'error',
                text: 'Offline'
            };
        }

        const qualityConfig = {
            excellent: { color: 'success', text: 'Excellent' },
            good: { color: 'success', text: 'Good' },
            fair: { color: 'warning', text: 'Fair' },
            poor: { color: 'error', text: 'Poor' },
            unknown: { color: 'default', text: 'Connected' }
        };

        const quality = qualityConfig[networkState.networkQuality] || qualityConfig.unknown;
        
        return {
            icon: networkState.vpnActive ? <LockOutlined /> : <WifiOutlined />,
            color: quality.color,
            text: quality.text + (networkState.vpnActive ? ' (VPN)' : '')
        };
    };

    const config = getStatusConfig();
    const tooltipContent = (
        <div style={{ fontSize: '12px' }}>
            <div>Status: {networkState.isOnline ? 'Online' : 'Offline'}</div>
            <div>Quality: {networkState.networkQuality}</div>
            <div>VPN: {networkState.vpnActive ? 'Active' : 'Inactive'}</div>
            <div style={{ marginTop: '8px' }}>
                <Button 
                    size="small" 
                    icon={<ReloadOutlined spin={refreshing} />}
                    onClick={handleManualRefresh}
                    disabled={refreshing}
                >
                    Refresh
                </Button>
            </div>
        </div>
    );

    return (
        <Tooltip title={tooltipContent} placement="bottom">
            <Tag
                icon={refreshing ? <LoadingOutlined spin /> : config.icon}
                color={config.color}
                style={{
                    marginLeft: '8px',
                    cursor: 'pointer',
                    fontSize: '12px'
                }}
                onClick={handleManualRefresh}
            >
                {config.text}
            </Tag>
        </Tooltip>
    );
};

export default NetworkStatus;