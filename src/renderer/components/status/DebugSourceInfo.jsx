import React, { useState } from 'react';
import { useSources } from '../../hooks/workspace';

export const DebugSourceInfo = ({ inFooter = false }) => {
    const { sources } = useSources();
    const [isExpanded, setIsExpanded] = useState(false);
    
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
        position: 'fixed',
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
                    bottom: 50, // Above footer
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
                        {httpSources.map(source => (
                            <div key={source.sourceId} style={{ marginBottom: 10, borderBottom: '1px solid #444', paddingBottom: 5 }}>
                                <div>ID: {source.sourceId}</div>
                                <div>Enabled: {source.refreshOptions?.enabled ? 'Yes' : 'No'}</div>
                                <div>Interval: {source.refreshOptions?.interval}m</div>
                                <div>Last Refresh: {source.refreshOptions?.lastRefresh ? new Date(source.refreshOptions.lastRefresh).toLocaleTimeString() : 'Never'}</div>
                                <div>Next Refresh: {source.refreshOptions?.nextRefresh ? new Date(source.refreshOptions.nextRefresh).toLocaleTimeString() : 'Not scheduled'}</div>
                                <div>Has Content: {source.sourceContent ? 'Yes' : 'No'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
};