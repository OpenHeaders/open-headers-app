import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Tag, Typography, Space, Modal, Popconfirm } from 'antd';
import {
    ReloadOutlined,
    DeleteOutlined,
    SettingOutlined,
    EyeOutlined
} from '@ant-design/icons';
import RefreshOptions from './RefreshOptions';
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
                         onUpdateRefreshOptions
                     }) => {
    // Component state
    const [refreshTimes, setRefreshTimes] = useState({});
    const [refreshModalVisible, setRefreshModalVisible] = useState(false);
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
        const now = Date.now();
        const initialRefreshTimes = {};

        sources.forEach(source => {
            if (source.sourceType === 'http' &&
                source.refreshOptions &&
                (source.refreshOptions.enabled || source.refreshOptions.interval > 0) &&
                source.refreshOptions.nextRefresh) {

                const remaining = Math.max(0, source.refreshOptions.nextRefresh - now);

                if (remaining > 0) {
                    // Format the remaining time for initial display
                    initialRefreshTimes[source.sourceId] = `Refreshes in ${formatTimeRemaining(remaining)}`;
                    console.log(`Set initial refresh time for source ${source.sourceId}: ${initialRefreshTimes[source.sourceId]}`);
                }
            }
        });

        if (Object.keys(initialRefreshTimes).length > 0) {
            setRefreshTimes(prev => ({...prev, ...initialRefreshTimes}));
        }
    }, [sources]);

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

    // Handle edit refresh options
    const handleEditRefresh = useCallback((source) => {
        // Only store the ID so we always pull latest data from sources array
        setSelectedSourceId(source.sourceId);
        setRefreshModalVisible(true);
    }, []);

    // Handle view content
    const handleViewContent = useCallback((source) => {
        // Store only the ID for the selected source
        setSelectedSourceId(source.sourceId);
        setContentViewerVisible(true);
    }, []);

    // Handle refresh source with update to modal if open
    const handleRefreshSource = async (sourceId) => {
        try {
            console.log('SourceTable: Starting refresh for source', sourceId);

            // Set refreshing state
            setRefreshingSourceId(sourceId);

            // Call the parent refresh handler
            const success = await onRefreshSource(sourceId);

            console.log('SourceTable: Refresh completed with success =', success);

            // We don't need to explicitly update selectedSource here
            // since it's dynamically derived from sources and selectedSourceId

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

    // Handle save refresh options
    const handleSaveRefreshOptions = async (sourceId, refreshOptions) => {
        try {
            // Set loading state to give visual feedback
            setRefreshingSourceId(sourceId);

            // Call parent handler to update refresh options
            const success = await onUpdateRefreshOptions(sourceId, refreshOptions);

            if (success) {
                // Keep modal open with loading state if we're doing an immediate refresh
                const shouldRefreshNow = refreshOptions.refreshNow === true;

                if (shouldRefreshNow) {
                    // The modal will be closed by the RefreshOptions component
                    // after the refresh completes (and it will show the success message)
                    return success;
                } else {
                    // If no immediate refresh, add a small delay then close
                    await new Promise(resolve => setTimeout(resolve, 300));
                    setRefreshModalVisible(false);

                    // Clean up after animation completes
                    setTimeout(() => {
                        setSelectedSourceId(null);
                        setRefreshingSourceId(null);

                        // Note: We no longer show a success message here as RefreshOptions will handle it
                    }, 300);
                }
            } else {
                showMessage('error', 'Failed to update refresh options');
                setRefreshingSourceId(null);
            }

            return success;
        } catch (error) {
            console.error('Error saving refresh options:', error);
            showMessage('error', `Error: ${error.message}`);
            setRefreshingSourceId(null);
            return false;
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
        setRefreshModalVisible(false);
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
                                    onClick={() => handleEditRefresh(record)}
                                    style={{ padding: '0 4px', fontSize: '12px' }}
                                >
                                    <SettingOutlined /> Refresh
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

            {/* Refresh Options Modal - only render when visible and source is set */}
            {refreshModalVisible && selectedSource && (
                <Modal
                    title="Edit Auto-Refresh Options"
                    open={refreshModalVisible}
                    onCancel={handleCloseModal}
                    footer={null}
                    destroyOnClose={true}
                    maskClosable={false}
                    className="ant-modal-small"
                    width={500}
                >
                    <RefreshOptions
                        key={`refresh-options-${selectedSource.sourceId}`}
                        source={selectedSource}
                        onSave={handleSaveRefreshOptions}
                        onCancel={handleCloseModal}
                    />
                </Modal>
            )}

            {/* Content Viewer Modal */}
            <ContentViewer
                source={selectedSource}
                open={contentViewerVisible}
                onClose={handleCloseModal}
                onRefresh={handleRefreshSource}
            />
        </>
    );
};

export default SourceTable;