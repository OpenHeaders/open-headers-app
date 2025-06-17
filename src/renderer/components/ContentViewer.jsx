import React, { useState, useEffect, useRef } from 'react';
import { Modal, Card, Button, Typography, Space, Tabs, Divider, Skeleton, Table, theme } from 'antd';
import { FileTextOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { showMessage } from '../utils/messageUtil';

const { Text } = Typography;

/**
 * ContentViewer component for displaying source content in a modal
 * With improved headers extraction and display and no refresh option
 */
const ContentViewer = ({ source, open, onClose }) => {
    const [activeTab, setActiveTab] = useState('content');
    const [copyingContent, setCopyingContent] = useState(false);
    const [copyingJson, setCopyingJson] = useState(false);
    const { token } = theme.useToken();

    // Store our own internal copy of content to avoid the intermediate "Refreshing..." state
    const [internalContent, setInternalContent] = useState(null);
    const [internalOriginalResponse, setInternalOriginalResponse] = useState(null);
    const [responseHeaders, setResponseHeaders] = useState(null);

    // Add variables to detect filtered content
    const isFilteredContent = source?.isFiltered || source?.filteredWith ||
        (source?.jsonFilter?.enabled && source?.jsonFilter?.path);
    const filterPath = source?.jsonFilter?.path || source?.filteredWith || 'unknown';

    // Initialize or update internal content when source changes
    useEffect(() => {
        if (source) {
            // Only update internal content when it changes
            if (source.sourceContent !== internalContent) {
                setInternalContent(source.sourceContent);
            }

            if (source.originalResponse !== internalOriginalResponse) {
                setInternalOriginalResponse(source.originalResponse);
            }

            // Try to extract headers from source
            extractHeaders(source);
        }
    }, [source?.sourceId, source?.sourceContent, source?.originalResponse, source?.headers, internalContent, internalOriginalResponse]);

    // Extract headers from source or originalResponse
    const extractHeaders = (source) => {
        // Check if headers was explicitly cleared (null means error state)
        if (source?.headers === null) {
            setResponseHeaders(null);
            return;
        }

        // First check if there are headers directly in the source
        if (source?.headers) {
            setResponseHeaders(source.headers);
            return;
        }

        // Check for rawResponse property
        if (source?.rawResponse) {
            try {
                const parsed = JSON.parse(source.rawResponse);
                if (parsed && parsed.headers) {
                    setResponseHeaders(parsed.headers);
                    return;
                }
            } catch (e) {
                // Failed to parse rawResponse
            }
        }

        // Try to parse headers from originalResponse if it's a string
        if (source?.originalResponse && typeof source.originalResponse === 'string') {
            try {
                // First try parsing as JSON
                const parsedJson = JSON.parse(source.originalResponse);
                if (parsedJson.headers) {
                    setResponseHeaders(parsedJson.headers);
                    return;
                }
            } catch (e) {
                // originalResponse is not valid JSON, will try alternate approach
            }

            // Try to extract headers using a more lenient regex approach
            try {
                const headerPattern = /"headers":\s*(\{[^}]+\})/;
                const match = source.originalResponse.match(headerPattern);

                if (match && match[1]) {
                    try {
                        // Try to clean and parse the matched JSON
                        const headersText = match[1]
                            .replace(/\\"/g, '"')  // Replace escaped quotes
                            .replace(/([{,])\s*([a-zA-Z0-9_-]+):/g, '$1"$2":'); // Add quotes to keys

                        const headers = JSON.parse(headersText);
                        setResponseHeaders(headers);
                        return;
                    } catch (err) {
                        // Failed to parse headers from regex match
                    }
                }
            } catch (regexErr) {
                // Regex extraction approach failed
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
                            setResponseHeaders(headers);
                            return;
                        } catch (err) {
                            // Failed to parse headers from sourceContent match
                        }
                    }
                } catch (e) {
                    // Failed to extract headers from sourceContent
                }
            }

            // Try a more aggressive extraction approach for cases where the headers might be malformed
            try {
                // Look for a larger chunk that might contain the headers
                const fullResponseMatch = source.sourceContent.match(/\{[\s\S]*?"headers"[\s\S]*?\}/);
                if (fullResponseMatch) {
                    try {
                        const fullResponse = JSON.parse(fullResponseMatch[0]);
                        if (fullResponse.headers) {
                            setResponseHeaders(fullResponse.headers);
                            return;
                        }
                    } catch (err) {
                        // Failed to parse full response match
                    }
                }
            } catch (e) {
                // Failed aggressive extraction approach
            }
        }

        // Manual fallback for common headers
        const fallbackHeaders = {};

        // Check if we can extract content-type from the response
        if (source?.sourceContent?.includes('<!doctype html>') ||
            source?.originalResponse?.includes('<!doctype html>')) {
            fallbackHeaders['Content-Type'] = 'text/html';
        }

        if (Object.keys(fallbackHeaders).length > 0) {
            setResponseHeaders(fallbackHeaders);
            return;
        }

        // If we couldn't find headers, set to null and show message
        setResponseHeaders(null);
    };

    // Check if this is an HTTP source with JSON content
    const isHttpSource = source?.sourceType === 'http';
    const hasJsonFilter = source?.jsonFilter?.enabled && source?.jsonFilter?.path;
    const hasOriginalResponse = !!internalOriginalResponse;

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
            // Error formatting content
            return content || 'No content available';
        }
    };

    // Format JSON for display
    const formatJson = (jsonString) => {
        try {
            if (typeof jsonString !== 'string' || !jsonString.trim()) {
                return 'No response content available';
            }

            // Try to parse and stringify to format
            if (jsonString.trim().startsWith('{') || jsonString.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(jsonString);
                    return JSON.stringify(parsed, null, 2);
                } catch (e) {
                    // If parsing fails, return as-is
                    return jsonString;
                }
            }

            // Return as-is if not valid JSON (could be HTML, etc.)
            return jsonString;
        } catch (error) {
            // Error formatting content
            return jsonString || 'Invalid content';
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
                        {/* Updated indicator for filtered content */}
                        {isFilteredContent ? (
                            <div className="filter-indicator" style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                marginBottom: '8px',
                                fontSize: '12px'
                            }}>
                                <Text strong>JSON Filtered:</Text> {filterPath}
                            </div>
                        ) : (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                JSON Filter Path: <code>N/A</code>
                            </Text>
                        )}
                        <Button
                            size="small"
                            icon={copyingContent ? <CheckOutlined /> : <CopyOutlined />}
                            onClick={() => handleCopy(internalContent || '', 'content')}
                            type={copyingContent ? "success" : "default"}
                        >
                            {copyingContent ? 'Copied!' : 'Copy'}
                        </Button>
                    </div>

                    <pre className="content-display" style={{
                        maxHeight: 300,
                        overflow: 'auto',
                        margin: 0,
                        padding: 12,
                        fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                        fontSize: 12,
                        borderRadius: 6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }}>
                        {formatContent(internalContent)}
                    </pre>
                </div>
            )
        }
    ];

    // Add original JSON tab for HTTP sources with JSON data
    if (isHttpSource && hasOriginalResponse) {
        items.push({
            key: 'originalResponse',
            label: 'Response',
            children: (
                <div>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            size="small"
                            icon={copyingJson ? <CheckOutlined /> : <CopyOutlined />}
                            onClick={() => handleCopy(internalOriginalResponse || '', 'json')}
                            type={copyingJson ? "success" : "default"}
                        >
                            {copyingJson ? 'Copied!' : 'Copy'}
                        </Button>
                    </div>

                    <pre className="content-display" style={{
                        maxHeight: 300,
                        overflow: 'auto',
                        margin: 0,
                        padding: 12,
                        fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                        fontSize: 12,
                        borderRadius: 6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }}>
                        {formatJson(internalOriginalResponse)}
                    </pre>
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
                    {responseHeaders && Object.keys(responseHeaders).length > 0 ? (
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
                            color: token.colorTextSecondary,
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
            className="content-viewer-modal"
            footer={[
                <Button key="close" onClick={onClose}>
                    Close
                </Button>
            ]}
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
                            type={copyingContent ? "success" : "default"}
                            style={{ marginLeft: 'auto' }}
                        >
                            {copyingContent ? 'Copied!' : 'Copy'}
                        </Button>
                    </div>

                    <pre className="content-display" style={{
                        maxHeight: 300,
                        overflow: 'auto',
                        margin: 0,
                        padding: 12,
                        fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                        fontSize: 12,
                        borderRadius: 6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }}>
                        {formatContent(internalContent)}
                    </pre>
                </Card>
            )}
        </Modal>
    );
};

export default ContentViewer;