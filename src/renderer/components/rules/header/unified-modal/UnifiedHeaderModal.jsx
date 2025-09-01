import React, { useState, useEffect, useRef } from 'react';
import {
    Modal,
    Form,
    Button,
    Space,
    Segmented,
    theme
} from 'antd';
import { 
    SaveOutlined,
    CloseOutlined,
    RightCircleTwoTone,
    CopyrightTwoTone
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEnvironments } from '../../../../contexts';
import { showMessage } from '../../../../utils';
import { extractVariablesFromRule } from '../../../../utils/validation/environment-variables';

// Import sub-components
import FormHeader from './FormHeader';
import ValueSection from './ValueSection';
import CookieAttributes from './CookieAttributes';
import DomainSection from './DomainSection';
import EnvVarInfo from './EnvVarInfo';
import { buildHeaderValue, parseHeaderValue } from './utils';

const UnifiedHeaderModal = ({ visible, onCancel, onSave, initialValues }) => {
    const [form] = Form.useForm();
    const envContext = useEnvironments();
    const { token } = theme.useToken();
    const formRef = useRef(null);
    
    // Determine initial mode based on headerName or default to generic
    const getInitialMode = () => {
        if (initialValues?.headerName === 'Cookie' || initialValues?.headerName === 'Set-Cookie') {
            return 'cookie';
        }
        return 'generic';
    };
    
    // State management
    const [mode, setMode] = useState(getInitialMode());
    const [headerType, setHeaderType] = useState('request');
    const [valueType, setValueType] = useState('static');
    const [envVarValidation, setEnvVarValidation] = useState({});
    const [domainValidation, setDomainValidation] = useState([]);
    
    // Cookie-specific state
    const [expirationMode, setExpirationMode] = useState('session');
    const [sameSite, setSameSite] = useState('Lax');
    const [secure, setSecure] = useState(false);
    const [httpOnly, setHttpOnly] = useState(false);

    // Initialize form values
    useEffect(() => {
        if (visible && form) {
            setTimeout(() => {
                const currentMode = getInitialMode();
                setMode(currentMode);
                
                if (initialValues) {
                    if (currentMode === 'cookie') {
                        // Parse cookie values
                        const parsed = parseHeaderValue(initialValues.headerValue, 'cookie');
                        form.setFieldsValue({
                            cookieName: parsed.name || initialValues.cookieName || '',
                            cookieValue: parsed.value || initialValues.cookieValue || '',
                            tag: initialValues.tag || '',
                            domains: initialValues.domains || [],
                            cookiePath: parsed.path || initialValues.cookiePath || '/',
                            sameSite: parsed.sameSite || initialValues.sameSite || 'Lax',
                            secure: parsed.secure || initialValues.secure || false,
                            httpOnly: parsed.httpOnly || initialValues.httpOnly || false,
                            headerType: initialValues.isResponse ? 'response' : 'request',
                            valueType: initialValues.isDynamic ? 'dynamic' : 'static',
                            sourceId: initialValues.sourceId || '',
                            prefix: initialValues.prefix || '',
                            suffix: initialValues.suffix || '',
                            expirationMode: parsed.expirationMode || initialValues.expirationMode || 'session',
                            maxAge: parsed.maxAge || initialValues.maxAge,
                            expires: (parsed.expires || initialValues.expires) ? 
                                dayjs(parsed.expires || initialValues.expires) : undefined
                        });
                        setExpirationMode(parsed.expirationMode || initialValues.expirationMode || 'session');
                        setSameSite(parsed.sameSite || initialValues.sameSite || 'Lax');
                        setSecure(parsed.secure || initialValues.secure || false);
                        setHttpOnly(parsed.httpOnly || initialValues.httpOnly || false);
                    } else {
                        // Generic header values
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
                    }
                    setHeaderType(initialValues.isResponse ? 'response' : 'request');
                    setValueType(initialValues.isDynamic ? 'dynamic' : 'static');
                } else {
                    // Reset form for new rule
                    form.resetFields();
                    if (currentMode === 'cookie') {
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
                    } else {
                        form.setFieldsValue({
                            headerType: 'request',
                            valueType: 'static'
                        });
                        setHeaderType('request');
                    }
                    setValueType('static');
                    setExpirationMode('session');
                    setSameSite('Lax');
                    setSecure(false);
                    setHttpOnly(false);
                }
            }, 0);
        }
    }, [visible, initialValues, form]);

    // Handle mode switch
    const handleModeSwitch = (newMode) => {
        // Save current values that are common
        const commonValues = {
            tag: form.getFieldValue('tag'),
            domains: form.getFieldValue('domains'),
            valueType: form.getFieldValue('valueType'),
            sourceId: form.getFieldValue('sourceId'),
            prefix: form.getFieldValue('prefix'),
            suffix: form.getFieldValue('suffix'),
            headerType: form.getFieldValue('headerType')
        };
        
        setMode(newMode);
        
        // Reset form but preserve common values
        form.resetFields();
        form.setFieldsValue(commonValues);
        
        // Set mode-specific defaults
        if (newMode === 'cookie') {
            form.setFieldsValue({
                cookiePath: '/',
                sameSite: 'Lax',
                secure: false,
                httpOnly: false,
                expirationMode: 'session'
            });
        }
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

            let ruleData;
            
            if (mode === 'cookie') {
                // Build cookie header value
                const headerValue = buildHeaderValue(values, mode, valueType);
                
                // Extract environment variables
                const allEnvVars = extractVariablesFromRule({
                    headerName: headerType === 'response' ? 'Set-Cookie' : 'Cookie',
                    headerValue: valueType === 'static' ? headerValue : undefined,
                    isDynamic: valueType === 'dynamic',
                    prefix: valueType === 'dynamic' ? values.prefix : undefined,
                    suffix: valueType === 'dynamic' ? values.suffix : undefined,
                    domains: domains
                });

                ruleData = {
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
                    // Store cookie-specific data for editing
                    cookieName: values.cookieName,
                    cookieValue: valueType === 'static' ? values.cookieValue : '',
                    cookiePath: values.cookiePath,
                    sameSite: values.sameSite,
                    secure: values.secure,
                    httpOnly: values.httpOnly,
                    expirationMode: values.expirationMode,
                    maxAge: values.maxAge,
                    expires: values.expires ? values.expires.toISOString() : undefined
                };
            } else {
                // Generic header
                const allEnvVars = extractVariablesFromRule({
                    headerName: values.headerName,
                    headerValue: valueType === 'static' ? values.headerValue : undefined,
                    isDynamic: valueType === 'dynamic',
                    prefix: valueType === 'dynamic' ? values.prefix : undefined,
                    suffix: valueType === 'dynamic' ? values.suffix : undefined,
                    domains: domains
                });
                
                ruleData = {
                    headerName: values.headerName.trim(),
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
            }

            onSave(ruleData);
        } catch (error) {
            // Form validation failed
        }
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{initialValues ? 'Edit Header Rule' : 'Add Header Rule'}</span>
                    <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                        <Segmented
                            value={mode}
                            onChange={handleModeSwitch}
                            options={[
                                { 
                                    label: 'Generic Header', 
                                    value: 'generic', 
                                    icon: <RightCircleTwoTone />
                                },
                                { 
                                    label: 'Cookie', 
                                    value: 'cookie', 
                                    icon: <CopyrightTwoTone />
                                }
                            ]}
                            size="middle"
                            style={{ fontWeight: 500 }}
                        />
                    </div>
                    <div style={{ width: 200 }}></div> {/* Spacer to balance the layout */}
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={mode === 'cookie' ? 800 : 600}
            destroyOnClose
            styles={{
                body: { 
                    height: mode === 'cookie' ? 'calc(85vh - 100px)' : 'calc(70vh - 100px)',
                    maxHeight: mode === 'cookie' ? 'calc(85vh - 100px)' : 'calc(70vh - 100px)', 
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
                style={{ marginTop: 24 }}
            >
                {/* Header section - name/cookie name, type, tag */}
                <FormHeader
                    mode={mode}
                    headerType={headerType}
                    setHeaderType={setHeaderType}
                    envVarValidation={envVarValidation}
                    setEnvVarValidation={setEnvVarValidation}
                    envContext={envContext}
                />

                {/* Value section - static/dynamic */}
                <ValueSection
                    mode={mode}
                    valueType={valueType}
                    setValueType={setValueType}
                    envVarValidation={envVarValidation}
                    setEnvVarValidation={setEnvVarValidation}
                    envContext={envContext}
                />

                {/* Cookie attributes (only for cookie mode) */}
                {mode === 'cookie' && (
                    <CookieAttributes
                        headerType={headerType}
                        expirationMode={expirationMode}
                        setExpirationMode={setExpirationMode}
                        sameSite={sameSite}
                        setSameSite={setSameSite}
                        secure={secure}
                        setSecure={setSecure}
                        httpOnly={httpOnly}
                        setHttpOnly={setHttpOnly}
                        form={form}
                    />
                )}

                {/* Domains section */}
                <DomainSection
                    domainValidation={domainValidation}
                    setDomainValidation={setDomainValidation}
                    envContext={envContext}
                />

                {/* Environment Variable Info */}
                <EnvVarInfo 
                    envVarValidation={envVarValidation}
                    mode={mode}
                />

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

export default UnifiedHeaderModal;