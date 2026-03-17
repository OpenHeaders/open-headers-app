/**
 * StorageDetailModal Component
 * 
 * Modal for displaying detailed storage entry information
 * Shows key, domain, URL, timestamp, attributes, and values
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Whether modal is visible
 * @param {Object} props.selectedEntry - Selected storage entry
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.messageApi - Ant Design message API
 */
import React from 'react';
import { Modal, Space, Tag, Typography, Button, theme } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { formatRelativeTimeWithSmallMs } from '../../../utils';
import { getTypeColor, getActionColor, formatValue } from './StorageUtils';

const { Text } = Typography;

const StorageDetailModal = ({ visible, selectedEntry, onClose, messageApi }) => {
    const { token } = theme.useToken();

    if (!selectedEntry) return null;

    const handleCopyKey = () => {
        navigator.clipboard.writeText(selectedEntry.name);
        messageApi.success('Key copied to clipboard');
    };

    const handleCopyOldValue = () => {
        let textToCopy;
        if (selectedEntry.action === 'clear' && typeof selectedEntry.oldValue === 'object' && selectedEntry.oldValue !== null) {
            textToCopy = Object.entries(selectedEntry.oldValue)
                .map(([key, value]) => `${key}: ${formatValue(value)}`)
                .join('\n');
        } else {
            textToCopy = formatValue(selectedEntry.oldValue);
        }
        navigator.clipboard.writeText(textToCopy);
        messageApi.success(selectedEntry.action === 'clear' ? 'Cleared entries copied to clipboard' : 'Old value copied to clipboard');
    };

    const handleCopyNewValue = () => {
        navigator.clipboard.writeText(formatValue(selectedEntry.value));
        messageApi.success('New value copied to clipboard');
    };

    const renderCookieAttributes = () => {
        if (selectedEntry.type !== 'cookie' || !selectedEntry.metadata) return null;

        const { metadata } = selectedEntry;
        const hasAttributes = selectedEntry.path || metadata.maxAge !== undefined || metadata.expires || 
                             metadata.httpOnly || metadata.secure || metadata.sameSite;

        if (!hasAttributes) {
            return (
                <Text type="secondary" style={{ fontStyle: 'italic' }}>
                    No special attributes
                </Text>
            );
        }

        return (
            <div>
                {selectedEntry.path && (
                    <div>
                        <Text type="secondary">Path:</Text> <Text code>{selectedEntry.path}</Text>
                    </div>
                )}
                {metadata.maxAge !== undefined && (
                    <div>
                        <Text type="secondary">Max-Age:</Text> <Text code>{metadata.maxAge}</Text>
                        {metadata.maxAge === '0' && (
                            <Text type="danger" style={{ fontSize: '12px', marginLeft: '8px' }}>
                                (Cookie deletion)
                            </Text>
                        )}
                    </div>
                )}
                {metadata.expires && (
                    <div>
                        <Text type="secondary">Expires:</Text> <Text code>{metadata.expires}</Text>
                    </div>
                )}
                {metadata.httpOnly && (
                    <div>
                        <Tag color="red" style={{ marginTop: '4px' }}>HttpOnly</Tag>
                        <Text type="secondary" style={{ fontSize: '12px' }}> - Cannot be accessed by JavaScript</Text>
                    </div>
                )}
                {metadata.secure && (
                    <div>
                        <Tag color="green" style={{ marginTop: '4px' }}>Secure</Tag>
                        <Text type="secondary" style={{ fontSize: '12px' }}> - Only sent over HTTPS</Text>
                    </div>
                )}
                {metadata.sameSite && (
                    <div>
                        <Tag color="blue" style={{ marginTop: '4px' }}>SameSite: {metadata.sameSite}</Tag>
                        <Text type="secondary" style={{ fontSize: '12px' }}> - Cross-site request behavior</Text>
                    </div>
                )}
            </div>
        );
    };

    const renderOldValue = () => {
        if (selectedEntry.action === 'clear' && typeof selectedEntry.oldValue === 'object' && selectedEntry.oldValue !== null) {
            return Object.entries(selectedEntry.oldValue).length > 0
                ? Object.entries(selectedEntry.oldValue)
                    .map(([key, value]) => `${key}: ${formatValue(value)}`)
                    .join('\n')
                : '<empty storage>';
        }
        
        if (!selectedEntry.oldValue || formatValue(selectedEntry.oldValue) === '') {
            return <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{'<new>'}</span>;
        }
        
        return formatValue(selectedEntry.oldValue);
    };

    const renderNewValue = () => {
        if (selectedEntry.action === 'remove') {
            return <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{'<removed>'}</span>;
        }
        if (selectedEntry.action === 'clear') {
            return <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{'<cleared>'}</span>;
        }
        if (!selectedEntry.value || formatValue(selectedEntry.value) === '') {
            return <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{'<empty>'}</span>;
        }
        return formatValue(selectedEntry.value);
    };

    const canCopyOldValue = () => {
        const hasOldValue = selectedEntry.oldValue && formatValue(selectedEntry.oldValue) !== '';
        const isEmptyClear = selectedEntry.action === 'clear' && 
            typeof selectedEntry.oldValue === 'object' && 
            selectedEntry.oldValue !== null && 
            Object.entries(selectedEntry.oldValue).length === 0;
        return hasOldValue || (selectedEntry.action === 'clear' && !isEmptyClear);
    };

    const canCopyNewValue = () => {
        if (selectedEntry.action === 'remove' || selectedEntry.action === 'clear') return false;
        return selectedEntry.value && formatValue(selectedEntry.value) !== '';
    };

    return (
        <Modal
            title={
                <Space>
                    <Tag color={getTypeColor(selectedEntry?.type)}>
                        {selectedEntry?.type === 'localStorage' ? 'LOCAL STORAGE' : 
                         selectedEntry?.type === 'sessionStorage' ? 'SESSION STORAGE' : 'COOKIE'}
                    </Tag>
                    <Tag color={getActionColor(selectedEntry?.action)}>
                        {selectedEntry?.action?.toUpperCase()}
                    </Tag>
                    <Text>{selectedEntry?.name}</Text>
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
                        <Text strong>Key/Name:</Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', marginBottom: '16px' }}>
                            <Text code style={{ flex: 1 }}>
                                {selectedEntry.name === '*' ? '<all keys>' : selectedEntry.name}
                            </Text>
                            {selectedEntry.name !== '*' && (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<CopyOutlined />}
                                    onClick={handleCopyKey}
                                >
                                    Copy
                                </Button>
                            )}
                        </div>
                    </div>

                    <div>
                        <Text strong>Domain:</Text>
                        <Text style={{ marginLeft: '8px' }}>{selectedEntry.domain}</Text>
                    </div>

                    {selectedEntry.url && (
                        <div>
                            <Text strong>URL:</Text>
                            <Text style={{ marginLeft: '8px', fontSize: '12px' }} code>
                                {selectedEntry.url}
                            </Text>
                        </div>
                    )}

                    {selectedEntry.timestamp !== undefined && (
                        <div>
                            <Text strong>Timestamp:</Text>
                            <Text style={{ marginLeft: '8px' }}>
                                {formatRelativeTimeWithSmallMs(selectedEntry.timestamp).main}
                                <span style={{ fontSize: '0.85em', opacity: 0.8 }}>
                                    {formatRelativeTimeWithSmallMs(selectedEntry.timestamp).ms}
                                </span>
                            </Text>
                        </div>
                    )}

                    {selectedEntry.type === 'cookie' && selectedEntry.metadata && (
                        <div style={{ marginTop: '16px' }}>
                            <Text strong>Cookie Attributes:</Text>
                            <div style={{
                                backgroundColor: token.colorBgLayout,
                                padding: '12px',
                                borderRadius: '6px',
                                border: `1px solid ${token.colorBorderSecondary}`,
                                marginTop: '8px'
                            }}>
                                {renderCookieAttributes()}
                            </div>
                        </div>
                    )}

                    {selectedEntry.newValue && (
                        <div style={{ marginTop: '16px' }}>
                            <Text strong>Raw Cookie String:</Text>
                            <pre style={{
                                backgroundColor: token.colorBgLayout,
                                padding: '12px',
                                borderRadius: '6px',
                                border: `1px solid ${token.colorBorderSecondary}`,
                                marginTop: '8px',
                                fontSize: '12px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all'
                            }}>
                                {selectedEntry.newValue}
                            </pre>
                        </div>
                    )}

                    <div style={{ marginTop: '16px' }}>
                        <Text strong>{selectedEntry.action === 'clear' ? 'Cleared Entries:' : 'Old Value:'}</Text>
                        <pre style={{
                            backgroundColor: token.colorBgLayout,
                            padding: '12px',
                            borderRadius: '6px',
                            border: `1px solid ${token.colorBorderSecondary}`,
                            maxHeight: '200px',
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            marginTop: '8px'
                        }}>
                            {renderOldValue()}
                        </pre>
                    </div>

                    <div>
                        <Text strong>New Value:</Text>
                        <pre style={{
                            backgroundColor: token.colorBgLayout,
                            padding: '12px',
                            borderRadius: '6px',
                            border: `1px solid ${token.colorBorderSecondary}`,
                            maxHeight: '200px',
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            marginTop: '8px',
                            marginBottom: '12px'
                        }}>
                            {renderNewValue()}
                        </pre>
                    </div>

                    <Space>
                        <Button
                            icon={<CopyOutlined />}
                            disabled={!canCopyOldValue()}
                            onClick={handleCopyOldValue}
                        >
                            {selectedEntry.action === 'clear' ? 'Copy Cleared Entries' : 'Copy Old Value'}
                        </Button>
                        
                        <Button
                            icon={<CopyOutlined />}
                            disabled={!canCopyNewValue()}
                            onClick={handleCopyNewValue}
                        >
                            Copy New Value
                        </Button>
                    </Space>
                </Space>
            </div>
        </Modal>
    );
};

export default StorageDetailModal;