import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Form, Input, Radio, Alert, Button, Space, Tooltip, App, Switch, Collapse, Typography } from 'antd';
import { UserOutlined, TeamOutlined, CheckCircleOutlined, SyncOutlined, ExclamationCircleOutlined, QuestionCircleOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { DEFAULT_VALUES, WORKSPACE_TYPES } from '../constants';
import { WorkspaceServiceAdapterFactory } from '../services/WorkspaceServiceAdapter';
import { useWorkspaces } from '../../../../hooks/workspace';
import { prepareAuthData } from '../utils';
import GitStatusAlert from './GitStatusAlert';
import ConnectionProgressModal from './ConnectionProgressModal';
import AuthenticationForm from './AuthenticationForm';

const { Text } = Typography;

const WorkspaceEditModal = ({
    visible,
    workspace,
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
    const { updateWorkspace } = workspaceContext;
    
    const services = useMemo(() => {
        return WorkspaceServiceAdapterFactory.create({
            workspaceContext
        });
    }, [workspaceContext]);
    
    useEffect(() => {
        return () => {
            if (services?.cleanup) {
                services.cleanup();
            }
        };
    }, [services]);
    
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateError, setUpdateError] = useState(null);

    const authTypeValue = Form.useWatch('authType', form);
    const sshKeySourceValue = Form.useWatch('sshKeySource', form);
    
    useEffect(() => {
        setAuthType(authTypeValue || DEFAULT_VALUES.authType);
    }, [authTypeValue]);
    
    useEffect(() => {
        setSshKeySource(sshKeySourceValue || DEFAULT_VALUES.sshKeySource);
    }, [sshKeySourceValue]);
    
    // Initialize form with workspace data when modal opens or workspace changes
    useEffect(() => {
        if (visible && workspace) {
            // Extract auth data from workspace
            const authData = workspace.authData || {};
            
            // Set form values from the workspace
            const formValues = {
                name: workspace.name,
                description: workspace.description,
                type: workspace.type,
                gitUrl: workspace.gitUrl,
                gitBranch: workspace.gitBranch || 'main',
                gitPath: workspace.gitPath || 'config/',
                authType: workspace.authType || 'none',
                autoSync: workspace.autoSync !== false,
            };
            
            // Add auth-related fields based on authType
            if (workspace.authType === 'token' && authData.token) {
                formValues.gitToken = authData.token;
            } else if (workspace.authType === 'basic' && authData.username && authData.password) {
                formValues.gitUsername = authData.username;
                formValues.gitPassword = authData.password;
            } else if (workspace.authType === 'ssh-key') {
                formValues.sshKeySource = authData.sshKeySource || 'file';
                if (authData.sshKeySource === 'text' && authData.sshKey) {
                    formValues.sshKey = authData.sshKey;
                } else if (authData.sshKeySource === 'file' && authData.sshKeyPath) {
                    formValues.sshKeyPath = authData.sshKeyPath;
                }
            }
            
            form.setFieldsValue(formValues);
            
            // Set auth type state
            setAuthType(workspace.authType || 'none');
            setSshKeySource(authData.sshKeySource || 'file');
        }
    }, [visible, workspace, form]);
    
    useEffect(() => {
        if (visible && !gitStatus && services) {
            checkGitStatus().catch(console.error);
        }
    }, [visible, services]);
    
    // Remove this useEffect as we're not using the creation hook anymore
    
    useEffect(() => {
        if (!visible) {
            setConnectionTested(false);
            setConnectionProgress([]);
            setIsTestingConnection(false);
            setUpdateError(null);
            setIsUpdating(false);
            setExpandedKeys([]);
            
            if (unsubscribeProgressRef.current) {
                unsubscribeProgressRef.current();
                unsubscribeProgressRef.current = null;
            }
            if (progressUnsubscribeRef.current) {
                progressUnsubscribeRef.current();
                progressUnsubscribeRef.current = null;
            }
            
            if (form) {
                form.resetFields();
            }
        }
    }, [visible, form]);
    
    const checkGitStatus = async () => {
        try {
            const status = await services.gitService.getStatus();
            setGitStatus(status);
        } catch (error) {
            console.error('Failed to check Git status:', error);
            setGitStatus({ isInstalled: false, error: error.message });
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
    
    const handleTestConnection = async () => {
        const values = form.getFieldsValue();
        
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
                name: 'gitUrl',
                errors: ['Please enter a valid Git repository URL (e.g., https://github.com/user/repo.git, git@github.com:user/repo.git, or /path/to/repo)']
            }]);
            return;
        }
        
        // Validate auth fields based on auth type
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
            
            unsubscribeProgressRef.current = services.gitService.subscribeToConnectionProgress();
            
            progressUnsubscribeRef.current = services.gitService.onProgress((event) => {
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
                checkWriteAccess: false // For edit mode, we don't need write access check
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
    
    const handleFinish = async (values) => {
        try {
            setIsUpdating(true);
            setUpdateError(null);
            
            // Prepare auth data if it's a Git workspace
            let authData = null;
            if (workspace.type === WORKSPACE_TYPES.GIT) {
                try {
                    authData = await prepareAuthData(values, values.authType || 'none');
                } catch (error) {
                    message.error(`Failed to prepare authentication: ${error.message}`);
                    setIsUpdating(false);
                    return;
                }
            }
            
            // Prepare update values
            const updateValues = {
                name: values.name,
                description: values.description,
                gitUrl: values.gitUrl,
                gitBranch: values.gitBranch,
                gitPath: values.gitPath,
                authType: values.authType,
                autoSync: values.autoSync,
                authData: authData
            };
            
            // Update the workspace
            const success = await updateWorkspace(workspace.id, updateValues);
            
            if (success) {
                message.success('Workspace updated successfully');
                onSuccess?.(workspace.id);
                handleCancel();
            } else {
                throw new Error('Failed to update workspace');
            }
        } catch (error) {
            console.error('Workspace update failed:', error);
            setUpdateError(error);
            message.error(`Failed to update workspace: ${error.message}`);
        } finally {
            setIsUpdating(false);
        }
    };
    
    const handleCancel = () => {
        onCancel();
    };
    
    const renderGitConfigSection = () => {
        return (
            <>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: 12 }}>Git Repository Configuration</div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px', marginBottom: 16 }}>
                        <Form.Item
                            name="gitUrl"
                            label={
                                <Space>
                                    Repository URL
                                    <Tooltip title="Supports: Remote (https://, git@), Local (/path/to/repo or file:///), Network (git://host/repo)">
                                        <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                                    </Tooltip>
                                </Space>
                            }
                            rules={[{ required: true, message: 'Please enter a Git repository URL' }]}
                            style={{ marginBottom: 0 }}
                        >
                            <Input placeholder="e.g., /Users/name/repos/config.git or https://github.com/user/repo.git" />
                        </Form.Item>
                        
                        <Form.Item
                            name="autoSync"
                            label={
                                <Space>
                                    Auto Sync
                                    <Tooltip title="When enabled, the workspace will automatically sync with the Git repository every hour to pull the latest configuration changes. This ensures all team members stay up-to-date with the shared configuration. You can also manually sync at any time using the sync button.">
                                        <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                                    </Tooltip>
                                </Space>
                            }
                            valuePropName="checked"
                            style={{ marginBottom: 0 }}
                        >
                            <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
                        </Form.Item>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: 16 }}>
                        <Form.Item
                            name="gitBranch"
                            label={
                                <Space>
                                    Branch
                                    <Tooltip title="The branch to sync from">
                                        <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                                    </Tooltip>
                                </Space>
                            }
                            style={{ marginBottom: 0 }}
                        >
                            <Input placeholder="main" />
                        </Form.Item>
                        
                        <Form.Item
                            name="gitPath"
                            label={
                                <Space>
                                    Config directory path
                                    <Tooltip title="Directory where configuration files are stored">
                                        <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                                    </Tooltip>
                                </Space>
                            }
                            style={{ marginBottom: 0 }}
                        >
                            <Input placeholder="e.g., config/ or path/to/config/" />
                        </Form.Item>
                    </div>
                    
                    <Form.Item
                        name="authType"
                        label={
                            <Space>
                                Authentication Method
                                <Tooltip title="If Git is already configured locally (e.g., via SSH agent or credential helper), select 'Use System Git Config'">
                                    <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                                </Tooltip>
                            </Space>
                        }
                    >
                        <Radio.Group>
                            <Radio.Button value="none">System Git Config</Radio.Button>
                            <Radio.Button value="token">Access Token</Radio.Button>
                            <Radio.Button value="ssh-key">SSH Key</Radio.Button>
                            <Radio.Button value="basic">Username/Password</Radio.Button>
                        </Radio.Group>
                    </Form.Item>
                    
                    <AuthenticationForm
                        authType={authType}
                        sshKeySource={sshKeySource}
                        onBrowseSSHKey={handleBrowseSSHKey}
                    />
                </div>
            </>
        );
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

    const renderError = () => {
        if (!updateError) return null;
        
        return (
            <Alert
                message="Workspace Update Failed"
                description={
                    <div>
                        <div style={{ marginBottom: 8 }}>{updateError.message}</div>
                    </div>
                }
                type="error"
                showIcon
                icon={<ExclamationCircleOutlined />}
                style={{ marginBottom: 16 }}
            />
        );
    };
    
    const renderFooter = () => {
        const showTestButton = workspace?.type === WORKSPACE_TYPES.GIT;
        
        return (
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={handleCancel} disabled={isUpdating}>
                    Cancel
                </Button>
                
                {showTestButton && (
                    <Tooltip title="Test repository connection and validate configuration">
                        <Button 
                            onClick={handleTestConnection}
                            icon={connectionTested ? 
                                <CheckCircleOutlined style={{ color: '#52c41a' }} /> : 
                                <SyncOutlined spin={isTestingConnection} />
                            }
                            disabled={!form.getFieldValue('gitUrl') || isUpdating || isTestingConnection}
                            type={connectionTested ? 'default' : undefined}
                            style={connectionTested ? { borderColor: '#52c41a' } : undefined}
                            loading={isTestingConnection}
                        >
                            {isTestingConnection ? 'Testing...' : 
                             connectionTested ? 'Connection Verified' : 'Test Connection'}
                        </Button>
                    </Tooltip>
                )}
                
                <Button 
                    type="primary" 
                    loading={isUpdating}
                    onClick={() => form.submit()}
                    disabled={isUpdating}
                >
                    {isUpdating ? 'Updating...' : 'Update Workspace'}
                </Button>
            </Space>
        );
    };
    
    return (
        <>
            <Modal
                title="Edit Workspace"
                open={visible}
                onCancel={handleCancel}
                footer={renderFooter()}
                width={700}
                closable={!isUpdating}
                maskClosable={!isUpdating}
                styles={{
                    body: { 
                        maxHeight: 'calc(70vh - 110px)', 
                        overflowY: 'auto', 
                        paddingBottom: 0
                    }
                }}
            >
                {renderError()}
                
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFinish}
                    style={{ paddingBottom: 20 }}
                    disabled={isUpdating}
                >
                    {/* Main workspace information - always visible */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: 16 }}>
                        <Form.Item
                            name="name"
                            label="Workspace Name"
                            rules={[{ required: true, message: 'Please enter a workspace name' }]}
                            style={{ marginBottom: 0 }}
                        >
                            <Input placeholder="e.g., Frontend Team, QA Environment, Development" size="large" />
                        </Form.Item>

                        <Form.Item
                            name="description"
                            label="Description"
                            style={{ marginBottom: 0 }}
                        >
                            <Input placeholder="Optional description" size="large" />
                        </Form.Item>
                    </div>

                    {/* Collapsible section for ALL technical details */}
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
                                    {/* Display workspace type as read-only */}
                                    <Form.Item
                                        label="Workspace Type"
                                        style={{ marginBottom: 16 }}
                                    >
                                        <Space>
                                            {workspace?.type === WORKSPACE_TYPES.GIT ? (
                                                <>
                                                    <TeamOutlined />
                                                    <span>Team (Git Sync)</span>
                                                </>
                                            ) : (
                                                <>
                                                    <UserOutlined />
                                                    <span>Personal</span>
                                                </>
                                            )}
                                        </Space>
                                    </Form.Item>

                                    {workspace?.type === WORKSPACE_TYPES.GIT && (
                                        <>
                                            <GitStatusAlert
                                                checkingGitStatus={false}
                                                gitStatus={gitStatus}
                                                installingGit={false}
                                                gitInstallProgress=""
                                                onInstallGit={handleInstallGit}
                                                style={{ marginBottom: 16 }}
                                            />
                                            {renderGitConfigSection()}
                                        </>
                                    )}
                                </>
                            )
                        }]}
                    />
                </Form>
            </Modal>

            <ConnectionProgressModal
                visible={isTestingConnection || (connectionProgress && connectionProgress.length > 0)}
                isTestingConnection={isTestingConnection}
                connectionProgress={connectionProgress}
                testResult={connectionTestResult}
                onClose={handleCloseConnectionProgress}
            />

        </>
    );
};

export default WorkspaceEditModal;