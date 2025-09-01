/**
 * Modal for editing workflow recording description
 * Provides a text area for entering detailed multi-line descriptions
 */

import React, { useState, useEffect } from 'react';
import { Modal, Input, Form, Typography, Tag, Space, Button } from 'antd';
import { EditOutlined, EyeOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Text } = Typography;

/**
 * EditDescriptionModal component
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Whether modal is visible
 * @param {string} props.recordId - ID of the record being edited
 * @param {string} props.recordUrl - URL of the record for display
 * @param {Object} props.recordTag - Tag object of the record for display
 * @param {string} props.currentDescription - Current description value
 * @param {boolean} props.viewOnly - Whether modal is in view-only mode
 * @param {Function} props.onSave - Callback when saving description
 * @param {Function} props.onCancel - Callback when canceling
 */
const EditDescriptionModal = ({ 
    visible, 
    recordId,
    recordUrl,
    recordTag,
    currentDescription, 
    viewOnly = false,
    onSave, 
    onCancel 
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    // Reset form when modal opens with current description
    useEffect(() => {
        if (visible) {
            form.setFieldsValue({
                description: currentDescription || ''
            });
        }
    }, [visible, currentDescription, form]);

    const handleOk = async () => {
        try {
            setLoading(true);
            const values = await form.validateFields();
            await onSave(values.description || null);
            form.resetFields();
        } catch (error) {
            console.error('Failed to save description:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        form.resetFields();
        onCancel();
    };

    return (
        <Modal
            title={
                <span>
                    {viewOnly ? (
                        <>
                            <EyeOutlined style={{ marginRight: 8 }} />
                            View Description
                        </>
                    ) : (
                        <>
                            <EditOutlined style={{ marginRight: 8 }} />
                            Edit Description
                        </>
                    )}
                </span>
            }
            open={visible}
            onOk={viewOnly ? undefined : handleOk}
            onCancel={handleCancel}
            confirmLoading={loading}
            width={800}
            okText={viewOnly ? undefined : "Save"}
            cancelText={viewOnly ? "Close" : "Cancel"}
            footer={viewOnly ? [
                <Button key="close" onClick={handleCancel}>
                    Close
                </Button>
            ] : undefined}
        >
            <div style={{ marginBottom: 16 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                        <Text type="secondary">Recording: </Text>
                        <Text ellipsis style={{ maxWidth: 500 }}>{recordUrl}</Text>
                    </div>
                    {recordTag && recordTag.name && (
                        <div>
                            <Text type="secondary">Tag: </Text>
                            <Tag color="blue">{recordTag.name}</Tag>
                        </div>
                    )}
                </Space>
            </div>
            
            {viewOnly ? (
                <div>
                    <Text strong>Description:</Text>
                    <div style={{ 
                        marginTop: 8,
                        padding: 12,
                        backgroundColor: '#f5f5f5',
                        borderRadius: 4,
                        height: 400,
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }}>
                        {currentDescription || <Text type="secondary">No description available</Text>}
                    </div>
                </div>
            ) : (
                <Form
                    form={form}
                    layout="vertical"
                    autoComplete="off"
                >
                    <Form.Item
                        name="description"
                        label="Description"
                        help="Enter a description for this workflow recording. You can use multiple lines."
                    >
                        <TextArea
                            maxLength={1000}
                            showCount
                            placeholder="Describe what this recording captures, any important steps, context, or notes..."
                            style={{ 
                                height: 400,
                                resize: 'none'
                            }}
                        />
                    </Form.Item>
                </Form>
            )}
        </Modal>
    );
};

export default EditDescriptionModal;