import React, { useState, useEffect, useRef } from 'react';
import {
    Modal,
    Form,
    Input,
    Select,
    Button,
    Radio,
    Space,
    Typography,
    Alert,
    Tooltip,
    DatePicker,
    InputNumber,
    Checkbox,
    Switch,
    theme,
    Divider
} from 'antd';
import { 
    SaveOutlined,
    CloseOutlined,
    InfoCircleOutlined,
    CopyrightTwoTone
} from '@ant-design/icons';
import { useSources, useEnvironments } from '../../contexts';
import { getSourceIcon, formatSourceDisplay } from '../proxy';
import DomainTags from '../features/domain-tags';
import { showMessage } from '../../utils';
import { 
    validateEnvironmentVariables,
    formatMissingVariables,
    getResolvedPreview,
    extractVariablesFromRule
} from '../../utils/validation/environment-variables';

const { Option } = Select;
const { Text } = Typography;

// SameSite options
const SAMESITE_OPTIONS = [
    { value: 'Strict', label: 'Strict', description: 'Cookies only sent to same-site requests' },
    { value: 'Lax', label: 'Lax', description: 'Cookies sent to same-site requests and top-level navigation' },
    { value: 'None', label: 'None', description: 'Cookies sent to all requests (requires Secure)' }
];

// Common cookie expiration presets
const EXPIRATION_PRESETS = [
    { label: '1 Hour', value: 1, unit: 'hours' },
    { label: '1 Day', value: 1, unit: 'days' },
    { label: '1 Week', value: 7, unit: 'days' },
    { label: '1 Month', value: 30, unit: 'days' },
    { label: '3 Months', value: 90, unit: 'days' },
    { label: '1 Year', value: 365, unit: 'days' },
    { label: 'Session', value: 'session', unit: null }
];

