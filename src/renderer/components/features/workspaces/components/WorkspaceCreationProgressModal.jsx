import React from 'react';
import { Modal, Steps, Progress, Space, Typography, Alert } from 'antd';
import { CheckCircleOutlined, LoadingOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons';

const { Text } = Typography;

const WorkspaceCreationProgressModal = ({
    visible,
    state,
    progress,
    progressMessage,
    error,
    onClose
}) => {
    const renderStepIcon = (stepNumber) => {
        if (!progress) return null;
        
        const currentStep = progress.step;
        const stepStatus = stepNumber < currentStep ? 'finish' : 
                          stepNumber === currentStep ? 'process' : 'wait';
        
        if (stepStatus === 'finish') {
            return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
        } else if (stepStatus === 'process') {
            return <LoadingOutlined spin style={{ color: '#1890ff' }} />;
        } else {
            return null;
        }
    };

    const getStepStatus = (stepNumber) => {
        if (!progress) return 'wait';
        
        const currentStep = progress.step;
        if (stepNumber < currentStep) return 'finish';
        if (stepNumber === currentStep) return 'process';
        return 'wait';
    };

    const progressSteps = [
        {
            title: 'Validating',
            description: 'Checking workspace settings'
        },
        {
            title: 'Git Setup',
            description: 'Preparing repository'
        },
        {
            title: 'Connection',
            description: 'Authenticating & cloning'
        },
        {
            title: 'Creating',
            description: 'Initializing workspace'
        },
        {
            title: 'Syncing',
            description: 'Pushing configuration'
        },
        {
            title: 'Activating',
            description: 'Switching to new workspace'
        }
    ];

    return (
        <Modal
            title="Creating Workspace"
            open={visible}
            onCancel={onClose}
            footer={null}
            width={800}
            closable={false}
            maskClosable={false}
            centered
        >
            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {/* Current Progress Message */}
                <div style={{ 
                    padding: '16px',
                    backgroundColor: '#f0f8ff',
                    borderRadius: '8px',
                    textAlign: 'center'
                }}>
                    <Space>
                        <SyncOutlined spin style={{ color: '#1890ff', fontSize: '16px' }} />
                        <Text strong style={{ color: '#1890ff', fontSize: '14px' }}>
                            {progressMessage}
                        </Text>
                    </Space>
                </div>

                {/* Progress Steps */}
                {progress && (
                    <div style={{ padding: '0 16px' }}>
                        <Steps
                            current={Math.min(progress.step - 1, progressSteps.length - 1)}
                            size="default"
                            labelPlacement="vertical"
                            items={progressSteps.map((step, index) => ({
                                title: step.title,
                                description: step.description,
                                status: getStepStatus(index + 1),
                                icon: renderStepIcon(index + 1)
                            }))}
                            style={{ marginBottom: 16 }}
                        />
                    </div>
                )}

                {/* Progress Bar */}
                {progress && (
                    <div style={{ padding: '0 16px' }}>
                        <Progress 
                            percent={Math.round((progress.step / progress.total) * 100)}
                            status="active"
                            strokeColor={{
                                '0%': '#108ee9',
                                '100%': '#87d068'
                            }}
                            showInfo={false}
                            style={{ marginBottom: 8 }}
                        />
                        <div style={{ textAlign: 'center' }}>
                            <Text type="secondary" style={{ fontSize: '13px' }}>
                                Step {progress.step} of {progress.total}
                            </Text>
                        </div>
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <Alert
                        message="Creation Failed"
                        description={error.message || error}
                        type="error"
                        showIcon
                        icon={<CloseCircleOutlined />}
                    />
                )}

                {/* Additional Details */}
                {progress && progress.description && (
                    <div style={{ 
                        padding: '12px 16px',
                        backgroundColor: '#fafafa',
                        borderRadius: '6px',
                        textAlign: 'center'
                    }}>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                            {progress.description}
                        </Text>
                    </div>
                )}
            </Space>
        </Modal>
    );
};

export default WorkspaceCreationProgressModal;