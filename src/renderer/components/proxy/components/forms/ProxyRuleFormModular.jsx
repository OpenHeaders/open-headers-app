import React, { useState, useEffect, useRef } from 'react';
import { Modal, Form, Input, Button, Space, Typography, Divider } from 'antd';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { errorMessage } from '../../../../utils';
import {
    HeaderTypeSelector,
    ExistingHeaderRuleSelector,
    CustomHeaderConfig,
    StaticValueInput,
    DynamicValueConfig,
    DomainConfig
} from './ProxyRuleFormFields';
import {
    createHeaderNameValidator,
    createHeaderValueValidator,
    validateRuleName
} from './ProxyRuleFormValidation';

const { Text } = Typography;

/**
 * ProxyRuleForm - Modular form for creating and editing proxy rules
 * 
 * Refactored proxy rule form component using modular field components.
 * Maintains all original functionality while improving maintainability
 * through component composition and separation of concerns.
 * 
 * Architecture:
 * - Uses modular field components from ProxyRuleFormFields
 * - Validation logic extracted to ProxyRuleFormValidation
 * - Core form logic and state management remain in this component
 * - Clean separation between presentation and business logic
 * 
 * Features:
 * - Modal-based form with comprehensive validation
 * - Support for custom headers and header rule references
 * - Dynamic form sections based on header type selection
 * - Source selection for dynamic values with prefix/suffix
 * - Domain pattern configuration with validation
 * - Proper form initialization and cleanup
 * 
 * @param {boolean} visible - Whether the modal is visible
 * @param {function} onCancel - Callback when modal is cancelled
 * @param {function} onSave - Callback when form is submitted with rule data
 * @param {Object|null} rule - Existing rule data for editing, null for creation
 * @param {Array} sources - Available sources for dynamic header values
 * @param {Array} headerRules - Available header rules for reference mode
 * @returns {JSX.Element} Proxy rule form modal
 */
const ProxyRuleForm = ({ visible, onCancel, onSave, rule, sources = [], headerRules = [] }) => {
    const [form] = Form.useForm();
    const formRef = useRef(null);
    const [headerType, setHeaderType] = useState('custom');
    const [valueType, setValueType] = useState('static');

    // Form initialization effect
    useEffect(() => {
        if (visible) {
            if (rule) {
                // Initialize form with existing rule data
                const isReference = !!rule.headerRuleId;
                const formValues = {
                    name: rule.name,
                    headerType: isReference ? 'reference' : 'custom',
                    headerRuleId: rule.headerRuleId || undefined,
                    headerName: rule.headerName || '',
                    valueType: rule.isDynamic ? 'dynamic' : 'static',
                    headerValue: rule.headerValue || '',
                    sourceId: rule.sourceId || undefined,
                    prefix: rule.prefix || '',
                    suffix: rule.suffix || ''
                };
                
                // Only set domains for custom headers
                if (!isReference) {
                    formValues.domains = rule.domains || [];
                }
                
                form.setFieldsValue(formValues);
                setHeaderType(rule.headerRuleId ? 'reference' : 'custom');
                setValueType(rule.isDynamic ? 'dynamic' : 'static');
            } else {
                form.resetFields();
                setHeaderType('custom');
                setValueType('static');
            }
        }
    }, [rule, form, visible]);

    // Form submission handler
    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            
            // For custom headers, validate domains
            if (headerType === 'custom') {
                const domains = values.domains || [];
                if (domains.length === 0) {
                    errorMessage('At least one domain is required');
                    return;
                }
            }

            // Build rule data based on header type
            let ruleData = {
                name: values.name,
                enabled: rule?.enabled !== false
            };

            if (headerType === 'reference') {
                // Using existing header rule - no domains needed, will use the header rule's domains
                ruleData.headerRuleId = values.headerRuleId;
                ruleData.isDynamic = true; // Dynamic rules reference header rules
            } else {
                // Custom header - needs domains
                ruleData.domains = values.domains || [];
                ruleData.headerName = values.headerName.trim();
                ruleData.isDynamic = valueType === 'dynamic';
                
                if (valueType === 'static') {
                    ruleData.headerValue = values.headerValue.trim();
                } else {
                    ruleData.sourceId = values.sourceId;
                    ruleData.prefix = values.prefix || '';
                    ruleData.suffix = values.suffix || '';
                }
            }

            onSave({ ...rule, ...ruleData });
        } catch (error) {
            // Form validation failed - this is expected when user hasn't filled required fields
        }
    };

    // Create validation functions with current state
    const validateHeaderName = createHeaderNameValidator(headerType);
    const validateHeaderValue = createHeaderValueValidator(headerType, valueType);

    return (
        <Modal
            title={rule ? 'Edit Proxy Rule' : 'Add Proxy Rule'}
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
                {/* Rule Name */}
                <Form.Item
                    name="name"
                    label="Rule Name"
                    rules={validateRuleName}
                >
                    <Input
                        placeholder="e.g., Add Authentication Header"
                        size="small"
                    />
                </Form.Item>

                <Divider style={{ margin: '16px 0' }} />

                {/* Header Configuration Section */}
                <div style={{ marginBottom: 16 }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                        Header Configuration
                    </Text>
                    
                    {/* Header Type Selector */}
                    <HeaderTypeSelector 
                        headerType={headerType}
                        setHeaderType={setHeaderType}
                        form={form}
                    />

                    {headerType === 'reference' ? (
                        <>
                            {/* Existing Header Rule Selection */}
                            <ExistingHeaderRuleSelector headerRules={headerRules} />
                        </>
                    ) : (
                        /* Custom Header Configuration */
                        <>
                            {/* Header Name and Value Type */}
                            <CustomHeaderConfig 
                                validateHeaderName={validateHeaderName}
                                valueType={valueType}
                                setValueType={setValueType}
                                sources={sources}
                            />

                            {/* Value Input */}
                            {valueType === 'static' ? (
                                <StaticValueInput validateHeaderValue={validateHeaderValue} />
                            ) : (
                                <DynamicValueConfig sources={sources} />
                            )}
                            
                            {/* Domains for custom header */}
                            <DomainConfig />
                        </>
                    )}
                </div>

                {/* Sticky Footer */}
                <div style={{
                    position: 'sticky',
                    bottom: 0,
                    backgroundColor: 'var(--ant-color-bg-container, #fff)',
                    borderTop: '1px solid rgba(0, 0, 0, 0.06)',
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
                            {rule ? 'Update' : 'Create'}
                        </Button>
                    </Space>
                </div>
            </Form>
        </Modal>
    );
};

export default ProxyRuleForm;