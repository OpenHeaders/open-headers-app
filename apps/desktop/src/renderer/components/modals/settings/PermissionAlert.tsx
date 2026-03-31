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
 *  permissionAlert - Alert configuration object
 *  permissionAlert.type - Alert type ('warning', 'error', 'info', 'success')
 *  permissionAlert.message - Main alert message/title
 *  permissionAlert.description - Detailed description text
 *  permissionAlert.action - Optional action button configuration
 *  permissionAlert.action.text - Button text
 *  permissionAlert.action.onClick - Button click handler
 *  onClose - Callback function when alert is closed
 */
interface PermissionAlertProps {
  permissionAlert: {
    type?: 'error' | 'info' | 'success' | 'warning';
    message?: string;
    description?: string;
    action?: { text: string; onClick: () => void };
  } | null;
  onClose: () => void;
}
const PermissionAlert = ({ permissionAlert, onClose }: PermissionAlertProps) => {
  // Don't render if no alert is provided
  if (!permissionAlert) return null;

  return (
    <Alert
      title={permissionAlert.message}
      description={
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Text>{permissionAlert.description}</Text>
          {permissionAlert.action && (
            <Button size="small" type="primary" onClick={permissionAlert.action.onClick} style={{ marginTop: 8 }}>
              {permissionAlert.action.text}
            </Button>
          )}
        </Space>
      }
      type={permissionAlert.type}
      showIcon
      closable={{ onClose }}
      style={{ marginBottom: 16 }}
    />
  );
};

export default PermissionAlert;
