import React, { useState, useEffect } from 'react';

export const DebugNetworkState = ({ inFooter = false }) => {
    const [networkState, setNetworkState] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [isExpanded, setIsExpanded] = useState(false);

    const fetchNetworkState = async () => {
        try {
            if (window.electronAPI && window.electronAPI.getNetworkState) {
                const state = await window.electronAPI.getNetworkState();
                setNetworkState(state);
                setLastUpdate(new Date());
            } else {
                console.error('electronAPI.getNetworkState not available');
                setNetworkState({ error: 'API not available' });
            }
        } catch (error) {
            console.error('Failed to get network state:', error);
            setNetworkState({ error: error.message });
        }
    };

    useEffect(() => {
        // Initial fetch
        fetchNetworkState();

        // Refresh every 2 seconds
        const interval = setInterval(fetchNetworkState, 2000);

        // Listen for network state changes
        const handleNetworkSync = (event) => {
            if (event.state) {
                setNetworkState(event.state);
                setLastUpdate(new Date());
            }
        };

        if (window.electronAPI && window.electronAPI.onNetworkStateSync) {
            window.electronAPI.onNetworkStateSync(handleNetworkSync);
        }

        return () => {
            clearInterval(interval);
        };
    }, []);

    const baseStyle = {
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '5px 10px',
        fontSize: 12,
        cursor: 'pointer',
        borderRadius: 4,
    };
    
    const style = inFooter ? baseStyle : {
        ...baseStyle,
        position: 'fixed',
        bottom: 10,
        left: 160, // Position after collapsed HTTP Sources
        zIndex: 9999
    };
    
    return (
        <>
            <div
                style={style}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                Network: {networkState?.isOnline ? 
                    <span style={{ color: '#52c41a' }}>Online</span> : 
                    <span style={{ color: '#ff4d4f' }}>Offline</span>
                }
            </div>
            
            {isExpanded && (
                <div style={{ 
                    position: 'fixed', 
                    bottom: 50, // Above footer
                    left: 370, // Middle position - avoid collision with HTTP Sources
                    background: 'rgba(0,0,0,0.8)', 
                    color: 'white', 
                    padding: 10, 
                    fontSize: 11,
                    width: 600,
                    maxHeight: 200,
                    overflow: 'hidden',
                    zIndex: 9999,
                    borderRadius: 4
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <h4 style={{ margin: 0 }}>Debug: Network State</h4>
                        <button
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: 16,
                                padding: 0,
                                marginLeft: 10
                            }}
                            onClick={() => setIsExpanded(false)}
                        >
                            ×
                        </button>
                    </div>
                    {networkState?.error ? (
                        <div style={{ color: '#ff6b6b' }}>
                            Error: {networkState.error}
                        </div>
                    ) : networkState ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '140px 140px 140px 140px', gap: '10px' }}>
                            {/* Column 1: Basic Status */}
                            <div>
                                <div style={{ borderBottom: '1px solid #444', paddingBottom: 3, marginBottom: 5 }}>
                                    <strong>Status</strong>
                                </div>
                                <div>State: <span style={{ color: networkState.isOnline ? '#51cf66' : '#ff6b6b' }}>
                                    {networkState.isOnline ? 'ONLINE' : 'OFFLINE'}
                                </span></div>
                                <div>Quality: {networkState.networkQuality || 'unknown'}</div>
                                <div>Connection: {networkState.connectionType || 'unknown'}</div>
                                <div>VPN: {networkState.vpnActive ? '✓ Active' : '✗ Inactive'}</div>
                                <div>Version: {networkState.version || 0}</div>
                            </div>
                            
                            {/* Column 2: Diagnostics */}
                            <div>
                                <div style={{ borderBottom: '1px solid #444', paddingBottom: 3, marginBottom: 5 }}>
                                    <strong>Diagnostics</strong>
                                </div>
                                {networkState.diagnostics ? (
                                    <>
                                        <div>DNS: {networkState.diagnostics.dnsResolvable ? '✓' : '✗'}</div>
                                        <div>Internet: {networkState.diagnostics.internetReachable ? '✓' : '✗'}</div>
                                        <div>Latency: {networkState.diagnostics.latency || 0}ms</div>
                                        <div>Captive: {networkState.diagnostics.captivePortal ? 'Yes' : 'No'}</div>
                                    </>
                                ) : (
                                    <div style={{ color: '#999' }}>No diagnostics</div>
                                )}
                            </div>
                            
                            {/* Column 3: Interfaces */}
                            <div>
                                <div style={{ borderBottom: '1px solid #444', paddingBottom: 3, marginBottom: 5 }}>
                                    <strong>Interfaces</strong>
                                </div>
                                <div>Primary: {networkState.primaryInterface || 'None'}</div>
                                {networkState.interfaces && networkState.interfaces.length > 0 ? (
                                    <div style={{ fontSize: 10, color: '#ccc' }}>
                                        {networkState.interfaces.slice(0, 4).map((iface, idx) => (
                                            <div key={idx}>
                                                {Array.isArray(iface) ? iface[0] : iface.name || iface}
                                            </div>
                                        ))}
                                        {networkState.interfaces.length > 4 && <div>+{networkState.interfaces.length - 4} more</div>}
                                    </div>
                                ) : (
                                    <div style={{ color: '#999', fontSize: 10 }}>No interfaces</div>
                                )}
                            </div>
                            
                            {/* Column 4: Timestamps */}
                            <div>
                                <div style={{ borderBottom: '1px solid #444', paddingBottom: 3, marginBottom: 5 }}>
                                    <strong>Updates</strong>
                                </div>
                                <div style={{ fontSize: 10 }}>
                                    <div>State: {networkState.lastUpdate ? new Date(networkState.lastUpdate).toLocaleTimeString() : 'N/A'}</div>
                                    <div>UI: {lastUpdate.toLocaleTimeString()}</div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>Loading network state...</div>
                    )}
                </div>
            )}
        </>
    );
};