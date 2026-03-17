import React from 'react';
import { Form, Input, Select, Radio, Button, Alert, Space, Tooltip } from 'antd';
import { FolderOpenOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { AUTH_TYPES, SSH_KEY_SOURCES, TOKEN_TYPES } from '../constants/WorkspaceConstants';

const { Option } = Select;

/**
 * Authentication form component for Git repository access
 * @param {Object} props - Component props
 * @param {string} props.authType - Currently selected authentication type
 * @param {string} props.sshKeySource - SSH key source (text or file)
 * @param {Function} props.onBrowseSSHKey - Handler for SSH key file browsing
 * @returns {JSX.Element} AuthenticationForm component
 */
const AuthenticationForm = ({ authType, sshKeySource, onBrowseSSHKey }) => {
    /**
     * Renders token authentication fields
     * @returns {JSX.Element} Token authentication form fields
     */
    const renderTokenFields = () => (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <Form.Item
                name="gitToken"
                label={
                    <Space>
                        Personal Access Token
                        <Tooltip title="Generate a token from your Git provider with repository access permissions">
                            <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                        </Tooltip>
                    </Space>
                }
                rules={[{ required: true, message: 'Please enter your access token' }]}
                style={{ marginBottom: 0 }}
            >
                <Input.Password placeholder="ghp_xxxxxxxxxxxx or glpat-xxxxxxxxxxxx" />
            </Form.Item>
            <Form.Item
                name="tokenType"
                label={
                    <Space>
                        Token Type
                        <Tooltip title="Auto-detect will determine the type based on the repository URL">
                            <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                        </Tooltip>
                    </Space>
                }
                initialValue="auto"
                style={{ marginBottom: 0 }}
            >
                <Select>
                    {TOKEN_TYPES.map(type => (
                        <Option key={type.value} value={type.value}>
                            {type.label}
                        </Option>
                    ))}
                </Select>
            </Form.Item>
        </div>
    );

    /**
     * Renders SSH key authentication fields
     * @returns {JSX.Element} SSH key authentication form fields
     */
    const renderSSHKeyFields = () => (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: 16 }}>
                <Form.Item
                    name="sshKeySource"
                    label={
                        <Space>
                            SSH Key Source
                            <Tooltip title="Choose how to provide your SSH private key">
                                <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                            </Tooltip>
                        </Space>
                    }
                    initialValue={SSH_KEY_SOURCES.TEXT}
                    style={{ marginBottom: 0 }}
                >
                    <Radio.Group>
                        <Radio.Button value={SSH_KEY_SOURCES.TEXT}>Paste Key</Radio.Button>
                        <Radio.Button value={SSH_KEY_SOURCES.FILE}>Select File</Radio.Button>
                    </Radio.Group>
                </Form.Item>
                
                <Form.Item
                    name="sshPassphrase"
                    label={
                        <Space>
                            SSH Key Passphrase (Optional)
                            <Tooltip title="Leave empty if your SSH key is not passphrase-protected">
                                <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                            </Tooltip>
                        </Space>
                    }
                    style={{ marginBottom: 0 }}
                >
                    <Input.Password placeholder="Passphrase for the SSH key" />
                </Form.Item>
            </div>
            
            {sshKeySource === SSH_KEY_SOURCES.TEXT ? (
                <Form.Item
                    name="sshKey"
                    label={
                        <Space>
                            SSH Private Key
                            <Tooltip title="Paste the contents of your private key file (e.g., id_rsa)">
                                <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                            </Tooltip>
                        </Space>
                    }
                    rules={[{ required: true, message: 'Please enter your SSH private key' }]}
                >
                    <Input.TextArea 
                        rows={6}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                        style={{ fontFamily: 'monospace' }}
                    />
                </Form.Item>
            ) : (
                <Form.Item
                    name="sshKeyPath"
                    label={
                        <Space>
                            SSH Key File
                            <Tooltip title="Select your SSH private key file from your system">
                                <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                            </Tooltip>
                        </Space>
                    }
                    rules={[{ required: true, message: 'Please select your SSH key file' }]}
                >
                    <Input
                        placeholder="~/.ssh/id_rsa"
                        addonAfter={
                            <Button 
                                type="text" 
                                icon={<FolderOpenOutlined />}
                                onClick={onBrowseSSHKey}
                            >
                                Browse
                            </Button>
                        }
                    />
                </Form.Item>
            )}
        </>
    );

    /**
     * Renders basic authentication fields
     * @returns {JSX.Element} Basic authentication form fields
     */
    const renderBasicFields = () => (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Form.Item
                name="gitUsername"
                label={
                    <Space>
                        Username
                        <Tooltip title="Your Git provider username or email address">
                            <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                        </Tooltip>
                    </Space>
                }
                rules={[{ required: true, message: 'Please enter your username' }]}
                style={{ marginBottom: 0 }}
            >
                <Input placeholder="Username or email" />
            </Form.Item>
            <Form.Item
                name="gitPassword"
                label={
                    <Space>
                        Password
                        <Tooltip title="Your account password or personal access token">
                            <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                        </Tooltip>
                    </Space>
                }
                rules={[{ required: true, message: 'Please enter your password' }]}
                style={{ marginBottom: 0 }}
            >
                <Input.Password placeholder="Password or personal access token" />
            </Form.Item>
        </div>
    );

    /**
     * Renders the system Git config information
     * @returns {JSX.Element} System Git config alert
     */
    const renderSystemGitInfo = () => (
        <Alert
            message="Using System Git Configuration"
            description={
                <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                    <li>Will use your existing Git credentials (SSH keys, credential helpers, etc.)</li>
                    <li>Works with SSH agent, GitHub CLI, Git Credential Manager, etc.</li>
                    <li>Perfect for repositories you can already clone/pull locally</li>
                </ul>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
        />
    );

    // Render appropriate fields based on authentication type
    switch (authType) {
        case AUTH_TYPES.TOKEN:
            return renderTokenFields();
        case AUTH_TYPES.SSH_KEY:
            return renderSSHKeyFields();
        case AUTH_TYPES.BASIC:
            return renderBasicFields();
        case AUTH_TYPES.NONE:
            return renderSystemGitInfo();
        default:
            return null;
    }
};

export default AuthenticationForm;
