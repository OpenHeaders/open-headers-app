/**
 * Content Tabs Component
 * 
 * Renders tabbed interface for displaying different aspects of source data
 * with intelligent tab generation based on available data types.
 * 
 * Tab Types:
 * - Filtered Response: Shows processed/filtered content with filter indicators
 * - Original Response: Displays raw API response data
 * - Headers: HTTP response headers in structured table format
 * 
 * Features:
 * - Dynamic tab generation based on available data
 * - Copy functionality for each content type
 * - Visual indicators for filtered content
 * - Consistent styling with code highlighting
 * - Responsive design with proper scrolling
 * 
 * @module ContentTabs
 * @since 3.0.0
 */

import React from 'react';
import { Button, Typography, Tabs } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { formatContent, formatJson } from './ContentFormatter';
import { HeadersTable } from './HeadersTable';

const { Text } = Typography;

/**
 * ContentTabs component for displaying tabbed source content interface
 * 
 * Dynamically generates tabs based on available source data and provides
 * specialized display for each content type with appropriate formatting.
 * 
 * @param {Object} props - Component props
 * @param {string} props.activeTab - Currently active tab key
 * @param {Function} props.onTabChange - Tab change handler function
 * @param {Object} props.source - Source object containing response data
 * @param {string} props.internalContent - Processed/filtered content state
 * @param {string} props.internalOriginalResponse - Raw response content state
 * @param {Object} props.responseHeaders - Extracted HTTP headers object
 * @param {boolean} props.copyingContent - Content copy operation state
 * @param {boolean} props.copyingJson - JSON copy operation state
 * @param {Function} props.onCopyContent - Content copy handler function
 * @param {Function} props.onCopyJson - JSON copy handler function
 * @returns {React.Component} Rendered tabbed interface component
 * @example
 * <ContentTabs activeTab="content" onTabChange={setTab} source={sourceData} ... />
 */
export function ContentTabs({
    activeTab,
    onTabChange,
    source,
    internalContent,
    internalOriginalResponse,
    responseHeaders,
    copyingContent,
    copyingJson,
    onCopyContent,
    onCopyJson
}) {
    const isHttpSource = source?.sourceType === 'http';
    const hasOriginalResponse = !!internalOriginalResponse;
    
    // Determine if content has been filtered and extract filter path
    const isFilteredContent = source?.isFiltered || source?.filteredWith ||
        (source?.jsonFilter?.enabled && source?.jsonFilter?.path);
    const filterPath = source?.jsonFilter?.path || source?.filteredWith || 'unknown';

    // Build tabs array starting with filtered response tab
    const items = [
        {
            key: 'content',
            label: 'Filtered Response',
            children: (
                <div>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Display filter status indicator for user awareness */}
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
                            onClick={() => onCopyContent(internalContent || '')}
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

    // Add original response tab for HTTP sources with response data
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
                            onClick={() => onCopyJson(internalOriginalResponse || '')}
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

    // Add headers tab for HTTP sources to display response headers
    if (isHttpSource) {
        items.push({
            key: 'headers',
            label: 'Headers',
            children: (
                <HeadersTable headers={responseHeaders} />
            )
        });
    }

    return (
        <Tabs
            activeKey={activeTab}
            onChange={onTabChange}
            items={items}
            type="card"
            size="small"
        />
    );
}