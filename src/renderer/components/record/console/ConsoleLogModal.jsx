/**
 * ConsoleLogModal Component
 * 
 * Modal component for displaying detailed console log information
 * Extracted from RecordConsoleTab for better modularity
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Whether the modal is visible
 * @param {Object} props.selectedLog - The selected console log entry
 * @param {Object} props.record - The full record for context
 * @param {Function} props.onClose - Handler for modal close
 * @param {Function} props.messageApi - Ant Design message API
 */
import React from 'react';
import { Modal, Space, Tag, Typography, Button, theme } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { formatRelativeTimeWithSmallMs, format24HTimeWithMs } from '../../../utils';

const { Text } = Typography;

const ConsoleLogModal = ({ 
    visible, 
    selectedLog, 
    record, 
    onClose, 
    messageApi 
}) => {
    const { useToken } = theme;
    const { token } = useToken();

    if (!selectedLog) return null;

    const getLogLevelColor = (level) => {
        switch (level) {
            case 'error': return 'error';
            case 'warn': return 'warning';
            case 'info': return 'blue';
            case 'debug': return 'purple';
            default: return 'default';
        }
    };

    const formatTimestamp = () => {
        const ts = selectedLog.timestamp;
        const timeParts = formatRelativeTimeWithSmallMs(ts);
        const absoluteTime = new Date(record?.metadata?.startTime + ts);
        const formattedAbsoluteTime = format24HTimeWithMs(absoluteTime);
        
        return (
            <span>
                {timeParts.main}
                <span style={{ fontSize: '0.85em', opacity: 0.7 }}>{timeParts.ms}</span>
                {' '}
                ({formattedAbsoluteTime.date} {formattedAbsoluteTime.time}
                <span style={{ fontSize: '0.85em', opacity: 0.8 }}>{formattedAbsoluteTime.ms}</span>)
            </span>
        );
    };

    const handleCopyMessage = async () => {
        try {
            await navigator.clipboard.writeText(selectedLog.message);
            messageApi.success('Copied to clipboard');
        } catch (error) {
            messageApi.error('Failed to copy to clipboard');
        }
    };

    return (
        <Modal
            title={
                <Space>
                    <Tag color={getLogLevelColor(selectedLog.level)}>
                        {selectedLog.level?.toUpperCase()}
                    </Tag>
                    <Text>Console Log</Text>
                </Space>
            }
            open={visible}
            onCancel={onClose}
            footer={[
                <Button key="close" onClick={onClose}>
                    Close
                </Button>
            ]}
            width={800}
        >
            <div>
                <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                        <Text strong>Timestamp:</Text>
                        <div style={{ marginBottom: '16px' }}>
                            <Text>{formatTimestamp()}</Text>
                        </div>
                    </div>

                    <div>
                        <Text strong>Message:</Text>
                        <pre style={{
                            backgroundColor: token.colorBgLayout,
                            padding: '12px',
                            borderRadius: '6px',
                            border: `1px solid ${token.colorBorderSecondary}`,
                            maxHeight: '400px',
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            marginTop: '8px'
                        }}>
                            {selectedLog.message}
                        </pre>
                    </div>

                    <Button
                        icon={<CopyOutlined />}
                        onClick={handleCopyMessage}
                    >
                        Copy Message
                    </Button>
                </Space>
            </div>
        </Modal>
    );
};

export default ConsoleLogModal;