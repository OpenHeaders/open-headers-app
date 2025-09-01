/**
 * NetworkPayloadTab Component
 * 
 * Displays request body with content type information
 * Formats JSON and other payloads appropriately
 * 
 * @param {Object} props - Component props
 * @param {Object} props.request - Network request data
 * @param {Object} props.token - Ant Design theme token
 */
import React from 'react';
import { Space, Typography } from 'antd';

const { Text } = Typography;

const NetworkPayloadTab = ({ request, token }) => {
    if (!request.requestBody) {
        return (
            <div style={{ height: '100%', overflow: 'auto', padding: '0' }}>
                <div style={{ padding: '16px', textAlign: 'center' }}>
                    <Text type="secondary">No request body</Text>
                </div>
            </div>
        );
    }

    let formattedPayload;
    let contentType = request.requestHeaders?.['content-type'] || request.requestHeaders?.['Content-Type'] || '';

    try {
        if (contentType.includes('json') || typeof request.requestBody === 'object') {
            const jsonData = typeof request.requestBody === 'string'
                ? JSON.parse(request.requestBody)
                : request.requestBody;
            formattedPayload = JSON.stringify(jsonData, null, 2);
        } else {
            formattedPayload = typeof request.requestBody === 'string'
                ? request.requestBody
                : JSON.stringify(request.requestBody, null, 2);
        }
    } catch (e) {
        formattedPayload = String(request.requestBody);
    }

    return (
        <div style={{ height: '100%', overflow: 'auto', padding: '0' }}>
            <div style={{ padding: '16px' }}>
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                    {contentType && (
                        <div>
                            <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>
                                Content Type
                            </Text>
                            <div style={{ marginTop: '8px' }}>
                                <Text style={{ fontSize: '12px' }}>{contentType}</Text>
                            </div>
                        </div>
                    )}

                    <div>
                        <Space>
                            <Text strong style={{ fontSize: '13px', color: token.colorTextSecondary }}>
                                Request Body
                            </Text>
                            <Text copyable={{ text: formattedPayload }} style={{ fontSize: '12px' }} />
                        </Space>
                        <div style={{ marginTop: '8px' }}>
                            <pre style={{
                                fontSize: '12px',
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                                backgroundColor: token.colorBgLayout,
                                padding: '12px',
                                borderRadius: '6px',
                                border: `1px solid ${token.colorBorderSecondary}`
                            }}>
                                {formattedPayload}
                            </pre>
                        </div>
                    </div>
                </Space>
            </div>
        </div>
    );
};

export default NetworkPayloadTab;