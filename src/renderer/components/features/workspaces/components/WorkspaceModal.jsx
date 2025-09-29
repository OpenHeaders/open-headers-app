
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Form, Input, Radio, Alert, Button, Space, Tooltip, App, Switch, Checkbox, Card, Typography } from 'antd';
import { UserOutlined, TeamOutlined, CheckCircleOutlined, SyncOutlined, ExclamationCircleOutlined, QuestionCircleOutlined, SafetyOutlined, WarningOutlined, DatabaseOutlined, FileOutlined, FolderOutlined } from '@ant-design/icons';
import { DEFAULT_VALUES, WORKSPACE_TYPES } from '../constants';
import { useWorkspaceCreation } from '../hooks/useWorkspaceCreation';
import { WorkspaceServiceAdapterFactory } from '../services/WorkspaceServiceAdapter';
import { useWorkspaces } from '../../../../hooks/workspace';
import { useSources, useEnvironments } from '../../../../hooks/useCentralizedWorkspace';
import { prepareAuthData } from '../utils';
import GitStatusAlert from './GitStatusAlert';
import ConnectionProgressModal from './ConnectionProgressModal';
import AuthenticationForm from './AuthenticationForm';
import WorkspaceCreationProgressModal from './WorkspaceCreationProgressModal';
import { FILE_FORMATS, ExportService } from '../../../../services/export-import';

const { Text, Title } = Typography;

// Define environment options for export
const ENVIRONMENT_OPTIONS = {
    NONE: 'none',
    SCHEMA: 'schema',
    FULL: 'full'
};

