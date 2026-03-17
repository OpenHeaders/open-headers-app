import React, { useState } from 'react';
import { Modal, Space, Button, Input, Typography, Alert, Checkbox, Tooltip, App, theme } from 'antd';
import { 
    DatabaseOutlined,
    CopyOutlined,
    QuestionCircleOutlined
} from '@ant-design/icons';

/**
 * EnvironmentShareModal - A reusable modal for sharing environment configurations
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Whether the modal is visible
 * @param {string} props.environmentName - Name of the environment to share
 * @param {Object} props.environmentData - Environment data to share
 * @param {Function} props.onClose - Handler for closing the modal
 * @returns {JSX.Element} EnvironmentShareModal component
 */
const EnvironmentShareModal = ({ visible, environmentName, environmentData, onClose }) => {
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const [isIncludeValues, setIsIncludeValues] = useState(false);
    const [appLink, setAppLink] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Generate invite links when modal opens
    React.useEffect(() => {
        if (visible && environmentName && environmentData) {
            generateEnvironmentLink(false);
        }
    }, [visible, environmentName, environmentData]);
    
    // Reset state when modal closes
    React.useEffect(() => {
        if (!visible) {
            setIsIncludeValues(false);
            setAppLink('');
        }
    }, [visible]);
    
    const generateEnvironmentLink = async (includeValues) => {
        try {
            setLoading(true);
            const result = await window.electronAPI.generateEnvironmentConfigLink({
                environments: {
                    [environmentName]: environmentData || {}
                },
                includeValues
            });
            
            if (result.success) {
                setAppLink(result.links.appLink);
                
                // Warn if URL is too long for Windows
                if (result.links.appLink.length > 2000) {
                    message.warning('The generated URL is very long and may not work on Windows. Consider sharing without values or splitting into smaller environments.');
                }
            } else {
                message.error(`Failed to generate share link: ${result.error}`);
                onClose();
            }
        } catch (error) {
            console.error('Error generating environment link:', error);
            message.error('Failed to generate environment share link');
            onClose();
        } finally {
            setLoading(false);
        }
    };
    
    const handleIncludeValuesChange = async (e) => {
        const checked = e.target.checked;
        setIsIncludeValues(checked);
        await generateEnvironmentLink(checked);
    };
    
    const handleCopyLink = () => {
        navigator.clipboard.writeText(appLink);
        message.success('Link copied to clipboard');
    };
    
    if (!environmentName || !environmentData) return null;
    
    return (
        <Modal
            title={
                <Space>
                    Share environment <DatabaseOutlined />{environmentName}
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
            centered
            destroyOnClose
        >
            <Space direction="vertical" style={{ width: '100%' }} size={20}>
                <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'center', minHeight: 32, alignItems: 'center' }}>
                        <Checkbox
                            checked={isIncludeValues}
                            onChange={handleIncludeValuesChange}
                            disabled={loading}
                            style={{ display: 'flex', alignItems: 'center' }}
                        >
                            <span style={{ lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                Include environment values
                                <Tooltip 
                                    title="Includes the actual values of all environment variables. Recipients won't need to add their own values."
                                    placement="top"
                                >
                                    <QuestionCircleOutlined style={{ fontSize: 12, color: token.colorPrimary, cursor: 'help', verticalAlign: 'middle' }} />
                                </Tooltip>
                            </span>
                        </Checkbox>
                    </div>
                </div>

                <div style={{ 
                    background: token.colorInfoBg, 
                    border: `1px solid ${token.colorInfoBorder}`,
                    borderRadius: 8,
                    padding: '12px 16px',
                    marginBottom: 16
                }}>
                    <Typography.Text style={{ fontSize: 13, color: token.colorInfo }}>
                        <strong>What happens next:</strong>
                    </Typography.Text>
                    <ul style={{ 
                        margin: '8px 0 0 0', 
                        paddingLeft: 20,
                        fontSize: 13,
                        color: token.colorInfo
                    }}>
                        <li style={{ marginBottom: 4 }}>
                            Recipient opens this link in their browser
                        </li>
                        <li style={{ marginBottom: 4 }}>
                            Browser automatically opens OpenHeaders app to show Import dialog
                        </li>
                        <li style={{ marginBottom: 4 }}>
                            Based on the import options, the environment will be created/updated in the app
                        </li>
                        <li>
                            {isIncludeValues 
                                ? 'Env Values will be imported based on the selected import strategy (merge or replace)'
                                : 'Env Values will not be included, only the schema'}
                        </li>
                    </ul>
                </div>

                <div style={{ 
                    background: token.colorFillAlter, 
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 8,
                    padding: 16
                }}>
                    <Input.TextArea
                        value={appLink}
                        readOnly
                        autoSize={{ minRows: 2, maxRows: 3 }}
                        style={{ 
                            border: 'none',
                            background: 'transparent',
                            padding: 0,
                            resize: 'none',
                            fontFamily: 'monospace',
                            fontSize: 13,
                            color: token.colorText
                        }}
                    />
                </div>

                <Button
                    icon={<CopyOutlined />}
                    onClick={handleCopyLink}
                    type="primary"
                    size="large"
                    block
                    loading={loading}
                    disabled={!appLink}
                >
                    Copy Environment Link
                </Button>

                {isIncludeValues && (
                    <Alert
                        message="This link contains environment variable values"
                        type="warning"
                        showIcon
                        banner
                    />
                )}
            </Space>
        </Modal>
    );
};

export default EnvironmentShareModal;