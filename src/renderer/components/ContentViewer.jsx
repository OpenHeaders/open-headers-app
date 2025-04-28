import React, { useState, useEffect, useRef } from 'react';
import { Modal, Card, Button, Typography, Space, Tabs, Divider, Skeleton, Table } from 'antd';
import { FileTextOutlined, ReloadOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { showMessage } from '../utils/messageUtil';

const { Text } = Typography;

/**
 * ContentViewer component for displaying source content in a modal
 * With improved headers extraction and display
 */
const ContentViewer = ({ source, open, onClose, onRefresh }) => {
    const [activeTab, setActiveTab] = useState('content');
    const [loading, setLoading] = useState(false);
    const [copyingContent, setCopyingContent] = useState(false);
    const [copyingJson, setCopyingJson] = useState(false);

    // Store our own internal copy of content to avoid the intermediate "Refreshing..." state
    const [internalContent, setInternalContent] = useState(null);
    const [internalOriginalJson, setInternalOriginalJson] = useState(null);
    const [responseHeaders, setResponseHeaders] = useState(null);

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

            // Check if the source has headers directly
            if (source.headers) {
                console.log('ContentViewer: Found headers in source:', source.headers);
            }

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

                // Try to extract headers from source
                extractHeaders(source);

                // If we were refreshing and got new content, clear the loading state
                if (refreshingRef.current && source.sourceContent !== 'Refreshing...') {
                    console.log('ContentViewer: Refresh completed with new content');
                    refreshingRef.current = false;
                    setLoading(false);
                }
            }
        }
    }, [source?.sourceId, source?.sourceContent, source?.originalJson, source?.headers, internalContent, internalOriginalJson]);

    // Extract headers from source or originalJson - Improved version
    const extractHeaders = (source) => {
        console.log("Attempting to extract headers for source:", source?.sourceId);

        // First check if there are headers directly in the source
        if (source?.headers) {
            console.log("Found headers directly in source object:", source.headers);
            setResponseHeaders(source.headers);
            return;
        }

        // Check for rawResponse property
        if (source?.rawResponse) {
            try {
                console.log("Trying to extract headers from rawResponse");
                const parsed = JSON.parse(source.rawResponse);
                if (parsed && parsed.headers) {
                    console.log("Found headers in rawResponse:", parsed.headers);
                    setResponseHeaders(parsed.headers);
                    return;
                }
            } catch (e) {
                console.log("Failed to parse rawResponse:", e);
            }
        }

        // Try to parse headers from originalJson if it's a string
        if (source?.originalJson && typeof source.originalJson === 'string') {
            try {
                // First try parsing as JSON
                const parsedJson = JSON.parse(source.originalJson);
                if (parsedJson.headers) {
                    console.log("Extracted headers from parsed originalJson:", parsedJson.headers);
                    setResponseHeaders(parsedJson.headers);
                    return;
                }
            } catch (e) {
                console.log("originalJson is not valid JSON, will try alternate approach");
            }

            // Try to extract headers using a more lenient regex approach
            try {
                const headerPattern = /"headers":\s*(\{[^}]+\})/;
                const match = source.originalJson.match(headerPattern);

                if (match && match[1]) {
                    try {
                        // Try to clean and parse the matched JSON
                        const headersText = match[1]
                            .replace(/\\"/g, '"')  // Replace escaped quotes
                            .replace(/([{,])\s*([a-zA-Z0-9_-]+):/g, '$1"$2":'); // Add quotes to keys

                        console.log("Attempting to parse headers match:", headersText.substring(0, 50) + "...");
                        const headers = JSON.parse(headersText);

                        console.log("Successfully extracted headers using regex:", headers);
                        setResponseHeaders(headers);
                        return;
                    } catch (err) {
                        console.log("Failed to parse headers from regex match:", err);
                    }
                } else {
                    console.log("No headers pattern found in originalJson");
                }
            } catch (regexErr) {
                console.log("Regex extraction approach failed:", regexErr);
            }
        }

        // Check for other properties on source that might contain headers
        if (source?.sourceContent && typeof source.sourceContent === 'string') {
            // Try to find headers in the source content
            if (source.sourceContent.includes('"headers":')) {
                try {
                    const headerMatch = source.sourceContent.match(/"headers":\s*(\{[^}]+\})/);
                    if (headerMatch && headerMatch[1]) {
                        try {
                            // Add proper formatting to the matched object
                            const cleanedMatch = headerMatch[1]
                                .replace(/\\"/g, '"')
                                .replace(/([{,])\s*([a-zA-Z0-9_-]+):/g, '$1"$2":');

                            const headers = JSON.parse(cleanedMatch);
                            console.log("Extracted headers from sourceContent:", headers);
                            setResponseHeaders(headers);
                            return;
                        } catch (err) {
                            console.log("Failed to parse headers from sourceContent match:", err);
                        }
                    }
                } catch (e) {
                    console.log("Failed to extract headers from sourceContent:", e);
                }
            }

            // Try a more aggressive extraction approach for cases where the headers might be malformed
            try {
                // Look for a larger chunk that might contain the headers
                const fullResponseMatch = source.sourceContent.match(/\{[\s\S]*?"headers"[\s\S]*?\}/);
                if (fullResponseMatch) {
                    console.log("Found potential full response object, trying to extract headers");
                    try {
                        const fullResponse = JSON.parse(fullResponseMatch[0]);
                        if (fullResponse.headers) {
                            console.log("Extracted headers from full response object:", fullResponse.headers);
                            setResponseHeaders(fullResponse.headers);
                            return;
                        }
                    } catch (err) {
                        console.log("Failed to parse full response match:", err);
                    }
                }
            } catch (e) {
                console.log("Failed aggressive extraction approach:", e);
            }
        }

        // Manual fallback for common headers
        console.log("Attempting to create fallback headers from available information");
        const fallbackHeaders = {};

        // Check if we can extract content-type from the response
        if (source?.sourceContent?.includes('<!doctype html>') ||
            source?.originalJson?.includes('<!doctype html>')) {
            fallbackHeaders['content-type'] = 'text/html';
        }

        if (Object.keys(fallbackHeaders).length > 0) {
            console.log("Created fallback headers:", fallbackHeaders);
            setResponseHeaders(fallbackHeaders);
            return;
        }

        // If we couldn't find headers, set to null and show message
        console.log("No headers found in any source property after trying all methods");
        setResponseHeaders(null);
    };

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
            showMessage('error', `Failed to refresh content: ${error.message}`);
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
                showMessage('success', 'Copied to clipboard');
            })
            .catch(err => {
                showMessage('error', 'Failed to copy content');
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

    // Prepare headers data for the table
    const getHeadersData = () => {
        if (!responseHeaders) return [];

        return Object.entries(responseHeaders).map(([key, value], index) => ({
            key: index,
            name: key,
            value: value
        }));
    };

    // Headers table columns
    const headersColumns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            width: '40%',
            render: (text) => <Text strong style={{ fontSize: 12 }}>{text}</Text>
        },
        {
            title: 'Value',
            dataIndex: 'value',
            key: 'value',
            width: '60%',
            render: (text) => <Text style={{ fontSize: 12, wordBreak: 'break-all' }}>{text}</Text>
        }
    ];

    // Define tabs items for HTTP sources with JSON
    const items = [
        {
            key: 'content',
            label: 'Filtered Response',
            children: (
                <div>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Always show JSON filter path info, display N/A if no filter is enabled */}
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            JSON Filter Path: <code>{hasJsonFilter ? source?.jsonFilter?.path : 'N/A'}</code>
                        </Text>
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
            label: 'Response',
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

    // Add headers tab for HTTP sources
    if (isHttpSource) {
        items.push({
            key: 'headers',
            label: 'Headers',
            children: (
                <div className="response-headers">
                    {loading ? (
                        <ContentSkeleton />
                    ) : responseHeaders && Object.keys(responseHeaders).length > 0 ? (
                        <Table
                            columns={headersColumns}
                            dataSource={getHeadersData()}
                            pagination={false}
                            size="small"
                            className="headers-table"
                            style={{ fontSize: 12 }}
                        />
                    ) : (
                        <div className="no-headers" style={{
                            padding: '20px 0',
                            textAlign: 'center',
                            color: '#999',
                            fontStyle: 'italic',
                            fontSize: 12
                        }}>
                            No headers available
                        </div>
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
                        {loading ? 'Refreshing...' : 'Refresh Content'}
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
            {isHttpSource ? (
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={items}
                    type="card"
                    size="small"
                />
            ) : (
                <Card size="small">
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* For non-HTTP sources or without original JSON, also show filter status */}
                        {isHttpSource && (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                JSON Filter Path: <code>N/A</code>
                            </Text>
                        )}
                        <Button
                            size="small"
                            icon={copyingContent ? <CheckOutlined /> : <CopyOutlined />}
                            onClick={() => handleCopy(internalContent || '', 'content')}
                            disabled={loading}
                            type={copyingContent ? "success" : "default"}
                            style={{ marginLeft: 'auto' }}
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
                </Card>
            )}
        </Modal>
    );
};

export default ContentViewer;