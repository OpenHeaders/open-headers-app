/**
 * Source Table Columns Configuration
 * 
 * Comprehensive table column definitions for the source management interface.
 * Provides structured column layout with specialized rendering logic for different
 * source types (HTTP, file, environment) and dynamic action controls.
 * 
 * Column Features:
 * - Source type identification with color-coded tags
 * - Template source detection and labeling
 * - Dependency state visualization for HTTP sources
 * - Content preview with truncation and tooltip
 * - Dynamic action buttons based on source type and state
 * - Real-time refresh status display with timing information
 * 
 * Source Type Support:
 * - HTTP: Full CRUD operations, refresh status, dependency checking
 * - File: View and remove operations, auto-update notification
 * - Environment: View and remove operations, static content
 * 
 * State Management:
 * - Loading states for refresh and remove operations
 * - Disabled states for sources with missing dependencies
 * - Visual feedback for activation states and errors
 * 
 * @module SourceTableColumns
 * @since 3.0.0
 */

import React from 'react';
import { Button, Tag, Typography, Space, Popconfirm, Tooltip } from 'antd';
import { ReloadOutlined, DeleteOutlined, EditOutlined, EyeOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { trimContent } from './SourceTableUtils';
import { isTemplateSource } from './SourceDependencyChecker';

const { Text } = Typography;

/**
 * Creates table columns configuration for source table
 * @param {Object} params - Configuration parameters
 * @param {Object} params.token - Ant Design theme token
 * @param {Function} params.getRefreshStatusText - Function to get refresh status text
 * @param {Function} params.handleViewContent - View content handler
 * @param {Function} params.handleEditSource - Edit source handler
 * @param {Function} params.handleRemoveSource - Remove source handler
 * @param {Function} params.handleRefreshSource - Refresh source handler
 * @param {number} params.refreshingSourceId - Currently refreshing source ID
 * @param {number} params.removingSourceId - Currently removing source ID
 * @returns {Array} Table columns configuration
 */
export const createSourceTableColumns = ({
    token,
    getRefreshStatusText,
    handleViewContent,
    handleEditSource,
    handleRemoveSource,
    handleRefreshSource,
    refreshingSourceId,
    removingSourceId
}) => [
    // Column 1: Source ID
    // Simple numeric identifier for each source, used for internal tracking
    {
        title: 'ID',
        dataIndex: 'sourceId',
        key: 'sourceId',
        width: 50,
    },
    // Column 2: Source Type and Status
    // Displays source type with color coding and additional status information
    {
        title: 'Type',
        dataIndex: 'sourceType',
        key: 'sourceType',
        width: 180,
        render: (type, record) => (
            <Space size={4} direction="vertical" align="start">
                <Space size={4}>
                    {/* Primary type tag with color coding:
                        Blue for HTTP (dynamic sources)
                        Green for File (local file sources)
                        Orange for Environment (variable sources) */}
                    <Tag 
                        color={type === 'http' ? 'blue' : type === 'file' ? 'green' : 'orange'} 
                        style={{ fontSize: '11px', padding: '0 4px' }}
                    >
                        {type.toUpperCase()}
                    </Tag>
                    {/* Template indicator for sources using variable substitution */}
                    {isTemplateSource(record) && (
                        <Tag 
                            color="purple" 
                            style={{ fontSize: '11px', padding: '0 4px' }}
                        >
                            TEMPLATE
                        </Tag>
                    )}
                </Space>
                {/* Dependency warning for HTTP sources with missing requirements */}
                {type === 'http' && record.activationState === 'waiting_for_deps' && record.missingDependencies?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ fontSize: '10px', color: '#faad14', fontWeight: 500 }}>
                            Waiting for:
                        </span>
                        {/* Show first dependency */}
                        <Tag 
                            color="warning" 
                            style={{ 
                                fontSize: '9px', 
                                padding: '0 4px', 
                                margin: 0,
                                borderRadius: 3,
                                lineHeight: '16px',
                                height: '16px'
                            }}
                        >
                            {record.missingDependencies[0]}
                        </Tag>
                        {/* Show "+X more" tooltip if there are additional dependencies */}
                        {record.missingDependencies.length > 1 && (
                            <Tooltip title={record.missingDependencies.slice(1).join(', ')}>
                                <Tag 
                                    color="warning"
                                    style={{ 
                                        fontSize: '9px', 
                                        padding: '0 4px', 
                                        margin: 0,
                                        borderRadius: 3,
                                        lineHeight: '16px',
                                        height: '16px'
                                    }}
                                >
                                    +{record.missingDependencies.length - 1} more
                                </Tag>
                            </Tooltip>
                        )}
                    </div>
                )}
            </Space>
        ),
    },
    // Column 3: Source Tag
    // User-defined label for easy source identification and organization
    {
        title: 'Tag',
        dataIndex: 'sourceTag',
        key: 'sourceTag',
        width: 80,
        render: (tag) => tag || '-', // Display dash when no tag is set
    },
    // Column 4: Source Path/URL
    // Displays the source location with visual cues for type and state
    {
        title: 'Source Path/URL',
        dataIndex: 'sourcePath',
        key: 'sourcePath',
        ellipsis: true, // Enable text truncation with ellipsis
        render: (path, record) => (
            <Text
                ellipsis={{ tooltip: path }} // Show full path in tooltip on hover
                style={{ 
                    // Blue color for HTTP URLs to indicate they're clickable/external
                    color: record.sourceType === 'http' ? '#1890ff' : 'inherit', 
                    fontSize: '12px',
                    // Reduce opacity for sources with missing dependencies
                    opacity: record.activationState === 'waiting_for_deps' ? 0.5 : 1
                }}
            >
                {path}
            </Text>
        ),
    },
    // Column 5: Content Preview
    // Shows truncated source content with full text available in tooltip
    {
        title: 'Content',
        dataIndex: 'sourceContent',
        key: 'sourceContent',
        render: (content) => (
            <div className="source-content-cell" style={{ maxHeight: '60px', fontSize: '11px' }}>
                <Text ellipsis={{ tooltip: content }}>
                    {/* Trim content to prevent layout issues with large content */}
                    {trimContent(content)}
                </Text>
            </div>
        ),
    },
    // Column 6: Actions and Status
    // Dynamic action controls and status display based on source type and state
    {
        title: 'Actions',
        key: 'actions',
        width: 180,
        render: (_, record) => (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {/* HTTP Sources: Full functionality with refresh status and controls */}
                {record.sourceType === 'http' && (
                    <>
                        {/* Real-time refresh status display with dynamic updates */}
                        <div className={`refresh-status ${record.refreshOptions?.enabled ? 'active' : ''}`}>
                            {(() => {
                                const statusInfo = getRefreshStatusText(record);
                                const statusText = typeof statusInfo === 'object' ? statusInfo.text : statusInfo;
                                const isCircuitOpen = typeof statusInfo === 'object' && statusInfo.isCircuitOpen;
                                const circuitBreaker = typeof statusInfo === 'object' ? statusInfo.circuitBreaker : null;
                                
                                const statusContent = (
                                    <span style={{ 
                                        color: isCircuitOpen ? '#ff4d4f' : 'inherit',
                                        fontWeight: isCircuitOpen ? 500 : 'normal'
                                    }}>
                                        {isCircuitOpen && (
                                            <ExclamationCircleOutlined style={{ marginRight: 4 }} />
                                        )}
                                        {statusText}
                                    </span>
                                );
                                
                                if (isCircuitOpen && circuitBreaker) {
                                    const failureText = circuitBreaker.failureCount === 1 
                                        ? '1 failure' 
                                        : `${circuitBreaker.failureCount} consecutive failures`;
                                    const backoffText = circuitBreaker.timeUntilNextAttemptMs > 0
                                        ? `Auto-refresh will resume after this retry attempt.`
                                        : 'Auto-refresh is temporarily paused.';
                                    
                                    return (
                                        <Tooltip 
                                            title={
                                                <div>
                                                    <div>Auto-refresh temporarily disabled after {failureText}.</div>
                                                    <div>{backoffText}</div>
                                                    {circuitBreaker.canManualBypass && (
                                                        <div style={{ marginTop: 4 }}>Use the Refresh button to try manually.</div>
                                                    )}
                                                </div>
                                            }
                                            placement="top"
                                        >
                                            {statusContent}
                                        </Tooltip>
                                    );
                                }
                                
                                return statusContent;
                            })()}
                        </div>
                        <Space size="small">
                            {/* View Content: Opens content viewer modal */}
                            <Button
                                type="link"
                                size="small"
                                onClick={() => handleViewContent(record)}
                                style={{ padding: '0 4px', fontSize: '12px' }}
                                disabled={record.activationState === 'waiting_for_deps'}
                            >
                                <EyeOutlined /> View
                            </Button>
                            {/* Edit Source: Opens edit modal for configuration */}
                            <Button
                                type="link"
                                size="small"
                                onClick={() => handleEditSource(record)}
                                style={{ padding: '0 4px', fontSize: '12px' }}
                            >
                                <EditOutlined /> Edit
                            </Button>
                            {/* Manual Refresh: Triggers immediate refresh operation */}
                            {(() => {
                                const statusInfo = getRefreshStatusText(record);
                                const circuitBreaker = typeof statusInfo === 'object' ? statusInfo.circuitBreaker : null;
                                const isCircuitOpen = circuitBreaker?.isOpen;
                                
                                const refreshButton = (
                                    <Button
                                        type="link"
                                        size="small"
                                        onClick={() => handleRefreshSource(record.sourceId)}
                                        style={{ 
                                            padding: '0 4px', 
                                            fontSize: '12px',
                                            color: isCircuitOpen ? '#1890ff' : undefined
                                        }}
                                        loading={refreshingSourceId === record.sourceId}
                                        disabled={record.activationState === 'waiting_for_deps'}
                                    >
                                        <ReloadOutlined /> Refresh
                                    </Button>
                                );
                                
                                if (isCircuitOpen) {
                                    const failureText = circuitBreaker.failureCount === 1 
                                        ? '1 failure' 
                                        : `${circuitBreaker.failureCount} consecutive failures`;
                                    const backoffText = `Next retry in ${circuitBreaker.timeUntilNextAttempt || 'a moment'}.`;
                                    
                                    return (
                                        <Tooltip 
                                            title={
                                                <div>
                                                    <div>Auto-refresh temporarily disabled after {failureText}.</div>
                                                    <div>{backoffText}</div>
                                                    <div style={{ marginTop: 4 }}>Click to try manually.</div>
                                                </div>
                                            }
                                            placement="top"
                                        >
                                            {refreshButton}
                                        </Tooltip>
                                    );
                                }
                                
                                return refreshButton;
                            })()}
                            {/* Remove Source: Confirmation dialog for deletion */}
                            <Popconfirm
                                title="Remove this source?"
                                onConfirm={() => handleRemoveSource(record.sourceId)}
                                okText="Yes"
                                cancelText="No"
                            >
                                <Button
                                    type="link"
                                    danger
                                    size="small"
                                    loading={removingSourceId === record.sourceId}
                                    style={{ padding: '0 4px', fontSize: '12px' }}
                                >
                                    <DeleteOutlined /> Remove
                                </Button>
                            </Popconfirm>
                        </Space>
                    </>
                )}
                {/* File and Environment Sources: Limited functionality (view and remove only) */}
                {(record.sourceType === 'file' || record.sourceType === 'env') && (
                    <>
                        {/* Static status display for non-HTTP sources */}
                        <div className="refresh-status">
                            {record.sourceType === 'file' ? 'Auto-updates on file change' : 'No auto-refresh'}
                        </div>
                        <Space size="small">
                            {/* View Content: Opens content viewer modal */}
                            <Button
                                type="link"
                                size="small"
                                onClick={() => handleViewContent(record)}
                                style={{ padding: '0 4px', fontSize: '12px' }}
                            >
                                <EyeOutlined /> View
                            </Button>
                            {/* Remove Source: Confirmation dialog for deletion */}
                            <Popconfirm
                                title="Remove this source?"
                                onConfirm={() => handleRemoveSource(record.sourceId)}
                                okText="Yes"
                                cancelText="No"
                            >
                                <Button
                                    type="link"
                                    danger
                                    size="small"
                                    loading={removingSourceId === record.sourceId}
                                    style={{ padding: '0 4px', fontSize: '12px' }}
                                >
                                    <DeleteOutlined /> Remove
                                </Button>
                            </Popconfirm>
                        </Space>
                    </>
                )}
            </Space>
        ),
    },
];