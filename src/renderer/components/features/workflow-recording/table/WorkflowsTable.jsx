/**
 * WorkflowsTable component for displaying and managing workflow recordings
 * Provides table view of all workflow recordings with actions for viewing, deleting, and exporting
 */

import React, { useState, useEffect } from 'react';
import { Table, Typography, Empty, theme } from 'antd';
import { useNavigation } from '../../../../contexts';
import { createLogger } from '../../../../utils/error-handling/logger';

const log = createLogger('WorkflowsTable');

import { 
  loadWorkflowRecordings, 
  deleteWorkflowRecording, 
  applyWorkflowRecordingHighlight 
} from '../shared';
import { showMessage } from '../../../../utils';
import { createWorkflowColumns } from './WorkflowTableColumns';
import { WorkflowTableActions } from './WorkflowTableActions';
import { DEFAULT_PAGINATION } from '../shared';
import RecordingExportModal from '../../../modals/export-recording';
import ProcessingOverlay from './ProcessingOverlay';
import EditDescriptionModal from '../modals/EditDescriptionModal';
import EditTagModal from '../modals/EditTagModal';

const { Text } = Typography;

/**
 * WorkflowsTable component
 * @param {Object} props - Component props
 * @param {Function} props.onViewRecord - Callback when viewing a record
 * @param {Function} props.onRecordDeleted - Callback when a record is deleted
 * @returns {React.ReactNode} Rendered component
 */
