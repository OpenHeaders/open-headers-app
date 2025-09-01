/**
 * NetworkResponseTab Component
 * 
 * Displays response body with content type information
 * Formats JSON and other responses appropriately
 * 
 * @param {Object} props - Component props
 * @param {Object} props.request - Network request data
 * @param {Object} props.token - Ant Design theme token
 */
import React from 'react';
import { Space, Typography } from 'antd';

const { Text } = Typography;

const NetworkResponseTab = ({ request, token }) => {
    if (!request.responseBody) {
        return (
            <div style={{ height: '100%', overflow: 'auto', padding: '0' }}>
                <div style={{ padding: '16px', textAlign: 'center' }}>
                    <Text type="secondary">No response body</Text>
                </div>
            </div>
        );
    }

    let formattedResponse;
    let contentType = request.responseHeaders?.['content-type'] || '';

    try {
        if (contentType.includes('json') || typeof request.responseBody === 'object') {
            const jsonData = typeof request.responseBody === 'string'
                ? JSON.parse(request.responseBody)
                : request.responseBody;
            formattedResponse = JSON.stringify(jsonData, null, 2);
        } else {
            formattedResponse = typeof request.responseBody === 'string'
                ? request.responseBody
                : JSON.stringify(request.responseBody, null, 2);
        }
    } catch (e) {
        formattedResponse = String(request.responseBody);
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
                                Response Body
                            </Text>
                            <Text copyable={{ text: formattedResponse }} style={{ fontSize: '12px' }} />
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
                                {formattedResponse}
                            </pre>
                        </div>
                    </div>
                </Space>
            </div>
        </div>
    );
};

export default NetworkResponseTab;