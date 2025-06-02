import React, { useState, useEffect } from 'react';
import { Modal, Form, Switch, Divider, Button, Row, Col, Typography, Space, Tooltip, Select } from 'antd';
import {
    LoginOutlined,
    EyeInvisibleOutlined,
    AppstoreOutlined,
    MenuOutlined,
    BgColorsOutlined,
    SyncOutlined,
    SunOutlined,
    MoonOutlined
} from '@ant-design/icons';
import { useTheme, THEME_MODES } from '../contexts/ThemeContext';
const { createLogger } = require('../utils/logger');
const log = createLogger('SettingsModal');

const { Text } = Typography;

/**
 * SettingsModal component styled to closely match macOS system preferences
 * with proper state-dependent styling and functionality
 */
const SettingsModal = ({ open, settings, onCancel, onSave }) => {
    const [form] = Form.useForm();
    const [formValues, setFormValues] = useState(settings || {});
    const { themeMode } = useTheme();

    // When settings or visibility change, update form values
    useEffect(() => {
        if (open && settings) {
            form.setFieldsValue({
                ...settings,
                theme: themeMode // Add current theme mode
            });
            setFormValues({
                ...settings,
                theme: themeMode
            });
        }
    }, [open, settings, form, themeMode]);

    // Track form value changes and enforce dependencies
    const handleValuesChange = (changedValues, allValues) => {
        // If "Open at login" is turned off, also disable "Hide on start"
        if (changedValues.hasOwnProperty('launchAtLogin') && !changedValues.launchAtLogin) {
            form.setFieldValue('hideOnLaunch', false);
            allValues.hideOnLaunch = false;
        }

        setFormValues(allValues);
    };

    // Handle form submission
    const handleSubmit = () => {
        form.validateFields()
            .then(async values => {
                // Enforce dependency rule: if launchAtLogin is false, hideOnLaunch must be false
                if (!values.launchAtLogin) {
                    values.hideOnLaunch = false;
                }
                
                // Pass all values including theme to settings save
                onSave(values);
            })
            .catch(info => {
                log.debug('Validation failed:', info);
            });
    };

    // Section title style
    const sectionStyle = {
        fontSize: 13,
        fontWeight: 600,
        color: '#1d1d1f',
        marginBottom: 16,
        marginTop: 8,
    };

    // Get option state style based on toggle value
    const getOptionStyle = (isActive) => {
        return {
            marginBottom: 20,
            transition: 'opacity 0.2s ease',
            opacity: isActive ? 1 : 0.6,
        };
    };

    // Get label style based on toggle state
    const getLabelStyle = (isActive) => {
        return {
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s ease',
            color: isActive ? '#1d1d1f' : '#86868b',
        };
    };

    // Get icon style based on toggle state
    const getIconStyle = (isActive) => {
        return {
            marginRight: 8,
            color: isActive ? '#0071e3' : '#86868b',
            transition: 'color 0.2s ease',
        };
    };

    // Description style with conditional opacity
    const getDescStyle = (isActive) => {
        return {
            fontSize: 12,
            color: isActive ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.3)',
            marginTop: 4,
            transition: 'color 0.2s ease',
        };
    };

    // Calculate dependent option states
    const canHideOnLaunch = formValues.launchAtLogin;

    return (
        <Modal
            title="Settings"
            open={open}
            onCancel={onCancel}
            width={500}
            className="settings-modal"
            footer={[
                <Button key="cancel" onClick={onCancel}>
                    Cancel
                </Button>,
                <Button key="save" type="primary" onClick={handleSubmit}>
                    Save
                </Button>
            ]}
            centered
            styles={{
                body: {
                    padding: '20px 24px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif'
                }
            }}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    launchAtLogin: false,
                    hideOnLaunch: false,
                    showDockIcon: true,
                    showStatusBarIcon: true
                }}
                onValuesChange={handleValuesChange}
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
            >
                <div style={sectionStyle}>General</div>

                <Row style={getOptionStyle(true)} align="middle" justify="space-between">
                    <Col span={16}>
                        <div style={getLabelStyle(formValues.launchAtLogin)}>
                            <LoginOutlined style={getIconStyle(formValues.launchAtLogin)} />
                            <Space direction="vertical" size={0}>
                                <span>Open at login</span>
                                <span style={getDescStyle(formValues.launchAtLogin)}>Start automatically when you log in</span>
                            </Space>
                        </div>
                    </Col>
                    <Col span={8} style={{ textAlign: 'right' }}>
                        <Form.Item name="launchAtLogin" valuePropName="checked" noStyle>
                            <Switch />
                        </Form.Item>
                    </Col>
                </Row>

                <Tooltip title={!canHideOnLaunch ? "Enable 'Open at login' to use this option" : ""}>
                    <Row style={getOptionStyle(canHideOnLaunch)} align="middle" justify="space-between">
                        <Col span={16}>
                            <div style={getLabelStyle(canHideOnLaunch && formValues.hideOnLaunch)}>
                                <EyeInvisibleOutlined style={getIconStyle(canHideOnLaunch && formValues.hideOnLaunch)} />
                                <Space direction="vertical" size={0}>
                                    <span>Hide on start</span>
                                    <span style={getDescStyle(canHideOnLaunch && formValues.hideOnLaunch)}>Start automatically in background mode</span>
                                </Space>
                            </div>
                        </Col>
                        <Col span={8} style={{ textAlign: 'right' }}>
                            <Form.Item name="hideOnLaunch" valuePropName="checked" noStyle>
                                <Switch disabled={!canHideOnLaunch} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Tooltip>

                <Divider style={{ margin: '8px 0 16px 0' }} />

                <div style={sectionStyle}>Appearance</div>

                <Row style={getOptionStyle(true)} align="middle" justify="space-between">
                    <Col span={16}>
                        <div style={getLabelStyle(formValues.showDockIcon)}>
                            <AppstoreOutlined style={getIconStyle(formValues.showDockIcon)} />
                            <Space direction="vertical" size={0}>
                                <span>Show in Dock</span>
                                <span style={getDescStyle(formValues.showDockIcon)}>Display app icon in the Dock (MacOS)</span>
                            </Space>
                        </div>
                    </Col>
                    <Col span={8} style={{ textAlign: 'right' }}>
                        <Form.Item name="showDockIcon" valuePropName="checked" noStyle>
                            <Switch />
                        </Form.Item>
                    </Col>
                </Row>

                <Row style={getOptionStyle(true)} align="middle" justify="space-between">
                    <Col span={16}>
                        <div style={getLabelStyle(formValues.showStatusBarIcon)}>
                            <MenuOutlined style={getIconStyle(formValues.showStatusBarIcon)} />
                            <Space direction="vertical" size={0}>
                                <span>Show in menu bar</span>
                                <span style={getDescStyle(formValues.showStatusBarIcon)}>Display app icon in the system tray/menu bar</span>
                            </Space>
                        </div>
                    </Col>
                    <Col span={8} style={{ textAlign: 'right' }}>
                        <Form.Item name="showStatusBarIcon" valuePropName="checked" noStyle>
                            <Switch />
                        </Form.Item>
                    </Col>
                </Row>

                <Row style={getOptionStyle(true)} align="middle" justify="space-between">
                    <Col span={16}>
                        <div style={getLabelStyle(true)}>
                            <BgColorsOutlined style={getIconStyle(true)} />
                            <Space direction="vertical" size={0}>
                                <span>Theme</span>
                                <span style={getDescStyle(true)}>Choose your preferred theme</span>
                            </Space>
                        </div>
                    </Col>
                    <Col span={8} style={{ textAlign: 'right' }}>
                        <Form.Item name="theme" noStyle>
                            <Select 
                                style={{ width: 120 }}
                                options={[
                                    { 
                                        value: THEME_MODES.AUTO, 
                                        label: (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <SyncOutlined style={{ fontSize: 12 }} />
                                                <span>Auto</span>
                                            </div>
                                        )
                                    },
                                    { 
                                        value: THEME_MODES.LIGHT, 
                                        label: (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <SunOutlined style={{ fontSize: 12 }} />
                                                <span>Light</span>
                                            </div>
                                        )
                                    },
                                    { 
                                        value: THEME_MODES.DARK, 
                                        label: (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <MoonOutlined style={{ fontSize: 12 }} />
                                                <span>Dark</span>
                                            </div>
                                        )
                                    }
                                ]}
                            />
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </Modal>
    );
};

export default SettingsModal;