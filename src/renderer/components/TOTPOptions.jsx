import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Input, Switch, Typography, Button, Space, Slider, Row, Col } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import timeManager from '../services/TimeManager';
import { useTheme } from '../contexts/ThemeContext';
import { successMessage } from '../utils/messageUtil';

const { Text } = Typography;

/**
 * TOTPOptions component with time synchronization
 * Simplified version that avoids Form conflicts
 */
const TOTPOptions = ({ form, initialEnabled = false, initialSecret = '', onChange }) => {
    // Get current theme from context
    const { isDarkMode } = useTheme();
    
    // Component state
    const [enabled, setEnabled] = useState(initialEnabled);
    const [secret, setSecret] = useState(initialSecret);
    const [code, setCode] = useState('------');
    const [timeRemaining, setTimeRemaining] = useState(30);
    const [previewVisible, setPreviewVisible] = useState(false);
    const [testing, setTesting] = useState(false);
    const [error, setError] = useState(null);
    const [timeOffset, setTimeOffset] = useState(0); // Time offset in seconds
    const [showOffsetAdjustment, setShowOffsetAdjustment] = useState(false);
    const [codeJustGenerated, setCodeJustGenerated] = useState(false);

    // Use a ref to track initialization
    const initialized = useRef(false);

    // Initialize from props
    useEffect(() => {
        if (initialized.current) return;


        // Set initial state from props
        setEnabled(initialEnabled);
        if (initialSecret) {
            setSecret(initialSecret);
        }

        initialized.current = true;
    }, [initialEnabled, initialSecret]);

    // Notify parent of changes
    useEffect(() => {
        if (onChange) {
            onChange(enabled, secret);
        }
    }, [enabled, secret, onChange]);

    // Generate TOTP code with time offset
    const generateTOTP = useCallback(async () => {
        try {
            if (!secret) {
                setError('Please enter a secret key');
                return;
            }

            setError(null);
            setTesting(true);

            // Normalize secret for better compatibility
            const normalizedSecret = secret.replace(/\s/g, '').replace(/=/g, '');


            // Use the window.generateTOTP function with time offset
            const totpCode = await window.generateTOTP(normalizedSecret, 30, 6, timeOffset);

            if (totpCode === 'ERROR') {
                setError('Failed to generate code. Check your secret key.');
                setCode('ERROR');
            } else {
                setCode(totpCode);
                // Trigger animation for new code
                setCodeJustGenerated(true);
                setTimeout(() => setCodeJustGenerated(false), 300);
            }
        } catch (error) {
            setError(`Error: ${error.message}`);
            setCode('ERROR');
        } finally {
            setTesting(false);
        }
    }, [secret, timeOffset]);

    // Update timer and regenerate code when needed
    useEffect(() => {
        if (!previewVisible) return;

        // Function to calculate time remaining in current period
        const calculateTimeRemaining = () => {
            const secondsInPeriod = 30;
            const currentSeconds = Math.floor(timeManager.now() / 1000) + timeOffset;
            const secondsRemaining = secondsInPeriod - (currentSeconds % secondsInPeriod);
            return secondsRemaining;
        };

        // Initial code generation and timer setup
        generateTOTP();
        setTimeRemaining(calculateTimeRemaining());

        // Set up interval for countdown and code regeneration
        const timer = setInterval(() => {
            const remaining = calculateTimeRemaining();
            setTimeRemaining(remaining);
            
            // When we hit exactly 30 seconds (new period), generate new code
            if (remaining === 30) {
                generateTOTP();
            }
        }, 100); // Update every 100ms for smoother countdown

        return () => clearInterval(timer);
    }, [previewVisible, generateTOTP, timeOffset]);

    // Handle TOTP toggle
    const handleToggle = (checked) => {
        setEnabled(checked);
        setPreviewVisible(false);
        setError(null);

        // If disabling, clear the secret
        if (!checked) {
            setSecret('');
        }
    };

    // Handle secret change
    const handleSecretChange = (e) => {
        const newSecret = e.target.value;
        setSecret(newSecret);
        setPreviewVisible(false);
        setError(null);
    };

    // Test TOTP button handler
    const handleTestTOTP = async () => {
        if (!secret) {
            setError('Please enter a secret key');
            setCode('NO SECRET');
            return;
        }

        setPreviewVisible(true);
    };

    // Toggle time offset adjustment visibility
    const toggleOffsetAdjustment = () => {
        setShowOffsetAdjustment(!showOffsetAdjustment);
    };

    // Handle time offset change
    const handleOffsetChange = (value) => {
        setTimeOffset(value);
        // Regenerate code with new offset if preview is visible
        if (previewVisible) {
            generateTOTP();
        }
    };

    // Helper for tips on TOTP secret format
    const renderSecretTips = () => (
        <div style={{ marginTop: 4, marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
                <strong>Tips:</strong> Enter the secret key exactly as provided by the service.
            </Text>
        </div>
    );

    // Render time synchronization control
    const renderTimeSync = () => (
        <div style={{ marginTop: 8, marginBottom: 8 }}>
            <Button
                type="link"
                onClick={toggleOffsetAdjustment}
                size="small"
                style={{ padding: '0 4px', fontSize: 11 }}
            >
                {showOffsetAdjustment ? "Hide Time Sync" : "Time Sync"}
            </Button>

            {showOffsetAdjustment && (
                <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        Adjust if codes don't match other apps: ({timeOffset}s)
                    </Text>
                    <Slider
                        min={-30}
                        max={30}
                        value={timeOffset}
                        onChange={handleOffsetChange}
                        style={{ margin: '8px 0' }}
                    />
                    <Row>
                        <Col span={8}>
                            <Button
                                size="small"
                                onClick={() => handleOffsetChange(timeOffset - 5)}
                            >
                                -5s
                            </Button>
                        </Col>
                        <Col span={8} style={{ textAlign: 'center' }}>
                            <Button
                                size="small"
                                onClick={() => handleOffsetChange(0)}
                            >
                                Reset
                            </Button>
                        </Col>
                        <Col span={8} style={{ textAlign: 'right' }}>
                            <Button
                                size="small"
                                onClick={() => handleOffsetChange(timeOffset + 5)}
                            >
                                +5s
                            </Button>
                        </Col>
                    </Row>
                </div>
            )}
        </div>
    );

    return (
        <Card
            title="TOTP Authentication"
            size="small"
            style={{ marginBottom: 16 }}
            extra={
                <Switch
                    size="small"
                    checkedChildren="On"
                    unCheckedChildren="Off"
                    onChange={handleToggle}
                    checked={enabled}
                />
            }
        >
            {enabled && (
                <>
                    <div style={{ marginBottom: 16 }}>
                        <Text strong>TOTP Secret</Text>
                        <Input
                            placeholder="Enter TOTP secret key"
                            onChange={handleSecretChange}
                            value={secret}
                            status={error ? "error" : ""}
                            size="small"
                            style={{ marginTop: 4 }}
                            addonAfter={
                                <Button
                                    type="link"
                                    size="small"
                                    onClick={handleTestTOTP}
                                    style={{ padding: '0 4px' }}
                                    loading={testing}
                                >
                                    Test
                                </Button>
                            }
                        />
                        {error && <Text type="danger" style={{ fontSize: 11 }}>{error}</Text>}
                    </div>

                    {renderSecretTips()}

                    {previewVisible && (
                        <div style={{
                            background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#f5f5f7',
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 8,
                            border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#e8e8e8'}`,
                            backdropFilter: isDarkMode ? 'blur(10px)' : 'none',
                            boxShadow: isDarkMode ? '0 4px 12px rgba(0, 0, 0, 0.2)' : 'none'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 8
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Text style={{
                                        fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace',
                                        fontSize: '1.5rem',
                                        fontWeight: 'bold',
                                        color: code === 'ERROR' ? '#ff4d4f' : (isDarkMode ? '#87ceeb' : '#1890ff'),
                                        letterSpacing: '0.1em',
                                        cursor: code !== 'ERROR' ? 'pointer' : 'default',
                                        transition: 'transform 0.3s ease',
                                        transform: codeJustGenerated ? 'scale(1.1)' : 'scale(1)'
                                    }}
                                    onClick={() => {
                                        if (code !== 'ERROR') {
                                            navigator.clipboard.writeText(code);
                                            successMessage('Code copied to clipboard!');
                                        }
                                    }}>
                                        {code}
                                    </Text>
                                    {code !== 'ERROR' && (
                                        <CopyOutlined 
                                            style={{ 
                                                fontSize: '16px', 
                                                color: isDarkMode ? '#98989d' : '#8c8c8c', 
                                                cursor: 'pointer' 
                                            }}
                                            onClick={() => {
                                                navigator.clipboard.writeText(code);
                                                successMessage('Code copied to clipboard!');
                                            }}
                                        />
                                    )}
                                </div>
                                {code !== 'ERROR' && (
                                    <div style={{ textAlign: 'center' }}>
                                        <Text style={{ 
                                            fontSize: '1.2rem', 
                                            fontWeight: 'bold',
                                            color: timeRemaining <= 5 ? '#ff4d4f' : '#52c41a'
                                        }}>
                                            {timeRemaining}s
                                        </Text>
                                        <div style={{ 
                                            fontSize: '11px', 
                                            color: isDarkMode ? '#98989d' : '#8c8c8c' 
                                        }}>
                                            Time remaining
                                        </div>
                                    </div>
                                )}
                            </div>
                            {code !== 'ERROR' && (
                                <div style={{
                                    height: 8,
                                    background: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : '#e8e8e8',
                                    borderRadius: 4,
                                    overflow: 'hidden',
                                    boxShadow: isDarkMode ? 'inset 0 2px 4px rgba(0, 0, 0, 0.3)' : 'none'
                                }}>
                                    <div style={{
                                        height: '100%',
                                        background: timeRemaining <= 5 ? 
                                            (isDarkMode ? 'linear-gradient(90deg, #ff6b6b 0%, #ff8787 100%)' : '#ff4d4f') : 
                                            (isDarkMode ? 'linear-gradient(90deg, #90ee90 0%, #98fb98 100%)' : '#52c41a'),
                                        width: `${(timeRemaining / 30) * 100}%`,
                                        transition: 'width 0.1s linear, background 0.3s ease',
                                        boxShadow: isDarkMode ? (timeRemaining <= 5 ? '0 0 10px rgba(255, 107, 107, 0.8)' : '0 0 10px rgba(144, 238, 144, 0.8)') : 'none'
                                    }} />
                                </div>
                            )}
                        </div>
                    )}

                    {renderTimeSync()}

                    <Text type="secondary" style={{ fontSize: 11 }}>
                        Use <code>_TOTP_CODE</code> in any URL, header, or body field
                    </Text>
                </>
            )}
        </Card>
    );
};

export default TOTPOptions;