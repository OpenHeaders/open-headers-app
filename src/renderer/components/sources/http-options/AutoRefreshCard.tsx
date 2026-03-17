/**
 * Auto-Refresh Card Component
 * 
 * Provides interface for configuring automatic request refresh settings
 * with preset and custom interval options.
 * 
 * Features:
 * - Toggle for enabling/disabling auto-refresh
 * - Preset interval selection (1min - 12hrs)
 * - Custom interval input with validation
 * - Real-time state synchronization
 * 
 * @component
 * @since 3.0.0
 */

import React from 'react';
import { Card, Form, Switch, Radio, Select, InputNumber, Row, Col } from 'antd';

const { Option } = Select;

/**
 * Auto-Refresh card component for refresh configuration
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.refreshEnabled - Current refresh enabled state
 * @param {Function} props.handleRefreshToggle - Refresh toggle handler
 * @param {string} props.refreshType - Current refresh type (preset/custom)
 * @param {Function} props.handleRefreshTypeChange - Refresh type change handler
 * @param {number} props.customInterval - Current custom interval value
 * @param {Function} props.handlePresetIntervalChange - Preset interval change handler
 * @param {Function} props.handleCustomIntervalChange - Custom interval change handler
 * @param {Object} props.form - Form instance for field access
 * @returns {JSX.Element} Auto-refresh card component
 */
const AutoRefreshCard = ({
    refreshEnabled,
    handleRefreshToggle,
    refreshType,
    handleRefreshTypeChange,
    customInterval,
    handlePresetIntervalChange,
    handleCustomIntervalChange,
    form
}) => {
    return (
        <Card
            size="small"
            title="Auto-Refresh"
            extra={
                <Form.Item
                    name={['refreshOptions', 'enabled']}
                    valuePropName="checked"
                    noStyle
                >
                    <Switch
                        size="small"
                        checkedChildren="On"
                        unCheckedChildren="Off"
                        onChange={handleRefreshToggle}
                        checked={refreshEnabled}
                    />
                </Form.Item>
            }
        >
            {(refreshEnabled || !!form.getFieldValue(['refreshOptions', 'enabled'])) && (
                <Row gutter={[8, 8]}>
                    <Col span={24}>
                        <Form.Item
                            name={['refreshOptions', 'type']}
                            initialValue="preset"
                            style={{ marginBottom: 8 }}
                        >
                            <Radio.Group
                                onChange={handleRefreshTypeChange}
                                value={refreshType}
                                size="small"
                            >
                                <Radio value="preset">Preset</Radio>
                                <Radio value="custom">Custom</Radio>
                            </Radio.Group>
                        </Form.Item>
                    </Col>
                    <Col span={24}>
                        {(refreshType === 'preset' || form.getFieldValue(['refreshOptions', 'type']) === 'preset') ? (
                            <Form.Item
                                name={['refreshOptions', 'interval']}
                                initialValue={15}
                                style={{ marginBottom: 0 }}
                            >
                                <Select onChange={handlePresetIntervalChange} size="small">
                                    <Option value={1}>Every 1 minute</Option>
                                    <Option value={5}>Every 5 minutes</Option>
                                    <Option value={15}>Every 15 minutes</Option>
                                    <Option value={30}>Every 30 minutes</Option>
                                    <Option value={60}>Every hour</Option>
                                    <Option value={120}>Every 2 hours</Option>
                                </Select>
                            </Form.Item>
                        ) : (
                            <Form.Item
                                name={['refreshOptions', 'interval']}
                                initialValue={15}
                                style={{ marginBottom: 0 }}
                            >
                                <InputNumber
                                    min={1}
                                    max={10080}
                                    value={customInterval}
                                    onChange={handleCustomIntervalChange}
                                    addonAfter="minutes"
                                    size="small"
                                    style={{ width: '100%' }}
                                />
                            </Form.Item>
                        )}
                    </Col>
                </Row>
            )}
        </Card>
    );
};

export default AutoRefreshCard;