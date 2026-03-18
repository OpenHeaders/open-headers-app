/**
 * Response Preview Card Component
 * 
 * Provides comprehensive display for HTTP response data including
 * status codes, headers, body content, and raw response data.
 * 
 * Features:
 * - Status code display with descriptive text
 * - Tabbed interface for body, headers, and raw response
 * - Content type-aware formatting
 * - JSON filter result display
 * - Error response handling
 * 
 * @component
 * @since 3.0.0
 */

import React from 'react';
import { Card, Tabs } from 'antd';
import { getStatusText, formatContentByType } from './HttpTesting';

/**
 * Response Preview card component for response display
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.testResponseVisible - Response visibility state
 * @param {*} props.testResponseContent - Response content to display
 * @returns {JSX.Element} Response preview card component
 */
interface TestResponseContent {
    statusCode?: number;
    duration?: number;
    error?: string;
    details?: string;
    retryStrategy?: { reason: string };
    filteredWith?: string;
    body?: string;
    headers?: Record<string, string>;
}
interface ResponsePreviewCardProps { testResponseVisible: boolean; testResponseContent: TestResponseContent | string | null; }
const ResponsePreviewCard = ({ testResponseVisible, testResponseContent }: ResponsePreviewCardProps) => {
    if (!testResponseVisible) {
        return null;
    }

    return (
        <Card
            title={
                <div className="response-card-header">
                    <span>Response Preview</span>
                    {typeof testResponseContent === 'object' && testResponseContent !== null && testResponseContent.statusCode && (
                        <span className="status-display">
                            Status Code <span className={`status-code status-${Math.floor(testResponseContent.statusCode / 100)}xx`}>
                                {testResponseContent.statusCode} {getStatusText(testResponseContent.statusCode)}
                            </span>
                            {testResponseContent.duration && (
                                <span className="duration-display">
                                    • {testResponseContent.duration}ms
                                </span>
                            )}
                        </span>
                    )}
                </div>
            }
            size="small"
            style={{ marginTop: 8 }}
            className="response-preview-card"
        >
            {typeof testResponseContent === 'object' && testResponseContent !== null ? (
                (() => {
                    const content = testResponseContent;
                    return (
                        <Tabs
                            defaultActiveKey="body"
                            size="small"
                            items={[
                                {
                                    key: 'body',
                                    label: 'Body',
                                    children: (
                                        <div className="response-body">
                                            {(() => {
                                                try {
                                                    // Handle error responses first
                                                    if (content.error) {
                                                        return (
                                                            <div className="error-response">
                                                                <div className="error-title">Request Error:</div>
                                                                <div className="error-message">{content.error}</div>
                                                                {content.details && (
                                                                    <div className="error-details">
                                                                        <div className="error-details-title">Details:</div>
                                                                        <div className="error-details-content">{content.details}</div>
                                                                    </div>
                                                                )}
                                                                {content.retryStrategy && (
                                                                    <div className="retry-info">
                                                                        <div className="retry-info-title">Retry Strategy:</div>
                                                                        <div className="retry-info-content">{content.retryStrategy.reason}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    // Check if it's filterable JSON
                                                    if (content.filteredWith) {
                                                        return (
                                                            <div>
                                                                <div className="filter-info">
                                                                    [Filtered with path: {content.filteredWith}]
                                                                </div>
                                                                {formatContentByType(content.body, content.headers ?? null)}
                                                            </div>
                                                        );
                                                    }

                                                    // Standard body formatting
                                                    const bodyContent = content.body;
                                                    if (!bodyContent || bodyContent === '') {
                                                        // Check if this is an error status code
                                                        if (content.statusCode !== undefined && content.statusCode >= 400) {
                                                            return (
                                                                <div className="error-response">
                                                                    <div className="error-title">HTTP Error {content.statusCode}:</div>
                                                                    <div className="error-message">{getStatusText(content.statusCode)}</div>
                                                                    <div className="error-details">
                                                                        <div className="error-details-title">Response:</div>
                                                                        <div className="error-details-content">No response body received</div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return <pre className="no-content">No response body received</pre>;
                                                    }

                                                    return formatContentByType(bodyContent, content.headers ?? null);
                                                } catch (e) {
                                                    const errorMessage = e instanceof Error ? e.message : String(e);
                                                    return (
                                                        <div className="error-response">
                                                            <div className="error-title">Response Parsing Error:</div>
                                                            <div className="error-message">{errorMessage}</div>
                                                            <div className="error-details">
                                                                <div className="error-details-title">Raw Content:</div>
                                                                <pre className="error-details-content">{content.body || "No content"}</pre>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            })()}
                                        </div>
                                    )
                                },
                                {
                                    key: 'headers',
                                    label: 'Headers',
                                    children: (
                                        <div className="response-headers">
                                            {content.headers ? (
                                                <table className="headers-table">
                                                    <thead>
                                                    <tr>
                                                        <th>Name</th>
                                                        <th>Value</th>
                                                    </tr>
                                                    </thead>
                                                    <tbody>
                                                    {Object.entries(content.headers).map(([key, value]) => (
                                                        <tr key={key}>
                                                            <td>{key}</td>
                                                            <td>{value as React.ReactNode}</td>
                                                        </tr>
                                                    ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="no-headers">No headers available</div>
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    key: 'raw',
                                    label: 'Raw',
                                    children: (
                                        <pre className="response-raw">
                                            {JSON.stringify(content, null, 2)}
                                        </pre>
                                    )
                                }
                            ]}
                        />
                    );
                })()
            ) : (
                <pre className="response-error">
                    {String(testResponseContent ?? '')}
                </pre>
            )}
        </Card>
    );
};

export default ResponsePreviewCard;