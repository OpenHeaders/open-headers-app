import React from 'react';
import { Alert, Button, Space, Typography } from 'antd';

const { Text } = Typography;

/**
 * PermissionAlert component for displaying permission-related alerts
 * 
 * Provides a user-friendly interface for displaying permission requests,
 * status updates, and actions related to system permissions (like screen recording).
 * 
 * Features:
 * - Contextual alert messages with appropriate styling
 * - Action buttons for permission-related operations
 * - Closeable alerts with proper state management
 * - Support for different alert types (warning, error, info)
 * 
 * Common Use Cases:
 * - Screen recording permission requests on macOS
 * - Permission denied notifications
 * - App restart prompts after permission changes
 * - System preferences guidance
 * 
 * @param {Object} permissionAlert - Alert configuration object
 * @param {string} permissionAlert.type - Alert type ('warning', 'error', 'info', 'success')
 * @param {string} permissionAlert.message - Main alert message/title
 * @param {string} permissionAlert.description - Detailed description text
 * @param {Object} permissionAlert.action - Optional action button configuration
 * @param {string} permissionAlert.action.text - Button text
 * @param {function} permissionAlert.action.onClick - Button click handler
 * @param {function} onClose - Callback function when alert is closed
 */
const PermissionAlert = ({ permissionAlert, onClose }) => {
    // Don't render if no alert is provided
    if (!permissionAlert) return null;

    return (
        <Alert
            message={permissionAlert.message}
            description={
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Text>{permissionAlert.description}</Text>
                    {permissionAlert.action && (
                        <Button 
                            size="small" 
                            type="primary"
                            onClick={permissionAlert.action.onClick}
                            style={{ marginTop: 8 }}
                        >
                            {permissionAlert.action.text}
                        </Button>
                    )}
                </Space>
            }
            type={permissionAlert.type}
            showIcon
            closable
            onClose={onClose}
            style={{ marginBottom: 16 }}
        />
    );
};

export default PermissionAlert;