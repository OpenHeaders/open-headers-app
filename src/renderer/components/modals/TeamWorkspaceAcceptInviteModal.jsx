import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Form, Input, Radio, Alert, Button, Space, App, Select, Tooltip, Switch, Collapse, Typography } from 'antd';
import { TeamOutlined, CheckCircleOutlined, SyncOutlined, FolderOpenOutlined, QuestionCircleOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { DEFAULT_VALUES, WORKSPACE_TYPES, AUTH_TYPES, SSH_KEY_SOURCES, TOKEN_TYPES } from '../features/workspaces';
import { useWorkspaceCreation } from '../features/workspaces/hooks/useWorkspaceCreation';
import { WorkspaceServiceAdapterFactory } from '../features/workspaces/services/WorkspaceServiceAdapter';
import { useWorkspaces } from '../../hooks/workspace';
import { prepareAuthData } from '../features/workspaces';
import GitStatusAlert from '../features/workspaces/components/GitStatusAlert';
import ConnectionProgressModal from '../features/workspaces/components/ConnectionProgressModal';

const { Option } = Select;
const { Text } = Typography;

const TeamWorkspaceAcceptInviteModal = ({
    visible,
    inviteData,
    onCancel,
    onSuccess
}) => {
    const [form] = Form.useForm();
    const { message } = App.useApp();
    const [authType, setAuthType] = useState(DEFAULT_VALUES.authType);
    const [sshKeySource, setSshKeySource] = useState(DEFAULT_VALUES.sshKeySource);
    const [connectionTested, setConnectionTested] = useState(false);
    const [gitStatus, setGitStatus] = useState(null);
    const [connectionProgress, setConnectionProgress] = useState([]);
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [connectionTestResult, setConnectionTestResult] = useState(null);
    const [expandedKeys, setExpandedKeys] = useState([]);
    const unsubscribeProgressRef = useRef(null);
    const progressUnsubscribeRef = useRef(null);
    
    const workspaceContext = useWorkspaces();
    
    const services = useMemo(() => {
        return WorkspaceServiceAdapterFactory.create({
            workspaceContext
        });
    }, [workspaceContext]);
    
    const {
        progress,
        progressMessage,
        error,
        isLoading,
        isCompleted,
        isError,
        canRetry,
        canAbort,
        createWorkspace,
        resetCreation,
        retryCreation,
        workspaceId
    } = useWorkspaceCreation(services, { disableNotifications: true });

    const authTypeValue = Form.useWatch('authType', form);
    const sshKeySourceValue = Form.useWatch('sshKeySource', form);
    
    // Get all form values directly instead of watching individual fields
    // This ensures we get values even when fields are in collapsed panels
    const allFormValues = Form.useWatch([], form) || {};
    
    useEffect(() => {
        setAuthType(authTypeValue || DEFAULT_VALUES.authType);
    }, [authTypeValue]);
    
    useEffect(() => {
        setSshKeySource(sshKeySourceValue || DEFAULT_VALUES.sshKeySource);
    }, [sshKeySourceValue]);

    const generateUniqueWorkspaceName = (baseName, existingWorkspaces) => {
        let counter = 1;
        let newName = baseName;
        
        while (existingWorkspaces.find(w => w.name === newName)) {
            counter++;
            newName = `${baseName} (${counter})`;
        }
        
        return newName;
    };

    useEffect(() => {
        if (inviteData && visible) {
            const workspaceName = workspaceContext.workspaces.find(w => w.name === inviteData.workspaceName)
                ? generateUniqueWorkspaceName(inviteData.workspaceName, workspaceContext.workspaces)
                : inviteData.workspaceName;

            const formValues = {
                name: workspaceName,
                description: inviteData.description || `Shared workspace: ${inviteData.workspaceName}`,
                type: 'team',
                gitUrl: inviteData.repoUrl,
                gitBranch: inviteData.branch || 'main',
                gitPath: inviteData.configPath || 'config/',
                authType: inviteData.authType || DEFAULT_VALUES.authType,
                autoSync: true
            };

            // If auth data is included in the invite, pre-fill it
            if (inviteData.authData) {
                if (inviteData.authType === 'token' && inviteData.authData.token) {
                    formValues.gitToken = inviteData.authData.token;
                    formValues.tokenType = inviteData.authData.tokenType || 'auto';
                } else if (inviteData.authType === 'basic') {
                    formValues.gitUsername = inviteData.authData.username;
                    formValues.gitPassword = inviteData.authData.password;
                } else if (inviteData.authType === 'ssh-key') {
                    // SSH key is stored directly in authData
                    formValues.sshKeySource = 'text'; // Always text when from invite
                    formValues.sshKey = inviteData.authData.sshKey;
                    formValues.sshPassphrase = inviteData.authData.sshPassphrase;
                }
            }

            form.setFieldsValue(formValues);
            setConnectionTested(false);
            setConnectionTestResult(null);
        }
    }, [inviteData, visible, form, workspaceContext.workspaces]);

    useEffect(() => {
        if (visible && !gitStatus && services) {
            checkGitStatus().catch(console.error);
        }
    }, [visible, gitStatus, services]);

    useEffect(() => {
        if (!visible) {
            form.resetFields();
            setConnectionTested(false);
            setConnectionTestResult(null);
            resetCreation();
            setExpandedKeys([]);
        }
    }, [visible, form, resetCreation]);

    useEffect(() => {
        if (isCompleted && workspaceId) {
            onSuccess?.();
        }
    }, [isCompleted, workspaceId, onSuccess]);

    useEffect(() => {
        const handleWorkspaceSwitchStart = () => {
            onCancel();
        };

        window.addEventListener('workspace-switch-progress', handleWorkspaceSwitchStart);
        
        return () => {
            window.removeEventListener('workspace-switch-progress', handleWorkspaceSwitchStart);
        };
    }, [onCancel]);

    const checkGitStatus = async () => {
        try {
            const status = await services.gitService.getStatus();
            setGitStatus(status);
        } catch (error) {
            console.error('Failed to check Git status:', error);
            setGitStatus({ isInstalled: false, error: error.message });
        }
    };

    const handleTestConnection = async () => {
        // Use form.getFieldsValue(true) to get ALL fields including those not rendered
        const values = form.getFieldsValue(true);
        
        // For invites, use the pre-filled data if form values are missing
        if (inviteData) {
            values.gitUrl = values.gitUrl || inviteData.repoUrl;
            values.gitBranch = values.gitBranch || inviteData.branch || 'main';
            values.gitPath = values.gitPath || inviteData.configPath || 'config/';
            values.authType = values.authType || inviteData.authType || 'none';
            
            // Merge auth data from invite if not in form
            if (inviteData.authData && values.authType !== 'none') {
                if (values.authType === 'token' && !values.gitToken) {
                    values.gitToken = inviteData.authData.token;
                    values.tokenType = inviteData.authData.tokenType || 'auto';
                } else if (values.authType === 'basic') {
                    values.gitUsername = values.gitUsername || inviteData.authData.username;
                    values.gitPassword = values.gitPassword || inviteData.authData.password;
                } else if (values.authType === 'ssh-key') {
                    values.sshKeySource = values.sshKeySource || 'text';
                    values.sshKey = values.sshKey || inviteData.authData.sshKey;
                    values.sshPassphrase = values.sshPassphrase || inviteData.authData.sshPassphrase;
                }
            }
        }
        
        if (!values.gitUrl) {
            return;
        }
        
        const gitUrl = values.gitUrl.trim();
        const isValidUrl = /^(https?:\/\/|git@|ssh:\/\/|file:\/\/|\/|\.\/|\.\.\/|[a-zA-Z]:\\|[a-zA-Z]:\/)/i.test(gitUrl) || 
                          gitUrl.includes('.git') || 
                          gitUrl.includes('@') ||
                          gitUrl.startsWith('/') ||
                          gitUrl.startsWith('.');
        
        if (!isValidUrl) {
            message.error('Please enter a valid Git repository URL');
            form.setFields([{
                name: ['gitUrl'],
                errors: ['Please enter a valid Git repository URL (e.g., https://github.com/user/repo.git, git@github.com:user/repo.git, or /path/to/repo)']
            }]);
            return;
        }
        
        if (values.authType === 'token' && !values.gitToken) {
            message.error('Please enter an access token');
            form.setFields([{
                name: 'gitToken',
                errors: ['Please enter an access token']
            }]);
            return;
        }
        
        if (values.authType === 'basic') {
            if (!values.gitUsername || !values.gitPassword) {
                message.error('Please enter both username and password');
                if (!values.gitUsername) {
                    form.setFields([{
                        name: 'gitUsername',
                        errors: ['Please enter a username']
                    }]);
                }
                if (!values.gitPassword) {
                    form.setFields([{
                        name: 'gitPassword',
                        errors: ['Please enter a password']
                    }]);
                }
                return;
            }
        }
        
        if (values.authType === 'ssh-key') {
            if (values.sshKeySource === 'text' && !values.sshKey) {
                message.error('Please enter SSH key content');
                form.setFields([{
                    name: 'sshKey',
                    errors: ['Please enter SSH key content']
                }]);
                return;
            }
            
            if (values.sshKeySource === 'file' && !values.sshKeyPath) {
                message.error('Please select an SSH key file');
                form.setFields([{
                    name: 'sshKeyPath',
                    errors: ['Please select an SSH key file']
                }]);
                return;
            }
        }
        
        try {
            setIsTestingConnection(true);
            setConnectionProgress([]);
            setConnectionTested(false);
            setConnectionTestResult(null);
            
            unsubscribeProgressRef.current = services.gitService.subscribeToConnectionProgress?.();
            
            progressUnsubscribeRef.current = services.gitService.onProgress?.((event) => {
                if (event.type === 'git-connection') {
                    setConnectionProgress(event.data.summary || []);
                }
            });
            
            const authData = await prepareAuthData(values, values.authType || 'none');
            
            const result = await services.gitService.testConnection({
                url: values.gitUrl,
                branch: values.gitBranch || 'main',
                authType: values.authType || 'none',
                filePath: values.gitPath || 'config/',
                authData: authData,
                isInvite: true
            });
            
            setConnectionTested(result.success);
            setConnectionTestResult(result);
            setIsTestingConnection(false);
        } catch (error) {
            setConnectionTested(false);
            setConnectionTestResult({ success: false, error: error.message });
            setIsTestingConnection(false);
        }
    };

    const handleBrowseSSHKey = async () => {
        const filePath = await window.electronAPI.openFileDialog();
        if (filePath) {
            form.setFieldsValue({ sshKeyPath: filePath });
        }
    };

    const handleCloseConnectionProgress = () => {
        setIsTestingConnection(false);
        setConnectionProgress([]);
        setConnectionTestResult(null);
        if (unsubscribeProgressRef.current) {
            unsubscribeProgressRef.current();
            unsubscribeProgressRef.current = null;
        }
        if (progressUnsubscribeRef.current) {
            progressUnsubscribeRef.current();
            progressUnsubscribeRef.current = null;
        }
    };

    const handleInstallGit = async () => {
        try {
            const result = await services.gitService.install();
            if (result.success) {
                await checkGitStatus();
            }
        } catch (error) {
            console.error('Git installation failed:', error);
        }
    };

    const handleFinish = async (values) => {
        if (!connectionTested) {
            message.warning('Please test the connection before joining the workspace');
            return;
        }

        try {
            // Merge form values with invite data to ensure all required fields are present
            let finalValues = { ...values };
            
            if (inviteData) {
                // Ensure git repository details from invite are included
                finalValues.gitUrl = finalValues.gitUrl || inviteData.repoUrl;
                finalValues.gitBranch = finalValues.gitBranch || inviteData.branch || 'main';
                finalValues.gitPath = finalValues.gitPath || inviteData.configPath || 'config/';
                finalValues.authType = finalValues.authType || inviteData.authType || 'none';
                
                // Include auth data from invite if not in form
                if (inviteData.authData && finalValues.authType !== 'none') {
                    if (finalValues.authType === 'token' && !finalValues.gitToken) {
                        finalValues.gitToken = inviteData.authData.token;
                        finalValues.tokenType = inviteData.authData.tokenType || 'auto';
                    } else if (finalValues.authType === 'basic') {
                        finalValues.gitUsername = finalValues.gitUsername || inviteData.authData.username;
                        finalValues.gitPassword = finalValues.gitPassword || inviteData.authData.password;
                    } else if (finalValues.authType === 'ssh-key') {
                        finalValues.sshKeySource = finalValues.sshKeySource || 'text';
                        finalValues.sshKey = finalValues.sshKey || inviteData.authData.sshKey;
                        finalValues.sshPassphrase = finalValues.sshPassphrase || inviteData.authData.sshPassphrase;
                    }
                }
            }
            
            const formDataWithInviteMetadata = {
                ...finalValues,
                type: 'team',
                inviteMetadata: {
                    invitedBy: inviteData?.inviterName,
                    inviteId: inviteData?.inviteId,
                    joinedAt: new Date().toISOString()
                }
            };

            await createWorkspace(formDataWithInviteMetadata);
        } catch (error) {
            console.error('Failed to create workspace:', error);
            message.error(`Failed to join workspace: ${error.message}`);
        }
    };

    const canTestConnection = () => {
        // Check if we have a git URL
        const hasGitUrl = allFormValues.gitUrl || (inviteData && inviteData.repoUrl);
        
        // For pre-filled invites, we might have auth data that hasn't been set in form yet
        const hasPrefilledAuth = inviteData && inviteData.authData;
        
        return hasGitUrl && (authType === 'none' || hasValidAuthData() || hasPrefilledAuth);
    };

    const hasValidAuthData = () => {
        switch (authType) {
            case 'token':
                return allFormValues.gitToken;
            case 'ssh-key':
                return sshKeySource === 'text' ? allFormValues.sshKey : allFormValues.sshKeyPath;
            case 'basic':
                return allFormValues.gitUsername && allFormValues.gitPassword;
            default:
                return true;
        }
    };

    // Always require connection test unless it's already been tested
    const requireConnectionTest = !connectionTested;

    const renderFooter = () => {
        if (isLoading) {
            return (
                <div style={{ width: '100%' }}>
                    <div style={{ 
                        padding: '12px 16px',
                        backgroundColor: '#f0f8ff',
                        borderRadius: '6px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <SyncOutlined spin style={{ color: '#1890ff' }} />
                        <span style={{ color: '#1890ff', fontWeight: 500 }}>
                            {progressMessage}
                        </span>
                    </div>
                    
                    <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                        {canAbort && (
                            <Button onClick={onCancel}>
                                Cancel
                            </Button>
                        )}
                    </Space>
                </div>
            );
        }
        
        return (
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={onCancel} disabled={isLoading}>
                    Cancel
                </Button>
                
                <Tooltip title="Test repository connection and validate configuration">
                    <Button 
                        onClick={handleTestConnection} 
                        disabled={!canTestConnection() || isTestingConnection || isLoading}
                        loading={isTestingConnection}
                        icon={connectionTested ? 
                            <CheckCircleOutlined style={{ color: '#52c41a' }} /> : 
                            <SyncOutlined spin={isTestingConnection} />
                        }
                        type={connectionTested ? 'default' : undefined}
                        style={connectionTested ? { borderColor: '#52c41a' } : undefined}
                    >
                        {isTestingConnection ? 'Testing...' : 
                         connectionTested ? 'Connection Verified' : 'Test Connection'}
                    </Button>
                </Tooltip>
                
                <Button 
                    type="primary" 
                    htmlType="submit" 
                    disabled={requireConnectionTest || isLoading || !gitStatus?.isInstalled}
                    loading={isLoading}
                    onClick={() => form.submit()}
                >
                    {isLoading ? progressMessage : 'Join Workspace'}
                </Button>
            </Space>
        );
    };

    return (
        <>
            <Modal
                title={
                    <Space>
                        <TeamOutlined />
                        Invitation
                    </Space>
                }
                open={visible}
                onCancel={onCancel}
                footer={renderFooter()}
                width={700}
                destroyOnClose
                centered
                styles={{
                    body: { 
                        maxHeight: 'calc(70vh - 110px)', 
                        overflowY: 'scroll', 
                        paddingBottom: 0 
                    }
                }}
            >
                {inviteData && (
                    <Alert
                        message={`Workspace Invitation${inviteData.inviterName ? ` from ${inviteData.inviterName}` : ''}`}
                        description={
                            <div>
                                {!inviteData.authData && (
                                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                                        🔒 Configure your Git authentication below. Your credentials remain on your device.
                                    </div>
                                )}
                                <div style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ 
                                        background: '#1890ff', 
                                        color: 'white', 
                                        borderRadius: '50%', 
                                        width: '18px', 
                                        height: '18px', 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        fontSize: '10px',
                                        fontWeight: 'bold'
                                    }}>1</span>
                                    Click
                                    <span style={{ 
                                        background: '#f0f0f0', 
                                        padding: '2px 8px', 
                                        borderRadius: '4px', 
                                        fontSize: '11px',
                                        fontFamily: 'monospace'
                                    }}>Test Connection</span>
                                    <span style={{ margin: '0 4px' }}>→</span>
                                    <span style={{ 
                                        background: '#1890ff', 
                                        color: 'white', 
                                        borderRadius: '50%', 
                                        width: '18px', 
                                        height: '18px', 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        fontSize: '10px',
                                        fontWeight: 'bold'
                                    }}>2</span>
                                    Click
                                    <span style={{ 
                                        background: '#f0f0f0', 
                                        padding: '2px 8px', 
                                        borderRadius: '4px', 
                                        fontSize: '11px',
                                        fontFamily: 'monospace'
                                    }}>Join Workspace</span>
                                </div>
                            </div>
                        }
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                )}

                <GitStatusAlert
                    checkingGitStatus={false}
                    gitStatus={gitStatus}
                    installingGit={false}
                    gitInstallProgress=""
                    onInstallGit={handleInstallGit}
                    style={{ marginBottom: 16 }}
                />

                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFinish}
                    initialValues={{ type: 'team' }}
                    style={{ paddingBottom: 20 }}
                    disabled={isLoading}
                >
                    {/* Main workspace information - always visible */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: 16 }}>
                        <Form.Item 
                            name="name" 
                            label="Workspace Name" 
                            rules={[{ required: true, message: 'Please enter a workspace name' }]}
                            style={{ marginBottom: 0 }}
                        >
                            <Input placeholder="Enter workspace name" size="large" />
                        </Form.Item>

                        <Form.Item 
                            name="description" 
                            label="Description"
                            style={{ marginBottom: 0 }}
                        >
                            <Input placeholder="Optional description" size="large" />
                        </Form.Item>
                    </div>

                    {/* Collapsible section for ALL technical details including authentication */}
                    <Collapse 
                        activeKey={expandedKeys}
                        onChange={setExpandedKeys}
                        style={{ marginBottom: 16 }}
                        expandIcon={() => null}
                        items={[{
                            key: 'technical-details',
                            label: (
                                <Space>
                                    {expandedKeys.includes('technical-details') ? 
                                        <UpOutlined style={{ fontSize: 12 }} /> : 
                                        <DownOutlined style={{ fontSize: 12 }} />
                                    }
                                    <Text type="secondary">Show Technical Details</Text>
                                </Space>
                            ),
                            children: (
                                <>
                                    {/* Authentication section */}
                                    <Form.Item 
                                        name="authType" 
                                        label="Authentication Method" 
                                        rules={[{ required: true, message: 'Please select an authentication method' }]}
                                        extra="Choose how to authenticate with the Git repository"
                                        style={{ marginBottom: 16 }}
                                    >
                                        <Radio.Group>
                                            <Radio.Button value="none">System Git Config</Radio.Button>
                                            <Radio.Button value="token">Access Token</Radio.Button>
                                            <Radio.Button value="ssh-key">SSH Key</Radio.Button>
                                            <Radio.Button value="basic">Username/Password</Radio.Button>
                                        </Radio.Group>
                                    </Form.Item>

                                    {authType === AUTH_TYPES.TOKEN && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: 16 }}>
                                            <Form.Item
                                                name="gitToken"
                                                label="Personal Access Token"
                                                rules={[{ required: true, message: 'Please enter your access token' }]}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input.Password placeholder="ghp_xxxxxxxxxxxx or glpat-xxxxxxxxxxxx" size="small" />
                                            </Form.Item>
                                            <Form.Item
                                                name="tokenType"
                                                label="Token Type"
                                                initialValue="auto"
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Select size="small">
                                                    {TOKEN_TYPES.map(type => (
                                                        <Option key={type.value} value={type.value}>
                                                            {type.label}
                                                        </Option>
                                                    ))}
                                                </Select>
                                            </Form.Item>
                                        </div>
                                    )}

                                    {authType === AUTH_TYPES.SSH_KEY && (
                                        <>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: 16 }}>
                                                <Form.Item
                                                    name="sshKeySource"
                                                    label="SSH Key Source"
                                                    initialValue={SSH_KEY_SOURCES.TEXT}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Radio.Group size="small">
                                                        <Radio.Button value={SSH_KEY_SOURCES.TEXT}>Paste Key</Radio.Button>
                                                        <Radio.Button value={SSH_KEY_SOURCES.FILE}>Select File</Radio.Button>
                                                    </Radio.Group>
                                                </Form.Item>
                                                
                                                <Form.Item
                                                    name="sshPassphrase"
                                                    label="SSH Key Passphrase (Optional)"
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Input.Password placeholder="Passphrase for the SSH key" size="small" />
                                                </Form.Item>
                                            </div>
                                            
                                            {sshKeySource === SSH_KEY_SOURCES.TEXT ? (
                                                <Form.Item
                                                    name="sshKey"
                                                    label="SSH Private Key"
                                                    rules={[{ required: true, message: 'Please enter your SSH private key' }]}
                                                    help="Paste the contents of your private key file (e.g., id_rsa)"
                                                >
                                                    <Input.TextArea 
                                                        rows={4}
                                                        placeholder="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
                                                        style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                                    />
                                                </Form.Item>
                                            ) : (
                                                <Form.Item
                                                    name="sshKeyPath"
                                                    label="SSH Key File"
                                                    rules={[{ required: true, message: 'Please select your SSH key file' }]}
                                                >
                                                    <Input
                                                        placeholder="~/.ssh/id_rsa"
                                                        size="small"
                                                        addonAfter={
                                                            <Button 
                                                                type="text" 
                                                                icon={<FolderOpenOutlined />}
                                                                onClick={handleBrowseSSHKey}
                                                                size="small"
                                                            >
                                                                Browse
                                                            </Button>
                                                        }
                                                    />
                                                </Form.Item>
                                            )}
                                        </>
                                    )}

                                    {authType === AUTH_TYPES.BASIC && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: 16 }}>
                                            <Form.Item
                                                name="gitUsername"
                                                label="Username"
                                                rules={[{ required: true, message: 'Please enter your username' }]}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="Username or email" size="small" />
                                            </Form.Item>
                                            <Form.Item
                                                name="gitPassword"
                                                label="Password"
                                                rules={[{ required: true, message: 'Please enter your password' }]}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input.Password placeholder="Password or personal access token" size="small" />
                                            </Form.Item>
                                        </div>
                                    )}

                                    {authType === AUTH_TYPES.NONE && (
                                        <Alert
                                            message="Using System Git Configuration"
                                            description={
                                                <ul style={{ margin: '4px 0', paddingLeft: '20px', fontSize: '12px' }}>
                                                    <li>Will use your existing Git credentials (SSH keys, credential helpers, etc.)</li>
                                                    <li>Works with SSH agent, GitHub CLI, Git Credential Manager, etc.</li>
                                                    <li>Perfect for repositories you can already clone/pull locally</li>
                                                </ul>
                                            }
                                            type="info"
                                            showIcon
                                            style={{ marginBottom: 16 }}
                                        />
                                    )}

                                    {/* Repository details */}
                                    <div>
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: 8 }}>
                                                Git Repository (from invite)
                                            </div>
                                            
                                            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px', marginBottom: 12 }}>
                                                <Tooltip title={inviteData ? "This field is pre-filled from the workspace invite and cannot be changed" : ""}>
                                                    <Form.Item 
                                                        name="gitUrl" 
                                                        label="Repository URL"
                                                        rules={[{ required: true, message: 'Repository URL is required' }]}
                                                        style={{ marginBottom: 0 }}
                                                    >
                                                        <Input disabled={!!inviteData} placeholder="Repository URL" size="small" />
                                                    </Form.Item>
                                                </Tooltip>
                                                
                                                <Form.Item
                                                    name="autoSync"
                                                    label={
                                                        <Space>
                                                            Auto Sync
                                                            <Tooltip title="When enabled, the workspace will automatically sync with the Git repository every hour to pull the latest configuration changes. This ensures all team members stay up-to-date with the shared configuration. You can also manually sync at any time using the sync button.">
                                                                <QuestionCircleOutlined style={{ color: '#1890ff', fontSize: '12px' }} />
                                                            </Tooltip>
                                                        </Space>
                                                    }
                                                    valuePropName="checked"
                                                    initialValue={true}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" size="small" />
                                                </Form.Item>
                                            </div>
                                            
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <Tooltip title={inviteData ? "This field is pre-filled from the workspace invite and cannot be changed" : ""}>
                                                    <Form.Item 
                                                        name="gitBranch" 
                                                        label="Branch"
                                                        style={{ marginBottom: 0 }}
                                                    >
                                                        <Input disabled={!!inviteData} placeholder="Branch" size="small" />
                                                    </Form.Item>
                                                </Tooltip>
                                                
                                                <Tooltip title={inviteData ? "This field is pre-filled from the workspace invite and cannot be changed" : ""}>
                                                    <Form.Item 
                                                        name="gitPath" 
                                                        label="Config directory path"
                                                        style={{ marginBottom: 0 }}
                                                    >
                                                        <Input disabled={!!inviteData} placeholder="e.g., config/ or path/to/config/" size="small" />
                                                    </Form.Item>
                                                </Tooltip>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )
                        }]}
                    />

                    {isError && error && (
                        <Alert
                            message="Workspace Creation Failed"
                            description={error?.message || String(error)}
                            type="error"
                            showIcon
                            action={canRetry && (
                                <Button size="small" onClick={retryCreation}>
                                    Retry
                                </Button>
                            )}
                            style={{ marginBottom: 16 }}
                        />
                    )}

                </Form>
            </Modal>

            <ConnectionProgressModal
                visible={isTestingConnection || (connectionProgress && connectionProgress.length > 0)}
                isTestingConnection={isTestingConnection}
                connectionProgress={connectionProgress}
                testResult={connectionTestResult}
                onClose={handleCloseConnectionProgress}
            />

            <ConnectionProgressModal
                visible={isLoading && !isError}
                isTestingConnection={isLoading}
                connectionProgress={progress ? [{ 
                    step: progress.title || progressMessage, 
                    details: progress.description,
                    status: 'running',
                    progress: progress.step && progress.total ? Math.round((progress.step / progress.total) * 100) : undefined
                }] : []}
                testResult={null}
                onClose={() => {}}
            />
        </>
    );
};

export default TeamWorkspaceAcceptInviteModal;