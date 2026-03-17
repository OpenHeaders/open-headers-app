import React from 'react';
import { Form, Input, Row, Col, Checkbox } from 'antd';
import HttpOptions from '../../sources/HttpOptions';
import { validateEnvironmentVariables, validateTotpCodePlaceholder } from './form-validation';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('EditSourceForm');

/**
 * EditSourceForm component handles the form fields for editing an HTTP source
 * Separated from main modal for better modularity and maintainability
 */
const EditSourceForm = ({
    form,
    source,
    envContext,
    totpEnabled,
    totpSecret,
    refreshNow,
    refreshingSourceId,
    saving,
    onFormChange,
    onTotpChange,
    onTestResponse,
    onTestingChange,
    onRefreshNowChange,
    onGetHttpOptionsRef
}) => {
    /**
     * URL field validator that checks for environment variables and TOTP codes
     * @param {Object} _ - Rule object (unused)
     * @param {string} value - URL value to validate
     * @returns {Promise} - Validation result
     */
    const validateUrl = async (_, value) => {
        log.debug('URL validator called with value:', value);
        
        try {
            await validateEnvironmentVariables(value, envContext);
            await validateTotpCodePlaceholder(value, form);
            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
        }
    };

    return (
        <Form
            form={form}
            layout="vertical"
            preserve={false}
            onValuesChange={onFormChange}
        >
            {/* URL and Tag fields in a compact row */}
            <Row gutter={16}>
                <Col span={16}>
                    <Form.Item
                        label="URL"
                        name="sourcePath"
                        validateTrigger={['onChange', 'onBlur']}
                        validateFirst
                        rules={[
                            { required: true, message: 'Please enter a URL' },
                            { validator: validateUrl }
                        ]}
                    >
                        <Input placeholder="Enter URL (e.g., https://example.com)" />
                    </Form.Item>
                </Col>
                <Col span={8}>
                    <Form.Item
                        label="Tag (optional)"
                        name="sourceTag"
                    >
                        <Input placeholder="Enter a tag" />
                    </Form.Item>
                </Col>
            </Row>

            {/* Hidden form field to preserve sourceType */}
            <Form.Item
                name="sourceType"
                hidden={true}
            >
                <Input type="hidden" />
            </Form.Item>

            {/* Hidden fields for TOTP state */}
            <Form.Item name="enableTOTP" hidden={true}>
                <Input type="hidden" />
            </Form.Item>
            <Form.Item name="totpSecret" hidden={true}>
                <Input type="hidden" />
            </Form.Item>

            {/* HTTP-specific options */}
            <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                    HTTP Options
                </label>
                <HttpOptions
                    ref={onGetHttpOptionsRef}
                    form={form}
                    sourceId={source.sourceId}
                    onTestResponse={onTestResponse}
                    onTotpChange={onTotpChange}
                    initialTotpEnabled={totpEnabled}
                    initialTotpSecret={totpSecret}
                    onTestingChange={onTestingChange}
                />
            </div>

            {/* Refresh immediately checkbox - only show when auto-refresh is enabled */}
            <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => 
                    prevValues.refreshOptions?.enabled !== currentValues.refreshOptions?.enabled
                }
            >
                {({ getFieldValue }) => {
                    const autoRefreshEnabled = getFieldValue(['refreshOptions', 'enabled']);
                    return autoRefreshEnabled ? (
                        <Checkbox
                            checked={refreshNow}
                            onChange={onRefreshNowChange}
                            style={{ marginTop: 16 }}
                            disabled={saving || refreshingSourceId === source.sourceId}
                        >
                            Refresh immediately after saving
                        </Checkbox>
                    ) : null;
                }}
            </Form.Item>
        </Form>
    );
};

export default EditSourceForm;