const WorkspaceModal = ({
    visible,
    editingWorkspace,
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
    const unsubscribeProgressRef = useRef(null);
    const progressUnsubscribeRef = useRef(null);
    
    // Export options state
    const [selectedItems, setSelectedItems] = useState({
        sources: true,
        rules: true,
        proxyRules: true
    });
    
    const workspaceContext = useWorkspaces();
    const { sources, exportSources } = useSources();
    const { environments, generateEnvironmentSchema } = useEnvironments();
    
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
    
    const {
        state,
        progress,
        progressMessage,
        error,
        isLoading,
        isCompleted,
        isError,
        canRetry,
        canAbort,
        createWorkspace,
        abortCreation,
        resetCreation,
        retryCreation,
        workspaceId
    } = useWorkspaceCreation(services);

    const watchedType = Form.useWatch('type', form);
    const watchedGitUrl = Form.useWatch('gitUrl', form);
    const authTypeValue = Form.useWatch('authType', form);
    const sshKeySourceValue = Form.useWatch('sshKeySource', form);
    const watchedEnvironmentOption = Form.useWatch('environmentOption', form);
    
    useEffect(() => {
        setAuthType(authTypeValue || DEFAULT_VALUES.authType);
    }, [authTypeValue]);
    
    useEffect(() => {
        setSshKeySource(sshKeySourceValue || DEFAULT_VALUES.sshKeySource);
    }, [sshKeySourceValue]);
    
    useEffect(() => {
        if (visible && !gitStatus && services) {
            checkGitStatus().catch(console.error);
        }
    }, [visible, services]);
    
    useEffect(() => {
        if (isCompleted && workspaceId) {
            onSuccess?.(workspaceId);
            handleCancel();
        }
    }, [isCompleted, workspaceId, onSuccess]);
    
    useEffect(() => {
        if (!visible) {
            resetCreation();
            setConnectionTested(false);
            setConnectionProgress([]);
            setIsTestingConnection(false);
            
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
    }, [visible, resetCreation, form]);
    
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
                checkWriteAccess: !editingWorkspace && values.type === 'team'
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
        // For new team workspaces, include export data in the workspace creation values
        if (!editingWorkspace && values.type === 'team') {
            try {
                // Create export service with actual data from hooks
                const exportService = new ExportService({
                    appVersion: await window.electronAPI.getAppVersion(),
                    sources: sources || [],
                    activeWorkspaceId: workspaceContext.activeWorkspaceId,
                    exportSources: exportSources,
                    removeSource: () => {}, // Not needed for export
                    workspaces: workspaceContext.workspaces,
                    createWorkspace: workspaceContext.createWorkspace,
                    switchWorkspace: workspaceContext.switchWorkspace,
                    environments: environments,
                    createEnvironment: () => {}, // Not needed for export
                    setVariable: () => {}, // Not needed for export
                    generateEnvironmentSchema: generateEnvironmentSchema
                });
                
                // Prepare export options
                const exportOptions = {
                    selectedItems,
                    environmentOption: values.environmentOption || ENVIRONMENT_OPTIONS.SCHEMA,
                    fileFormat: values.fileFormat || FILE_FORMATS.SINGLE,
                    appVersion: await window.electronAPI.getAppVersion()
                };
                
                // Use private method to gather export data without triggering file save
                const exportData = await exportService._gatherExportData(exportOptions);
                
                // Sanitize sources for team workspaces - remove local execution data
                if (exportData.sources && Array.isArray(exportData.sources)) {
                    exportData.sources = exportData.sources.map(source => {
                        const { sourceContent, originalResponse, ...sanitizedSource } = source;
                        return sanitizedSource;
                    });
                }
                
                // Prepare files for commit
                const files = {};
                if (values.fileFormat === FILE_FORMATS.SINGLE) {
                    files['open-headers-config.json'] = JSON.stringify(exportData, null, 2);
                } else {
                    // Separate main config and environment
                    const mainData = { ...exportData };
                    const envData = {};
                    
                    if (exportData.environmentSchema) {
                        envData.environmentSchema = exportData.environmentSchema;
                        delete mainData.environmentSchema;
                    }
                    if (exportData.environments) {
                        envData.environments = exportData.environments;
                        delete mainData.environments;
                    }
                    
                    // Sanitize sources in mainData for team workspaces
                    if (mainData.sources && Array.isArray(mainData.sources)) {
                        mainData.sources = mainData.sources.map(source => {
                            const { sourceContent, originalResponse, ...sanitizedSource } = source;
                            return sanitizedSource;
                        });
                    }
                    
                    files['open-headers-config.json'] = JSON.stringify(mainData, null, 2);
                    if (Object.keys(envData).length > 0) {
                        files['open-headers-env.json'] = JSON.stringify(envData, null, 2);
                    }
                }
                
                // Add initial commit data to values
                values.initialCommit = {
                    files,
                    message: `Initialize Open Headers configuration for ${values.name}`
                };
            } catch (error) {
                console.error('Failed to prepare export data:', error);
                console.error('Error details:', error.stack);
                message.error({
                    content: `Failed to prepare configuration data: ${error.message}`,
                    duration: 8
                });
                return;
            }
        }
        
        // Create workspace (which will handle the commit as part of the creation process)
        const success = await createWorkspace(values);
        
        if (!success && !isError) {
            console.error('Workspace creation failed without error state');
        }
    };
    
    const handleCancel = () => {
        if (isLoading && canAbort) {
            abortCreation();
        }
        
        onCancel();
    };
    
    const renderWorkspaceTypeField = () => {
        if (editingWorkspace) return null;
        
        return (
            <Form.Item
                name="type"
                label="Workspace Type"
                rules={[{ required: true, message: 'Please select a workspace type' }]}
            >
                <Radio.Group style={{ width: '100%', display: 'flex', gap: '8px' }}>
                    <Radio.Button 
                        value={WORKSPACE_TYPES.PERSONAL} 
                        style={{ flex: 1, textAlign: 'center', height: 'auto', padding: '8px' }}
                    >
                        <UserOutlined style={{ marginRight: '8px' }} />
                        Personal
                    </Radio.Button>
                    <Radio.Button 
                        value="team"
                        style={{ flex: 1, textAlign: 'center', height: 'auto', padding: '8px' }}
                        disabled={gitStatus ? !gitStatus.isInstalled : false}
                    >
                        <TeamOutlined style={{ marginRight: '8px' }} />
                        Team (Git Sync)
                    </Radio.Button>
                </Radio.Group>
            </Form.Item>
        );
    };
    
    const renderWorkspaceTypeAlert = () => {
        if (editingWorkspace) return null;
        
        return (
            <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
            >
                {({ getFieldValue }) => {
                    const workspaceType = getFieldValue('type');
                    return (
                        <Alert
                            message={workspaceType === 'team' ? 'Team Workspace' : 'Personal Workspace'}
                            description={
                                workspaceType === 'team' ? (
                                    <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                                        <li>Stores all data locally on your device</li>
                                        <li>Syncs automatically configuration with a Git repository (pull-only)</li>
                                        <li>Ideal for sharing settings across team members</li>
                                        <li>Supports files exported from Open Headers</li>
                                        <li>Environment values are never synced, only schema</li>
                                    </ul>
                                ) : (
                                    <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                                        <li>Stores all data locally on your device</li>
                                        <li>Perfect for individual use or testing</li>
                                        <li>No external dependencies required</li>
                                        <li>Full control over your configuration</li>
                                    </ul>
                                )
                            }
                            type="info"
                            showIcon
                            closable
                            style={{ marginBottom: 16 }}
                        />
                    );
                }}
            </Form.Item>
        );
    };
    
    const renderExportOptions = () => {
        return (
            <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size="large">
                {/* What to Export */}
                <Card size="small" title={<Title level={5} style={{ margin: 0 }}>What to Export</Title>}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Checkbox
                            checked={selectedItems.rules}
                            onChange={(e) => setSelectedItems({ ...selectedItems, rules: e.target.checked })}
                        >
                            <Space>
                                <Text>Header Rules</Text>
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    (Request/response modification rules)
                                </Text>
                            </Space>
                        </Checkbox>
                        
                        <Checkbox
                            checked={selectedItems.sources}
                            onChange={(e) => setSelectedItems({ ...selectedItems, sources: e.target.checked })}
                        >
                            <Space>
                                <Text>HTTP Sources</Text>
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    (API endpoints, file paths, configurations)
                                </Text>
                            </Space>
                        </Checkbox>
                        
                        <Checkbox
                            checked={selectedItems.proxyRules}
                            onChange={(e) => setSelectedItems({ ...selectedItems, proxyRules: e.target.checked })}
                        >
                            <Space>
                                <Text>Proxy Rules</Text>
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    (URL redirects and proxy settings)
                                </Text>
                            </Space>
                        </Checkbox>
                    </Space>
                </Card>
                
                {/* Environment Variables */}
                <Card 
                    size="small" 
                    title={
                        <Space>
                            <Title level={5} style={{ margin: 0 }}>Environment Variables</Title>
                            <SafetyOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                        </Space>
                    }
                >
                    <Form.Item
                        name="environmentOption"
                        initialValue={ENVIRONMENT_OPTIONS.SCHEMA}
                        style={{ marginBottom: 0 }}
                    >
                        <Radio.Group style={{ width: '100%' }}>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Radio value={ENVIRONMENT_OPTIONS.SCHEMA} style={{ marginBottom: 8 }}>
                                    <Space align="start">
                                        <div>
                                            <Text strong>Variable Schema Only</Text>
                                            <Text type="success" style={{ marginLeft: 8, fontSize: '12px' }}>
                                                Recommended for teams
                                            </Text>
                                            <br />
                                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                                Exports variable names and descriptions. Team members add their own values.
                                            </Text>
                                        </div>
                                    </Space>
                                </Radio>
                                
                                <Radio value={ENVIRONMENT_OPTIONS.FULL} style={{ marginBottom: 8 }}>
                                    <Space align="start">
                                        <div>
                                            <Space>
                                                <Text strong>Include Values</Text>
                                                <WarningOutlined style={{ color: '#faad14' }} />
                                            </Space>
                                            <br />
                                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                                Includes actual values (API keys, passwords, etc). Use only for personal backups.
                                            </Text>
                                        </div>
                                    </Space>
                                </Radio>

                                <Radio value={ENVIRONMENT_OPTIONS.NONE}>
                                    <Text>Don't include environment variables</Text>
                                </Radio>
                            </Space>
                        </Radio.Group>
                    </Form.Item>
                </Card>
                
                {/* File Format */}
                <Card size="small" title={<Title level={5} style={{ margin: 0 }}>File Format</Title>}>
                    <Form.Item
                        name="fileFormat"
                        initialValue={FILE_FORMATS.SINGLE}
                        style={{ marginBottom: 0 }}
                    >
                        <Radio.Group style={{ width: '100%' }}>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Radio value={FILE_FORMATS.SINGLE}>
                                    <Space>
                                        <FileOutlined />
                                        <div>
                                            <Text strong>Single File</Text>
                                            <br />
                                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                                Everything in one JSON file - simpler to manage
                                            </Text>
                                        </div>
                                    </Space>
                                </Radio>
                                
                                <Radio value={FILE_FORMATS.SEPARATE} disabled={watchedEnvironmentOption === ENVIRONMENT_OPTIONS.NONE}>
                                    <Space>
                                        <FolderOutlined />
                                        <div>
                                            <Text strong={watchedEnvironmentOption !== ENVIRONMENT_OPTIONS.NONE} disabled={watchedEnvironmentOption === ENVIRONMENT_OPTIONS.NONE}>
                                                Multiple Files
                                            </Text>
                                            <br />
                                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                                {watchedEnvironmentOption === ENVIRONMENT_OPTIONS.NONE 
                                                    ? 'Only available when including environment variables'
                                                    : 'Separate files for config and environment schema - better for large teams'
                                                }
                                            </Text>
                                        </div>
                                    </Space>
                                </Radio>
                            </Space>
                        </Radio.Group>
                    </Form.Item>
                </Card>
            </Space>
        );
    };
    
    const renderGitConfigSection = () => {
        return (
            <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
            >
                {({ getFieldValue }) => {
                    const workspaceType = getFieldValue('type');
                    if (editingWorkspace || workspaceType === 'team') {
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
                                            initialValue={true}
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
                                                    <Tooltip title="If the branch doesn't exist, it will be automatically created when you first commit">
                                                        <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                                                    </Tooltip>
                                                </Space>
                                            }
                                            initialValue="main"
                                            style={{ marginBottom: 0 }}
                                        >
                                            <Input placeholder="main" />
                                        </Form.Item>
                                        
                                        <Form.Item
                                            name="gitPath"
                                            label={
                                                <Space>
                                                    Config directory path
                                                    <Tooltip title="Directory where configuration files will be stored. If the directory doesn't exist, it will be automatically created. Files will be auto-detected when reading and created based on your export settings when writing.">
                                                        <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                                                    </Tooltip>
                                                </Space>
                                            }
                                            initialValue="config/"
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
                                        initialValue="none"
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
                                    
                                    {!editingWorkspace && (
                                        <>
                                            <div style={{ 
                                                marginTop: 16,
                                                padding: '12px',
                                                backgroundColor: '#e6f7ff',
                                                border: '1px solid #91d5ff',
                                                borderRadius: '6px',
                                                marginBottom: 16
                                            }}>
                                                <div style={{ fontSize: '13px', color: '#0050b3' }}>
                                                    <strong>Note:</strong> When you create this workspace, your current configuration will be committed to the repository at the specified path. This allows your team to share the same settings.
                                                </div>
                                            </div>
                                            {renderExportOptions()}
                                        </>
                                    )}
                                </div>
                            </>
                        );
                    }
                    return null;
                }}
            </Form.Item>
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
        if (!isError || !error) return null;
        
        return (
            <Alert
                message="Workspace Creation Failed"
                description={
                    <div>
                        <div style={{ marginBottom: 8 }}>{error.message}</div>
                        {canRetry && (
                            <Button 
                                size="small" 
                                type="primary" 
                                onClick={retryCreation}
                                style={{ marginTop: 8 }}
                            >
                                Retry Creation
                            </Button>
                        )}
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
                            <Button onClick={handleCancel}>
                                Cancel
                            </Button>
                        )}
                    </Space>
                </div>
            );
        }
        
        const showTestButton = (editingWorkspace && watchedGitUrl) || 
                              (!editingWorkspace && watchedType === 'team');
        const requireConnectionTest = !editingWorkspace && watchedType === 'team' && !connectionTested;
        
        return (
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={handleCancel} disabled={isLoading}>
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
                            disabled={!watchedGitUrl || isLoading || isTestingConnection}
                            type={connectionTested ? 'default' : undefined}
                            style={connectionTested ? { borderColor: '#52c41a' } : undefined}
                            loading={isTestingConnection}
                        >
                            {isTestingConnection ? 'Testing...' : 
                             connectionTested ? 'Connection Verified' : 'Test Connection'}
                        </Button>
                    </Tooltip>
                )}
                
                <Tooltip
                    title={requireConnectionTest ? 
                        'Please test the Git connection first before creating the workspace' : 
                        undefined
                    }
                >
                    <Button 
                        type="primary" 
                        loading={isLoading}
                        onClick={() => form.submit()}
                        disabled={requireConnectionTest || isLoading}
                    >
                        {isLoading ? progressMessage : `${editingWorkspace ? 'Update' : 'Create'} Workspace`}
                    </Button>
                </Tooltip>
            </Space>
        );
    };
    
    return (
        <>
            <Modal
                title={editingWorkspace ? 'Edit Workspace' : 'Create Workspace'}
                open={visible}
                onCancel={handleCancel}
                footer={renderFooter()}
                width={700}
                closable={!isLoading}
                maskClosable={!isLoading}
                styles={{
                    body: { 
                        maxHeight: 'calc(70vh - 110px)', 
                        overflowY: 'auto', 
                        paddingBottom: 0,
                        display: isLoading ? 'none' : 'block'
                    }
                }}
            >
                {renderError()}
                
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFinish}
                    initialValues={{ type: WORKSPACE_TYPES.PERSONAL }}
                    style={{ paddingBottom: 20 }}
                    disabled={isLoading}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: 16 }}>
                        <Form.Item
                            name="name"
                            label="Workspace Name"
                            rules={[{ required: true, message: 'Please enter a workspace name' }]}
                            style={{ marginBottom: 0 }}
                        >
                            <Input placeholder="e.g., Frontend Team, QA Environment, Development" />
                        </Form.Item>

                        <Form.Item
                            name="description"
                            label="Description"
                            style={{ marginBottom: 0 }}
                        >
                            <Input placeholder="Optional description" />
                        </Form.Item>
                    </div>

                    {renderWorkspaceTypeField()}

                    <Form.Item
                        noStyle
                        shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
                    >
                        {({ getFieldValue }) => {
                            const workspaceType = getFieldValue('type');
                            if (editingWorkspace || workspaceType === 'team') {
                                return (
                                    <GitStatusAlert
                                        checkingGitStatus={false}
                                        gitStatus={gitStatus}
                                        installingGit={false}
                                        gitInstallProgress=""
                                        onInstallGit={handleInstallGit}
                                    />
                                );
                            }
                            return null;
                        }}
                    </Form.Item>

                    {renderWorkspaceTypeAlert()}
                    {renderGitConfigSection()}
                </Form>
            </Modal>

            <ConnectionProgressModal
                visible={isTestingConnection || (connectionProgress && connectionProgress.length > 0)}
                isTestingConnection={isTestingConnection}
                connectionProgress={connectionProgress}
                testResult={connectionTestResult}
                onClose={handleCloseConnectionProgress}
            />

            <WorkspaceCreationProgressModal
                visible={isLoading}
                state={state}
                progress={progress}
                progressMessage={progressMessage}
                error={error}
                onClose={() => {
                    if (canAbort) {
                        abortCreation();
                    }
                }}
            />
        </>
    );
};

export default WorkspaceModal;