const CookieRuleModal = ({ visible, onCancel, onSave, initialValues }) => {
    const [form] = Form.useForm();
    const { sources } = useSources();
    const envContext = useEnvironments();
    const { token } = theme.useToken();
    
    // State management
    const [headerType, setHeaderType] = useState('response');
    const [valueType, setValueType] = useState('static');
    const [expirationMode, setExpirationMode] = useState('session');
    const [sameSite, setSameSite] = useState('Lax');
    const [secure, setSecure] = useState(false);
    const [httpOnly, setHttpOnly] = useState(false);
    const [envVarValidation, setEnvVarValidation] = useState({});
    const [domainValidation, setDomainValidation] = useState([]);
    const [cookiePath, setCookiePath] = useState('/');
    const formRef = useRef(null);

    // Initialize form values
    useEffect(() => {
        if (visible && form) {
            setTimeout(() => {
                if (initialValues) {
                    // Parse existing cookie rule back to form values
                    const parsedValues = parseCookieValue(initialValues.headerValue);
                    form.setFieldsValue({
                        cookieName: parsedValues.name || initialValues.cookieName || '',
                        cookieValue: parsedValues.value || initialValues.cookieValue || '',
                        tag: initialValues.tag || '',
                        domains: initialValues.domains || [],
                        cookiePath: parsedValues.path || '/',
                        sameSite: parsedValues.sameSite || 'Lax',
                        secure: parsedValues.secure || false,
                        httpOnly: parsedValues.httpOnly || false,
                        headerType: initialValues.isResponse ? 'response' : 'request',
                        valueType: initialValues.isDynamic ? 'dynamic' : 'static',
                        sourceId: initialValues.sourceId || '',
                        prefix: initialValues.prefix || '',
                        suffix: initialValues.suffix || '',
                        expirationMode: parsedValues.expirationMode || 'session',
                        maxAge: parsedValues.maxAge || undefined,
                        expires: parsedValues.expires || undefined
                    });
                    setHeaderType(initialValues.isResponse ? 'response' : 'request');
                    setValueType(initialValues.isDynamic ? 'dynamic' : 'static');
                    setExpirationMode(parsedValues.expirationMode || 'session');
                    setSameSite(parsedValues.sameSite || 'Lax');
                    setSecure(parsedValues.secure || false);
                    setHttpOnly(parsedValues.httpOnly || false);
                    setCookiePath(parsedValues.path || '/');
                } else {
                    form.resetFields();
                    form.setFieldsValue({
                        cookiePath: '/',
                        sameSite: 'Lax',
                        secure: false,
                        httpOnly: false,
                        headerType: 'response',
                        valueType: 'static',
                        expirationMode: 'session'
                    });
                    setHeaderType('response');
                    setValueType('static');
                    setExpirationMode('session');
                    setSameSite('Lax');
                    setSecure(false);
                    setHttpOnly(false);
                    setCookiePath('/');
                }
            }, 0);
        }
    }, [visible, initialValues, form]);

    // Parse cookie value from Set-Cookie header
    const parseCookieValue = (cookieString) => {
        if (!cookieString) return {};
        
        const parts = cookieString.split(';').map(p => p.trim());
        const [nameValue, ...attributes] = parts;
        const [name, value] = nameValue.split('=');
        
        const result = {
            name: name || '',
            value: value || '',
            path: '/',
            sameSite: 'Lax',
            secure: false,
            httpOnly: false,
            expirationMode: 'session'
        };
        
        attributes.forEach(attr => {
            const [key, val] = attr.split('=');
            const lowerKey = key.toLowerCase();
            
            if (lowerKey === 'path') result.path = val;
            else if (lowerKey === 'samesite') result.sameSite = val;
            else if (lowerKey === 'secure') result.secure = true;
            else if (lowerKey === 'httponly') result.httpOnly = true;
            else if (lowerKey === 'max-age') {
                result.maxAge = parseInt(val);
                result.expirationMode = 'maxAge';
            }
            else if (lowerKey === 'expires') {
                result.expires = val;
                result.expirationMode = 'expires';
            }
        });
        
        return result;
    };

    // Build cookie value string
    const buildCookieValue = (values, isDynamic = false) => {
        let cookieString;
        
        // Build name=value part
        if (isDynamic && values.sourceId) {
            // For dynamic values, we'll store a placeholder that gets replaced at runtime
            cookieString = `${values.cookieName}={{DYNAMIC_VALUE}}`;
        } else {
            cookieString = `${values.cookieName}=${values.cookieValue}`;
        }
        
        // Only add attributes for response cookies (Set-Cookie header)
        // Request cookies (Cookie header) only have name=value pairs
        if (values.headerType === 'response') {
            // Add path
            if (values.cookiePath && values.cookiePath !== '/') {
                cookieString += `; Path=${values.cookiePath}`;
            } else {
                cookieString += '; Path=/';
            }
            
            // Add expiration
            if (values.expirationMode === 'maxAge' && values.maxAge) {
                cookieString += `; Max-Age=${values.maxAge}`;
            } else if (values.expirationMode === 'expires' && values.expires) {
                // Convert the date to UTC string
                const expiresDate = new Date(values.expires).toUTCString();
                cookieString += `; Expires=${expiresDate}`;
            }
            // Session cookies don't have Max-Age or Expires
            
            // Add SameSite
            if (values.sameSite) {
                cookieString += `; SameSite=${values.sameSite}`;
            }
            
            // Add Secure flag
            if (values.secure) {
                cookieString += '; Secure';
            }
            
            // Add HttpOnly flag
            if (values.httpOnly) {
                cookieString += '; HttpOnly';
            }
        }
        
        return cookieString;
    };

    // Validate field environment variables
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

    // Handle form submission
    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            
            const domains = values.domains || [];
            
            if (domains.length === 0) {
                showMessage('error', 'At least one domain is required');
                return;
            }

            // Build the cookie header value based on type
            let headerValue;
            let actualCookieValue = values.cookieValue;
            
            if (valueType === 'dynamic') {
                // For dynamic values, we need to handle it differently
                headerValue = buildCookieValue({ ...values, headerType }, true);
                actualCookieValue = ''; // Will be filled from source
            } else {
                headerValue = buildCookieValue({ ...values, headerType }, false);
            }

            // Extract all environment variables
            const allEnvVars = extractVariablesFromRule({
                headerName: headerType === 'response' ? 'Set-Cookie' : 'Cookie',
                headerValue: valueType === 'static' ? headerValue : undefined,
                isDynamic: valueType === 'dynamic',
                prefix: valueType === 'dynamic' ? values.prefix : undefined,
                suffix: valueType === 'dynamic' ? values.suffix : undefined,
                domains: domains
            });

            const ruleData = {
                headerName: headerType === 'response' ? 'Set-Cookie' : 'Cookie',
                headerValue: valueType === 'static' ? headerValue : '',
                tag: values.tag ? values.tag.trim() : '',
                domains: domains,
                isDynamic: valueType === 'dynamic',
                sourceId: valueType === 'dynamic' ? values.sourceId : '',
                prefix: valueType === 'dynamic' ? (values.prefix || '') : '',
                suffix: valueType === 'dynamic' ? (values.suffix || '') : '',
                isResponse: headerType === 'response',
                isEnabled: initialValues?.isEnabled !== false,
                hasEnvVars: allEnvVars.length > 0,
                envVars: allEnvVars,
                // Store original cookie data for editing
                cookieName: values.cookieName,
                cookieValue: actualCookieValue,
                cookiePath: values.cookiePath,
                sameSite: values.sameSite,
                secure: values.secure,
                httpOnly: values.httpOnly,
                expirationMode: values.expirationMode,
                maxAge: values.maxAge,
                expires: values.expires
            };

            onSave(ruleData);
        } catch (error) {
            // Form validation failed
        }
    };

    // Validation rules
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

    // Handle expiration preset selection
    const handleExpirationPreset = (preset) => {
        if (preset.value === 'session') {
            setExpirationMode('session');
            form.setFieldsValue({ maxAge: undefined, expires: undefined });
        } else {
            setExpirationMode('maxAge');
            const seconds = preset.unit === 'hours' 
                ? preset.value * 3600 
                : preset.value * 86400;
            form.setFieldsValue({ maxAge: seconds });
        }
    };

    // Revalidate when environment changes
    useEffect(() => {
        if (visible && envContext.environmentsReady) {
            // Validate all env vars when environment changes
            const values = form.getFieldsValue();
            if (values.cookieName) validateFieldEnvVars('cookieName', values.cookieName);
            if (values.cookieValue) validateFieldEnvVars('cookieValue', values.cookieValue);
            if (values.prefix) validateFieldEnvVars('prefix', values.prefix);
            if (values.suffix) validateFieldEnvVars('suffix', values.suffix);
        }
    }, [envContext.activeEnvironment, envContext.environmentsReady, visible]);

    return (
        <Modal
            title={
                <Space>
                    <CopyrightTwoTone />
                    {initialValues ? 'Edit Cookie Rule' : 'Add Cookie Rule'}
                </Space>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={800}
            destroyOnClose
            styles={{
                body: { 
                    height: 'calc(85vh - 100px)',
                    maxHeight: 'calc(85vh - 100px)', 
                    overflowY: 'auto',
                    overflowX: 'hidden',
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
                {/* Row 1 - Cookie Name, Type and Tag - Matching HeaderRuleForm format */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: 16 }}>
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
                    <Form.Item 
                        name="headerType" 
                        initialValue="response"
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

                {/* Row 2 - Value Type and Value - Matching HeaderRuleForm format */}
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
                            name="cookieValue"
                            style={{ flex: 1, marginBottom: 0 }}
                            rules={[{ validator: validateCookieValue }]}
                        >
                            <Input
                                placeholder="Cookie Value (e.g., abc123, {{SESSION_TOKEN}})"
                                size="small"
                                onChange={(e) => validateFieldEnvVars('cookieValue', e.target.value)}
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

                {/* Cookie Attributes Section - Always show header but conditional content */}
                <Divider orientation="left" style={{ fontSize: 12, marginTop: 24, marginBottom: 16 }}>
                    Cookie Attributes
                </Divider>

                {headerType === 'request' ? (
                    <Alert
                        message="Request Cookies"
                        description="Request cookies (Cookie header) only contain name=value pairs. Cookie attributes like Path, Expiration, Secure, HttpOnly, and SameSite are only used when setting cookies via the Set-Cookie response header."
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                ) : (
                    <>
                        {/* Path, Secure, and HttpOnly inline */}
                        <div style={{ display: 'flex', gap: '16px', marginBottom: 16 }}>
                            <Form.Item
                                label="Path"
                                name="cookiePath"
                                initialValue="/"
                                style={{ marginBottom: 0, flex: 2 }}
                                extra="The URL path that must exist for the cookie to be sent"
                            >
                                <Input
                                    placeholder="/ (default)"
                                    size="small"
                                    onChange={(e) => setCookiePath(e.target.value)}
                                />
                            </Form.Item>

                            <Form.Item
                                label={
                                    <span>
                                        Secure
                                        <Tooltip title="Cookie will only be sent over HTTPS connections">
                                            <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 12, color: '#8c8c8c' }} />
                                        </Tooltip>
                                    </span>
                                }
                                name="secure"
                                valuePropName="checked"
                                style={{ marginBottom: 0, minWidth: 100 }}
                            >
                                <Switch
                                    checked={secure}
                                    onChange={(checked) => {
                                        // Prevent disabling Secure when SameSite=None
                                        if (!checked && sameSite === 'None') {
                                            return; // Don't allow turning off
                                        }
                                        setSecure(checked);
                                    }}
                                    disabled={sameSite === 'None'} // Disable switch when SameSite=None
                                    checkedChildren="On"
                                    unCheckedChildren="Off"
                                    style={{ marginTop: 4 }}
                                />
                            </Form.Item>

                            <Form.Item
                                label={
                                    <span>
                                        HttpOnly
                                        <Tooltip title="Cookie cannot be accessed via JavaScript (prevents XSS attacks)">
                                            <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 12, color: '#8c8c8c' }} />
                                        </Tooltip>
                                    </span>
                                }
                                name="httpOnly"
                                valuePropName="checked"
                                style={{ marginBottom: 0, minWidth: 100 }}
                            >
                                <Switch
                                    checked={httpOnly}
                                    onChange={setHttpOnly}
                                    checkedChildren="On"
                                    unCheckedChildren="Off"
                                    style={{ marginTop: 4 }}
                                />
                            </Form.Item>
                        </div>

                        {/* SameSite and Expiration row with divided layout */}
                        <div style={{ display: 'flex', gap: '16px', marginBottom: 16 }}>
                            {/* Left side - SameSite */}
                            <div style={{ width: '280px' }}>
                                <Form.Item
                                    label="SameSite"
                                    name="sameSite"
                                    initialValue="Lax"
                                    style={{ marginBottom: 8 }}
                                >
                                    <Select
                                        value={sameSite}
                                        onChange={(value) => {
                                            setSameSite(value);
                                            // Automatically enable Secure when SameSite=None
                                            if (value === 'None' && !secure) {
                                                setSecure(true);
                                                form.setFieldsValue({ secure: true });
                                            }
                                        }}
                                        style={{ width: '100%' }}
                                        size="small"
                                    >
                                        {SAMESITE_OPTIONS.map(option => (
                                            <Option key={option.value} value={option.value}>
                                                {option.label}
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                    {SAMESITE_OPTIONS.find(opt => opt.value === sameSite)?.description}
                                </Text>
                            </div>

                            {/* Divider */}
                            <div style={{ width: '1px', backgroundColor: '#f0f0f0', margin: '0 8px' }} />

                            {/* Right side - Expiration */}
                            <div style={{ flex: 1 }}>
                                <Form.Item
                                    label="Expiration"
                                    name="expirationMode"
                                    initialValue="session"
                                    style={{ marginBottom: 8 }}
                                >
                                    <Select
                                        value={expirationMode}
                                        onChange={setExpirationMode}
                                        style={{ width: '280px' }}
                                        size="small"
                                    >
                                        <Option value="session">Session (no expiration)</Option>
                                        <Option value="maxAge">Max-Age (seconds)</Option>
                                        <Option value="expires">Expires (specific date)</Option>
                                    </Select>
                                </Form.Item>

                                {/* Expiration value input (shown conditionally) */}
                                {expirationMode === 'maxAge' && (
                                    <>
                                        <Form.Item
                                            name="maxAge"
                                            style={{ marginBottom: 8 }}
                                        >
                                            <InputNumber
                                                style={{ width: '100%' }}
                                                placeholder="Seconds (e.g., 3600 for 1 hour)"
                                                min={0}
                                                addonAfter="seconds"
                                                size="small"
                                            />
                                        </Form.Item>
                                        <Space wrap>
                                            {EXPIRATION_PRESETS.filter(p => p.value !== 'session').map(preset => (
                                                <Button
                                                    key={preset.label}
                                                    size="small"
                                                    onClick={() => handleExpirationPreset(preset)}
                                                >
                                                    {preset.label}
                                                </Button>
                                            ))}
                                        </Space>
                                    </>
                                )}

                                {expirationMode === 'expires' && (
                                    <Form.Item
                                        name="expires"
                                        style={{ marginBottom: 0 }}
                                    >
                                        <DatePicker
                                            showTime
                                            style={{ width: '100%' }}
                                            placeholder="Select expiration date and time"
                                            size="small"
                                        />
                                    </Form.Item>
                                )}
                            </div>
                        </div>

                        {sameSite === 'None' && (
                            <Alert
                                message="SameSite=None Configuration"
                                description="When SameSite is set to 'None', the Secure flag is required and has been automatically enabled. The cookie will only be sent over HTTPS connections."
                                type="info"
                                showIcon
                                style={{ marginBottom: 16 }}
                            />
                        )}
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
                {Object.keys(envVarValidation).some(key => envVarValidation[key]?.hasVars) && (
                    <Alert
                        message="Environment Variables Detected"
                        description={
                            <Space direction="vertical" size="small">
                                <Text>This cookie rule uses environment variables. They will be resolved when the rule is applied.</Text>
                                {Object.entries(envVarValidation).map(([field, validation]) => {
                                    if (!validation?.hasVars) return null;
                                    
                                    const fieldLabel = field === 'cookieName' ? 'Cookie name' : 
                                                     field === 'cookieValue' ? 'Cookie value' :
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
                    padding: '16px 24px',
                    marginTop: 16,
                    marginLeft: -24,
                    marginRight: -24,
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

export default CookieRuleModal;