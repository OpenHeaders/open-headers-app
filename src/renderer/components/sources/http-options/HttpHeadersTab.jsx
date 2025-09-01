/**
 * HTTP Headers Tab Component
 * 
 * Provides interface for configuring HTTP request headers with dynamic
 * key-value pairs, environment variable validation, and real-time validation.
 * 
 * Features:
 * - Dynamic header addition and removal
 * - Environment variable validation in header values
 * - Real-time validation feedback
 * - Clean form list management
 * 
 * @component
 * @since 3.0.0
 */

import React from 'react';
import { Form, Input, Button, Space } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';

/**
 * HTTP Headers tab component for header configuration
 * 
 * @param {Object} props - Component props
 * @param {Function} props.validateVariableExists - Variable validation function
 * @returns {JSX.Element} Headers tab component
 */
const HttpHeadersTab = ({ validateVariableExists }) => {
    return (
        <Form.List name={['requestOptions', 'headers']}>
            {(fields, { add, remove }) => (
                <>
                    {fields.map(({ key, name, ...restField }) => (
                        <Space
                            key={key}
                            style={{ display: 'flex', marginBottom: 8 }}
                            align="baseline"
                            size="small"
                        >
                            <Form.Item
                                {...restField}
                                name={[name, 'key']}
                                rules={[{ required: true, message: 'Missing key' }]}
                                style={{ marginBottom: 0 }}
                            >
                                <Input placeholder="Header name" size="small" />
                            </Form.Item>
                            <Form.Item
                                {...restField}
                                name={[name, 'value']}
                                style={{ marginBottom: 0 }}
                                validateFirst
                                validateTrigger={['onChange', 'onBlur']}
                                rules={[
                                    {
                                        validator: (_, value) => {
                                            const result = validateVariableExists(value);
                                            if (!result.valid) {
                                                return Promise.reject(new Error(result.error));
                                            }
                                            return Promise.resolve();
                                        }
                                    }
                                ]}
                            >
                                <Input placeholder="Value" size="small" />
                            </Form.Item>
                            <MinusCircleOutlined
                                onClick={() => remove(name)}
                            />
                        </Space>
                    ))}
                    <Form.Item style={{ marginBottom: 0 }}>
                        <Button
                            type="dashed"
                            onClick={() => add()}
                            block
                            icon={<PlusOutlined />}
                            size="small"
                        >
                            Add Header
                        </Button>
                    </Form.Item>
                </>
            )}
        </Form.List>
    );
};

export default HttpHeadersTab;