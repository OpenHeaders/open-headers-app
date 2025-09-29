/**
 * Modal components for environment and variable management
 * Includes create environment and add variable modals
 */

import React from 'react';
import { Modal, Form, Input, Radio } from 'antd';
import { 
  ENVIRONMENT_NAME_RULES, 
  VARIABLE_NAME_RULES, 
  VARIABLE_VALUE_RULES 
} from './EnvironmentTypes';
import SecretInput from './SecretInput';

const { TextArea } = Input;

/**
 * Modal for creating new environments
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Modal visibility
 * @param {Function} props.onCancel - Cancel callback
 * @param {Function} props.onOk - Confirm callback
 * @param {Object} props.form - Ant Design form instance
 */
export const CreateEnvironmentModal = ({ visible, onCancel, onOk, form }) => (
  <Modal
    title="Create New Environment"
    open={visible}
    onOk={onOk}
    onCancel={onCancel}
  >
    <Form form={form} layout="vertical">
      <Form.Item
        name="name"
        label="Environment Name"
        rules={ENVIRONMENT_NAME_RULES}
      >
        <Input placeholder="e.g., dev, qa, prod" />
      </Form.Item>
    </Form>
  </Modal>
);

/**
 * Modal for adding new global variables
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Modal visibility
 * @param {Function} props.onCancel - Cancel callback
 * @param {Function} props.onOk - Confirm callback
 * @param {Object} props.form - Ant Design form instance
 */
export const AddVariableModal = ({ visible, onCancel, onOk, form }) => (
  <Modal
    title="Add Variable"
    open={visible}
    onOk={onOk}
    onCancel={onCancel}
    width={480}
  >
    <Form 
      form={form} 
      layout="horizontal" 
      initialValues={{ isSecret: false }}
      labelCol={{ span: 4 }}
      wrapperCol={{ span: 20 }}
      labelAlign="left"
    >
      <Form.Item
        name="name"
        label="Name"
        rules={VARIABLE_NAME_RULES}
      >
        <TextArea placeholder="e.g., API_URL, AUTH_TOKEN" autoSize={{ minRows: 1, maxRows: 3 }} />
      </Form.Item>
      
      <Form.Item
        noStyle
        shouldUpdate={(prevValues, currentValues) => prevValues.isSecret !== currentValues.isSecret}
      >
        {({ getFieldValue }) => {
          const isSecret = getFieldValue('isSecret');
          
          return (
            <Form.Item
              name="value"
              label="Value"
              rules={VARIABLE_VALUE_RULES}
            >
              {isSecret ? (
                <SecretInput showButton={true} useGlobalPreference="modal" />
              ) : (
                <TextArea
                  placeholder="Enter value"
                  autoSize={{ minRows: 1, maxRows: 14 }}
                />
              )}
            </Form.Item>
          );
        }}
      </Form.Item>
      
      <Form.Item
        name="isSecret"
        label="Type"
      >
        <Radio.Group>
          <Radio value={false}>Default</Radio>
          <Radio value={true}>Secret</Radio>
        </Radio.Group>
      </Form.Item>
    </Form>
  </Modal>
);