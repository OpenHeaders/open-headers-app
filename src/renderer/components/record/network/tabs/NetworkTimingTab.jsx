/**
 * NetworkTimingTab Component
 * 
 * Displays request timing breakdown and details
 * Shows DNS, connection, SSL, waiting, and download times
 * 
 * @param {Object} props - Component props
 * @param {Object} props.request - Network request data
 * @param {Object} props.record - Full record for context
 * @param {Object} props.token - Ant Design theme token
 */
import React from 'react';
import { Space, Typography } from 'antd';
import { format24HTimeWithMs } from '../../../../utils';

const { Text } = Typography;

const NetworkTimingTab = ({ request, record, token }) => {
    const duration = request.duration || (request.endTime - request.timestamp) || 0;
    const timing = request.timing || {};

    const formatTimeWithMs = (relativeMs) => {
        const absoluteTime = new Date(record.metadata.startTime + relativeMs);
        const formattedTime = format24HTimeWithMs(absoluteTime);
        return (
            <span>
                {formattedTime.time}
                <span style={{ fontSize: '0.85em', opacity: 0.8 }}>{formattedTime.ms}</span>
            </span>
        );
    };

    const renderTimingItem = (label, value, unit = 'ms') => {
        if (value === undefined || value === null) return null;
        
        return (
            <div style={{ display: 'flex', marginBottom: '4px' }}>
                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>
                    {label}:
                </Text>
                <Text style={{ fontSize: '12px' }}>
                    {typeof value === 'number' ? value.toFixed(2) : value} {unit}
                </Text>
            </div>
        );
    };

    return (
        <div style={{ height: '100%', overflow: 'auto', padding: '0' }}>
            <div style={{ padding: '16px' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                        <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>
                            Timing Breakdown
                        </Text>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                        {renderTimingItem('Total Time', duration)}
                        {renderTimingItem('DNS Lookup', timing.dns)}
                        {renderTimingItem('Initial Connection', timing.connect)}
                        {renderTimingItem('SSL', timing.ssl)}
                        {renderTimingItem('Waiting (TTFB)', timing.waiting)}
                        {renderTimingItem('Content Download', timing.download)}
                    </div>

                    <div style={{ marginTop: '16px' }}>
                        <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>
                            Request Details
                        </Text>
                        <div style={{ marginTop: '8px' }}>
                            <div style={{ display: 'flex', marginBottom: '4px' }}>
                                <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>
                                    Started At:
                                </Text>
                                <Text style={{ fontSize: '12px' }}>
                                    {formatTimeWithMs(request.timestamp)}
                                </Text>
                            </div>
                            {request.endTime && (
                                <div style={{ display: 'flex', marginBottom: '4px' }}>
                                    <Text style={{ width: '140px', fontSize: '12px', color: token.colorTextTertiary }}>
                                        Completed At:
                                    </Text>
                                    <Text style={{ fontSize: '12px' }}>
                                        {formatTimeWithMs(request.endTime)}
                                    </Text>
                                </div>
                            )}
                        </div>
                    </div>
                </Space>
            </div>
        </div>
    );
};

export default NetworkTimingTab;