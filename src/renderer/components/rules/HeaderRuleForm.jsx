import { useSources, useEnvironments } from '../../contexts';
import { getSourceIcon, formatSourceDisplay } from '../proxy';
import React, { useState, useEffect, useRef } from 'react';
import {
    Modal,
    Form,
    Input,
    Select,
    Button,
    Radio,
    Space,
    AutoComplete,
    Typography,
    Alert,
    Tooltip,
    theme
} from 'antd';
import { 
    SaveOutlined,
    CloseOutlined,
    InfoCircleOutlined
} from '@ant-design/icons';
import DomainTags from '../features/domain-tags';
import { showMessage } from '../../utils';
import { 
    extractEnvironmentVariables,
    validateEnvironmentVariables,
    formatMissingVariables,
    getResolvedPreview,
    extractVariablesFromRule
} from '../../utils/validation/environment-variables';

const { Option } = Select;
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


const HeaderRuleForm = ({ visible, onCancel, onSave, initialValues }) => {
    const [form] = Form.useForm();
    const { sources } = useSources();
    const envContext = useEnvironments();
    const { token } = theme.useToken();
    const [headerType, setHeaderType] = useState('request');
    const [valueType, setValueType] = useState('static');
    const [envVarValidation, setEnvVarValidation] = useState({});
    const [domainValidation, setDomainValidation] = useState([]);
    const formRef = useRef(null);

    useEffect(() => {
        if (visible && form) {
            // Small delay to ensure form is mounted
            setTimeout(() => {
                if (initialValues) {
                    form.setFieldsValue({
                    headerName: initialValues.headerName || '',
                    headerValue: initialValues.headerValue || '',
                    tag: initialValues.tag || '',
                    domains: initialValues.domains || [],
                    valueType: initialValues.isDynamic ? 'dynamic' : 'static',
                    sourceId: initialValues.sourceId || '',
                    prefix: initialValues.prefix || '',
                    suffix: initialValues.suffix || '',
                    headerType: initialValues.isResponse ? 'response' : 'request'
                });
                setValueType(initialValues.isDynamic ? 'dynamic' : 'static');
                setHeaderType(initialValues.isResponse ? 'response' : 'request');
                } else {
                    form.resetFields();
                    setValueType('static');
                    setHeaderType('request');
                }
            }, 0);
        }
    }, [visible, initialValues, form]);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            
            const domains = values.domains || [];
            
            if (domains.length === 0) {
                showMessage('error', 'At least one domain is required');
                return;
            }

            // Extract all environment variables used in this rule
            const allEnvVars = extractVariablesFromRule({
                headerName: values.headerName,
                headerValue: valueType === 'static' ? values.headerValue : undefined,
                isDynamic: valueType === 'dynamic',
                prefix: valueType === 'dynamic' ? values.prefix : undefined,
                suffix: valueType === 'dynamic' ? values.suffix : undefined,
                domains: domains
            });
            
            const ruleData = {
                headerName: values.headerName.trim(), // Don't normalize if it has env vars
                headerValue: valueType === 'static' ? values.headerValue.trim() : '',
                tag: values.tag ? values.tag.trim() : '',
                domains: domains,
                isDynamic: valueType === 'dynamic',
                sourceId: valueType === 'dynamic' ? values.sourceId : '',
                prefix: valueType === 'dynamic' ? (values.prefix || '') : '',
                suffix: valueType === 'dynamic' ? (values.suffix || '') : '',
                isResponse: headerType === 'response',
                isEnabled: initialValues?.isEnabled !== false,
                hasEnvVars: allEnvVars.length > 0,
                envVars: allEnvVars
            };

            onSave(ruleData);
        } catch (error) {
            // Form validation failed - this is expected when user hasn't filled required fields
        }
    };

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

    // Validate all environment variables in form
    const validateAllEnvVars = () => {
        const values = form.getFieldsValue();
        const variables = envContext.getAllVariables();
        const validations = {};
        
        // Validate header name
        if (values.headerName) {
            validations.headerName = validateEnvironmentVariables(values.headerName, variables);
        }
        
        // Validate header value or dynamic fields
        if (valueType === 'static' && values.headerValue) {
            validations.headerValue = validateEnvironmentVariables(values.headerValue, variables);
        } else if (valueType === 'dynamic') {
            if (values.prefix) {
                validations.prefix = validateEnvironmentVariables(values.prefix, variables);
            }
            if (values.suffix) {
                validations.suffix = validateEnvironmentVariables(values.suffix, variables);
            }
        }
        
        // Validate domains
        if (values.domains && values.domains.length > 0) {
            const domainValidations = values.domains.map(domain => 
                validateEnvironmentVariables(domain, variables)
            );
            validations.domains = domainValidations;
            setDomainValidation(domainValidations);
        }
        
        setEnvVarValidation(validations);
        
        // Check if all validations pass
        let allValid = true;
        Object.values(validations).forEach(validation => {
            if (Array.isArray(validation)) {
                validation.forEach(v => {
                    if (v && !v.isValid) allValid = false;
                });
            } else if (validation && !validation.isValid) {
                allValid = false;
            }
        });
        
        return allValid;
    };

    const validateHeaderName = (_, value) => {
        if (!value || !value.trim()) {
            return Promise.reject('Header name is required');
        }
        
        // Validate environment variables first
        const envValidation = validateFieldEnvVars('headerName', value);
        if (envValidation && !envValidation.isValid) {
            return Promise.reject(formatMissingVariables(envValidation.missingVars));
        }
        
        // For validation of forbidden headers, we need to check the resolved value
        // But we'll allow it if it contains env vars that we can't resolve yet
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
    
    // Add validation for prefix/suffix
    const validatePrefixSuffix = (fieldName) => (_, value) => {
        if (!value) return Promise.resolve(); // Optional fields
        
        const envValidation = validateFieldEnvVars(fieldName, value);
        if (envValidation && !envValidation.isValid) {
            return Promise.reject(formatMissingVariables(envValidation.missingVars));
        }
        
        return Promise.resolve();
    };
    
    // Add effect to revalidate when environment changes or form values change
    useEffect(() => {
        if (visible && envContext.environmentsReady) {
            validateAllEnvVars();
        }
    }, [envContext.activeEnvironment, envContext.environmentsReady, visible]);


    return (
        <Modal
            title={initialValues ? 'Edit Header Rule' : 'Add Header Rule'}
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={600}
            destroyOnClose
            styles={{
                body: { 
                    maxHeight: '70vh', 
                    overflowY: 'auto',
                    paddingBottom: 0
                }
            }}
        >
            <Form
                ref={formRef}
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                autoComplete="off"
                scrollToFirstError
            >
                {/* Row 1 - Header Name, Type and Tag */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: 16 }}>
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
                    <Form.Item 
                        name="headerType" 
                        initialValue="request"
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

                {/* Row 2 - Value Type and Value */}
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
                            name="headerValue"
                            style={{ flex: 1, marginBottom: 0 }}
                            rules={[{ validator: validateHeaderValue }]}
                        >
                            <Input
                                placeholder="Header Value (e.g., Bearer {{API_TOKEN}})"
                                size="small"
                                onChange={(e) => validateFieldEnvVars('headerValue', e.target.value)}
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

                {/* Row 3 - Dynamic Value Format (only shown for dynamic values) */}
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

                {/* Row 4 - Domains */}
                <Form.Item
                    label="Domains"
                    name="domains"
                    rules={[{
                        required: true,
                        validator: (_, value) => {
                            if (!value || value.length === 0) {
                                return Promise.reject('Please add at least one domain pattern');
                            }
                            
                            // Validate environment variables in domains
                            if (envContext.environmentsReady) {
                                const variables = envContext.getAllVariables();
                                const invalidDomains = [];
                                
                                value.forEach((domain, index) => {
                                    const validation = validateEnvironmentVariables(domain, variables);
                                    if (validation.hasVars && !validation.isValid) {
                                        invalidDomains.push(`${domain} (${formatMissingVariables(validation.missingVars)})`);
                                    }
                                });
                                
                                if (invalidDomains.length > 0) {
                                    return Promise.reject(`Invalid domains: ${invalidDomains.join(', ')}`);
                                }
                            }
                            
                            return Promise.resolve();
                        }
                    }]}
                    style={{ marginBottom: 20 }}
                >
                    <DomainTags 
                        onValidate={(domains) => {
                            if (envContext.environmentsReady) {
                                const variables = envContext.getAllVariables();
                                const validations = domains.map(domain => 
                                    validateEnvironmentVariables(domain, variables)
                                );
                                setDomainValidation(validations);
                            }
                        }}
                        validationResults={domainValidation}
                    />
                </Form.Item>

                {/* Environment Variable Info */}
                {Object.keys(envVarValidation).some(key => {
                    const val = envVarValidation[key];
                    if (Array.isArray(val)) {
                        return val.some(v => v?.hasVars);
                    }
                    return val?.hasVars;
                }) && (
                    <Alert
                        message="Environment Variables Detected"
                        description={
                            <Space direction="vertical" size="small">
                                <Text>This rule uses environment variables. They will be resolved when the rule is applied.</Text>
                                {Object.entries(envVarValidation).map(([field, validation]) => {
                                    if (!validation || (!validation.hasVars && !Array.isArray(validation))) return null;
                                    
                                    // Handle domains array separately
                                    if (field === 'domains' && Array.isArray(validation)) {
                                        const domainsWithVars = validation
                                            .map((v, i) => v?.hasVars ? { index: i, vars: v.usedVars, isValid: v.isValid, missingVars: v.missingVars || [] } : null)
                                            .filter(Boolean);
                                        
                                        if (domainsWithVars.length === 0) return null;
                                        
                                        const validDomains = domainsWithVars.filter(d => d.isValid);
                                        const invalidDomains = domainsWithVars.filter(d => !d.isValid);
                                        const allDomainVars = [...new Set(domainsWithVars.flatMap(d => d.vars))];
                                        
                                        return (
                                            <div key={field}>
                                                <Text type={invalidDomains.length > 0 ? "danger" : "secondary"}>
                                                    • Domains use: {allDomainVars.map(v => `{{${v}}}`).join(', ')}
                                                    {invalidDomains.length > 0 && ` (missing: ${[...new Set(invalidDomains.flatMap(d => d.missingVars))].join(', ')})`}
                                                </Text>
                                            </div>
                                        );
                                    }
                                    
                                    if (!validation.hasVars) return null;
                                    
                                    const fieldLabel = field === 'headerName' ? 'Header name' : 
                                                     field === 'headerValue' ? 'Header value' :
                                                     field.charAt(0).toUpperCase() + field.slice(1);
                                    
                                    return (
                                        <Text key={field} type={validation.isValid ? "secondary" : "danger"}>
                                            • {fieldLabel} uses: {validation.usedVars.map(v => `{{${v}}}`).join(', ')}
                                            {!validation.isValid && ` (missing: ${validation.missingVars.join(', ')})`}
                                        </Text>
                                    );
                                })}
                            </Space>
                        }
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                )}

                {/* Sticky Footer */}
                <div style={{
                    position: 'sticky',
                    bottom: 0,
                    backgroundColor: token.colorBgContainer,
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                    padding: '16px 0',
                    marginTop: 16,
                    marginLeft: -24,
                    marginRight: -24,
                    paddingLeft: 24,
                    paddingRight: 24,
                    zIndex: 10
                }}>
                    <Space style={{ width: '100%', justifyContent: 'center' }}>
                        <Button
                            onClick={onCancel}
                            icon={<CloseOutlined />}
                            size="small"
                            style={{ minWidth: 100 }}
                        >
                            Cancel
                        </Button>

                        <Button
                            type="primary"
                            htmlType="submit"
                            icon={<SaveOutlined />}
                            size="small"
                            style={{ minWidth: 100 }}
                        >
                            {initialValues ? 'Update' : 'Create'}
                        </Button>
                    </Space>
                </div>
            </Form>
        </Modal>
    );
};

export default HeaderRuleForm;