const WorkflowsTable = ({ onViewRecord, onRecordDeleted }) => {
    const [workflowRecordings, setWorkflowRecordings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [processingRecords, setProcessingRecords] = useState({});
    const [descriptionModalVisible, setDescriptionModalVisible] = useState(false);
    const [tagModalVisible, setTagModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const { getHighlight, applyHighlight, TARGETS } = useNavigation();
    const { token } = theme.useToken();

    /**
     * Loads workflow recordings from the API
     */
    const handleLoadWorkflowRecordings = async () => {
        setLoading(true);
        const records = await loadWorkflowRecordings();
        setWorkflowRecordings(records);
        setLoading(false);
    };

    /**
     * Handles record deletion
     * @param {string} recordId - ID of record to delete
     */
    const handleDelete = async (recordId) => {
        const success = await deleteWorkflowRecording(recordId);
        if (success) {
            setWorkflowRecordings(prev => prev.filter(r => r.id !== recordId));
            if (onRecordDeleted) {
                onRecordDeleted(recordId);
            }
            // Reload to ensure consistency
            setTimeout(handleLoadWorkflowRecordings, 100);
        }
    };

    /**
     * Handles record export via modal
     * @param {Object} record - Record to export
     */
    const handleExport = (record) => {
        setSelectedRecord(record);
        setExportModalVisible(true);
    };

    /**
     * Handles JSON export completion
     * @param {Object} record - Record metadata being exported
     */
    const handleExportJson = async (record) => {
        try {
            const timestamp = new Date(record.timestamp).toISOString().replace(/:/g, '-').split('.')[0];
            const filename = `open-headers_recording_${timestamp}.json`;
            
            // Show save dialog
            const filePath = await window.electronAPI.saveFileDialog({
                title: 'Export Recording as JSON',
                buttonLabel: 'Export',
                defaultPath: filename,
                filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (!filePath) return;

            // Load the actual recording data
            const recordingData = await window.electronAPI.loadRecording(record.id);
            
            // Add tag and description to the recording data if they exist
            if (record.tag || record.description) {
                recordingData.metadata = {
                    ...recordingData.metadata,
                    tag: record.tag || null,
                    description: record.description || null
                };
            }
            
            // Export the recording data (minified to save space)
            await window.electronAPI.writeFile(filePath, JSON.stringify(recordingData));
            
            showMessage('success', 'Recording exported successfully');
            log.info('Recording exported successfully to:', filePath);
        } catch (error) {
            log.error('Failed to export recording:', error);
            showMessage('error', 'Failed to export recording');
        }
    };

    /**
     * Handles successful workflow recording import
     */
    const handleImportSuccess = async () => {
        // Reload workflow recordings after import
        await handleLoadWorkflowRecordings();
    };

    /**
     * Handles workflow recording import error
     * @param {Error} error - Import error
     */
    const handleImportError = (error) => {
        log.error('Import error:', error);
    };

    // Apply highlight when workflow recordings change
    useEffect(() => {
        const highlight = getHighlight(TARGETS.RECORDS);
        if (highlight && highlight.itemId && workflowRecordings.length > 0) {
            log.debug('[WorkflowsTable] Applying highlight for:', highlight.itemId);
            applyWorkflowRecordingHighlight(applyHighlight, TARGETS.RECORDS, highlight.itemId);
        }
    }, [workflowRecordings, getHighlight, applyHighlight, TARGETS.RECORDS]);
    
    // Load workflow recordings on mount and set up event listeners
    useEffect(() => {
        handleLoadWorkflowRecordings().catch(log.error);
        
        // Listen for recordings being processed
        const unsubscribeProcessing = window.electronAPI.onRecordingProcessing((processingRecord) => {
            log.debug('[WorkflowsTable] Recording processing:', processingRecord.id);
            // Add the processing record to our table immediately
            setWorkflowRecordings(prev => {
                // Check if record already exists
                const existing = prev.find(r => r.id === processingRecord.id);
                if (existing) {
                    return prev;
                }
                // Add new processing record at the beginning
                return [processingRecord, ...prev];
            });
            // Track processing state with event count from the processing record
            setProcessingRecords(prev => ({
                ...prev,
                [processingRecord.id]: { 
                    stage: 'preprocessing', 
                    progress: 0,
                    details: {
                        eventCount: processingRecord.eventCount || 0
                    }
                }
            }));
        });
        
        // Listen for processing progress updates
        const unsubscribeProgress = window.electronAPI.onRecordingProgress(({ recordId, stage, progress, details }) => {
            log.debug('[WorkflowsTable] Recording progress:', recordId, stage, progress);
            setProcessingRecords(prev => {
                const existing = prev[recordId] || {};
                return {
                    ...prev,
                    [recordId]: { 
                        stage, 
                        progress, 
                        details: {
                            ...existing.details,  // Preserve existing details like eventCount
                            ...details  // Merge in new details
                        }
                    }
                };
            });
            
            // If complete, remove from processing and reload
            if (stage === 'complete') {
                setTimeout(() => {
                    setProcessingRecords(prev => {
                        const updated = { ...prev };
                        delete updated[recordId];
                        return updated;
                    });
                    handleLoadWorkflowRecordings().catch(log.error);
                }, 500); // Small delay for smooth transition
            }
        });
        
        // Listen for new workflow recordings
        const unsubscribeReceived = window.electronAPI.onRecordingReceived(() => {
            handleLoadWorkflowRecordings().catch(log.error);
        });
        
        // Listen for deleted workflow recordings
        const unsubscribeDeleted = window.electronAPI.onRecordingDeleted(({ recordId }) => {
            setWorkflowRecordings(prev => prev.filter(r => r.id !== recordId));
            setProcessingRecords(prev => {
                const updated = { ...prev };
                delete updated[recordId];
                return updated;
            });
        });
        
        // Listen for metadata updates (e.g., when video recording completes or tag/description updates)
        const unsubscribeMetadataUpdated = window.electronAPI.onRecordingMetadataUpdated((data) => {
            if (data.metadata) {
                // Full metadata update from updateRecordingMetadata
                log.debug('[WorkflowsTable] Full metadata updated for recording:', data.recordId);
                setWorkflowRecordings(prev => prev.map(r => 
                    r.id === data.recordId ? { ...r, ...data.metadata } : r
                ));
            } else if (data.hasVideo !== undefined) {
                // Video status update
                log.debug('[WorkflowsTable] Video status updated for recording:', data.recordingId, 'hasVideo:', data.hasVideo);
                setWorkflowRecordings(prev => prev.map(r => 
                    r.id === data.recordingId ? { ...r, hasVideo: data.hasVideo } : r
                ));
            }
        });

        return () => {
            if (unsubscribeProcessing) unsubscribeProcessing();
            if (unsubscribeProgress) unsubscribeProgress();
            if (unsubscribeReceived) unsubscribeReceived();
            if (unsubscribeDeleted) unsubscribeDeleted();
            if (unsubscribeMetadataUpdated) unsubscribeMetadataUpdated();
        };
    }, []);

    /**
     * Handles metadata update for a recording
     * @param {string} recordId - ID of the record to update
     * @param {Object} updates - Object containing fields to update (tag, description) or special actions
     */
    const handleUpdateMetadata = async (recordId, updates) => {
        // Check if this is a special action to open the description modal
        if (updates._action === 'editDescription' || updates._action === 'viewDescription') {
            const record = workflowRecordings.find(r => r.id === recordId);
            if (record) {
                setEditingRecord({
                    id: recordId,
                    url: updates.recordUrl || record.url,
                    tag: updates.recordTag || record.tag,
                    currentDescription: updates.currentDescription || record.description,
                    viewOnly: updates._action === 'viewDescription'
                });
                setDescriptionModalVisible(true);
            }
            return;
        }
        
        // Check if this is a special action to open the tag modal
        if (updates._action === 'editTag') {
            const record = workflowRecordings.find(r => r.id === recordId);
            if (record) {
                setEditingRecord({
                    id: recordId,
                    url: updates.recordUrl || record.url,
                    currentTag: updates.currentTag || record.tag
                });
                setTagModalVisible(true);
            }
            return;
        }

        try {
            if (!window.electronAPI?.updateRecordingMetadata) {
                log.warn('electronAPI.updateRecordingMetadata not available');
                showMessage('error', 'Update functionality not available');
                return;
            }
            
            await window.electronAPI.updateRecordingMetadata({ recordId, updates });
            
            // Update local state immediately for responsive UI
            setWorkflowRecordings(prev => prev.map(r => 
                r.id === recordId ? { ...r, ...updates } : r
            ));
            
            showMessage('success', 'Recording updated successfully');
        } catch (error) {
            log.error('Failed to update recording metadata:', error);
            showMessage('error', 'Failed to update recording');
        }
    };

    /**
     * Handles saving description from modal
     * @param {string} description - New description value
     */
    const handleSaveDescription = async (description) => {
        if (!editingRecord) return;
        
        await handleUpdateMetadata(editingRecord.id, { description });
        setDescriptionModalVisible(false);
        setEditingRecord(null);
    };

    /**
     * Handles saving tag from modal
     * @param {string|Object} tag - New tag value (string or {name, url})
     */
    const handleSaveTag = async (tag) => {
        if (!editingRecord) return;
        
        await handleUpdateMetadata(editingRecord.id, { tag });
        setTagModalVisible(false);
        setEditingRecord(null);
    };

    // Create table columns
    const columns = createWorkflowColumns(
        onViewRecord,
        handleDelete,
        handleExport,
        handleUpdateMetadata,
        processingRecords
    );

    return (
        <>
            {/* Action Bar - Centered Import Button */}
            <div style={{ 
                marginBottom: '16px', 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 0',
                borderBottom: `1px solid ${token.colorBorderSecondary}`
            }}>
                <div style={{ 
                    fontSize: '16px', 
                    fontWeight: 500, 
                    color: token.colorText,
                    textAlign: 'center'
                }}>
                    Workflow Recordings
                    {workflowRecordings.length > 0 && (
                        <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '14px', 
                            fontWeight: 400, 
                            color: token.colorTextSecondary 
                        }}>
                            ({workflowRecordings.length} recordings)
                        </span>
                    )}
                </div>
                <WorkflowTableActions
                    onImportSuccess={handleImportSuccess}
                    onImportError={handleImportError}
                />
            </div>

            <div style={{ position: 'relative' }}>
                <Table
                    dataSource={workflowRecordings}
                    columns={columns}
                    loading={loading}
                    rowKey="id"
                    pagination={DEFAULT_PAGINATION}
                    onRow={(record) => {
                        const highlight = getHighlight(TARGETS.RECORDS);
                        const isHighlighted = highlight && highlight.itemId === record.id;
                        
                        if (isHighlighted) {
                            return {
                                style: {
                                    backgroundColor: token.colorPrimaryBg,
                                    transition: 'background-color 0.3s ease'
                                },
                                onMouseEnter: (e) => {
                                    e.currentTarget.style.backgroundColor = token.colorPrimaryBgHover;
                                },
                                onMouseLeave: (e) => {
                                    e.currentTarget.style.backgroundColor = token.colorPrimaryBg;
                                }
                            };
                        }
                        return {};
                    }}
                    locale={{
                        emptyText: (
                            <Empty
                                description="No workflow recordings found"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            >
                                <Text type="secondary">
                                    Start recording a session or import workflow recordings to see them here
                                </Text>
                            </Empty>
                        )
                    }}
                    scroll={{ x: 'max-content' }}
                    size="small"
                />
                
                {/* Show overlay if any recording is being processed */}
                {Object.keys(processingRecords).length > 0 && (
                    <ProcessingOverlay processing={Object.values(processingRecords)[0]} />
                )}
            </div>

            {/* Export Modal */}
            <RecordingExportModal
                visible={exportModalVisible}
                record={selectedRecord}
                onCancel={() => {
                    setExportModalVisible(false);
                    setSelectedRecord(null);
                }}
                onExportJson={handleExportJson}
            />

            {/* Edit Description Modal */}
            <EditDescriptionModal
                visible={descriptionModalVisible}
                recordId={editingRecord?.id}
                recordUrl={editingRecord?.url}
                recordTag={editingRecord?.tag}
                currentDescription={editingRecord?.currentDescription}
                viewOnly={editingRecord?.viewOnly}
                onSave={handleSaveDescription}
                onCancel={() => {
                    setDescriptionModalVisible(false);
                    setEditingRecord(null);
                }}
            />

            {/* Edit Tag Modal */}
            <EditTagModal
                visible={tagModalVisible}
                recordId={editingRecord?.id}
                recordUrl={editingRecord?.url}
                currentTag={editingRecord?.currentTag}
                onSave={handleSaveTag}
                onCancel={() => {
                    setTagModalVisible(false);
                    setEditingRecord(null);
                }}
            />
        </>
    );
};

export default WorkflowsTable;