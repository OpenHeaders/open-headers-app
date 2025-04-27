import React, { useState, useEffect } from 'react';
import { Tabs, Form, Input, Select, Button, Card, Space, message, Radio, InputNumber, Switch, Row, Col } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useHttp } from '../hooks/useHttp';
import JsonFilter from './JsonFilter';
import TOTPOptions from './TOTPOptions';
import { showMessage } from '../utils/messageUtil';

const { Option } = Select;
const { TextArea } = Input;

/**
 * HTTP Options component for configuring HTTP requests
 */
const HttpOptions = ({ form, onTestResponse, compact = false }) => {
    // Component state
    const [contentType, setContentType] = useState('application/json');
    const [testResponseVisible, setTestResponseVisible] = useState(false);
    const [testResponseContent, setTestResponseContent] = useState('');
    const [testing, setTesting] = useState(false);
    const [jsonFilterEnabled, setJsonFilterEnabled] = useState(false);
    const [refreshEnabled, setRefreshEnabled] = useState(false);
    const [refreshType, setRefreshType] = useState('preset');
    const [customInterval, setCustomInterval] = useState(15);
    const [rawResponse, setRawResponse] = useState(null);

    // Custom hooks
    const http = useHttp();

    // Handle content type change
    const handleContentTypeChange = (value) => {
        setContentType(value);
        form.setFieldsValue({
            requestOptions: {
                ...form.getFieldValue('requestOptions'),
                contentType: value
            }
        });
    };

    // Handle refresh enabled toggle
    const handleRefreshToggle = (checked) => {
        setRefreshEnabled(checked);

        // Update form values
        form.setFieldsValue({
            refreshOptions: {
                ...form.getFieldValue('refreshOptions'),
                enabled: checked
            }
        });
    };

    // Handle refresh type change
    const handleRefreshTypeChange = (e) => {
        const newType = e.target.value;
        setRefreshType(newType);

        // Update form values
        form.setFieldsValue({
            refreshOptions: {
                ...form.getFieldValue('refreshOptions'),
                type: newType
            }
        });
    };

    // Handle custom interval change
    const handleCustomIntervalChange = (value) => {
        // Ensure value is a positive number
        const interval = value > 0 ? value : 1;
        setCustomInterval(interval);

        form.setFieldsValue({
            refreshOptions: {
                ...form.getFieldValue('refreshOptions'),
                interval: interval
            }
        });
    };

    // Handle preset interval change
    const handlePresetIntervalChange = (value) => {
        form.setFieldsValue({
            refreshOptions: {
                ...form.getFieldValue('refreshOptions'),
                interval: value,
                type: 'preset'
            }
        });
    };

    // Handle JSON filter toggle
    const handleJsonFilterToggle = (enabled) => {
        setJsonFilterEnabled(enabled);

        // Update form values
        form.setFieldsValue({
            jsonFilter: {
                ...form.getFieldValue('jsonFilter'),
                enabled
            }
        });
    };

    // Handle test request
    const handleTestRequest = async () => {
        try {
            // Get current form values
            const values = form.getFieldsValue();
            if (!values.sourcePath) {
                showMessage('error', 'Please enter a URL');
                return;
            }

            // Ensure URL has protocol
            let url = values.sourcePath;
            if (!url.match(/^https?:\/\//i)) {
                url = 'https://' + url;
                form.setFieldsValue({ sourcePath: url });
            }

            // Show loading
            setTesting(true);
            setTestResponseVisible(false);

            // Prepare request options
            const requestOptions = {
                queryParams: {},
                headers: {},
                body: null,
                contentType: values.requestOptions?.contentType || 'application/json'
            };

            // Add query params if defined
            if (values.requestOptions?.queryParams) {
                // Convert array to object
                values.requestOptions.queryParams.forEach(param => {
                    if (param && param.key) {
                        requestOptions.queryParams[param.key] = param.value || '';
                    }
                });
            }

            // Add headers if defined
            if (values.requestOptions?.headers) {
                values.requestOptions.headers.forEach(header => {
                    if (header && header.key) {
                        requestOptions.headers[header.key] = header.value || '';
                    }
                });
            }

            // Add body if applicable
            if (['POST', 'PUT', 'PATCH'].includes(values.sourceMethod)) {
                const requestBody = values.requestOptions?.body || null;
                if (requestBody) {
                    requestOptions.body = requestBody;
                }
            }

            // Add TOTP secret if provided
            if (values.enableTOTP && values.totpSecret) {
                requestOptions.totpSecret = values.totpSecret;
            }

            // Add JSON filter if enabled
            const jsonFilter = jsonFilterEnabled ? {
                enabled: true,
                path: values.jsonFilter?.path || ''
            } : { enabled: false, path: '' };

            console.log("JSON Filter for test:", jsonFilter);

            // Make the test request
            const response = await http.testRequest(
                url,
                values.sourceMethod || 'GET',
                requestOptions,
                jsonFilter
            );

            // Save the raw response for later use
            setRawResponse(response);

            // Format the response for display
            setTestResponseContent(formatResponseForDisplay(response));
            setTestResponseVisible(true);

            // Send to parent
            if (onTestResponse) {
                onTestResponse(response);
            }
        } catch (error) {
            showMessage('error', `Failed to test request: ${error.message}`);
        } finally {
            setTesting(false);
        }
    };

    // Format response for display
    const formatResponseForDisplay = (responseJson) => {
        try {
            const response = JSON.parse(responseJson);

            let formattedResponse = `Status Code: ${response.statusCode}\n\n`;

            if (response.filteredWith) {
                formattedResponse += `[Filtered with path: ${response.filteredWith}]\n\n`;
            }

            if (response.body) {
                try {
                    const jsonBody = typeof response.body === 'string' && response.body.trim().startsWith('{') ?
                        JSON.parse(response.body) : response.body;

                    if (typeof jsonBody === 'object' && jsonBody !== null) {
                        formattedResponse += JSON.stringify(jsonBody, null, 2);
                    } else {
                        formattedResponse += response.body;
                    }
                } catch (e) {
                    formattedResponse += response.body;
                }
            } else {
                formattedResponse += "Empty response body";
            }

            return formattedResponse;
        } catch (error) {
            return responseJson || "No content";
        }
    };

    // Render component with compact layout
    if (compact) {
        return (
            <div className="http-options-compact">
                <Row gutter={16}>
                    <Col span={4}>
                        <Form.Item
                            name="sourceMethod"
                            label="HTTP Method"
                            initialValue="GET"
                        >
                            <Select style={{ width: '100%' }} size="small">
                                <Option value="GET">GET</Option>
                                <Option value="POST">POST</Option>
                                <Option value="PUT">PUT</Option>
                                <Option value="PATCH">PATCH</Option>
                                <Option value="DELETE">DELETE</Option>
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={20}>
                        <Button
                            type="primary"
                            onClick={handleTestRequest}
                            loading={testing}
                            size="small"
                            style={{ marginTop: 24 }}
                        >
                            Test Request
                        </Button>
                    </Col>
                </Row>

                {/* Tabs for different options */}
                <Tabs
                    defaultActiveKey="queryParams"
                    type="card"
                    size="small"
                    style={{ marginBottom: 10 }}
                    items={[
                        {
                            key: 'queryParams',
                            label: 'Query Params',
                            children: (
                                <Form.List name={['requestOptions', 'queryParams']}>
                                    {(fields, { add, remove }) => (
                                        <>
                                            {fields.map(({ key, name, ...restField }) => (
                                                <Space
                                                    key={key}
                                                    style={{ display: 'flex', marginBottom: 8 }}
                                                    align="baseline"
                                                    size="small"
                                                >
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
                                                    >
                                                        <Input placeholder="Value" size="small" />
                                                    </Form.Item>
                                                    <MinusCircleOutlined
                                                        onClick={() => remove(name)}
                                                        style={{ color: '#ff4d4f' }}
                                                    />
                                                </Space>
                                            ))}
                                            <Form.Item style={{ marginBottom: 0 }}>
                                                <Button
                                                    type="dashed"
                                                    onClick={() => add()}
                                                    block
                                                    icon={<PlusOutlined />}
                                                    size="small"
                                                >
                                                    Add Query Parameter
                                                </Button>
                                            </Form.Item>
                                        </>
                                    )}
                                </Form.List>
                            )
                        },
                        {
                            key: 'headers',
                            label: 'Headers',
                            children: (
                                <Form.List name={['requestOptions', 'headers']}>
                                    {(fields, { add, remove }) => (
                                        <>
                                            {fields.map(({ key, name, ...restField }) => (
                                                <Space
                                                    key={key}
                                                    style={{ display: 'flex', marginBottom: 8 }}
                                                    align="baseline"
                                                    size="small"
                                                >
                                                    <Form.Item
                                                        {...restField}
                                                        name={[name, 'key']}
                                                        rules={[{ required: true, message: 'Missing key' }]}
                                                        style={{ marginBottom: 0 }}
                                                    >
                                                        <Input placeholder="Header name" size="small" />
                                                    </Form.Item>
                                                    <Form.Item
                                                        {...restField}
                                                        name={[name, 'value']}
                                                        style={{ marginBottom: 0 }}
                                                    >
                                                        <Input placeholder="Value" size="small" />
                                                    </Form.Item>
                                                    <MinusCircleOutlined
                                                        onClick={() => remove(name)}
                                                        style={{ color: '#ff4d4f' }}
                                                    />
                                                </Space>
                                            ))}
                                            <Form.Item style={{ marginBottom: 0 }}>
                                                <Button
                                                    type="dashed"
                                                    onClick={() => add()}
                                                    block
                                                    icon={<PlusOutlined />}
                                                    size="small"
                                                >
                                                    Add Header
                                                </Button>
                                            </Form.Item>
                                        </>
                                    )}
                                </Form.List>
                            )
                        },
                        {
                            key: 'body',
                            label: 'Body',
                            children: (
                                <Row gutter={16}>
                                    <Col span={6}>
                                        <Form.Item
                                            name={['requestOptions', 'contentType']}
                                            label="Content Type"
                                            initialValue="application/json"
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
                            )
                        },
                        {
                            key: 'options',
                            label: 'Options',
                            children: (
                                <Row gutter={16}>
                                    <Col span={12}>
                                        {/* JSON Filter */}
                                        <Card size="small" title="JSON Filter"
                                              extra={
                                                  <Form.Item
                                                      name={['jsonFilter', 'enabled']}
                                                      valuePropName="checked"
                                                      initialValue={false}
                                                      noStyle
                                                  >
                                                      <Switch
                                                          size="small"
                                                          checkedChildren="On"
                                                          unCheckedChildren="Off"
                                                          onChange={handleJsonFilterToggle}
                                                      />
                                                  </Form.Item>
                                              }
                                              style={{ marginBottom: 8 }}
                                        >
                                            {jsonFilterEnabled && (
                                                <Form.Item
                                                    name={['jsonFilter', 'path']}
                                                    label="JSON Path"
                                                    rules={[{ required: true, message: 'Required' }]}
                                                >
                                                    <Input
                                                        placeholder="e.g., root.data.items[0].name"
                                                        size="small"
                                                    />
                                                </Form.Item>
                                            )}
                                        </Card>

                                        {/* TOTP Options */}
                                        <TOTPOptions form={form} compact={true} />
                                    </Col>
                                    <Col span={12}>
                                        {/* Auto-Refresh */}
                                        <Card
                                            size="small"
                                            title="Auto-Refresh"
                                            extra={
                                                <Form.Item
                                                    name={['refreshOptions', 'enabled']}
                                                    valuePropName="checked"
                                                    initialValue={false}
                                                    noStyle
                                                >
                                                    <Switch
                                                        size="small"
                                                        checkedChildren="On"
                                                        unCheckedChildren="Off"
                                                        onChange={handleRefreshToggle}
                                                    />
                                                </Form.Item>
                                            }
                                        >
                                            {refreshEnabled && (
                                                <Row gutter={[8, 8]}>
                                                    <Col span={24}>
                                                        <Form.Item
                                                            name={['refreshOptions', 'type']}
                                                            initialValue="preset"
                                                            style={{ marginBottom: 8 }}
                                                        >
                                                            <Radio.Group
                                                                onChange={handleRefreshTypeChange}
                                                                value={refreshType}
                                                                size="small"
                                                            >
                                                                <Radio value="preset">Preset</Radio>
                                                                <Radio value="custom">Custom</Radio>
                                                            </Radio.Group>
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={24}>
                                                        {refreshType === 'preset' ? (
                                                            <Form.Item
                                                                name={['refreshOptions', 'interval']}
                                                                initialValue={15}
                                                                style={{ marginBottom: 0 }}
                                                            >
                                                                <Select onChange={handlePresetIntervalChange} size="small">
                                                                    <Option value={1}>Every 1 minute</Option>
                                                                    <Option value={5}>Every 5 minutes</Option>
                                                                    <Option value={15}>Every 15 minutes</Option>
                                                                    <Option value={30}>Every 30 minutes</Option>
                                                                    <Option value={60}>Every hour</Option>
                                                                    <Option value={120}>Every 2 hours</Option>
                                                                </Select>
                                                            </Form.Item>
                                                        ) : (
                                                            <Form.Item
                                                                name={['refreshOptions', 'interval']}
                                                                initialValue={15}
                                                                style={{ marginBottom: 0 }}
                                                            >
                                                                <InputNumber
                                                                    min={1}
                                                                    max={10080}
                                                                    value={customInterval}
                                                                    onChange={handleCustomIntervalChange}
                                                                    addonAfter="minutes"
                                                                    size="small"
                                                                    style={{ width: '100%' }}
                                                                />
                                                            </Form.Item>
                                                        )}
                                                    </Col>
                                                </Row>
                                            )}
                                        </Card>
                                    </Col>
                                </Row>
                            )
                        }
                    ]}
                />

                {/* Test Response */}
                {testResponseVisible && (
                    <Card
                        title="Response Preview"
                        size="small"
                        style={{ marginTop: 8 }}
                    >
                        <pre style={{
                            maxHeight: 150,
                            overflow: 'auto',
                            background: '#fafafa',
                            padding: 8,
                            fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                            fontSize: 12,
                            borderRadius: 6,
                            border: '1px solid #f0f0f0'
                        }}>
                            {testResponseContent}
                        </pre>
                    </Card>
                )}
            </div>
        );
    }

    // Original non-compact layout (for backwards compatibility)
    // Define tabs items
    const tabItems = [
        {
            key: 'queryParams',
            label: 'Query Params',
            children: (
                <Form.List name={['requestOptions', 'queryParams']}>
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map(({ key, name, ...restField }) => (
                                <Space
                                    key={key}
                                    style={{ display: 'flex', marginBottom: 8 }}
                                    align="baseline"
                                >
                                    <Form.Item
                                        {...restField}
                                        name={[name, 'key']}
                                        rules={[{ required: true, message: 'Missing key' }]}
                                    >
                                        <Input placeholder="Parameter name" />
                                    </Form.Item>
                                    <Form.Item
                                        {...restField}
                                        name={[name, 'value']}
                                    >
                                        <Input placeholder="Value" />
                                    </Form.Item>
                                    <MinusCircleOutlined
                                        onClick={() => remove(name)}
                                        style={{ color: '#ff4d4f' }}
                                    />
                                </Space>
                            ))}
                            <Form.Item>
                                <Button
                                    type="dashed"
                                    onClick={() => add()}
                                    block
                                    icon={<PlusOutlined />}
                                >
                                    Add Query Parameter
                                </Button>
                            </Form.Item>
                        </>
                    )}
                </Form.List>
            )
        },
        {
            key: 'headers',
            label: 'Headers',
            children: (
                <Form.List name={['requestOptions', 'headers']}>
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map(({ key, name, ...restField }) => (
                                <Space
                                    key={key}
                                    style={{ display: 'flex', marginBottom: 8 }}
                                    align="baseline"
                                >
                                    <Form.Item
                                        {...restField}
                                        name={[name, 'key']}
                                        rules={[{ required: true, message: 'Missing key' }]}
                                    >
                                        <Input placeholder="Header name" />
                                    </Form.Item>
                                    <Form.Item
                                        {...restField}
                                        name={[name, 'value']}
                                    >
                                        <Input placeholder="Value" />
                                    </Form.Item>
                                    <MinusCircleOutlined
                                        onClick={() => remove(name)}
                                        style={{ color: '#ff4d4f' }}
                                    />
                                </Space>
                            ))}
                            <Form.Item>
                                <Button
                                    type="dashed"
                                    onClick={() => add()}
                                    block
                                    icon={<PlusOutlined />}
                                >
                                    Add Header
                                </Button>
                            </Form.Item>
                        </>
                    )}
                </Form.List>
            )
        },
        {
            key: 'body',
            label: 'Body',
            children: (
                <>
                    <Form.Item
                        name={['requestOptions', 'contentType']}
                        label="Content Type"
                        initialValue="application/json"
                    >
                        <Select onChange={handleContentTypeChange}>
                            <Option value="application/json">JSON</Option>
                            <Option value="application/x-www-form-urlencoded">Form URL Encoded</Option>
                        </Select>
                    </Form.Item>

                    {contentType === 'application/json' ? (
                        <Form.Item
                            name={['requestOptions', 'body']}
                            label="JSON Body"
                        >
                            <TextArea
                                rows={6}
                                placeholder="Enter JSON body"
                            />
                        </Form.Item>
                    ) : (
                        <Form.Item
                            name={['requestOptions', 'body']}
                            label="Form URL Encoded Body"
                        >
                            <TextArea
                                rows={6}
                                placeholder="key1:value1&#10;key2:value2&#10;...&#10;Keys and values are separated by :&#10;Rows are separated by new lines"
                            />
                        </Form.Item>
                    )}
                </>
            )
        }
    ];

    return (
        <div className="http-options">
            <Form.Item
                name="sourceMethod"
                label="HTTP Method"
                initialValue="GET"
            >
                <Select style={{ width: 120 }}>
                    <Option value="GET">GET</Option>
                    <Option value="POST">POST</Option>
                    <Option value="PUT">PUT</Option>
                    <Option value="PATCH">PATCH</Option>
                    <Option value="DELETE">DELETE</Option>
                </Select>
            </Form.Item>

            <Tabs defaultActiveKey="queryParams" type="card" items={tabItems} />

            {/* TOTP Options */}
            <TOTPOptions form={form} />

            {/* JSON Filter */}
            <JsonFilter
                enabled={jsonFilterEnabled}
                onChange={handleJsonFilterToggle}
            />

            {/* Auto-Refresh Options */}
            <Card
                title="Auto-Refresh Options"
                size="small"
                style={{ marginTop: 16, marginBottom: 16 }}
            >
                <Form.Item
                    name={['refreshOptions', 'enabled']}
                    label="Auto-Refresh"
                    valuePropName="checked"
                    initialValue={false}
                >
                    <Switch
                        onChange={handleRefreshToggle}
                        checked={refreshEnabled}
                        checkedChildren="Enabled"
                        unCheckedChildren="Disabled"
                    />
                </Form.Item>

                {refreshEnabled && (
                    <>
                        <Form.Item
                            name={['refreshOptions', 'type']}
                            initialValue="preset"
                        >
                            <Radio.Group
                                onChange={handleRefreshTypeChange}
                                value={refreshType}
                            >
                                <Radio value="preset">Use preset interval</Radio>
                                <Radio value="custom">Custom interval</Radio>
                            </Radio.Group>
                        </Form.Item>

                        {refreshType === 'preset' ? (
                            <Form.Item
                                name={['refreshOptions', 'interval']}
                                label="Refresh Interval"
                                initialValue={15}
                            >
                                <Select onChange={handlePresetIntervalChange}>
                                    <Option value={1}>Every 1 minute</Option>
                                    <Option value={5}>Every 5 minutes</Option>
                                    <Option value={15}>Every 15 minutes</Option>
                                    <Option value={30}>Every 30 minutes</Option>
                                    <Option value={60}>Every hour</Option>
                                    <Option value={120}>Every 2 hours</Option>
                                    <Option value={360}>Every 6 hours</Option>
                                    <Option value={720}>Every 12 hours</Option>
                                    <Option value={1440}>Every 24 hours</Option>
                                </Select>
                            </Form.Item>
                        ) : (
                            <Form.Item
                                name={['refreshOptions', 'interval']}
                                label="Custom Interval (minutes)"
                                initialValue={15}
                                help="Enter a custom refresh interval in minutes"
                            >
                                <InputNumber
                                    min={1}
                                    max={10080} // 7 days in minutes
                                    value={customInterval}
                                    onChange={handleCustomIntervalChange}
                                    style={{ width: '100%' }}
                                />
                            </Form.Item>
                        )}
                    </>
                )}
            </Card>

            {/* Test Button */}
            <Button
                type="primary"
                onClick={handleTestRequest}
                loading={testing}
            >
                Test Request
            </Button>

            {/* Test Response */}
            {testResponseVisible && (
                <Card
                    title="Response Preview"
                    size="small"
                    style={{ marginTop: 16 }}
                >
                    <pre style={{
                        maxHeight: 220,
                        overflow: 'auto',
                        background: '#fafafa',
                        padding: 8,
                        fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
                        fontSize: 12,
                        borderRadius: 6,
                        border: '1px solid #f0f0f0'
                    }}>
                        {testResponseContent}
                    </pre>
                </Card>
            )}
        </div>
    );
};

export default HttpOptions;