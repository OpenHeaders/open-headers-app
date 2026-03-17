/**
 * TOTP Authentication Card Component
 * 
 * Provides comprehensive interface for TOTP (Time-based One-Time Password)
 * authentication configuration including secret management, code generation,
 * and real-time countdown display.
 * 
 * Features:
 * - TOTP secret configuration with password field
 * - Real-time TOTP code generation and testing
 * - 30-second countdown timer with visual progress
 * - Cooldown warning for rate limiting
 * - Environment variable support in secrets
 * 
 * @component
 * @since 3.0.0
 */

import React from 'react';
import { Card, Form, Input, Switch, Button, Space, Typography, Alert, Progress, Tag } from 'antd';

const { Text } = Typography;

/**
 * TOTP Authentication card component for TOTP configuration
 * 
 * @param {Object} props - Component props
 * @param {Function} props.handleTotpToggle - TOTP toggle handler
 * @param {Function} props.handleTotpSecretChange - TOTP secret change handler
 * @param {Function} props.handleTestTotp - TOTP test handler
 * @param {string} props.totpError - Current TOTP error message
 * @param {boolean} props.totpTesting - TOTP testing state
 * @param {boolean} props.totpPreviewVisible - TOTP preview visibility
 * @param {string} props.totpCode - Current TOTP code
 * @param {number} props.timeRemaining - Seconds remaining for current code
 * @param {string} props.testSourceId - Test source ID for cooldown checking
 * @param {Function} props.canUseTotpSecret - Function to check TOTP cooldown
 * @param {Function} props.getCooldownSeconds - Function to get cooldown seconds
 * @returns {JSX.Element} TOTP authentication card component
 */
const TotpAuthCard = ({
    handleTotpToggle,
    handleTotpSecretChange,
    handleTestTotp,
    totpError,
    totpTesting,
    totpPreviewVisible,
    totpCode,
    timeRemaining,
    testSourceId,
    canUseTotpSecret,
    getCooldownSeconds
}) => {
    return (
        <Card
            size="small"
            title="TOTP Authentication"
            extra={
                <Form.Item
                    name="enableTOTP"
                    valuePropName="checked"
                    noStyle
                >
                    <Switch
                        size="small"
                        checkedChildren="On"
                        unCheckedChildren="Off"
                        onChange={handleTotpToggle}
                    />
                </Form.Item>
            }
            style={{ marginBottom: 8 }}
        >
            <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => 
                    prevValues.enableTOTP !== currentValues.enableTOTP
                }
            >
                {({ getFieldValue }) => {
                    const isEnabled = getFieldValue('enableTOTP');
                    return isEnabled ? (
                        <>
                            <div style={{ marginBottom: 16 }}>
                                <Form.Item
                                    name="totpSecret"
                                    rules={[{ required: true, message: 'TOTP secret is required' }]}
                                >
                                    <Input.Password
                                        placeholder="Enter TOTP secret key"
                                        onChange={handleTotpSecretChange}
                                        status={totpError ? "error" : ""}
                                        size="small"
                                        addonAfter={
                                            <Button
                                                type="link"
                                                size="small"
                                                onClick={handleTestTotp}
                                                style={{ padding: '0 4px' }}
                                                loading={totpTesting}
                                            >
                                                Test
                                            </Button>
                                        }
                                    />
                                </Form.Item>
                                {totpError && <Text type="danger" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>{totpError}</Text>}
                            </div>

                            <div style={{ marginTop: 4, marginBottom: 4 }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                    <strong>Tips:</strong> Enter the secret key and click Test button. TOTP Code is generated automatically based on secret key.
                                </Text>
                            </div>

                            {totpPreviewVisible && (
                                <Card size="small" style={{ marginBottom: 8 }}>
                                    <Space direction="vertical" style={{ width: '100%' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Space>
                                                <Text 
                                                    strong 
                                                    copyable={totpCode !== 'ERROR'}
                                                    style={{ 
                                                        fontSize: '1.5rem',
                                                        fontFamily: 'monospace'
                                                    }}
                                                    type={totpCode === 'ERROR' ? 'danger' : undefined}
                                                >
                                                    {totpCode}
                                                </Text>
                                            </Space>
                                            {totpCode !== 'ERROR' && (
                                                <div style={{ textAlign: 'center' }}>
                                                    <Text strong style={{ fontSize: '1.2rem' }} type={timeRemaining <= 5 ? 'danger' : 'success'}>
                                                        {timeRemaining}s
                                                    </Text>
                                                    <br />
                                                    <Text type="secondary" style={{ fontSize: '11px' }}>
                                                        Time remaining
                                                    </Text>
                                                </div>
                                            )}
                                        </div>
                                        {totpCode !== 'ERROR' && (
                                            <Progress 
                                                percent={(timeRemaining / 30) * 100} 
                                                showInfo={false}
                                                status={timeRemaining <= 5 ? 'exception' : 'success'}
                                                size="small"
                                            />
                                        )}
                                    </Space>
                                </Card>
                            )}
                            <Space style={{ marginTop: 8 }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>Use variable</Text>
                                <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>[[TOTP_CODE]]</Tag>
                                <Text type="secondary" style={{ fontSize: 11 }}>to use the value in URL, headers, query params, body</Text>
                            </Space>
                            {/* TOTP Cooldown Warning */}
                            <Form.Item
                                noStyle
                                shouldUpdate={(prevValues, currentValues) => 
                                    prevValues.totpSecret !== currentValues.totpSecret
                                }
                            >
                                {({ getFieldValue }) => {
                                    const secret = getFieldValue('totpSecret');
                                    return secret && testSourceId && !canUseTotpSecret(testSourceId) ? (
                                        <Alert
                                            type="warning"
                                            message={`⏱️ TOTP cooldown active: ${getCooldownSeconds(testSourceId)} seconds remaining`}
                                            style={{ marginTop: 8 }}
                                            description="Please wait before making another request with this source."
                                            showIcon={false}
                                        />
                                    ) : null;
                                }}
                            </Form.Item>
                        </>
                    ) : null;
                }}
            </Form.Item>
        </Card>
    );
};

export default TotpAuthCard;