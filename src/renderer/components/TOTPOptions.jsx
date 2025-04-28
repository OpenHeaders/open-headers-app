import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Input, Switch, Typography, Button, Space, Slider, Row, Col } from 'antd';

const { Text } = Typography;

/**
 * TOTPOptions component with time synchronization
 * Simplified version that avoids Form conflicts
 */
const TOTPOptions = ({ form, initialEnabled = false, initialSecret = '', onChange }) => {
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

    // Use a ref to track initialization
    const initialized = useRef(false);

    // Initialize from props
    useEffect(() => {
        if (initialized.current) return;

        console.log("TOTP component initializing with props:", { initialEnabled, initialSecret });

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

            console.log(`Generating TOTP with secret: ${normalizedSecret}, time offset: ${timeOffset}s`);

            // Use the window.generateTOTP function with time offset
            const totpCode = await window.generateTOTP(normalizedSecret, 30, 6, timeOffset);

            if (totpCode === 'ERROR') {
                setError('Failed to generate code. Check your secret key.');
                setCode('ERROR');
            } else {
                setCode(totpCode);
            }
        } catch (error) {
            console.error('Error generating TOTP:', error);
            setError(`Error: ${error.message}`);
            setCode('ERROR');
        } finally {
            setTesting(false);
        }
    }, [secret, timeOffset]);

    // Update timer and regenerate code when needed
    useEffect(() => {
        if (!previewVisible) return;

        // Initial code generation
        generateTOTP();

        // Calculate seconds remaining in current period
        const secondsInPeriod = 30;
        const currentSeconds = Math.floor(Date.now() / 1000);
        const secondsRemaining = secondsInPeriod - (currentSeconds % secondsInPeriod);
        setTimeRemaining(secondsRemaining);

        // Set up interval for countdown and code regeneration
        const timer = setInterval(() => {
            setTimeRemaining(prev => {
                const newTime = prev - 1;
                if (newTime <= 0) {
                    // Generate new code when timer expires
                    generateTOTP();
                    return 30; // Reset to full period
                }
                return newTime;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [previewVisible, generateTOTP]);

    // Handle TOTP toggle
    const handleToggle = (checked) => {
        console.log("TOTP toggle changed to:", checked);
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
                            background: '#f5f5f7',
                            padding: 8,
                            borderRadius: 6,
                            marginBottom: 8
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <Text style={{
                                    fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    color: code === 'ERROR' ? '#ff4d4f' : 'inherit'
                                }}>
                                    {code}
                                </Text>
                                {code !== 'ERROR' && <Text type="secondary" style={{ fontSize: '12px' }}>({timeRemaining}s)</Text>}
                            </div>
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