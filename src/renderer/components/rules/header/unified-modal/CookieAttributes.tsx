import React from 'react';
import {
    Form,
    Input,
    Select,
    Button,
    Space,
    Typography,
    Alert,
    Tooltip,
    DatePicker,
    InputNumber,
    Switch,
    Divider
} from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

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
    { label: '1 Year', value: 365, unit: 'days' }
];

const CookieAttributes = ({
    headerType,
    expirationMode,
    setExpirationMode,
    sameSite,
    setSameSite,
    secure,
    setSecure,
    httpOnly,
    setHttpOnly,
    form
}) => {
    // Handle expiration preset selection
    const handleExpirationPreset = (preset) => {
        setExpirationMode('maxAge');
        const seconds = preset.unit === 'hours' 
            ? preset.value * 3600 
            : preset.value * 86400;
        form.setFieldsValue({ maxAge: seconds });
    };

    return (
        <>
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
                                        {EXPIRATION_PRESETS.map(preset => (
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
        </>
    );
};

export default CookieAttributes;