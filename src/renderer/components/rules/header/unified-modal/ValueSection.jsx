import React from 'react';
import {
    Form,
    Input,
    Select,
    Space,
    Alert,
    Typography,
    theme
} from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useSources } from '../../../../contexts';
import { getSourceIcon, formatSourceDisplay } from '../../../proxy';
import { 
    validateEnvironmentVariables,
    formatMissingVariables
} from '../../../../utils/validation/environment-variables';

const { Option } = Select;
const { Text } = Typography;

const ValueSection = ({ 
    mode, 
    valueType, 
    setValueType, 
    envVarValidation,
    setEnvVarValidation,
    envContext 
}) => {
    const { sources } = useSources();
    const { token } = theme.useToken();
    
    // Helper function to validate environment variables in a field
    const validateFieldEnvVars = (fieldName, value) => {
        if (!value || !envContext.environmentsReady) return null;
        
        const variables = envContext.getAllVariables();
        const validation = validateEnvironmentVariables(value, variables);
        
        setEnvVarValidation(prev => ({
            ...prev,
            [fieldName]: validation
        }));
        
        return validation;
    };

    // Validation for header value
    const validateHeaderValue = (_, value) => {
        if (valueType === 'static' && (!value || !value.trim())) {
            return Promise.reject('Header value is required');
        }
        
        // Validate environment variables
        const envValidation = validateFieldEnvVars('headerValue', value);
        if (envValidation && !envValidation.isValid) {
            return Promise.reject(formatMissingVariables(envValidation.missingVars));
        }
        
        return Promise.resolve();
    };

    // Validation for cookie value
    const validateCookieValue = (_, value) => {
        if (valueType === 'static' && (!value || !value.trim())) {
            return Promise.reject('Cookie value is required');
        }
        
        // Validate environment variables
        const envValidation = validateFieldEnvVars('cookieValue', value);
        if (envValidation && !envValidation.isValid) {
            return Promise.reject(formatMissingVariables(envValidation.missingVars));
        }
        
        return Promise.resolve();
    };

    // Validation for prefix/suffix
    const validatePrefixSuffix = (fieldName) => (_, value) => {
        if (!value) return Promise.resolve(); // Optional fields
        
        const envValidation = validateFieldEnvVars(fieldName, value);
        if (envValidation && !envValidation.isValid) {
            return Promise.reject(formatMissingVariables(envValidation.missingVars));
        }
        
        return Promise.resolve();
    };

    const valuePlaceholder = mode === 'cookie' 
        ? "Cookie Value (e.g., abc123, {{SESSION_TOKEN}})"
        : "Header Value (e.g., Bearer {{API_TOKEN}})";

    const valueFieldName = mode === 'cookie' ? 'cookieValue' : 'headerValue';
    const validateValue = mode === 'cookie' ? validateCookieValue : validateHeaderValue;

    return (
        <>
            <Space.Compact block style={{ marginBottom: 16 }}>
                <Form.Item 
                    name="valueType" 
                    initialValue="static"
                    style={{ marginBottom: 0 }}
                >
                    <Select
                        size="small"
                        style={{ width: 120 }}
                        value={valueType}
                        onChange={setValueType}
                    >
                        <Option value="static">Static</Option>
                        <Option value="dynamic" disabled={!sources || sources.length === 0}>
                            Dynamic {sources && sources.length === 0 && '(No sources)'}
                        </Option>
                    </Select>
                </Form.Item>

                {valueType === 'static' ? (
                    <Form.Item
                        name={valueFieldName}
                        style={{ flex: 1, marginBottom: 0 }}
                        rules={[{ validator: validateValue }]}
                    >
                        <Input
                            placeholder={valuePlaceholder}
                            size="small"
                            onChange={(e) => validateFieldEnvVars(valueFieldName, e.target.value)}
                        />
                    </Form.Item>
                ) : (
                    <Form.Item
                        name="sourceId"
                        style={{ flex: 1, marginBottom: 0 }}
                        rules={[{ required: true, message: 'Please select a source' }]}
                    >
                        <Select
                            placeholder="Select a source"
                            size="small"
                            showSearch
                            optionFilterProp="children"
                        >
                            {sources && sources.length > 0 ? (
                                sources.map(source => (
                                    <Option key={source.sourceId} value={source.sourceId}>
                                        {getSourceIcon(source)}
                                        {formatSourceDisplay(source)}
                                    </Option>
                                ))
                            ) : (
                                <Option disabled>No sources available</Option>
                            )}
                        </Select>
                    </Form.Item>
                )}
            </Space.Compact>

            {/* Dynamic Value Format (only shown for dynamic values) */}
            {valueType === 'dynamic' && (
                <>
                    {sources && sources.length === 0 && (
                        <Alert
                            message="No Sources Available"
                            description="Please create at least one source in the Sources tab before using dynamic values."
                            type="warning"
                            showIcon
                            style={{ marginBottom: 16 }}
                        />
                    )}
                    
                    <Form.Item
                        label={
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Value Format (optional)
                            </Text>
                        }
                        style={{ marginBottom: 16 }}
                    >
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: 6,
                            padding: 4,
                            border: `1px solid ${token.colorBorder}`,
                            backgroundColor: token.colorFillQuaternary
                        }}>
                            <Form.Item
                                name="prefix"
                                style={{ flex: 1, marginBottom: 0, marginRight: -1 }}
                                rules={[{ validator: validatePrefixSuffix('prefix') }]}
                            >
                                <Input
                                    placeholder="Prefix (e.g., {{AUTH_TYPE}} )"
                                    size="small"
                                    style={{
                                        borderRadius: '4px 0 0 4px',
                                        borderRight: 'none',
                                        textAlign: 'right'
                                    }}
                                    onChange={(e) => validateFieldEnvVars('prefix', e.target.value)}
                                />
                            </Form.Item>

                            <div style={{
                                padding: '4px 12px',
                                border: `1px solid ${token.colorBorder}`,
                                backgroundColor: token.colorFillSecondary,
                                color: token.colorTextSecondary,
                                fontSize: 13,
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                height: 32,
                                fontStyle: 'italic'
                            }}>
                                {'{source_value}'}
                            </div>

                            <Form.Item
                                name="suffix"
                                style={{ flex: 1, marginBottom: 0, marginLeft: -1 }}
                                rules={[{ validator: validatePrefixSuffix('suffix') }]}
                            >
                                <Input
                                    placeholder="Suffix (e.g., {{ENV}})"
                                    size="small"
                                    style={{
                                        borderRadius: '0 4px 4px 0',
                                        borderLeft: 'none'
                                    }}
                                    onChange={(e) => validateFieldEnvVars('suffix', e.target.value)}
                                />
                            </Form.Item>
                        </div>
                    </Form.Item>
                </>
            )}
        </>
    );
};

export default ValueSection;