import React, { useState, useEffect } from 'react';
import { useSources } from '../../hooks/workspace';
import { useRefreshManager } from '../../contexts';

export const DebugSourceInfo = ({ inFooter = false }: { inFooter?: boolean }) => {
    const { sources } = useSources();
    const refreshManager = useRefreshManager();
    const [isExpanded, setIsExpanded] = useState(false);
    const [, setTick] = useState(0);

    // Tick every second so countdowns update
    useEffect(() => {
        if (!isExpanded) return;
        const timer = setInterval(() => setTick(n => n + 1), 1000);
        return () => clearInterval(timer);
    }, [isExpanded]);

    const httpSources = sources.filter(s => s.sourceType === 'http');

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
        position: 'fixed' as const,
        bottom: 10,
        left: 10,
        zIndex: 9999
    };

    return (
        <>
            <div style={style} onClick={() => setIsExpanded(!isExpanded)}>
                HTTP Sources ({httpSources.length})
            </div>

            {isExpanded && (
                <div style={{
                    position: 'fixed',
                    bottom: 50,
                    left: 10,
                    background: 'rgba(0,0,0,0.8)',
                    color: 'white',
                    padding: 10,
                    fontSize: 12,
                    maxWidth: 400,
                    maxHeight: 200,
                    overflow: 'auto',
                    zIndex: 9999,
                    borderRadius: 4
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0 }}>Debug: HTTP Sources</h4>
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
                    <div style={{ marginTop: 10 }}>
                        {httpSources.map(source => {
                            const status = refreshManager.getRefreshStatus(source.sourceId);
                            const timeUntilMs = refreshManager.getTimeUntilRefresh(source.sourceId, source);
                            const timeUntilSec = Math.ceil(timeUntilMs / 1000);

                            return (
                                <div key={source.sourceId} style={{ marginBottom: 10, borderBottom: '1px solid #444', paddingBottom: 5 }}>
                                    <div>ID: {source.sourceId}</div>
                                    <div>Auto-refresh: {source.refreshOptions?.enabled ? 'Yes' : 'No'}</div>
                                    <div>Interval: {source.refreshOptions?.interval}m</div>
                                    <div>Last Refresh: {source.refreshOptions?.lastRefresh ? new Date(source.refreshOptions.lastRefresh).toLocaleTimeString() : 'Never'}</div>
                                    <div>Next Refresh: {timeUntilMs > 0 ? `${timeUntilSec}s` : 'Now'}</div>
                                    <div>Refreshing: {status.isRefreshing ? 'Yes' : 'No'}</div>
                                    <div>Has Content: {source.sourceContent ? 'Yes' : 'No'}</div>
                                    {status.failureCount > 0 && (
                                        <div style={{ color: '#ff6b6b' }}>Failures: {status.failureCount}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
};
