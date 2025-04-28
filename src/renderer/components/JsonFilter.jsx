import React from 'react';
import { Card, Form, Input, Switch, Typography } from 'antd';

const { Text } = Typography;

/**
 * JsonFilter component for configuring JSON filtering options
 * Simplified for the compact UI design
 */
const JsonFilter = ({ enabled, onChange }) => {
    return (
        <Card
            title="JSON Filter"
            size="small"
            style={{ marginBottom: 8 }}
            extra={
                <Form.Item
                    name={['jsonFilter', 'enabled']}
                    valuePropName="checked"
                    initialValue={enabled || false}
                    noStyle
                >
                    <Switch
                        size="small"
                        checkedChildren="On"
                        unCheckedChildren="Off"
                        onChange={onChange}
                    />
                </Form.Item>
            }
        >
            {enabled && (
                <Form.Item
                    name={['jsonFilter', 'path']}
                    label="JSON Path"
                    rules={[{ required: true, message: 'Please enter a JSON path' }]}
                >
                    <Input
                        placeholder="e.g., root.data.items[0].name"
                        size="small"
                    />
                </Form.Item>
            )}

            <Text type="secondary" style={{ fontSize: 11 }}>
                Use dot notation to access nested objects. Example: <code>root.data.items[0].name</code>
            </Text>
        </Card>
    );
};

export default JsonFilter;