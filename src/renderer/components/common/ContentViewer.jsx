/**
 * ContentViewer Component
 * 
 * Main modal component for displaying source content with comprehensive content
 * visualization capabilities. Utilizes a modular architecture for maintainability
 * and extensibility.
 * 
 * Features:
 * - Modal-based content display with responsive design
 * - Intelligent header extraction from multiple response formats
 * - Tabbed interface for different content types (HTTP sources)
 * - Copy functionality with user feedback
 * - Filter status indicators for processed content
 * - Consistent styling with application theme
 * 
 * Architecture:
 * - Modular design with separate utilities for specific concerns
 * - State management for content, headers, and UI interactions
 * - Progressive enhancement based on source type
 * 
 * @component
 * @since 3.0.0
 */

import React, { useState, useEffect } from 'react';
import { Modal, Card, Button, Typography } from 'antd';
import { FileTextOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { extractHeaders, formatContent, createCopyHandler, ContentTabs } from './content-viewer';

const { Text } = Typography;

/**
 * ContentViewer component for displaying source content in a modal interface
 * 
 * Orchestrates the display of source content with intelligent content type detection
 * and appropriate visualization. Manages modal state and coordinates with child components.
 * 
 * @param {Object} props - Component props
 * @param {Object} props.source - Source object containing content and metadata
 * @param {boolean} props.open - Modal visibility state
 * @param {Function} props.onClose - Modal close handler function
 * @returns {React.Component} Rendered modal component with content display
 * @example
 * <ContentViewer source={sourceData} open={isOpen} onClose={handleClose} />
 */
const ContentViewer = ({ source, open, onClose }) => {
    const [activeTab, setActiveTab] = useState('content');
    const [copyingContent, setCopyingContent] = useState(false);
    const [copyingJson, setCopyingJson] = useState(false);

    // Store our own internal copy of content to avoid the intermediate "Refreshing..." state
    const [internalContent, setInternalContent] = useState(null);
    const [internalOriginalResponse, setInternalOriginalResponse] = useState(null);
    const [responseHeaders, setResponseHeaders] = useState(null);

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

            // Extract headers from source using the HeaderExtractor utility
            const extractedHeaders = extractHeaders(source);
            setResponseHeaders(extractedHeaders);
        }
    }, [source?.sourceId, source?.sourceContent, source?.originalResponse, source?.headers, internalContent, internalOriginalResponse]);

    // Create copy handlers using the ClipboardManager utility
    const handleCopyContent = createCopyHandler(setCopyingContent);
    const handleCopyJson = createCopyHandler(setCopyingJson);

    // Check if this is an HTTP source
    const isHttpSource = source?.sourceType === 'http';

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

            {/* Use ContentTabs for HTTP sources, otherwise show simple content */}
            {isHttpSource ? (
                <ContentTabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    source={source}
                    internalContent={internalContent}
                    internalOriginalResponse={internalOriginalResponse}
                    responseHeaders={responseHeaders}
                    copyingContent={copyingContent}
                    copyingJson={copyingJson}
                    onCopyContent={handleCopyContent}
                    onCopyJson={handleCopyJson}
                />
            ) : (
                <Card size="small">
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            JSON Filter Path: <code>N/A</code>
                        </Text>
                        <Button
                            size="small"
                            icon={copyingContent ? <CheckOutlined /> : <CopyOutlined />}
                            onClick={() => handleCopyContent(internalContent || '')}
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