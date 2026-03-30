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

import { CheckOutlined, CopyOutlined, FileTextOutlined } from '@ant-design/icons';
import type { Source } from '@openheaders/core';
import { Button, Card, Modal, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import { ContentTabs, createCopyHandler, extractHeaders, formatContent } from './content-viewer';

const { Text } = Typography;

/**
 * ContentViewer component for displaying source content in a modal interface
 *
 * Orchestrates the display of source content with intelligent content type detection
 * and appropriate visualization. Manages modal state and coordinates with child components.
 *
 *  props - Component props
 *  props.source - Source object containing content and metadata
 *  props.open - Modal visibility state
 *  props.onClose - Modal close handler function
 *  Rendered modal component with content display
 * @example
 * <ContentViewer source={sourceData} open={isOpen} onClose={handleClose} />
 */
interface ContentViewerProps {
  source: Source | null;
  open: boolean;
  onClose: () => void;
}
const ContentViewer = ({ source, open, onClose }: ContentViewerProps) => {
  const [activeTab, setActiveTab] = useState('content');
  const [copyingContent, setCopyingContent] = useState(false);
  const [copyingJson, setCopyingJson] = useState(false);

  // Store our own internal copy of content to avoid the intermediate "Refreshing..." state
  const [internalContent, setInternalContent] = useState<string | null>(null);
  const [internalOriginalResponse, setInternalOriginalResponse] = useState<string | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string> | null>(null);

  // Initialize or update internal content when source changes
  useEffect(() => {
    if (source) {
      // Only update internal content when it changes
      const sourceContent = source.sourceContent ?? null;
      setInternalContent((prev) => (sourceContent !== prev ? sourceContent : prev));

      const originalResponseStr = source.originalResponse
        ? typeof source.originalResponse === 'string'
          ? source.originalResponse
          : JSON.stringify(source.originalResponse)
        : null;
      setInternalOriginalResponse((prev) => (originalResponseStr !== prev ? originalResponseStr : prev));

      // Extract response headers from source
      const extractedHeaders = extractHeaders(source);
      setResponseHeaders(extractedHeaders);
    }
  }, [source]);

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
      destroyOnHidden={false}
      className="content-viewer-modal"
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <Text strong>Source:</Text> <Text>{source?.sourcePath || ''}</Text>
        </div>
        <div style={{ marginBottom: 8 }}>
          <Text strong>Type:</Text> <Text>{source?.sourceType?.toUpperCase() || ''}</Text>
        </div>
        {isHttpSource && (
          <div style={{ marginBottom: 8 }}>
            <Text strong>Method:</Text> <Text>{source?.sourceMethod || 'GET'}</Text>
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
              type="default"
              style={{ marginLeft: 'auto' }}
            >
              {copyingContent ? 'Copied!' : 'Copy'}
            </Button>
          </div>

          <pre
            className="content-display"
            style={{
              maxHeight: 300,
              overflow: 'auto',
              margin: 0,
              padding: 12,
              fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
              fontSize: 12,
              borderRadius: 6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {formatContent(internalContent ?? '')}
          </pre>
        </Card>
      )}
    </Modal>
  );
};

export default ContentViewer;
