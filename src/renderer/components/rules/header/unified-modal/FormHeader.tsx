import React from 'react';
import {
    Form,
    Input,
    Radio,
    AutoComplete,
    Typography
} from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { 
    validateEnvironmentVariables,
    formatMissingVariables
} from '../../../../utils/validation/environment-variables';

const { Text } = Typography;

// Common header suggestions
const HEADER_SUGGESTIONS = [
    'Authorization',
    'Content-Type', 
    'Accept',
    'User-Agent',
    'Cache-Control',
    'Cookie',
    'Origin',
    'Referer',
    'X-API-Key',
    'X-Auth-Token',
    'X-Requested-With',
    'X-CSRF-Token',
    'Accept-Language',
    'Accept-Encoding',
    'If-None-Match',
    'If-Modified-Since'
];

// Forbidden headers that can't be modified
const FORBIDDEN_HEADERS = [
    'Accept-Charset',
    'Accept-Encoding',
    'Access-Control-Request-Headers',
    'Access-Control-Request-Method',
    'Connection',
    'Content-Length',
    'Cookie2',
    'Date',
    'DNT',
    'Expect',
    'Host',
    'Keep-Alive',
    'Origin',
    'Proxy-',
    'Sec-',
    'TE',
    'Trailer',
    'Transfer-Encoding',
    'Upgrade',
    'Via'
];

// Normalize header name
const normalizeHeaderName = (name) => {
    if (!name) return '';
    return name.split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('-');
};

const FormHeader = ({ 
    mode, 
    headerType, 
    setHeaderType, 
    envVarValidation, 
    setEnvVarValidation,
    envContext 
}) => {
    const form = Form.useFormInstance();
    
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

    // Validation for header name
    const validateHeaderName = (_, value) => {
        if (!value || !value.trim()) {
            return Promise.reject('Header name is required');
        }
        
        // Validate environment variables first
        const envValidation = validateFieldEnvVars('headerName', value);
        if (envValidation && !envValidation.isValid) {
            return Promise.reject(formatMissingVariables(envValidation.missingVars));
        }
        
        // For validation of forbidden headers
        const hasEnvVars = envValidation && envValidation.hasVars;
        if (!hasEnvVars) {
            const headerName = value.trim().toLowerCase();
            
            // Check if it's a forbidden header
            if (FORBIDDEN_HEADERS.some(forbidden => {
                if (forbidden.endsWith('-')) {
                    return headerName.startsWith(forbidden.toLowerCase());
                }
                return headerName === forbidden.toLowerCase();
            })) {
                return Promise.reject(`"${value}" is a forbidden header that cannot be modified`);
            }
        }
        
        return Promise.resolve();
    };

    // Validation for cookie name
    const validateCookieName = (_, value) => {
        if (!value || !value.trim()) {
            return Promise.reject('Cookie name is required');
        }
        
        // Check for invalid characters
        if (/[=;,\s]/.test(value)) {
            return Promise.reject('Cookie name cannot contain =, ;, comma, or spaces');
        }
        
        // Validate environment variables
        const envValidation = validateFieldEnvVars('cookieName', value);
        if (envValidation && !envValidation.isValid) {
            return Promise.reject(formatMissingVariables(envValidation.missingVars));
        }
        
        return Promise.resolve();
    };

    return (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: 16 }}>
            {mode === 'generic' ? (
                <Form.Item
                    name="headerName"
                    style={{ marginBottom: 0, flex: 1 }}
                    rules={[{ validator: validateHeaderName }]}
                    extra={envVarValidation.headerName?.hasVars && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <InfoCircleOutlined /> Uses environment variables: {envVarValidation.headerName.usedVars.map(v => `{{${v}}}`).join(', ')}
                        </Text>
                    )}
                >
                    <AutoComplete
                        options={HEADER_SUGGESTIONS.map(h => ({ value: h }))}
                        placeholder="Header Name"
                        size="small"
                        style={{ width: '100%' }}
                        filterOption={(inputValue, option) =>
                            option.value.toLowerCase().includes(inputValue.toLowerCase())
                        }
                        onBlur={(e) => {
                            const fieldValue = e.target.value;
                            // Only normalize if it doesn't contain env vars
                            if (!fieldValue.includes('{{')) {
                                const normalized = normalizeHeaderName(fieldValue);
                                form.setFieldsValue({ headerName: normalized });
                            }
                            validateFieldEnvVars('headerName', fieldValue);
                        }}
                        onChange={(fieldValue) => {
                            validateFieldEnvVars('headerName', fieldValue);
                        }}
                    />
                </Form.Item>
            ) : (
                <Form.Item
                    name="cookieName"
                    style={{ marginBottom: 0, flex: 1 }}
                    rules={[{ validator: validateCookieName }]}
                    extra={envVarValidation.cookieName?.hasVars && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <InfoCircleOutlined /> Uses environment variables: {envVarValidation.cookieName.usedVars.map(v => `{{${v}}}`).join(', ')}
                        </Text>
                    )}
                >
                    <Input
                        placeholder="Cookie Name"
                        size="small"
                        onChange={(e) => validateFieldEnvVars('cookieName', e.target.value)}
                    />
                </Form.Item>
            )}
            
            <Form.Item 
                name="headerType" 
                initialValue={mode === 'cookie' ? 'response' : 'request'}
                style={{ marginBottom: 0 }}
            >
                <Radio.Group 
                    size="small"
                    value={headerType}
                    onChange={(e) => setHeaderType(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                >
                    <Radio.Button value="request">Request</Radio.Button>
                    <Radio.Button value="response">Response</Radio.Button>
                </Radio.Group>
            </Form.Item>
            
            <Form.Item
                name="tag"
                style={{ marginBottom: 0, width: 180 }}
            >
                <Input
                    placeholder="Tag (optional)"
                    size="small"
                    maxLength={20}
                />
            </Form.Item>
        </div>
    );
};

export default FormHeader;