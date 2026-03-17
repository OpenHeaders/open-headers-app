import React from 'react';
import { Form, Input, Select, Radio, Space, Typography, Tag } from 'antd';
import { LinkOutlined, SolutionOutlined } from '@ant-design/icons';
import DomainTags from '../../../features/domain-tags';
import { getSourceIcon, formatSourceDisplay } from '../../utils';

const { Text } = Typography;
const { Option } = Select;

/**
 * ProxyRuleFormFields - Form field components for proxy rule configuration
 * 
 * Modular form field components that can be composed to create proxy rule forms.
 * Provides reusable field components for different aspects of proxy rule configuration.
 */

/**
 * Header Type Selector - Choose between custom header or existing rule reference
 */
export const HeaderTypeSelector = ({ headerType, setHeaderType, form }) => (
    <Form.Item name="headerType" initialValue="custom" style={{ marginBottom: 16 }}>
        <Radio.Group 
            value={headerType}
            onChange={e => {
                const newType = e.target.value;
                setHeaderType(newType);
                // Clear domains when switching to reference mode
                if (newType === 'reference') {
                    form.setFieldsValue({ domains: undefined });
                }
            }}
            size="small"
            optionType="button"
            buttonStyle="solid"
        >
            <Radio.Button value="reference">
                <LinkOutlined /> Use Existing Rule
            </Radio.Button>
            <Radio.Button value="custom">
                <SolutionOutlined /> Custom Header
            </Radio.Button>
        </Radio.Group>
    </Form.Item>
);

/**
 * Existing Header Rule Selector - Dropdown for selecting existing header rules
 */
export const ExistingHeaderRuleSelector = ({ headerRules }) => (
    <Form.Item
        name="headerRuleId"
        rules={[{ required: true, message: 'Please select a header rule' }]}
    >
        <Select
            placeholder="Select a header rule *"
            size="small"
            showSearch
            optionFilterProp="children"
            dropdownStyle={{ maxWidth: 600 }}
            style={{ width: '100%' }}
            optionLabelProp="label"
        >
            {headerRules.length > 0 ? (
                headerRules.map(rule => {
                    const isDisabled = !rule.isEnabled;
                    return (
                        <Option 
                            key={rule.id} 
                            value={rule.id} 
                            disabled={isDisabled}
                            label={rule.headerName}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <Space>
                                    <Text strong={!isDisabled} type={isDisabled ? 'secondary' : undefined}>
                                        {rule.headerName}
                                    </Text>
                                    {rule.isDynamic && (
                                        <Tag color="blue" style={{ marginLeft: 8 }}>Dynamic</Tag>
                                    )}
                                    {isDisabled && (
                                        <Tag color="default">Disabled</Tag>
                                    )}
                                </Space>
                                <Text type="secondary" style={{ fontSize: 11, marginLeft: 2 }}>
                                    {rule.domains?.length ? 
                                        (rule.domains.length > 3 ? 
                                            `${rule.domains.slice(0, 3).join(', ')}... (+${rule.domains.length - 3} more)` : 
                                            rule.domains.join(', ')
                                        ) : 
                                        'all domains'
                                    }
                                </Text>
                            </div>
                        </Option>
                    );
                })
            ) : (
                <Option disabled>No header rules available</Option>
            )}
        </Select>
    </Form.Item>
);

/**
 * Custom Header Configuration - Fields for custom header name and value type
 */
export const CustomHeaderConfig = ({ validateHeaderName, valueType, setValueType, sources }) => (
    <Space.Compact block style={{ marginBottom: 12 }}>
        <Form.Item
            name="headerName"
            style={{ flex: 1, marginBottom: 0 }}
            rules={[{ validator: validateHeaderName }]}
        >
            <Input
                placeholder="Header Name (e.g., Authorization) *"
                size="small"
            />
        </Form.Item>
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
    </Space.Compact>
);

/**
 * Static Value Input - Simple text input for static header values
 */
export const StaticValueInput = ({ validateHeaderValue }) => (
    <Form.Item
        name="headerValue"
        rules={[{ validator: validateHeaderValue }]}
    >
        <Input
            placeholder="Header Value *"
            size="small"
        />
    </Form.Item>
);

/**
 * Dynamic Value Configuration - Source selector and prefix/suffix inputs
 */
export const DynamicValueConfig = ({ sources }) => (
    <>
        <Form.Item
            name="sourceId"
            rules={[{ required: true, message: 'Please select a source' }]}
        >
            <Select
                placeholder="Select a source *"
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

        {/* Dynamic Value Format */}
        <Form.Item
            label={
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Value Format (optional)
                </Text>
            }
        >
            <div style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 6,
                padding: 4,
                border: '1px solid',
                borderColor: 'rgba(0, 0, 0, 0.15)',
                backgroundColor: 'rgba(0, 0, 0, 0.04)'
            }}>
                <Form.Item
                    name="prefix"
                    style={{ flex: 1, marginBottom: 0, marginRight: -1 }}
                >
                    <Input
                        placeholder="Prefix (optional)"
                        size="small"
                        style={{
                            borderRadius: '4px 0 0 4px',
                            borderRight: 'none',
                            textAlign: 'right'
                        }}
                    />
                </Form.Item>

                <div style={{
                    padding: '4px 12px',
                    border: '1px solid',
                    borderColor: 'rgba(0, 0, 0, 0.15)',
                    backgroundColor: 'rgba(0, 0, 0, 0.06)',
                    color: 'rgba(0, 0, 0, 0.45)',
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
                >
                    <Input
                        placeholder="Suffix (optional)"
                        size="small"
                        style={{
                            borderRadius: '0 4px 4px 0',
                            borderLeft: 'none'
                        }}
                    />
                </Form.Item>
            </div>
        </Form.Item>
    </>
);

/**
 * Domain Configuration - Domain tags input for custom headers
 */
export const DomainConfig = () => (
    <Form.Item
        label="Domains"
        name="domains"
        rules={[{
            required: true,
            validator: (_, value) => {
                if (!value || value.length === 0) {
                    return Promise.reject('Please add at least one domain pattern');
                }
                return Promise.resolve();
            }
        }]}
        style={{ marginTop: 16 }}
    >
        <DomainTags />
    </Form.Item>
);