/**
 * NetworkHeadersTab Component
 * 
 * Displays request and response headers in organized sections
 * Shows general info, response headers, and request headers
 * 
 * @param {Object} props - Component props
 * @param {Object} props.request - Network request data
 * @param {Object} props.token - Ant Design theme token
 */
import React from 'react';
import { Space, Typography } from 'antd';

const { Text } = Typography;

const NetworkHeadersTab = ({ request, token }) => {
    const renderHeaderSection = (title, headers) => {
        if (!headers || Object.keys(headers).length === 0) return null;
        
        return (
            <div>
                <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>
                    ▼ {title}
                </Text>
                <div style={{ marginTop: '8px', marginLeft: '16px' }}>
                    {Object.entries(headers).map(([key, value]) => (
                        <div key={key} style={{ display: 'flex', marginBottom: '4px', gap: '8px' }}>
                            <Text style={{ 
                                minWidth: '200px', 
                                width: '200px', 
                                flexShrink: 0, 
                                fontSize: '12px', 
                                color: token.colorTextTertiary 
                            }}>
                                {key}:
                            </Text>
                            <Text style={{ fontSize: '12px', wordBreak: 'break-all', flex: 1 }}>
                                {String(value)}
                            </Text>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div style={{ height: '100%', overflow: 'auto', padding: '0' }}>
            <div style={{ padding: '16px' }}>
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                    {/* General Section */}
                    <div>
                        <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>
                            ▼ General
                        </Text>
                        <div style={{ marginTop: '8px', marginLeft: '16px' }}>
                            <div style={{ display: 'flex', marginBottom: '4px', gap: '8px' }}>
                                <Text style={{ 
                                    minWidth: '200px', 
                                    width: '200px', 
                                    flexShrink: 0, 
                                    fontSize: '12px', 
                                    color: token.colorTextTertiary 
                                }}>
                                    Request URL:
                                </Text>
                                <Text copyable style={{ fontSize: '12px', wordBreak: 'break-all', flex: 1 }}>
                                    {request.url}
                                </Text>
                            </div>
                            <div style={{ display: 'flex', marginBottom: '4px', gap: '8px' }}>
                                <Text style={{ 
                                    minWidth: '200px', 
                                    width: '200px', 
                                    flexShrink: 0, 
                                    fontSize: '12px', 
                                    color: token.colorTextTertiary 
                                }}>
                                    Request Method:
                                </Text>
                                <Text style={{ fontSize: '12px' }}>{request.method}</Text>
                            </div>
                            <div style={{ display: 'flex', marginBottom: '4px', gap: '8px' }}>
                                <Text style={{ 
                                    minWidth: '200px', 
                                    width: '200px', 
                                    flexShrink: 0, 
                                    fontSize: '12px', 
                                    color: token.colorTextTertiary 
                                }}>
                                    Status Code:
                                </Text>
                                <Text style={{ fontSize: '12px' }}>{request.status || 'Failed'}</Text>
                            </div>
                            {request.remoteAddress && (
                                <div style={{ display: 'flex', marginBottom: '4px', gap: '8px' }}>
                                    <Text style={{ 
                                        minWidth: '200px', 
                                        width: '200px', 
                                        flexShrink: 0, 
                                        fontSize: '12px', 
                                        color: token.colorTextTertiary 
                                    }}>
                                        Remote Address:
                                    </Text>
                                    <Text style={{ fontSize: '12px' }}>{request.remoteAddress}</Text>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Response Headers */}
                    {renderHeaderSection('Response Headers', request.responseHeaders)}

                    {/* Request Headers */}
                    {renderHeaderSection('Request Headers', request.requestHeaders)}
                </Space>
            </div>
        </div>
    );
};

export default NetworkHeadersTab;