/**
 * HTTP Body Tab Component
 * 
 * Provides interface for configuring HTTP request body content with
 * content type selection and environment variable validation.
 * 
 * Features:
 * - Content type selection (JSON, Form URL Encoded)
 * - Dynamic body content area
 * - Environment variable validation in body content
 * - Real-time validation feedback
 * 
 * @component
 * @since 3.0.0
 */

import React from 'react';
import { Form, Select, Row, Col, Input } from 'antd';

const { Option } = Select;
const { TextArea } = Input;

/**
 * HTTP Body tab component for request body configuration
 * 
 * @param {Object} props - Component props
 * @param {string} props.contentType - Current content type
 * @param {Function} props.handleContentTypeChange - Content type change handler
 * @param {Function} props.validateVariableExists - Variable validation function
 * @returns {JSX.Element} Body tab component
 */
const HttpBodyTab = ({ contentType, handleContentTypeChange, validateVariableExists }) => {
    return (
        <Row gutter={16}>
            <Col span={6}>
                <Form.Item
                    name={['requestOptions', 'contentType']}
                    label="Content Type"
                >
                    <Select onChange={handleContentTypeChange} size="small">
                        <Option value="application/json">JSON</Option>
                        <Option value="application/x-www-form-urlencoded">Form URL Encoded</Option>
                    </Select>
                </Form.Item>
            </Col>
            <Col span={18}>
                <Form.Item
                    name={['requestOptions', 'body']}
                    label={contentType === 'application/json' ? 'JSON Body' : 'Form URL Encoded Body'}
                    rules={[
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
                    <TextArea
                        rows={3}
                        placeholder={contentType === 'application/json'
                            ? 'Enter JSON body'
                            : 'key1:value1\nkey2:value2\n...'}
                        size="small"
                    />
                </Form.Item>
            </Col>
        </Row>
    );
};

export default HttpBodyTab;