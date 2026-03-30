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

import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { Button, Tabs, Typography } from 'antd';
import type { Source } from '@/types/source';
import { formatContent, formatJson } from './ContentFormatter';
import { HeadersTable } from './HeadersTable';

const { Text } = Typography;

interface ContentTabsProps {
  activeTab: string;
  onTabChange: (key: string) => void;
  source: Source;
  internalContent: string | null;
  internalOriginalResponse: string | null;
  responseHeaders: Record<string, string> | null;
  copyingContent: boolean;
  copyingJson: boolean;
  onCopyContent: (content: string) => void;
  onCopyJson: (content: string) => void;
}

/**
 * ContentTabs component for displaying tabbed source content interface
 *
 * Dynamically generates tabs based on available source data and provides
 * specialized display for each content type with appropriate formatting.
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
  onCopyJson,
}: ContentTabsProps) {
  const isHttpSource = source?.sourceType === 'http';
  const hasOriginalResponse = !!internalOriginalResponse;

  // Determine if content has been filtered and extract filter path
  const isFilteredContent =
    source?.isFiltered || source?.filteredWith || (source?.jsonFilter?.enabled && source?.jsonFilter?.path);
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
              <div
                className="filter-indicator"
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  fontSize: '12px',
                }}
              >
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
              type={(copyingContent ? 'success' : 'default') as never}
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
        </div>
      ),
    },
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
              type={(copyingJson ? 'success' : 'default') as never}
            >
              {copyingJson ? 'Copied!' : 'Copy'}
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
            {formatJson(internalOriginalResponse)}
          </pre>
        </div>
      ),
    });
  }

  // Add headers tab for HTTP sources to display response headers
  if (isHttpSource) {
    items.push({
      key: 'headers',
      label: 'Headers',
      children: <HeadersTable headers={responseHeaders} />,
    });
  }

  return <Tabs activeKey={activeTab} onChange={onTabChange} items={items} type="card" size="small" />;
}
