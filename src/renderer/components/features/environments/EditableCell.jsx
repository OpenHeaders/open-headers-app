/**
 * Editable table cell component for inline variable editing
 * Supports different input types based on the data being edited
 */

import React, { forwardRef } from 'react';
import { Form, Input, Radio } from 'antd';
import { VARIABLE_NAME_RULES } from './EnvironmentTypes';
import SecretInput from './SecretInput';

const { TextArea } = Input;

/**
 * Dynamic value input that switches between TextArea and SecretInput based on isSecret
 */
const DynamicValueInput = forwardRef((props, ref) => {
  const form = Form.useFormInstance();
  const isSecret = Form.useWatch('isSecret', form);
  
  if (isSecret) {
    return <SecretInput ref={ref} useGlobalPreference="edit" showButton={true} {...props} />;
  }
  
  return (
    <TextArea
      ref={ref}
      placeholder="Enter value"
      autoSize={{ minRows: 1, maxRows: 14 }}
      {...props}
    />
  );
});

/**
 * EditableCell component for inline editing in the variables table
 * @param {Object} props - Component props
 * @param {boolean} props.editing - Whether the cell is in edit mode
 * @param {string} props.dataIndex - The data field being edited
 * @param {string} props.title - Column title for validation messages
 * @param {string} props.inputType - Type of input (text, password, radio)
 * @param {Object} props.record - Current record data
 * @param {number} props.index - Row index
 * @param {React.ReactNode} props.children - Child elements to render when not editing
 * @param {Object} restProps - Additional props to pass to the td element
 */
const EditableCell = ({
  editing,
  dataIndex,
  title,
  inputType,
  record,
  index,
  children,
  ...restProps
}) => {
  /**
   * Renders the appropriate input component based on input type
   */
  const renderInputNode = () => {
    switch (inputType) {
      case 'dynamic':
        // For value field that needs to respond to isSecret changes
        return <DynamicValueInput />;
      case 'password':
        return <SecretInput useGlobalPreference="edit" showButton={true} />;
      case 'radio':
        return (
          <Radio.Group>
            <Radio value={false}>Default</Radio>
            <Radio value={true}>Secret</Radio>
          </Radio.Group>
        );
      default:
        return (
          <TextArea
            placeholder="Enter value"
            autoSize={{ minRows: 1, maxRows: 14 }}
          />
        );
    }
  };

  /**
   * Gets validation rules based on the field being edited
   */
  const getValidationRules = () => {
    const rules = [];
    
    // All fields except isSecret are required
    if (dataIndex !== 'isSecret') {
      rules.push({
        required: true,
        message: `Please Input ${title}!`,
      });
    }
    
    // Variable name has specific pattern requirements
    if (dataIndex === 'name') {
      rules.push(VARIABLE_NAME_RULES[1]); // Pattern rule
    }
    
    return rules;
  };

  return (
    <td {...restProps}>
      {editing ? (
        <Form.Item
          name={dataIndex}
          style={{ margin: 0 }}
          rules={getValidationRules()}
        >
          {renderInputNode()}
        </Form.Item>
      ) : (
        children
      )}
    </td>
  );
};

export default EditableCell;