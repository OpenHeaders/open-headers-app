import React, {useState, useEffect, useCallback, useRef} from 'react';
import { Table, Button, Tag, Typography, Space, Modal, Popconfirm } from 'antd';
import {
    ReloadOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeOutlined
} from '@ant-design/icons';
import EditSourceModal from './EditSourceModal';
import ContentViewer from './ContentViewer';
import { showMessage } from '../utils/messageUtil';
import refreshManager from '../services/RefreshManager';

const { Text } = Typography;

/**
 * SourceTable component - FIXED to work with new RefreshManager status system
 * No longer relies on content changes for refresh status display
 */
const SourceTable = ({
                         sources,
                         onRemoveSource,
                         onRefreshSource,
                         onUpdateSource
                     }) => {
    // ENHANCED: Separate refresh display state from content
    const [refreshDisplayStates, setRefreshDisplayStates] = useState({});
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [contentViewerVisible, setContentViewerVisible] = useState(false);
    const [selectedSourceId, setSelectedSourceId] = useState(null);
    const [refreshingSourceId, setRefreshingSourceId] = useState(null);
    const [removingSourceId, setRemovingSourceId] = useState(null);

    // Get the currently selected source from the latest sources array
    const selectedSource = selectedSourceId ?
        sources.find(s => s.sourceId === selectedSourceId) : null;

    // Format time remaining in human-readable format
    const formatTimeRemaining = (milliseconds) => {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else {
            return `${minutes}m ${seconds}s`;
        }
    };

    // ENHANCED: Get refresh status text using RefreshManager status
    const getRefreshStatusText = (source) => {
        if (!source || source.sourceType !== 'http' ||
            !source.refreshOptions ||
            (!source.refreshOptions.enabled && !source.refreshOptions.interval > 0)) {
            return 'Auto-refresh disabled';
        }

        // FIXED: Get status from RefreshManager instead of relying on content
        const refreshStatus = refreshManager.getRefreshStatus(source.sourceId);
        const displayState = refreshDisplayStates[source.sourceId];

        // Check if currently refreshing
        if (refreshStatus?.isRefreshing || refreshingSourceId === source.sourceId) {
            return 'Refreshing...';
        }

        // Check if manager reports errors
        if (refreshStatus?.consecutiveErrors > 0) {
            return `Error (retrying in ${formatTimeRemaining(refreshManager.getTimeUntilRefresh(source.sourceId))})`;
        }

        // Use cached display state if available and recent
        if (displayState && displayState.timestamp > Date.now() - 2000) {
            return displayState.text;
        }

        // Calculate from RefreshManager timing
        const timeUntilRefresh = refreshManager.getTimeUntilRefresh(source.sourceId);
        if (timeUntilRefresh > 0) {
            return `Refreshes in ${formatTimeRemaining(timeUntilRefresh)}`;
        }

        // Fall back to displaying the interval
        return `Auto-refresh: ${source.refreshOptions.interval}m`;
    };

    // Debug helper for tracking refresh states
    const debugRefreshState = (sourceId, action, data = {}) => {
        const timestamp = new Date().toISOString().substr(11, 8);
        console.log(`[${timestamp}] [RefreshTable] Source ${sourceId} - ${action}:`, data);
    };

    // ENHANCED: Update refresh display states using RefreshManager data
    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            const newDisplayStates = {};
            let needsUpdate = false;

            sources.forEach(source => {
                if (source.sourceType === 'http' && source.refreshOptions?.enabled) {
                    // Get current status from RefreshManager
                    const refreshStatus = refreshManager.getRefreshStatus(source.sourceId);
                    let statusText = '';

                    if (refreshStatus?.isRefreshing || refreshingSourceId === source.sourceId) {
                        statusText = 'Refreshing...';
                    } else if (refreshStatus?.consecutiveErrors > 0) {
                        const timeUntilRetry = refreshManager.getTimeUntilRefresh(source.sourceId);
                        statusText = `Error (retrying in ${formatTimeRemaining(timeUntilRetry)})`;
                    } else {
                        // Calculate time remaining
                        const timeUntilRefresh = refreshManager.getTimeUntilRefresh(source.sourceId);
                        if (timeUntilRefresh > 0) {
                            statusText = `Refreshes in ${formatTimeRemaining(timeUntilRefresh)}`;
                        } else {
                            statusText = `Auto-refresh: ${source.refreshOptions.interval}m`;
                        }
                    }

                    // Only update if the text has changed
                    const currentState = refreshDisplayStates[source.sourceId];
                    if (!currentState || currentState.text !== statusText) {
                        newDisplayStates[source.sourceId] = {
                            text: statusText,
                            timestamp: now
                        };
                        needsUpdate = true;
                    }
                }
            });

            // Only update state if there are changes
            if (needsUpdate) {
                setRefreshDisplayStates(prev => ({ ...prev, ...newDisplayStates }));
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [sources, refreshDisplayStates, refreshingSourceId]);

    // Clean up display states when sources change
    useEffect(() => {
        setRefreshDisplayStates(prev => {
            const sourceIds = new Set(sources.map(s => s.sourceId));
            const filtered = {};
            let hasChanges = false;

            Object.keys(prev).forEach(sourceId => {
                if (sourceIds.has(parseInt(sourceId))) {
                    filtered[sourceId] = prev[sourceId];
                } else {
                    hasChanges = true;
                    console.log(`[RefreshTable] Removing display state for deleted source ${sourceId}`);
                }
            });

            return hasChanges ? filtered : prev;
        });
    }, [sources]);

    // Handle save edited source
    const handleSaveSource = async (sourceData) => {
        try {
            // Set loading state for visual feedback
            setRefreshingSourceId(sourceData.sourceId);

            // Extract refreshNow flag and remove it from the data sent to parent
            const shouldRefreshNow = sourceData.refreshNow === true;
            const dataToSave = { ...sourceData };
            delete dataToSave.refreshNow;

            console.log("SourceTable: Saving source data...");

            // Call parent handler to update the source and get the updated source
            const updatedSource = await onUpdateSource(dataToSave);

            if (updatedSource) {
                console.log("SourceTable: Source updated successfully");

                // If immediate refresh is requested, trigger it
                if (shouldRefreshNow) {
                    console.log("SourceTable: Triggering immediate refresh after save...");

                    // Small delay to ensure the source is updated in the manager
                    setTimeout(async () => {
                        try {
                            const refreshSuccess = await handleRefreshSource(sourceData.sourceId, updatedSource);

                            if (refreshSuccess) {
                                console.log("SourceTable: Manual refresh completed successfully");
                            } else {
                                console.log("SourceTable: Manual refresh failed");
                            }
                        } catch (error) {
                            console.error("SourceTable: Error during manual refresh:", error);
                        }
                    }, 500);
                }

                // Close the modal
                setEditModalVisible(false);

                // Success message after modal is closed
                setTimeout(() => {
                    showMessage('success', 'Source updated successfully');
                }, 100);

                return true;
            } else {
                showMessage('error', 'Failed to update source');
                return false;
            }
        } catch (error) {
            console.error('SourceTable: Error saving source:', error);
            showMessage('error', `Error: ${error.message}`);
            return false;
        } finally {
            // Clear refreshing state with delay to ensure UI updates properly
            setTimeout(() => {
                setRefreshingSourceId(null);
            }, 1500);
        }
    };

    // Handle edit source
    const handleEditSource = useCallback((source) => {
        // Only store the ID so we always pull latest data from sources array
        setSelectedSourceId(source.sourceId);
        setEditModalVisible(true);
    }, []);

    // Handle view content
    const handleViewContent = useCallback((source) => {
        // Store only the ID for the selected source
        setSelectedSourceId(source.sourceId);
        setContentViewerVisible(true);
    }, []);

    // ENHANCED: Handle refresh source with proper status tracking
    const handleRefreshSource = async (sourceId, updatedSource = null) => {
        try {
            debugRefreshState(sourceId, 'Manual Refresh Started');
            console.log('SourceTable: Starting refresh for source', sourceId);

            // Set refreshing state
            setRefreshingSourceId(sourceId);

            // ENHANCED: Update display state immediately
            setRefreshDisplayStates(prev => ({
                ...prev,
                [sourceId]: {
                    text: 'Refreshing...',
                    timestamp: Date.now()
                }
            }));

            // Call the parent refresh handler (which delegates to RefreshManager)
            const success = await onRefreshSource(sourceId, updatedSource);

            debugRefreshState(sourceId, 'Manual Refresh Completed', { success });
            console.log('SourceTable: Refresh completed with success =', success);

            return success;
        } catch (error) {
            debugRefreshState(sourceId, 'Manual Refresh Error', { error: error.message });
            console.error('SourceTable: Error refreshing source:', error);
            return false;
        } finally {
            // Clear refreshing state with a delay to ensure UI updates
            setTimeout(() => {
                setRefreshingSourceId(null);
                debugRefreshState(sourceId, 'Cleared Refreshing State');
            }, 1500);
        }
    };

    // Handle remove source
    const handleRemoveSource = async (sourceId) => {
        try {
            // Set removing state
            setRemovingSourceId(sourceId);

            // Get source details for the message
            const source = sources.find(s => s.sourceId === sourceId);
            const sourceType = source?.sourceType?.toUpperCase() || 'SOURCE';
            const sourceTag = source?.sourceTag || `#${sourceId}`;

            // Call parent handler to remove the source
            const success = await onRemoveSource(sourceId);

            if (success) {
                // Clean up display states to prevent stale display
                setRefreshDisplayStates(prev => {
                    const updated = { ...prev };
                    delete updated[sourceId];
                    return updated;
                });

                showMessage('warning',
                    `${sourceType} source ${sourceTag} has been removed. Any browser extension rules using this source will be affected.`,
                    5 // Duration in seconds
                );
            } else {
                showMessage('error', `Failed to remove source ${sourceTag}`);
            }

            return success;
        } catch (error) {
            console.error('SourceTable: Error removing source:', error);
            showMessage('error', `Error removing source: ${error.message}`);
            return false;
        } finally {
            // Clear removing state
            setRemovingSourceId(null);
        }
    };

    // Close modals
    const handleCloseModal = useCallback(() => {
        // Hide modals first
        setEditModalVisible(false);
        setContentViewerVisible(false);

        // Then clear selected source ID after animation completes
        setTimeout(() => {
            setSelectedSourceId(null);
        }, 300);
    }, []);

    // Helper function to trim content for display
    const trimContent = (content) => {
        if (!content) return 'No content yet';

        if (content.length <= 30) return content;

        // Show first 10 chars, then ellipsis, then last 10 chars
        return `${content.substring(0, 10)}...${content.substring(content.length - 10)}`;
    };

    // Table columns definition - compact version
    const columns = [
        {
            title: 'ID',
            dataIndex: 'sourceId',
            key: 'sourceId',
            width: 50,
        },
        {
            title: 'Type',
            dataIndex: 'sourceType',
            key: 'sourceType',
            width: 70,
            render: (type) => (
                <Tag color={type === 'http' ? 'blue' : type === 'file' ? 'green' : 'orange'} style={{ fontSize: '11px', padding: '0 4px' }}>
                    {type.toUpperCase()}
                </Tag>
            ),
        },
        {
            title: 'Tag',
            dataIndex: 'sourceTag',
            key: 'sourceTag',
            width: 80,
            render: (tag) => tag || '-',
        },
        {
            title: 'Source Path/URL',
            dataIndex: 'sourcePath',
            key: 'sourcePath',
            ellipsis: true,
            render: (path, record) => (
                <Text
                    ellipsis={{ tooltip: path }}
                    style={{ color: record.sourceType === 'http' ? '#0071e3' : 'inherit', fontSize: '12px' }}
                >
                    {path}
                </Text>
            ),
        },
        {
            title: 'Content',
            dataIndex: 'sourceContent',
            key: 'sourceContent',
            render: (content) => (
                <div className="source-content-cell" style={{ maxHeight: '60px', fontSize: '11px' }}>
                    <Text ellipsis={{ tooltip: content }}>
                        {trimContent(content)}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 180,
            render: (_, record) => (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {record.sourceType === 'http' && (
                        <>
                            <div className={`refresh-status ${(record.refreshOptions?.enabled || record.refreshOptions?.interval > 0) ? 'active' : ''}`}>
                                {getRefreshStatusText(record)}
                            </div>
                            <Space size="small">
                                <Button
                                    type="link"
                                    size="small"
                                    onClick={() => handleViewContent(record)}
                                    style={{ padding: '0 4px', fontSize: '12px' }}
                                >
                                    <EyeOutlined /> View
                                </Button>
                                <Button
                                    type="link"
                                    size="small"
                                    onClick={() => handleEditSource(record)}
                                    style={{ padding: '0 4px', fontSize: '12px' }}
                                >
                                    <EditOutlined /> Edit
                                </Button>
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
                    {(record.sourceType === 'file' || record.sourceType === 'env') && (
                        <>
                            <div className="refresh-status">
                                {record.sourceType === 'file' ? 'Auto-updates on file change' : 'No auto-refresh'}
                            </div>
                            <Space size="small">
                                <Button
                                    type="link"
                                    size="small"
                                    onClick={() => handleViewContent(record)}
                                    style={{ padding: '0 4px', fontSize: '12px' }}
                                >
                                    <EyeOutlined /> View
                                </Button>
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

    // Empty state
    const emptyText = (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p>No sources yet. Add a source using the form above.</p>
        </div>
    );

    return (
        <>
            <Table
                dataSource={sources}
                columns={columns}
                rowKey={(record) => `source-${record.sourceId}-${record.sourceType}`}
                pagination={false}
                locale={{ emptyText }}
                size="small"
                bordered
                scroll={{ x: 'max-content' }}
            />

            {/* Edit Source Modal - only render when visible and source is set */}
            {editModalVisible && selectedSource && (
                <EditSourceModal
                    key={`edit-source-${selectedSource.sourceId}`}
                    source={selectedSource}
                    open={editModalVisible}
                    onCancel={handleCloseModal}
                    onSave={handleSaveSource}
                    refreshingSourceId={refreshingSourceId} // Pass refreshingSourceId to the modal
                />
            )}

            {/* Content Viewer Modal */}
            <ContentViewer
                source={selectedSource}
                open={contentViewerVisible}
                onClose={handleCloseModal}
            />
        </>
    );
};

export default SourceTable;