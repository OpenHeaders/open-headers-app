/**
 * JSON Filter Card Component
 * 
 * Provides interface for configuring JSON response filtering with
 * path-based data extraction and environment variable validation.
 * 
 * Features:
 * - Toggle for enabling/disabling JSON filtering
 * - JSON path configuration with validation
 * - Environment variable support in paths
 * - User-friendly help text and examples
 * 
 * @component
 * @since 3.0.0
 */

import React from 'react';
import { Card, Form, Input, Switch, Typography } from 'antd';

const { Text } = Typography;

/**
 * JSON Filter card component for response filtering configuration
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.jsonFilterEnabled - Current JSON filter enabled state
 * @param {Function} props.handleJsonFilterToggle - JSON filter toggle handler
 * @param {Function} props.validateVariableExists - Variable validation function
 * @param {Object} props.form - Form instance for field access
 * @returns {JSX.Element} JSON filter card component
 */
const JsonFilterCard = ({ 
    jsonFilterEnabled, 
    handleJsonFilterToggle, 
    validateVariableExists, 
    form 
}) => {
    return (
        <Card 
            size="small" 
            title="JSON Filter"
            extra={
                <Form.Item
                    name={['jsonFilter', 'enabled']}
                    valuePropName="checked"
                    initialValue={false}
                    noStyle
                >
                    <Switch
                        size="small"
                        checkedChildren="On"
                        unCheckedChildren="Off"
                        onChange={handleJsonFilterToggle}
                        checked={jsonFilterEnabled}
                    />
                </Form.Item>
            }
            style={{ marginBottom: 8 }}
        >
            {(jsonFilterEnabled || !!form.getFieldValue(['jsonFilter', 'enabled'])) && (
                <Form.Item
                    name={['jsonFilter', 'path']}
                    label="JSON Path"
                    rules={[
                        { required: true, message: 'Required' },
                        {
                            validator: (_, value) => {
                                if (!value) return Promise.resolve();
                                const result = validateVariableExists(value);
                                if (!result.valid) {
                                    return Promise.reject(new Error(result.error));
                                }
                                return Promise.resolve();
                            }
                        }
                    ]}
                >
                    <Input
                        placeholder="e.g., root.data.items[0].name"
                        size="small"
                    />
                </Form.Item>
            )}

            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                {jsonFilterEnabled ? 'Filter will extract specific data from JSON response' : 'Full JSON response will be used'}
            </Text>
        </Card>
    );
};

export default JsonFilterCard;