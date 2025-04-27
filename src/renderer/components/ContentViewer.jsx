import React, { useState, useEffect, useRef } from 'react';
import { Modal, Card, Button, Typography, Space, Tabs, Divider, Skeleton, message } from 'antd';
import { FileTextOutlined, ReloadOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * ContentViewer component for displaying source content in a modal
 * Includes special handling for HTTP JSON responses
 */
const ContentViewer = ({ source, open, onClose, onRefresh }) => {
    const [activeTab, setActiveTab] = useState('content');
    const [loading, setLoading] = useState(false);
    const [copyingContent, setCopyingContent] = useState(false);
    const [copyingJson, setCopyingJson] = useState(false);

    // Store our own internal copy of content to avoid the intermediate "Refreshing..." state
    const [internalContent, setInternalContent] = useState(null);
    const [internalOriginalJson, setInternalOriginalJson] = useState(null);

    // Keep track of whether we're currently refreshing
    const refreshingRef = useRef(false);

    // Initialize or update internal content when source changes
    useEffect(() => {
        if (source) {
            console.log('ContentViewer: Source data received:', {
                id: source.sourceId,
                content: source.sourceContent?.substring(0, 30),
                originalJson: source.originalJson?.substring(0, 30)
            });

            // Only update internal content when:
            // 1. It's not already set
            // 2. The content is not the intermediate "Refreshing..." message
            // 3. We're not currently in a refresh operation (or the refresh is completing)
            if (
                (!internalContent || !internalOriginalJson) ||
                (source.sourceContent !== 'Refreshing...' &&
                    (source.sourceContent !== internalContent || source.originalJson !== internalOriginalJson))
            ) {
                console.log('ContentViewer: Updating internal content');
                setInternalContent(source.sourceContent);
                setInternalOriginalJson(source.originalJson);

                // If we were refreshing and got new content, clear the loading state
                if (refreshingRef.current && source.sourceContent !== 'Refreshing...') {
                    console.log('ContentViewer: Refresh completed with new content');
                    refreshingRef.current = false;
                    setLoading(false);
                }
            }
        }
    }, [source?.sourceId, source?.sourceContent, source?.originalJson, internalContent, internalOriginalJson]);

    // Handle refresh click with custom logic
    const handleRefresh = async () => {
        if (!onRefresh || !source) return;

        console.log('ContentViewer: Initiating refresh for source', source.sourceId);
        setLoading(true);
        refreshingRef.current = true;

        try {
            // Perform the refresh
            const success = await onRefresh(source.sourceId);

            // If refresh failed, clear loading state
            if (!success) {
                console.log('ContentViewer: Refresh failed, clearing loading state');
                refreshingRef.current = false;
                setLoading(false);
            }
            // Otherwise wait for the new content to arrive
        } catch (error) {
            console.error('ContentViewer: Error during refresh:', error);
            message.error(`Failed to refresh content: ${error.message}`);
            refreshingRef.current = false;
            setLoading(false);
        }
    };

    // Check if this is an HTTP source with JSON content
    const isHttpSource = source?.sourceType === 'http';
    const hasJsonFilter = source?.jsonFilter?.enabled && source?.jsonFilter?.path;
    const hasOriginalJson = !!internalOriginalJson;

    // Content skeleton for loading state
    const ContentSkeleton = () => (
        <div>
            <Skeleton.Input style={{ width: '30%', height: 16 }} active size="small" />
            <div style={{ marginTop: 8 }}>
                <Skeleton.Input style={{ width: '100%', height: 100 }} active size="small" />
            </div>
        </div>
    );

    // Format content for display
    const formatContent = (content) => {
        try {
            // If it looks like JSON, try to format it
            if (
                typeof content === 'string' &&
                (content.trim().startsWith('{') || content.trim().startsWith('['))
            ) {
                try {
                    const parsed = JSON.parse(content);
                    return JSON.stringify(parsed, null, 2);
                } catch (e) {
                    // If parsing fails, return as-is
                    return content;
                }
            }
            return content || 'No content available';
        } catch (error) {
            console.error('Error formatting content:', error);
            return content || 'No content available';
        }
    };

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
            console.error('Error formatting JSON:', error);
            return jsonString || 'Invalid JSON';
        }
    };

    // Handle copy to clipboard
    const handleCopy = (text, type = 'content') => {
        // Set the appropriate copying state
        if (type === 'content') {
            setCopyingContent(true);
        } else {
            setCopyingJson(true);
        }

        navigator.clipboard.writeText(text)
            .then(() => {
                // Show success message
                message.success('Copied to clipboard');
            })
            .catch(err => {
                message.error('Failed to copy content');
                console.error('Failed to copy content:', err);
            })
            .finally(() => {
                // Reset copying state after a short delay
                setTimeout(() => {
                    if (type === 'content') {
                        setCopyingContent(false);
                    } else {
                        setCopyingJson(false);
                    }
                }, 1000);
            });
    };

    // Define tabs items for HTTP JSON sources
    const items = [
        {
            key: 'content',
            label: 'Filtered Content',
            children: (
                <div>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {hasJsonFilter && (
                            <Text type="secondary">
                                JSON Filter Path: <code>{source?.jsonFilter?.path || 'none'}</code>
                            </Text>
                        )}
                        <Button
                            size="small"
                            icon={copyingContent ? <CheckOutlined /> : <CopyOutlined />}
                            onClick={() => handleCopy(internalContent || '', 'content')}
                            disabled={loading}
                            type={copyingContent ? "success" : "default"}
                        >
                            {copyingContent ? 'Copied!' : 'Copy'}
                        </Button>
                    </div>

                    {loading ? (
                        <ContentSkeleton />
                    ) : (
                        <pre style={{
                            maxHeight: 300,
                            overflow: 'auto',
                            margin: 0,
                            background: '#f5f5f7',
                            padding: 12,
                            fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                            fontSize: 12,
                            borderRadius: 6,
                            border: '1px solid #f0f0f0',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                        }}>
                            {formatContent(internalContent)}
                        </pre>
                    )}
                </div>
            )
        }
    ];

    // Add original JSON tab for HTTP sources with JSON data
    if (isHttpSource && hasOriginalJson) {
        items.push({
            key: 'originalJson',
            label: 'Original JSON Response',
            children: (
                <div>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            size="small"
                            icon={copyingJson ? <CheckOutlined /> : <CopyOutlined />}
                            onClick={() => handleCopy(internalOriginalJson || '', 'json')}
                            disabled={loading}
                            type={copyingJson ? "success" : "default"}
                        >
                            {copyingJson ? 'Copied!' : 'Copy'}
                        </Button>
                    </div>

                    {loading ? (
                        <ContentSkeleton />
                    ) : (
                        <pre style={{
                            maxHeight: 300,
                            overflow: 'auto',
                            margin: 0,
                            background: '#f5f5f7',
                            padding: 12,
                            fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                            fontSize: 12,
                            borderRadius: 6,
                            border: '1px solid #f0f0f0',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                        }}>
                            {formatJson(internalOriginalJson)}
                        </pre>
                    )}
                </div>
            )
        });
    }

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <FileTextOutlined style={{ marginRight: 8 }} />
                    Source Content {source?.sourceTag ? `- ${source.sourceTag}` : ''}
                </div>
            }
            open={open}
            onCancel={onClose}
            width={700}
            destroyOnClose={false}
            footer={[
                isHttpSource && (
                    <Button
                        key="refresh"
                        onClick={handleRefresh}
                        icon={<ReloadOutlined />}
                        loading={loading}
                        disabled={loading}
                    >
                        {loading ? 'Refreshing...' : 'Refresh now'}
                    </Button>
                ),
                <Button key="close" onClick={onClose}>
                    Close
                </Button>
            ].filter(Boolean)}
        >
            <Card size="small" style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 8 }}>
                    <Text strong>Source:</Text>{' '}
                    <Text>{source?.sourcePath || ''}</Text>
                </div>
                <div style={{ marginBottom: 8 }}>
                    <Text strong>Type:</Text>{' '}
                    <Text>{source?.sourceType?.toUpperCase() || ''}</Text>
                </div>
                {isHttpSource && (
                    <div style={{ marginBottom: 8 }}>
                        <Text strong>Method:</Text>{' '}
                        <Text>{source?.sourceMethod || 'GET'}</Text>
                    </div>
                )}
            </Card>

            {/* Use Tabs for HTTP sources with JSON, otherwise just show content */}
            {isHttpSource && hasOriginalJson ? (
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={items}
                    type="card"
                />
            ) : (
                <Card size="small">
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            size="small"
                            icon={copyingContent ? <CheckOutlined /> : <CopyOutlined />}
                            onClick={() => handleCopy(internalContent || '', 'content')}
                            disabled={loading}
                            type={copyingContent ? "success" : "default"}
                        >
                            {copyingContent ? 'Copied!' : 'Copy'}
                        </Button>
                    </div>

                    {loading ? (
                        <ContentSkeleton />
                    ) : (
                        <pre style={{
                            maxHeight: 400,
                            overflow: 'auto',
                            margin: 0,
                            background: '#f5f5f7',
                            padding: 12,
                            fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                            fontSize: 12,
                            borderRadius: 6,
                            border: '1px solid #f0f0f0',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                        }}>
                            {formatContent(internalContent)}
                        </pre>
                    )}
                </Card>
            )}
        </Modal>
    );
};

export default ContentViewer;