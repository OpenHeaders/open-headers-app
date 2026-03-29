/**
 * HTTP Query Parameters Tab Component
 *
 * Provides interface for configuring HTTP request query parameters with
 * dynamic key-value pairs, environment variable validation, and real-time validation.
 *
 * Features:
 * - Dynamic query parameter addition and removal
 * - Environment variable validation in parameter values
 * - Real-time validation feedback
 * - Clean form list management
 *
 * @component
 * @since 3.0.0
 */

import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, Space } from 'antd';
import React from 'react';

/**
 * HTTP Query Parameters tab component for query parameter configuration
 *
 * @param {Object} props - Component props
 * @param {Function} props.validateVariableExists - Variable validation function
 * @returns {JSX.Element} Query parameters tab component
 */
interface HttpQueryParamsTabProps {
  validateVariableExists: (value: string) => { valid: boolean; error?: string };
}
const HttpQueryParamsTab = ({ validateVariableExists }: HttpQueryParamsTabProps) => {
  return (
    <Form.List name={['requestOptions', 'queryParams']}>
      {(fields, { add, remove }) => (
        <>
          {fields.map(({ key, name, ...restField }) => (
            <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline" size="small">
              <Form.Item
                {...restField}
                name={[name, 'key']}
                rules={[{ required: true, message: 'Missing key' }]}
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="Parameter name" size="small" />
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
                    },
                  },
                ]}
              >
                <Input placeholder="Value" size="small" />
              </Form.Item>
              <MinusCircleOutlined onClick={() => remove(name)} />
            </Space>
          ))}
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="small">
              Add Query Parameter
            </Button>
          </Form.Item>
        </>
      )}
    </Form.List>
  );
};

export default HttpQueryParamsTab;
