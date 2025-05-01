import React from 'react';
import { Modal, Form, Checkbox, Divider, Button, Space } from 'antd';

/**
 * SettingsModal component for application settings
 */
const SettingsModal = ({ open, settings, onCancel, onSave }) => {
    const [form] = Form.useForm();

    // When settings or visibility change, update form values
    React.useEffect(() => {
        if (open && settings) {
            form.setFieldsValue(settings);
        }
    }, [open, settings, form]);

    // Handle form submission
    const handleSubmit = () => {
        form.validateFields()
            .then(values => {
                onSave(values);
            })
            .catch(info => {
                console.log('Validation failed:', info);
            });
    };

    return (
        <Modal
            title="Application Settings"
            open={open}
            onCancel={onCancel}
            footer={[
                <Button key="cancel" onClick={onCancel}>
                    Cancel
                </Button>,
                <Button key="save" type="primary" onClick={handleSubmit}>
                    Save
                </Button>
            ]}
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
            >
                <Divider orientation="left">Startup Options</Divider>
                <Form.Item
                    name="launchAtLogin"
                    valuePropName="checked"
                >
                    <Checkbox>Launch at login</Checkbox>
                </Form.Item>
                <Form.Item
                    name="hideOnLaunch"
                    valuePropName="checked"
                >
                    <Checkbox>Hide window on startup</Checkbox>
                </Form.Item>

                <Divider orientation="left">Appearance</Divider>
                <Form.Item
                    name="showDockIcon"
                    valuePropName="checked"
                >
                    <Checkbox>Show Dock icon (macOS only)</Checkbox>
                </Form.Item>
                <Form.Item
                    name="showStatusBarIcon"
                    valuePropName="checked"
                >
                    <Checkbox>Show tray icon</Checkbox>
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default SettingsModal;