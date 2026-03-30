/**
 * WorkflowRecording component for managing workflow view and table switching
 * Handles sticky header behavior, view switching, and tutorial information
 */

import { TableOutlined } from '@ant-design/icons';
import type { Recording, WorkflowRecordingEntry } from '@openheaders/core';
import { Alert, Button, Card, theme } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import { WorkflowsTable } from '@/renderer/components/features/workflow-recording/table';
import { WorkflowViewer } from '@/renderer/components/features/workflow-recording/viewer';
import { useSettings } from '@/renderer/contexts';
import { convertNewRecordingFormat } from '@/renderer/utils';

interface WorkflowRecordingProps {
  record: Recording | null;
  onRecordChange: (record: Recording | null) => void;
  onPlaybackTimeChange: (time: number) => void;
  autoHighlight: boolean;
  renderDetails?: (embedded: boolean) => React.ReactNode;
}

const WorkflowRecording = ({
  record,
  onRecordChange,
  onPlaybackTimeChange,
  autoHighlight,
  renderDetails,
}: WorkflowRecordingProps) => {
  const [showTable, setShowTable] = useState(!record); // Show table by default if no record
  const { token } = theme.useToken();
  const { settings } = useSettings();
  const tutorialMode = settings?.tutorialMode !== undefined ? settings.tutorialMode : true;

  // Update showTable when record changes (e.g., from extension)
  useEffect(() => {
    if (record) {
      setShowTable(false);
    } else {
      // When record is null, show the table
      setShowTable(true);
    }
  }, [record]);

  // Listen for new workflow recordings from WebSocket to reset view
  useEffect(() => {
    const handleNewRecording = () => {
      // Reset to table view when a new recording arrives
      setShowTable(true);
      if (onRecordChange) {
        onRecordChange(null);
      }
    };

    // Subscribe to recording received events
    const unsubscribe = window.electronAPI.onRecordingReceived(handleNewRecording);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [onRecordChange]);

  /**
   * Handles viewing a specific record
   * @param {Object} recordData - Record to view
   */
  const handleViewRecord = async (recordData: WorkflowRecordingEntry) => {
    try {
      // Load the full record data
      const fullRecord = await window.electronAPI.loadRecording(recordData.id);
      if (fullRecord?.record) {
        // Convert new format to old format if needed
        const convertedRecord = convertNewRecordingFormat(fullRecord.record) as Recording;
        onRecordChange(convertedRecord);
        setShowTable(false);
      }
    } catch (error) {
      console.error('Failed to load workflow:', error);
    }
  };

  /**
   * Handles record deletion
   * @param {string} recordId - ID of deleted record
   */
  const handleRecordDeleted = (recordId: string) => {
    // If the currently viewed record is deleted, show upload view
    if (record && (record.metadata?.recordId === recordId || record.id === recordId)) {
      onRecordChange(null);
      setShowTable(false);
    }
  };

  // Show recordings table
  if (showTable) {
    return (
      <Card
        size="small"
        title="Workflows"
        style={{
          borderRadius: token.borderRadius,
          boxShadow: token.boxShadowTertiary,
        }}
      >
        {tutorialMode && (
          <Alert
            message="Recording (Session & Video)"
            description={
              <div>
                <div>
                  Recording a workflow captures your current tab browser activity. Perfect for creating demos, debugging
                  technical issues, and sharing reproducible workflows.
                </div>
                <div style={{ marginTop: 8 }}>
                  <strong>Captures:</strong> 🔧 Console • 🌐 Network • 💾 Storage • 🖱️ Mouse events • 📊 Page metrics
                </div>
              </div>
            }
            type="info"
            showIcon
            closable
            style={{ marginBottom: 16 }}
          />
        )}
        <WorkflowsTable onViewRecord={handleViewRecord} onRecordDeleted={handleRecordDeleted} />
      </Card>
    );
  }

  // Show table view if no record
  if (!record) {
    return null; // The useEffect will handle setting showTable to true
  }

  // Show record details view
  return (
    <>
      <Card
        size="small"
        title={
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              position: 'relative',
            }}
          >
            <span style={{ position: 'absolute', left: 0 }}>Record</span>
            <Button
              icon={<TableOutlined />}
              onClick={() => setShowTable(true)}
              size={'middle' as const}
              aria-label="View all workflow recordings"
              title="Go back to workflows list"
            >
              ← Back to Workflows
            </Button>
          </div>
        }
        style={{
          borderRadius: token.borderRadius,
          boxShadow: token.boxShadowTertiary,
        }}
      >
        <WorkflowViewer
          record={record}
          onRecordChange={onRecordChange}
          viewMode="info"
          onPlaybackTimeChange={onPlaybackTimeChange}
          autoHighlight={autoHighlight}
          showAllWorkflowsButton={false}
          onShowAllWorkflows={() => setShowTable(true)}
        />
      </Card>
      {renderDetails?.(true)}
    </>
  );
};

export default WorkflowRecording;
