import { useSettings } from '../../contexts';
import React, { useState, useEffect } from 'react';
import { Badge, Card, Space, Typography, Progress, Tag } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { adaptiveCircuitBreakerManager } from '../../utils/error-handling';

const { Text } = Typography;

export function CircuitBreakerStatus({ inFooter = false }) {
    const { settings } = useSettings();
    const [breakers, setBreakers] = useState({});
    const [isExpanded, setIsExpanded] = useState(false);
    
    useEffect(() => {
        // Update status every 2 seconds
        const updateStatus = () => {
            try {
                const status = adaptiveCircuitBreakerManager.getAllStatus();
                setBreakers(status || {});
            } catch (error) {
                console.error('Error getting circuit breaker status:', error);
            }
        };
        
        updateStatus();
        const interval = setInterval(updateStatus, 2000);
        
        return () => clearInterval(interval);
    }, []);
    
    // Only show in developer mode
    if (!settings?.developerMode) {
        return null;
    }
    
    // Count breakers by state
    const breakerStates = Object.values(breakers).reduce((acc, breaker) => {
        acc[breaker.state] = (acc[breaker.state] || 0) + 1;
        acc.total++;
        return acc;
    }, { total: 0, CLOSED: 0, OPEN: 0, HALF_OPEN: 0 });
    
    // Determine overall health
    const overallHealth = breakerStates.OPEN > 0 ? 'error' : 
                         breakerStates.HALF_OPEN > 0 ? 'warning' : 
                         'success';
    
    const healthColor = overallHealth === 'error' ? '#ff4d4f' :
                       overallHealth === 'warning' ? '#faad14' :
                       '#52c41a';
    
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
        left: 280, // Position after Network State
        zIndex: 9999
    };
    
    return (
        <>
            {/* Mini view (always visible) */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={style}
            >
                Circuit Breaker: <span style={{ color: healthColor }}>
                    {breakerStates.CLOSED}/{breakerStates.total}
                </span>
            </div>
            
            {/* Expanded view */}
            {isExpanded && (
                <Card
                    title={
                        <Space>
                            <SyncOutlined spin />
                            <Text>Circuit Breaker Status</Text>
                        </Space>
                    }
                    size="small"
                    extra={
                        <a onClick={() => setIsExpanded(false)}>Minimize</a>
                    }
                    style={{
                        position: 'fixed',
                        bottom: 50, // Above footer
                        right: 10,
                        width: 350,
                        maxHeight: 400,
                        overflow: 'auto',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                        zIndex: 1000
                    }}
                >
                    <Space direction="vertical" style={{ width: '100%' }}>
                        {/* Summary */}
                        <div>
                            <Space>
                                <Badge status={overallHealth} />
                                <Text strong>Overall Health</Text>
                            </Space>
                            <div style={{ marginTop: 8 }}>
                                <Space size="small">
                                    <Tag color="success">{breakerStates.CLOSED} Closed</Tag>
                                    {breakerStates.HALF_OPEN > 0 && (
                                        <Tag color="warning">{breakerStates.HALF_OPEN} Half-Open</Tag>
                                    )}
                                    {breakerStates.OPEN > 0 && (
                                        <Tag color="error">{breakerStates.OPEN} Open</Tag>
                                    )}
                                </Space>
                            </div>
                        </div>
                        
                        {/* Individual breakers */}
                        <div style={{ marginTop: 16 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>Individual Breakers:</Text>
                            <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
                                {Object.entries(breakers).map(([name, breaker]) => {
                                    const stateColor = breaker.state === 'CLOSED' ? 'success' :
                                                     breaker.state === 'HALF_OPEN' ? 'warning' :
                                                     'error';
                                    
                                    const successRate = breaker.metrics.totalRequests > 0
                                        ? (breaker.metrics.totalSuccesses / breaker.metrics.totalRequests * 100).toFixed(1)
                                        : 0;
                                    
                                    return (
                                        <div 
                                            key={name} 
                                            style={{ 
                                                marginBottom: 12,
                                                padding: 8,
                                                backgroundColor: '#fafafa',
                                                borderRadius: 4
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={{ fontSize: 12 }}>{name}</Text>
                                                <Badge status={stateColor} text={breaker.state} />
                                            </div>
                                            
                                            {breaker.metrics.totalRequests > 0 && (
                                                <div style={{ marginTop: 4 }}>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        Success Rate: {successRate}% ({breaker.metrics.totalSuccesses}/{breaker.metrics.totalRequests})
                                                    </Text>
                                                    <Progress 
                                                        percent={parseFloat(successRate)} 
                                                        size="small" 
                                                        showInfo={false}
                                                        strokeColor={parseFloat(successRate) > 80 ? '#52c41a' : '#faad14'}
                                                    />
                                                </div>
                                            )}
                                            
                                            {breaker.state === 'OPEN' && breaker.nextAttemptTime && (
                                                <div style={{ marginTop: 4 }}>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        Next attempt in {Math.round((breaker.nextAttemptTime - Date.now()) / 1000)}s
                                                    </Text>
                                                    {breaker.backoff && breaker.backoff.consecutiveOpenings > 0 && (
                                                        <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                                            Backoff: {breaker.backoff.consecutiveOpenings}x (timeout: {Math.round(breaker.backoff.currentTimeout / 1000)}s)
                                                        </Text>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </Space>
                </Card>
            )}
        </>
    );
}