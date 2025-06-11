import React, { useState, useEffect } from 'react';
import { Badge, Tooltip, Card, Space, Typography, Progress, Tag } from 'antd';
import {
    CheckCircleOutlined,
    WarningOutlined,
    StopOutlined,
    SyncOutlined
} from '@ant-design/icons';

const { Text } = Typography;

// Only show in development when circuit breaker status is enabled
const SHOW_STATUS = process.env.NODE_ENV === 'development' && 
                   process.env.REACT_APP_SHOW_CIRCUIT_BREAKER_STATUS === 'true';

export function CircuitBreakerStatus() {
    const [breakers, setBreakers] = useState({});
    const [isExpanded, setIsExpanded] = useState(false);
    
    useEffect(() => {
        if (!SHOW_STATUS || !window.circuitBreakerManager) {
            return;
        }
        
        // Update status every 2 seconds
        const updateStatus = () => {
            try {
                const status = window.circuitBreakerManager.getAllStatus();
                setBreakers(status || {});
            } catch (error) {
                console.error('Error getting circuit breaker status:', error);
            }
        };
        
        updateStatus();
        const interval = setInterval(updateStatus, 2000);
        
        return () => clearInterval(interval);
    }, []);
    
    if (!SHOW_STATUS) {
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
    
    const healthIcon = overallHealth === 'error' ? <StopOutlined /> :
                      overallHealth === 'warning' ? <WarningOutlined /> :
                      <CheckCircleOutlined />;
    
    const healthColor = overallHealth === 'error' ? '#ff4d4f' :
                       overallHealth === 'warning' ? '#faad14' :
                       '#52c41a';
    
    // Mini view (collapsed)
    if (!isExpanded) {
        return (
            <Tooltip title="Circuit Breaker Status (Click to expand)">
                <div
                    onClick={() => setIsExpanded(true)}
                    style={{
                        position: 'fixed',
                        bottom: 50,
                        right: 10,
                        backgroundColor: healthColor,
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        opacity: 0.9,
                        fontSize: '12px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 1000
                    }}
                >
                    {healthIcon}
                    <span>
                        CB: {breakerStates.CLOSED}/{breakerStates.total}
                    </span>
                </div>
            </Tooltip>
        );
    }
    
    // Expanded view
    return (
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
                bottom: 50,
                right: 10,
                width: 350,
                maxHeight: 400,
                overflow: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            Next attempt in {Math.round((breaker.nextAttemptTime - Date.now()) / 1000)}s
                                        </Text>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Space>
        </Card>
    );
}

// Export a hook to check circuit breaker health
export function useCircuitBreakerHealth() {
    const [health, setHealth] = useState('unknown');
    
    useEffect(() => {
        if (!SHOW_STATUS || !window.circuitBreakerManager) {
            return;
        }
        
        const checkHealth = () => {
            try {
                const hasOpen = window.circuitBreakerManager.hasOpenCircuits();
                setHealth(hasOpen ? 'unhealthy' : 'healthy');
            } catch (error) {
                setHealth('error');
            }
        };
        
        checkHealth();
        const interval = setInterval(checkHealth, 5000);
        
        return () => clearInterval(interval);
    }, []);
    
    return health;
}