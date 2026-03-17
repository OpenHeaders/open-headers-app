/**
 * Action components and handlers for WorkflowsTable
 * Provides import functionality and bulk actions
 */

import React from 'react';
import { Button, Space, Upload, Tooltip } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

import { handleWorkflowImport, SUPPORTED_FILE_TYPES } from '../shared';

/**
 * Upload component for importing workflows
 * @param {Function} onImportSuccess - Callback when import succeeds
 * @param {Function} onImportError - Callback when import fails
 * @returns {React.ReactNode} Upload component
 */
export const WorkflowUpload = ({ onImportSuccess, onImportError }) => {
  const uploadProps = {
    name: 'workflow',
    multiple: false,
    accept: Object.values(SUPPORTED_FILE_TYPES).join(','),
    showUploadList: false,
    beforeUpload: (file) => {
      handleWorkflowImport(file, onImportSuccess, onImportError).catch(console.error);
      return false; // Prevent default upload behavior
    }
  };

  return (
    <Upload {...uploadProps}>
      <Tooltip title="Import a session recording workflow from another user (.json)">
        <Button 
          type="primary"
          icon={<UploadOutlined />}
          size="default"
        >
          Import Workflow
        </Button>
      </Tooltip>
    </Upload>
  );
};

/**
 * Action buttons for the workflows table header
 * @param {Function} onImportSuccess - Callback when import succeeds
 * @param {Function} onImportError - Callback when import fails
 * @param {Array} selectedWorkflows - Currently selected workflows
 * @param {Function} onBulkDelete - Callback for bulk delete action
 * @returns {React.ReactNode} Action buttons component
 */
export const WorkflowTableActions = ({ 
  onImportSuccess, 
  onImportError, 
  selectedWorkflows = [], 
  onBulkDelete 
}) => {
  return (
    <Space size="middle">
      <WorkflowUpload 
        onImportSuccess={onImportSuccess}
        onImportError={onImportError}
      />
      
      {selectedWorkflows.length > 0 && (
        <Button 
          danger 
          size="default"
          onClick={() => onBulkDelete(selectedWorkflows)}
        >
          Delete Selected ({selectedWorkflows.length})
        </Button>
      )}
    </Space>
  );
};