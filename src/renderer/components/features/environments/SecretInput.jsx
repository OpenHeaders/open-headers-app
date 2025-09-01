/**
 * Reusable secret input component with visibility toggle
 * Provides consistent UI for entering and masking secret values
 */

import React, { useState, useEffect, forwardRef } from 'react';
import { Input, Button } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';

const { TextArea } = Input;

// Global preferences for showing secrets (reset on app restart)
let globalShowSecretsInEditMode = true;
let globalShowSecretsInModal = true;

/**
 * SecretInput - A reusable component for secret/password inputs with visibility toggle
 * @param {Object} props - Component props
 * @param {string} props.value - Input value
 * @param {Function} props.onChange - Change handler
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.showButton - Whether to show the Show/Hide button (default: false)
 * @param {boolean|string} props.useGlobalPreference - Whether to use global preference ('edit', 'modal', or false) (default: false)
 * @param {Object} props.autoSize - AutoSize configuration for TextArea
 * @param {Object} props.style - Additional styles
 * @param {Object} restProps - Additional props to pass to TextArea
 */
const SecretInput = forwardRef(({ 
  value, 
  onChange, 
  placeholder = "Enter value",
  showButton = false,
  useGlobalPreference = false,
  autoSize = { minRows: 1, maxRows: 14 },
  style = {},
  ...restProps 
}, ref) => {
  const getInitialVisibility = () => {
    if (useGlobalPreference === 'edit') return globalShowSecretsInEditMode;
    if (useGlobalPreference === 'modal') return globalShowSecretsInModal;
    return true;
  };
  
  const [showPassword, setShowPassword] = useState(getInitialVisibility());
  const [internalValue, setInternalValue] = useState(value || '');
  
  // Update internal value when prop value changes
  useEffect(() => {
    setInternalValue(value || '');
  }, [value]);
  
  const handleChange = (e) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    if (onChange) {
      onChange(e);
    }
  };
  
  const toggleVisibility = () => {
    const newValue = !showPassword;
    setShowPassword(newValue);
    
    // Update global preference if enabled
    if (useGlobalPreference === 'edit') {
      globalShowSecretsInEditMode = newValue;
    } else if (useGlobalPreference === 'modal') {
      globalShowSecretsInModal = newValue;
    }
  };
  
  const inputElement = (
    <div style={{ position: 'relative', flex: showButton ? 1 : undefined }}>
      <TextArea
        ref={ref}
        value={showPassword ? internalValue : '••••••••'}
        onChange={showPassword ? handleChange : undefined}
        placeholder={placeholder}
        autoSize={autoSize}
        style={{
          paddingRight: '30px',
          fontFamily: !showPassword ? 'monospace' : 'inherit',
          ...style
        }}
        readOnly={!showPassword}
        {...restProps}
      />
      <span
        style={{
          position: 'absolute',
          right: '8px',
          top: '4px',
          cursor: 'pointer',
          color: 'rgba(0, 0, 0, 0.45)',
          zIndex: 1
        }}
        onClick={toggleVisibility}
      >
        {showPassword ? <EyeOutlined /> : <EyeInvisibleOutlined />}
      </span>
    </div>
  );
  
  if (showButton) {
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        {inputElement}
        <Button
          size="small"
          onClick={toggleVisibility}
          style={{ width: 60 }}
        >
          {showPassword ? 'Hide' : 'Show'}
        </Button>
      </div>
    );
  }
  
  return inputElement;
});

SecretInput.displayName = 'SecretInput';

export default SecretInput;