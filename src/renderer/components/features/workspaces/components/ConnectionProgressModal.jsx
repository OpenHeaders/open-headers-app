import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Progress } from 'antd';
import { CloseOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

/**
 * Separate modal for showing Git connection test progress
 * Features auto-close functionality and real-time progress display
 */
const ConnectionProgressModal = ({
    visible,
    isTestingConnection,
    connectionProgress,
    onClose,
    testResult = null
}) => {
    const [autoCloseCountdown, setAutoCloseCountdown] = useState(0);
    const autoCloseTimerRef = useRef(null);
    const countdownTimerRef = useRef(null);
    const progressContainerRef = useRef(null);

    // Start auto-close countdown when test completes
    useEffect(() => {
        if (!isTestingConnection && connectionProgress.length > 0 && testResult !== null) {
            const delay = testResult.success ? 3000 : 10000; // 3s for success, 10s for error
            const countdownInterval = 100; // Update every 100ms
            let remaining = delay;

            setAutoCloseCountdown(Math.ceil(remaining / 1000));

            // Countdown timer
            countdownTimerRef.current = setInterval(() => {
                remaining -= countdownInterval;
                setAutoCloseCountdown(Math.ceil(remaining / 1000));
            }, countdownInterval);

            // Auto-close timer
            autoCloseTimerRef.current = setTimeout(() => {
                onClose();
                setAutoCloseCountdown(0);
            }, delay);
        }

        return () => {
            if (autoCloseTimerRef.current) {
                clearTimeout(autoCloseTimerRef.current);
            }
            if (countdownTimerRef.current) {
                clearInterval(countdownTimerRef.current);
            }
        };
    }, [isTestingConnection, connectionProgress.length, testResult, onClose]);

    // Auto-scroll to bottom when new progress items are added
    useEffect(() => {
        if (progressContainerRef.current) {
            progressContainerRef.current.scrollTop = progressContainerRef.current.scrollHeight;
        }
    }, [connectionProgress.length]);

    const handleClose = () => {
        // Clear timers
        if (autoCloseTimerRef.current) {
            clearTimeout(autoCloseTimerRef.current);
        }
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
        }
        setAutoCloseCountdown(0);
        onClose();
    };

    const renderProgressContent = () => {
        // Show initializing message when testing but no progress yet
        if (isTestingConnection && (!connectionProgress || connectionProgress.length === 0)) {
            return (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <Progress type="circle" percent={10} status="active" />
                    <div style={{ marginTop: '16px' }}>Initializing connection test...</div>
                </div>
            );
        }
        
        // Show progress steps if we have them
        if (connectionProgress && connectionProgress.length > 0) {
            return (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 16 }}>
                        <strong>
                            {isTestingConnection ? 'Testing Git Connection...' : 'Connection Test Results'}
                        </strong>
                    </div>
                    
                    <div 
                        ref={progressContainerRef}
                        style={{ 
                            marginBottom: 16, 
                            maxHeight: '400px', 
                            overflowY: 'auto',
                            padding: '8px',
                            border: '1px solid #f0f0f0',
                            borderRadius: '4px'
                        }}
                    >
                        {connectionProgress.map((step, index) => (
                            <div key={step.step || index} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: '14px', marginBottom: 4 }}>
                                    {step.step || 'Processing...'}
                                </div>
                                {step.details && (
                                    <div style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>
                                        {String(step.details)}
                                    </div>
                                )}
                                <div style={{ marginTop: 4 }}>
                                    <span style={{ 
                                        color: step.status === 'success' ? '#52c41a' : 
                                               step.status === 'error' ? '#ff4d4f' : 
                                               step.status === 'warning' ? '#faad14' : '#1890ff',
                                        fontWeight: 'bold'
                                    }}>
                                        {step.status === 'success' ? '✓' : 
                                         step.status === 'error' ? '✗' : 
                                         step.status === 'warning' ? '⚠' : '◯'} {step.status || 'running'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {isTestingConnection && (
                        <Progress 
                            percent={connectionProgress.length > 0 ? 
                                    // Use specific progress if available, otherwise fallback to step-based calculation
                                    (connectionProgress[connectionProgress.length - 1]?.progress !== undefined ? 
                                        connectionProgress[connectionProgress.length - 1].progress : 
                                        Math.min(90, connectionProgress.length * 12)) : 10} 
                            status="active"
                            showInfo={false}
                        />
                    )}
                </div>
            );
        }
        
        // Fallback for when there's no progress and not testing
        return (
            <div style={{ textAlign: 'center', padding: '20px' }}>
                <div>No progress information available</div>
            </div>
        );
    };

    const renderFooter = () => {
        const buttons = [];

        // Always show close button
        buttons.push(
            <Button 
                key="close" 
                onClick={handleClose}
                icon={<CloseOutlined />}
                disabled={false}
            >
                Close
            </Button>
        );

        // Show auto-close countdown if applicable
        if (autoCloseCountdown > 0) {
            buttons.unshift(
                <span key="countdown" style={{ marginRight: 8, color: '#666' }}>
                    Auto-closing in {autoCloseCountdown}s...
                </span>
            );
        }

        return buttons;
    };

    const getModalTitle = () => {
        if (isTestingConnection) {
            return 'Testing Git Connection';
        }
        
        if (testResult) {
            return testResult.success ? 
                <span style={{ color: '#52c41a' }}>
                    <CheckCircleOutlined /> Connection Successful
                </span> :
                <span style={{ color: '#ff4d4f' }}>
                    <ExclamationCircleOutlined /> Connection Failed
                </span>;
        }
        
        return 'Git Connection Test';
    };

    return (
        <Modal
            title={getModalTitle()}
            open={visible}
            onCancel={handleClose}
            footer={renderFooter()}
            width={600}
            closable={!isTestingConnection}
            maskClosable={!isTestingConnection}
            centered
            zIndex={1500}
        >
            {renderProgressContent()}
        </Modal>
    );
};

export default ConnectionProgressModal;