import React, { useState, useEffect, useCallback } from 'react';
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

const { Text } = Typography;

/**
 * SourceTable component for displaying and managing sources with compact layout
 */
const SourceTable = ({
                         sources,
                         onRemoveSource,
                         onRefreshSource,
                         onUpdateSource
                     }) => {
    // Component state
    const [refreshTimes, setRefreshTimes] = useState({});
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [contentViewerVisible, setContentViewerVisible] = useState(false);
    const [selectedSourceId, setSelectedSourceId] = useState(null);
    const [refreshingSourceId, setRefreshingSourceId] = useState(null);
    const [removingSourceId, setRemovingSourceId] = useState(null);

    // Get the currently selected source from the latest sources array
    // This ensures we're always working with the most up-to-date data
    const selectedSource = selectedSourceId ?
        sources.find(s => s.sourceId === selectedSourceId) : null;

    // Format time remaining in a human-readable format (h:m:s)
    const formatTimeRemaining = (milliseconds) => {
        const hours = Math.floor(milliseconds / (60 * 60 * 1000));
        const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((milliseconds % (60 * 1000)) / 1000);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else {
            return `${minutes}m ${seconds}s`;
        }
    };

    // Calculate and return refresh status text for a source
    const getRefreshStatusText = (source) => {
        if (!source || source.sourceType !== 'http' ||
            !source.refreshOptions ||
            (!source.refreshOptions.enabled && !source.refreshOptions.interval > 0)) {
            return 'Auto-refresh disabled';
        }

        // Check if we have a cached time in refreshTimes
        if (refreshTimes[source.sourceId]) {
            return refreshTimes[source.sourceId];
        }

        // Check if we have a valid nextRefresh time
        const now = Date.now();
        if (source.refreshOptions.nextRefresh && source.refreshOptions.nextRefresh > now) {
            const remaining = source.refreshOptions.nextRefresh - now;
            return `Refreshes in ${formatTimeRemaining(remaining)}`;
        }

        // Fall back to displaying the interval
        return `Auto-refresh: ${source.refreshOptions.interval}m`;
    };

    // Initialize refresh times when sources change
    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            const newRefreshTimes = {};
            let needsUpdate = false;

            sources.forEach(source => {
                if (source.sourceType === 'http' &&
                    source.refreshOptions &&
                    (source.refreshOptions.enabled || source.refreshOptions.interval > 0) &&
                    source.refreshOptions.nextRefresh) {

                    // IMPORTANT: Always recalculate from source every interval
                    // This ensures we're always showing the most current timing
                    const remaining = Math.max(0, source.refreshOptions.nextRefresh - now);
                    const timeText = remaining > 0
                        ? `Refreshes in ${formatTimeRemaining(remaining)}`
                        : 'Refreshing...';

                    // Always update the displayed time - don't check if it's changed
                    newRefreshTimes[source.sourceId] = timeText;
                    needsUpdate = true;
                }
            });

            // Only update state if there are changes
            if (needsUpdate) {
                setRefreshTimes(newRefreshTimes); // Replace entire object instead of merging
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [sources, refreshingSourceId, onRefreshSource]);

    // Update countdown timers for auto-refreshing sources
    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            const newRefreshTimes = {};
            let needsUpdate = false;

            sources.forEach(source => {
                if (source.sourceType === 'http' &&
                    source.refreshOptions &&
                    (source.refreshOptions.enabled || source.refreshOptions.interval > 0) &&
                    source.refreshOptions.nextRefresh) {

                    const remaining = Math.max(0, source.refreshOptions.nextRefresh - now);

                    // If the time has passed, it should be refreshing or needs a fresh refresh cycle
                    if (remaining <= 0) {
                        // If more than 30 seconds have passed since the nextRefresh time,
                        // it's probably stuck and needs a manual refresh
                        if (remaining < -30000) { // 30 seconds
                            newRefreshTimes[source.sourceId] = 'Refresh needed';
                            needsUpdate = true;

                            // Trigger a refresh if it's not already refreshing
                            if (!refreshingSourceId) {
                                // Use setTimeout to prevent the refresh from happening on every interval tick
                                setTimeout(() => {
                                    onRefreshSource(source.sourceId);
                                }, 500);
                            }
                        } else {
                            newRefreshTimes[source.sourceId] = 'Refreshing now...';
                            needsUpdate = true;
                        }
                    } else {
                        // Format the remaining time
                        const timeText = `Refreshes in ${formatTimeRemaining(remaining)}`;
                        if (refreshTimes[source.sourceId] !== timeText) {
                            newRefreshTimes[source.sourceId] = timeText;
                            needsUpdate = true;
                        }
                    }
                }
            });

            // Only update state if there are changes
            if (needsUpdate) {
                setRefreshTimes(prev => ({...prev, ...newRefreshTimes}));
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [sources, refreshingSourceId, onRefreshSource, refreshTimes]);

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

    // Handle refresh source with update to modal if open
    const handleRefreshSource = async (sourceId, updatedSource = null) => {
        try {
            console.log('SourceTable: Starting refresh for source', sourceId);

            // Set refreshing state
            setRefreshingSourceId(sourceId);

            // Call the parent refresh handler with the updated source if provided
            const success = await onRefreshSource(sourceId, updatedSource);

            console.log('SourceTable: Refresh completed with success =', success);

            return success;
        } catch (error) {
            console.error('Error refreshing source:', error);
            return false;
        } finally {
            // Clear refreshing state with a small delay to ensure UI updates
            setTimeout(() => {
                setRefreshingSourceId(null);
            }, 100);
        }
    };

    // Handle save edited source
    const handleSaveSource = async (sourceData) => {
        try {
            // Set loading state to give visual feedback
            setRefreshingSourceId(sourceData.sourceId);

            // Extract refreshNow flag and remove it from the data sent to parent
            const shouldRefreshNow = sourceData.refreshNow === true;
            const dataToSave = { ...sourceData };
            delete dataToSave.refreshNow;

            // IMPORTANT: Preserve existing refresh timing if not refreshing immediately
            if (!shouldRefreshNow) {
                // Find the current source to get its existing refresh schedule
                const currentSource = sources.find(s => s.sourceId === sourceData.sourceId);
                if (currentSource && currentSource.refreshOptions &&
                    currentSource.refreshOptions.nextRefresh &&
                    currentSource.refreshOptions.nextRefresh > Date.now()) {

                    // Explicitly preserve the nextRefresh timestamp
                    if (!dataToSave.refreshOptions) {
                        dataToSave.refreshOptions = {};
                    }

                    dataToSave.refreshOptions.preserveTiming = true;
                    dataToSave.refreshOptions.nextRefresh = currentSource.refreshOptions.nextRefresh;
                    dataToSave.refreshOptions.lastRefresh = currentSource.refreshOptions.lastRefresh;

                    console.log(`Preserving refresh timing for source ${sourceData.sourceId}: next refresh at ${new Date(currentSource.refreshOptions.nextRefresh).toISOString()}`);
                }
            }

            // Show loading state for a reasonable duration
            console.log("Saving source data...");
            await new Promise(resolve => setTimeout(resolve, 500));

            // Call parent handler to update the source and get the updated source
            const updatedSource = await onUpdateSource(dataToSave);

            if (updatedSource) {
                // If immediate refresh is requested, trigger it and wait for it to complete
                // before closing the modal
                if (shouldRefreshNow) {
                    console.log("Waiting for refresh to complete before closing modal...");

                    // Execute the refresh and wait for it to complete
                    await handleRefreshSource(sourceData.sourceId, updatedSource);

                    // Add a small delay to ensure the UI has fully updated with new timing
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Now close the modal after everything is complete
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
            console.error('Error saving source:', error);
            showMessage('error', `Error: ${error.message}`);
            return false;
        } finally {
            // Clear refreshing state
            setRefreshingSourceId(null);
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
                showMessage('warning',
                    `${sourceType} source ${sourceTag} has been removed. Any browser extension rules using this source will be affected.`,
                    5 // Duration in seconds
                );
            } else {
                showMessage('error', `Failed to remove source ${sourceTag}`);
            }

            return success;
        } catch (error) {
            console.error('Error removing source:', error);
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

    // Only log when needed, not on every render
    useEffect(() => {
        if (selectedSource && contentViewerVisible) {
            console.log('SourceTable: Current selected source', selectedSourceId,
                'content:', selectedSource.sourceContent?.substring(0, 30));
        }
    }, [contentViewerVisible, selectedSourceId, selectedSource?.sourceContent]);

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