import React, { useEffect, useRef } from 'react';
import { Button, Space, Card, Typography, theme } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * JsonViewer component for displaying JSON data with filtering info
 */
const JsonViewer = ({ source, onRefresh }) => {
    // Get filtered and original data
    const filteredContent = source.sourceContent || '';
    const originalResponse = source.originalResponse || '';
    const jsonFilterPath = source.jsonFilter?.path || '';
    const { token } = theme.useToken();

    // Use refs to track previous values for comparison
    const prevSourceIdRef = useRef(null);
    const prevContentRef = useRef(null);
    const prevOriginalResponseRef = useRef(null);

    // Log only when component mounts or when important data changes
    useEffect(() => {
        const sourceId = source.sourceId;

        // Only log if this is the first render or if source data has changed
        if (
            prevSourceIdRef.current !== sourceId ||
            prevContentRef.current !== filteredContent ||
            prevOriginalResponseRef.current !== originalResponse
        ) {

            // Update refs with current values
            prevSourceIdRef.current = sourceId;
            prevContentRef.current = filteredContent;
            prevOriginalResponseRef.current = originalResponse;
        }
    }, [source.sourceId, filteredContent, originalResponse, jsonFilterPath]);

    // Format JSON for display
    const formatJson = (jsonString) => {
        try {
            if (typeof jsonString !== 'string' || !jsonString.trim()) {
                return 'No JSON content available';
            }

            // Try to parse and stringify to format
            if (jsonString.trim().startsWith('{') || jsonString.trim().startsWith('[')) {
                const parsed = JSON.parse(jsonString);
                return JSON.stringify(parsed, null, 2);
            }

            // Return as-is if not valid JSON
            return jsonString;
        } catch (error) {
            // Error formatting JSON
            return jsonString || 'Invalid JSON';
        }
    };

    return (
        <div>
            <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ marginBottom: 16 }}>
                    <Space>
                        <Button
                            onClick={onRefresh}
                            icon={<ReloadOutlined />}
                        >
                            Refresh JSON
                        </Button>

                        <Text type="secondary">
                            JSON Filter Path: <code>{jsonFilterPath || 'none'}</code>
                        </Text>
                    </Space>
                </div>

                <Card
                    title="Filtered Content"
                    size="small"
                    style={{ marginBottom: 16 }}
                >
                    <pre style={{
                        maxHeight: 200,
                        overflow: 'auto',
                        margin: 0,
                        background: token.colorBgLayout,
                        padding: 8,
                        fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                        fontSize: 12,
                        borderRadius: 6
                    }}>
                        {filteredContent}
                    </pre>
                </Card>

                <Card
                    title="Original JSON Response"
                    size="small"
                >
                    <pre style={{
                        maxHeight: 300,
                        overflow: 'auto',
                        margin: 0,
                        background: token.colorBgLayout,
                        padding: 8,
                        fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                        fontSize: 12,
                        borderRadius: 6
                    }}>
                        {formatJson(originalResponse)}
                    </pre>
                </Card>
            </Space>
        </div>
    );
};

export default JsonViewer;