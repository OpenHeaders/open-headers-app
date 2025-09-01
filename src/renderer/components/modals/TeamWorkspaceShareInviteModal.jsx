import React, { useState } from 'react';
import { Modal, Space, Button, Input, Typography, Alert, Checkbox, Segmented, Tooltip, App, theme } from 'antd';
import { 
    TeamOutlined, 
    CopyOutlined,
    QuestionCircleOutlined
} from '@ant-design/icons';

/**
 * TeamWorkspaceShareInviteModal - A reusable modal for sharing team workspace invites
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Whether the modal is visible
 * @param {Object} props.workspace - The workspace object to share
 * @param {Function} props.onClose - Handler for closing the modal
 * @returns {JSX.Element} TeamWorkspaceShareInviteModal component
 */
const TeamWorkspaceShareInviteModal = ({ visible, workspace, onClose }) => {
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const [linkType, setLinkType] = useState('web');
    const [includeAuth, setIncludeAuth] = useState(false);
    const [appLink, setAppLink] = useState('');
    const [webLink, setWebLink] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Generate invite links when modal opens
    React.useEffect(() => {
        if (visible && workspace) {
            generateInviteLinks();
        }
    }, [visible, workspace]);
    
    // Reset state when modal closes
    React.useEffect(() => {
        if (!visible) {
            setLinkType('web');
            setIncludeAuth(false);
            setAppLink('');
            setWebLink('');
        }
    }, [visible]);
    
    const generateInviteLinks = async () => {
        try {
            setLoading(true);
            const result = await window.electronAPI.generateTeamWorkspaceInvite({
                ...workspace,
                includeAuthData: false
            });
            
            if (result.success) {
                setAppLink(result.links.appLink);
                setWebLink(result.links.webLink);
            } else {
                message.error(`Failed to generate invite: ${result.error}`);
                onClose();
            }
        } catch (error) {
            console.error('Error generating invite:', error);
            message.error('Failed to generate workspace invite');
            onClose();
        } finally {
            setLoading(false);
        }
    };
    
    const handleChange = async (type, auth) => {
        if (type === 'web' && auth) {
            // Web links cannot include auth
            auth = false;
            setIncludeAuth(false);
        }
        
        setLinkType(type);
        
        if (type === 'app' && auth !== includeAuth) {
            try {
                setLoading(true);
                const newResult = await window.electronAPI.generateTeamWorkspaceInvite({
                    ...workspace,
                    includeAuthData: auth
                });
                
                if (newResult.success) {
                    setAppLink(newResult.links.appLink);
                }
            } catch (error) {
                console.error('Error regenerating invite:', error);
                message.error('Failed to regenerate invite link');
            } finally {
                setLoading(false);
            }
        }
    };
    
    const getLinkValue = () => {
        if (linkType === 'web') {
            return webLink;
        }
        return appLink;
    };
    
    const handleCopyLink = () => {
        navigator.clipboard.writeText(getLinkValue());
        message.success('Link copied to clipboard');
    };
    
    if (!workspace) return null;
    
    return (
        <Modal
            title={
                <Space>
                    Invite to team workspace <TeamOutlined />{workspace.name}
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
                    <Segmented
                        value={linkType}
                        onChange={(value) => handleChange(value, includeAuth)}
                        options={[
                            { 
                                label: (
                                    <div style={{ padding: '4px 0' }}>
                                        <div>First-time users</div>
                                        <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 'normal' }}>
                                            No app installed yet
                                        </div>
                                    </div>
                                ),
                                value: 'web'
                            },
                            { 
                                label: (
                                    <div style={{ padding: '4px 0' }}>
                                        <div>Existing users</div>
                                        <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 'normal' }}>
                                            Have app installed
                                        </div>
                                    </div>
                                ),
                                value: 'app'
                            }
                        ]}
                        block
                        size="large"
                        disabled={loading}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', minHeight: 32, alignItems: 'center' }}>
                    {linkType === 'app' && (
                        <Checkbox
                            checked={includeAuth}
                            onChange={async (e) => {
                                const checked = e.target.checked;
                                setIncludeAuth(checked);
                                await handleChange('app', checked);
                            }}
                            disabled={loading}
                            style={{ display: 'flex', alignItems: 'center' }}
                        >
                            <span style={{ lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                Include Git authentication credentials
                                <Tooltip 
                                    title="Includes your configured auth data for this workspace (personal access token, user/pass or SSH key)"
                                    placement="top"
                                >
                                    <QuestionCircleOutlined style={{ fontSize: 12, color: token.colorPrimary, cursor: 'help', verticalAlign: 'middle' }} />
                                </Tooltip>
                            </span>
                        </Checkbox>
                    )}
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
                            {linkType === 'web' 
                                ? 'They see workspace details, download & install the app, then click to join workspace'
                                : 'Browser automatically opens OpenHeaders app to join workspace'}
                        </li>
                        <li style={{ marginBottom: 4 }}>
                            After accepting the invitation, the config will be automatically synced every 1h
                        </li>
                        <li >
                            (Optional) Environment values must be imported separately via 'Menu -> Import' or 'Share Environment'
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
                        value={getLinkValue()}
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
                    disabled={!getLinkValue()}
                >
                    Copy Invite Link
                </Button>

                {includeAuth && (
                    <Alert
                        message="This link contains sensitive authentication data"
                        type="warning"
                        showIcon
                        banner
                    />
                )}
            </Space>
        </Modal>
    );
};

export default TeamWorkspaceShareInviteModal;