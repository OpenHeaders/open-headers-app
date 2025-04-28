import React, { useState, useEffect } from 'react';
import { Tabs, Form, Input, Select, Button, Card, Space, Radio, InputNumber, Switch, Row, Col } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useHttp } from '../hooks/useHttp';
import JsonFilter from './JsonFilter';
import TOTPOptions from './TOTPOptions';
import { showMessage } from '../utils/messageUtil';

const { Option } = Select;
const { TextArea } = Input;

/**
 * HttpOptions component for configuring HTTP requests with compact layout
 */
const HttpOptions = ({ form, onTestResponse }) => {
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

    // Helper function to get status text based on status code
    const getStatusText = (statusCode) => {
        const statusTexts = {
            // 1xx - Informational
            100: 'Continue',
            101: 'Switching Protocols',
            102: 'Processing',
            103: 'Early Hints',

            // 2xx - Success
            200: 'OK',
            201: 'Created',
            202: 'Accepted',
            203: 'Non-Authoritative Information',
            204: 'No Content',
            205: 'Reset Content',
            206: 'Partial Content',
            207: 'Multi-Status',
            208: 'Already Reported',
            226: 'IM Used',

            // 3xx - Redirection
            300: 'Multiple Choices',
            301: 'Moved Permanently',
            302: 'Found',
            303: 'See Other',
            304: 'Not Modified',
            305: 'Use Proxy',
            307: 'Temporary Redirect',
            308: 'Permanent Redirect',

            // 4xx - Client Errors
            400: 'Bad Request',
            401: 'Unauthorized',
            402: 'Payment Required',
            403: 'Forbidden',
            404: 'Not Found',
            405: 'Method Not Allowed',
            406: 'Not Acceptable',
            407: 'Proxy Authentication Required',
            408: 'Request Timeout',
            409: 'Conflict',
            410: 'Gone',
            411: 'Length Required',
            412: 'Precondition Failed',
            413: 'Payload Too Large',
            414: 'URI Too Long',
            415: 'Unsupported Media Type',
            416: 'Range Not Satisfiable',
            417: 'Expectation Failed',
            418: "I'm a teapot",
            421: 'Misdirected Request',
            422: 'Unprocessable Entity',
            423: 'Locked',
            424: 'Failed Dependency',
            425: 'Too Early',
            426: 'Upgrade Required',
            428: 'Precondition Required',
            429: 'Too Many Requests',
            431: 'Request Header Fields Too Large',
            451: 'Unavailable For Legal Reasons',

            // 5xx - Server Errors
            500: 'Internal Server Error',
            501: 'Not Implemented',
            502: 'Bad Gateway',
            503: 'Service Unavailable',
            504: 'Gateway Timeout',
            505: 'HTTP Version Not Supported',
            506: 'Variant Also Negotiates',
            507: 'Insufficient Storage',
            508: 'Loop Detected',
            510: 'Not Extended',
            511: 'Network Authentication Required'
        };

        return statusTexts[statusCode] || 'Unknown Status';
    };

    // Helper function to format content based on content type
    const formatContentByType = (content, headers) => {
        if (!content) return "No content";

        try {
            // Check content type from headers
            const contentType = headers && headers['content-type'] ?
                headers['content-type'].toLowerCase() : '';

            // Format JSON
            if ((contentType.includes('application/json') || contentType.includes('json')) ||
                (typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('[')))) {
                try {
                    const jsonObject = typeof content === 'string' ? JSON.parse(content) : content;
                    return (
                        <div className="formatted-json">
                            {JSON.stringify(jsonObject, null, 2)}
                        </div>
                    );
                } catch (e) {
                    // If JSON parsing fails, display as plain text
                    return content;
                }
            }

            // Format HTML with syntax highlighting
            if (contentType.includes('html')) {
                return (
                    <div className="formatted-html">
                        {content}
                    </div>
                );
            }

            // Format XML with syntax highlighting
            if (contentType.includes('xml')) {
                return (
                    <div className="formatted-xml">
                        {content}
                    </div>
                );
            }

            // Plain text or other types
            return content;
        } catch (error) {
            return content;
        }
    };

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

    // Format response for display - Professional format
    const formatResponseForDisplay = (responseJson) => {
        try {
            const response = JSON.parse(responseJson);
            return response;
        } catch (error) {
            return {
                statusCode: 0,
                error: "Failed to parse response",
                body: responseJson || "No content"
            };
        }
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

    return (
        <div className="http-options">
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
                                    <TOTPOptions form={form} />
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

            {/* Test Response - Compact Professional UI */}
            {testResponseVisible && (
                <Card
                    title={
                        <div className="response-card-header">
                            <span>Response Preview</span>
                            {typeof testResponseContent === 'object' && testResponseContent.statusCode && (
                                <span className="status-display">
                                    Status Code <span className={`status-code status-${Math.floor(testResponseContent.statusCode / 100)}xx`}>
                                        {testResponseContent.statusCode} {getStatusText(testResponseContent.statusCode)}
                                    </span>
                                </span>
                            )}
                        </div>
                    }
                    size="small"
                    style={{ marginTop: 8 }}
                    className="response-preview-card"
                >
                    {typeof testResponseContent === 'object' ? (
                        <Tabs
                            defaultActiveKey="body"
                            size="small"
                            items={[
                                {
                                    key: 'body',
                                    label: 'Body',
                                    children: (
                                        <pre className="response-body">
                                            {(() => {
                                                try {
                                                    // Check if it's filterable JSON
                                                    if (testResponseContent.filteredWith) {
                                                        return (
                                                            <div>
                                                                <div className="filter-info">
                                                                    [Filtered with path: {testResponseContent.filteredWith}]
                                                                </div>
                                                                {formatContentByType(testResponseContent.body, testResponseContent.headers)}
                                                            </div>
                                                        );
                                                    }

                                                    // Standard body formatting
                                                    return formatContentByType(testResponseContent.body, testResponseContent.headers);
                                                } catch (e) {
                                                    return testResponseContent.body || "No body content";
                                                }
                                            })()}
                                        </pre>
                                    )
                                },
                                {
                                    key: 'headers',
                                    label: 'Headers',
                                    children: (
                                        <div className="response-headers">
                                            {testResponseContent.headers ? (
                                                <table className="headers-table">
                                                    <thead>
                                                    <tr>
                                                        <th>Name</th>
                                                        <th>Value</th>
                                                    </tr>
                                                    </thead>
                                                    <tbody>
                                                    {Object.entries(testResponseContent.headers).map(([key, value]) => (
                                                        <tr key={key}>
                                                            <td>{key}</td>
                                                            <td>{value}</td>
                                                        </tr>
                                                    ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="no-headers">No headers available</div>
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    key: 'raw',
                                    label: 'Raw',
                                    children: (
                                        <pre className="response-raw">
                                            {JSON.stringify(testResponseContent, null, 2)}
                                        </pre>
                                    )
                                }
                            ]}
                        />
                    ) : (
                        <pre className="response-error">
                            {testResponseContent}
                        </pre>
                    )}
                </Card>
            )}
        </div>
    );
};

export default HttpOptions;