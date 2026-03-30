/**
 * Modal for editing workflow recording tag with optional URL
 * Allows users to add a tag name and associate it with a URL (e.g., JIRA ticket)
 */

import { LinkOutlined, TagOutlined } from '@ant-design/icons';
import { Form, Input, Modal, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { WorkflowTag } from '@/types/recording';

const { Text } = Typography;

interface EditTagModalProps {
  visible: boolean;
  recordId: string;
  recordUrl: string;
  currentTag: string | WorkflowTag;
  onSave: (tag: { name: string; url: string } | null) => Promise<void>;
  onCancel: () => void;
}

// Parse tag data - always object with name/url
const getTagData = (tag: string | WorkflowTag | null) => {
  if (!tag) return { name: '', url: '' };
  if (typeof tag === 'string') return { name: tag, url: '' };
  return { name: tag.name || '', url: tag.url || '' };
};

const EditTagModal = ({ visible, recordId: _recordId, recordUrl, currentTag, onSave, onCancel }: EditTagModalProps) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // Reset form when modal opens with current tag
  useEffect(() => {
    if (visible) {
      const tagData = getTagData(currentTag);
      form.setFieldsValue({
        tagName: tagData.name,
        tagUrl: tagData.url,
      });
    }
  }, [visible, currentTag, form]);

  const handleOk = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();

      // Auto-prepend https:// if URL is provided without scheme
      let finalUrl = values.tagUrl || '';
      if (finalUrl && !finalUrl.match(/^https?:\/\//)) {
        finalUrl = `https://${finalUrl}`;
      }

      // Save as object if either field has value, null if both empty
      const tagValue = values.tagName || finalUrl ? { name: values.tagName || '', url: finalUrl } : null;

      await onSave(tagValue);
      form.resetFields();
    } catch (error) {
      console.error('Failed to save tag:', error);
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
          <TagOutlined style={{ marginRight: 8 }} />
          Edit Tag
        </span>
      }
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={600}
      okText="Save"
      cancelText="Cancel"
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">Recording: </Text>
        <Text ellipsis style={{ maxWidth: 500 }}>
          {recordUrl}
        </Text>
      </div>

      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          name="tagName"
          label="Tag Name"
          dependencies={['tagUrl']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value) {
                const url = getFieldValue('tagUrl');
                if (url && !value) {
                  return Promise.reject(new Error('Tag name is required when URL is provided'));
                }
                return Promise.resolve();
              },
            }),
            { max: 50, message: 'Tag name must be less than 50 characters' },
          ]}
        >
          <Input prefix={<TagOutlined />} placeholder="e.g., JIRA-1234, Bug Fix, Feature" maxLength={50} />
        </Form.Item>

        <Form.Item
          name="tagUrl"
          label={
            <Space>
              <span>Associated URL</span>
              <Text type="secondary">(Optional)</Text>
            </Space>
          }
          help="Link to JIRA ticket, GitHub issue, documentation, etc. (https:// will be added automatically if needed)"
          rules={[
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();

                // Allow URLs with or without protocol
                const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
                if (urlPattern.test(value)) {
                  return Promise.resolve();
                }

                return Promise.reject(new Error('Please enter a valid URL (e.g., jira.company.com/PROJ-123)'));
              },
            },
          ]}
        >
          <Input prefix={<LinkOutlined />} placeholder="e.g., jira.company.com/browse/PROJ-123" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EditTagModal;
