/**
 * JWT Editor Modal - Two-pane editor for JWT tokens
 * Left pane: Decoded editable JSON
 * Right pane: Encoded JWT preview
 */

import React, { useState, useEffect } from 'react';
import { Modal, Row, Col, Input, Alert, Button, Space, Typography, Tag, Tooltip, message, Checkbox, Collapse, Select, Radio, Segmented, theme } from 'antd';
import { CopyOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, KeyOutlined, LockOutlined, CaretRightOutlined, EyeInvisibleOutlined, CodeOutlined, FileTextOutlined } from '@ant-design/icons';
import { 
  decodeJWT, 
  encodeJWT,
  signJWT,
  formatJSON, 
  validateJSON, 
  getJWTExpiration,
  JWT_CLAIM_DESCRIPTIONS 
} from '../../../utils/jwtUtils';

const { TextArea } = Input;
const { Title, Text } = Typography;
const { Panel } = Collapse;

/**
 * JWT Editor Modal Component
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Modal visibility
 * @param {string} props.variableName - Name of the variable being edited
 * @param {string} props.initialValue - Initial JWT token value
 * @param {boolean} props.isSecret - Whether the variable is a secret
 * @param {Function} props.onSave - Save callback with new token value and type
 * @param {Function} props.onCancel - Cancel callback
 */
const JWTEditorModal = ({ visible, variableName, initialValue, isSecret: initialIsSecret, onSave, onCancel }) => {
  const { token } = theme.useToken();
  const [decodedHeader, setDecodedHeader] = useState('');
  const [decodedPayload, setDecodedPayload] = useState('');
  const [signature, setSignature] = useState('');
  const [encodedToken, setEncodedToken] = useState('');
  const [error, setError] = useState(null);
  const [headerError, setHeaderError] = useState(null);
  const [payloadError, setPayloadError] = useState(null);
  const [expirationInfo, setExpirationInfo] = useState(null);
  const [isModified, setIsModified] = useState(false);
  const [originalToken, setOriginalToken] = useState('');
  const [useSecretKey, setUseSecretKey] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [signingError, setSigningError] = useState(null);
  const [algorithm, setAlgorithm] = useState('HS256');
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [variableType, setVariableType] = useState('default');
  const [editMode, setEditMode] = useState('decoded'); // 'decoded' or 'encoded'
  const [encodedInput, setEncodedInput] = useState('');
  const [encodedInputError, setEncodedInputError] = useState(null);

  // Initialize with decoded token
  useEffect(() => {
    if (visible && initialValue) {
      try {
        const decoded = decodeJWT(initialValue);
        setDecodedHeader(formatJSON(decoded.header));
        setDecodedPayload(formatJSON(decoded.payload));
        setSignature(decoded.signature);
        setEncodedToken(initialValue);
        setEncodedInput(initialValue);
        setOriginalToken(initialValue);
        setError(null);
        setHeaderError(null);
        setPayloadError(null);
        setEncodedInputError(null);
        setIsModified(false);
        setUseSecretKey(false);
        setSecretKey('');
        setSigningError(null);
        setEditMode('decoded');
        // Set algorithm from header if available
        setAlgorithm(decoded.header.alg || 'HS256');
        // Set variable type from props
        setVariableType(initialIsSecret ? 'secret' : 'default');
        
        // Check expiration
        const expInfo = getJWTExpiration(decoded.payload);
        setExpirationInfo(expInfo);
      } catch (err) {
        setError(err.message);
        // Still show the original token even if it can't be decoded
        setEncodedToken(initialValue);
        setEncodedInput(initialValue);
        setOriginalToken(initialValue);
        // Set variable type from props even on error
        setVariableType(initialIsSecret ? 'secret' : 'default');
        setEditMode('encoded'); // Switch to encoded mode if decode fails
      }
    }
  }, [visible, initialValue, initialIsSecret]);

  /**
   * Update the encoded token (with or without signing)
   */
  const updateEncodedToken = async (headerObj, payloadObj) => {
    try {
      let newToken;
      
      if (useSecretKey && secretKey) {
        // Sign with the provided secret
        newToken = await signJWT(headerObj, payloadObj, secretKey, algorithm);
        setEncodedToken(newToken);
        setSigningError(null);
      } else {
        // Use original signature
        newToken = encodeJWT(headerObj, payloadObj, signature);
        setEncodedToken(newToken);
      }
      
      // Check if we're back to the original token
      setIsModified(newToken !== originalToken);
    } catch (err) {
      setSigningError(err.message);
      // Still encode without signature as fallback
      const newToken = encodeJWT(headerObj, payloadObj, signature);
      setEncodedToken(newToken);
      // We're modified if there was an error but we have changes
      setIsModified(newToken !== originalToken);
    }
  };

  /**
   * Handle header changes
   */
  const handleHeaderChange = async (e) => {
    const newHeader = e.target.value;
    setDecodedHeader(newHeader);
    
    try {
      const headerObj = validateJSON(newHeader);
      const payloadObj = validateJSON(decodedPayload);
      await updateEncodedToken(headerObj, payloadObj);
      setHeaderError(null);
      setError(null);
    } catch (err) {
      setHeaderError(err.message);
      // Still mark as modified when there's an error
      setIsModified(true);
    }
  };

  /**
   * Handle payload changes
   */
  const handlePayloadChange = async (e) => {
    const newPayload = e.target.value;
    setDecodedPayload(newPayload);
    
    try {
      const headerObj = validateJSON(decodedHeader);
      const payloadObj = validateJSON(newPayload);
      await updateEncodedToken(headerObj, payloadObj);
      setPayloadError(null);
      setError(null);
      
      // Update expiration info
      const expInfo = getJWTExpiration(payloadObj);
      setExpirationInfo(expInfo);
    } catch (err) {
      setPayloadError(err.message);
      // Still mark as modified when there's an error
      setIsModified(true);
    }
  };

  /**
   * Handle secret key changes
   */
  const handleSecretKeyChange = async (e) => {
    const newSecret = e.target.value;
    setSecretKey(newSecret);
    
    if (useSecretKey) {
      try {
        const headerObj = validateJSON(decodedHeader);
        const payloadObj = validateJSON(decodedPayload);
        await updateEncodedToken(headerObj, payloadObj);
      } catch (err) {
        // Errors already handled in updateEncodedToken
      }
    }
  };

  /**
   * Handle toggle for using secret key
   */
  const handleUseSecretKeyToggle = async (checked) => {
    setUseSecretKey(checked);
    setSigningError(null);
    
    try {
      const headerObj = validateJSON(decodedHeader);
      const payloadObj = validateJSON(decodedPayload);
      await updateEncodedToken(headerObj, payloadObj);
    } catch (err) {
      // Errors already handled in updateEncodedToken
    }
  };

  /**
   * Handle algorithm change
   */
  const handleAlgorithmChange = async (value) => {
    setAlgorithm(value);
    
    // Update the header to reflect the new algorithm
    try {
      const headerObj = validateJSON(decodedHeader);
      headerObj.alg = value;
      setDecodedHeader(formatJSON(headerObj));
      
      if (useSecretKey && secretKey) {
        const payloadObj = validateJSON(decodedPayload);
        await updateEncodedToken(headerObj, payloadObj);
      }
    } catch (err) {
      // If there's an error parsing, just update the algorithm
      // The error will be shown in the header error field
    }
  };

  /**
   * Format JSON on blur for better readability
   */
  const formatOnBlur = (type) => {
    try {
      if (type === 'header') {
        const headerObj = validateJSON(decodedHeader);
        setDecodedHeader(formatJSON(headerObj));
        setHeaderError(null);
      } else if (type === 'payload') {
        const payloadObj = validateJSON(decodedPayload);
        setDecodedPayload(formatJSON(payloadObj));
        setPayloadError(null);
      }
    } catch (err) {
      // Keep the error already set
    }
  };

  /**
   * Handle encoded token input changes
   */
  const handleEncodedInputChange = (e) => {
    const newToken = e.target.value;
    setEncodedInput(newToken);
    setEncodedInputError(null);
    
    // Try to decode and update the decoded view
    try {
      const decoded = decodeJWT(newToken);
      setDecodedHeader(formatJSON(decoded.header));
      setDecodedPayload(formatJSON(decoded.payload));
      setSignature(decoded.signature);
      setEncodedToken(newToken);
      setError(null);
      setHeaderError(null);
      setPayloadError(null);
      
      // Update algorithm from header
      setAlgorithm(decoded.header.alg || 'HS256');
      
      // Check expiration
      const expInfo = getJWTExpiration(decoded.payload);
      setExpirationInfo(expInfo);
      
      // Mark as modified if different from original
      setIsModified(newToken !== originalToken);
    } catch (err) {
      setEncodedInputError(err.message);
      setEncodedToken(newToken);
      // Mark as modified since we have an invalid token
      setIsModified(true);
    }
  };

  /**
   * Handle mode switch
   */
  const handleModeSwitch = (mode) => {
    setEditMode(mode);
    
    // If switching to encoded mode, sync the encoded input with current encoded token
    if (mode === 'encoded') {
      setEncodedInput(encodedToken);
      setEncodedInputError(null);
    }
  };

  /**
   * Copy token to clipboard
   */
  const copyToClipboard = async () => {
    try {
      const tokenToCopy = editMode === 'encoded' ? encodedInput : encodedToken;
      await navigator.clipboard.writeText(tokenToCopy);
      message.success('JWT token copied to clipboard');
    } catch (error) {
      message.error('Failed to copy to clipboard');
    }
  };

  /**
   * Handle save
   */
  const handleSave = () => {
    if (editMode === 'decoded') {
      if (!headerError && !payloadError && encodedToken) {
        onSave(encodedToken, variableType === 'secret');
      }
    } else {
      // In encoded mode, save the encoded input if it's valid
      if (!encodedInputError && encodedInput) {
        onSave(encodedInput, variableType === 'secret');
      }
    }
  };

  /**
   * Render expiration status
   */
  const renderExpirationStatus = () => {
    if (!expirationInfo || !expirationInfo.hasExpiration) {
      return null;
    }

    const { isExpired, expiresAt } = expirationInfo;
    
    return (
      <Alert
        message={
          <Space>
            {isExpired ? (
              <>
                <CloseCircleOutlined />
                <Text strong>Token Expired</Text>
                <Text type="secondary">
                  Expired on {expiresAt.toLocaleString()}
                </Text>
              </>
            ) : (
              <>
                <CheckCircleOutlined />
                <Text strong>Token Valid</Text>
                <Text type="secondary">
                  Expires on {expiresAt.toLocaleString()}
                </Text>
              </>
            )}
          </Space>
        }
        type={isExpired ? 'error' : 'success'}
        showIcon={false}
        style={{ marginBottom: 16 }}
      />
    );
  };

  /**
   * Render common claims helper
   */
  const renderClaimsHelper = () => {
    try {
      const payload = validateJSON(decodedPayload);
      const commonClaims = Object.keys(payload)
        .filter(key => JWT_CLAIM_DESCRIPTIONS[key])
        .map(key => (
          <Tooltip key={key} title={JWT_CLAIM_DESCRIPTIONS[key]}>
            <Tag color="blue">{key}</Tag>
          </Tooltip>
        ));
      
      if (commonClaims.length > 0) {
        return (
          <div style={{ marginTop: 8, marginBottom: 24 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Claims: </Text>
            {commonClaims}
          </div>
        );
      }
    } catch {
      // Don't show claims if JSON is invalid
    }
    return null;
  };

  const hasErrors = editMode === 'decoded' 
    ? (headerError || payloadError || error)
    : (encodedInputError || error);

  return (
    <Modal
      title={
        <Space>
          <span>JWT Token Editor</span>
          <Tag color="purple">{variableName}</Tag>
          {isModified && <Tag color="orange">Modified</Tag>}
        </Space>
      }
      open={visible}
      onOk={handleSave}
      onCancel={onCancel}
      width="90vw"
      okText="Save"
      okButtonProps={{ 
        disabled: hasErrors,
        type: 'primary'
      }}
      centered
      bodyStyle={{ 
        height: 'calc(80vh - 110px)',
        overflow: 'hidden',
        padding: '16px 24px'
      }}
      style={{ 
        maxWidth: '1400px'
      }}
    >
      {error && (
        <Alert
          message="Initial JWT Decode Error"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16} style={{ height: '100%' }}>
        {/* Left Pane - Editable Area */}
        <Col span={14} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Space>
              <Title level={5} style={{ margin: 0 }}>Edit Mode:</Title>
              <Segmented
                value={editMode}
                onChange={handleModeSwitch}
                options={[
                  {
                    label: 'Decoded',
                    value: 'decoded',
                    icon: <CodeOutlined />
                  },
                  {
                    label: 'Encoded',
                    value: 'encoded',
                    icon: <FileTextOutlined />
                  }
                ]}
              />
            </Space>
            
            {/* Variable Type Selector */}
            <Space>
              <Text type="secondary">Env Var Type:</Text>
              <Radio.Group 
                value={variableType} 
                onChange={(e) => setVariableType(e.target.value)}
                size="small"
              >
                <Radio.Button value="default">Default</Radio.Button>
                <Radio.Button value="secret">
                  <Space size={4}>
                    <EyeInvisibleOutlined />
                    Secret
                  </Space>
                </Radio.Button>
              </Radio.Group>
            </Space>
          </div>
          
          {editMode === 'decoded' ? (
            <>
              {/* Header Editor - Collapsible */}
              <Collapse 
            defaultActiveKey={[]} 
            style={{ marginBottom: 16 }}
            expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
            onChange={(keys) => setHeaderExpanded(keys.includes('1'))}
          >
            <Panel 
              header={
                <Space>
                  <Text strong>Header</Text>
                  {headerError && (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      <WarningOutlined /> {headerError}
                    </Text>
                  )}
                </Space>
              } 
              key="1"
            >
              <TextArea
                value={decodedHeader}
                onChange={handleHeaderChange}
                onBlur={() => formatOnBlur('header')}
                placeholder="JWT Header (JSON)"
                autoSize={{ minRows: 3, maxRows: 6 }}
                style={{ 
                  fontFamily: 'monospace',
                  borderColor: headerError ? '#ff4d4f' : undefined
                }}
              />
            </Panel>
          </Collapse>

          {/* Payload Editor - Collapsible but expanded by default */}
          <Collapse 
            defaultActiveKey={['payload']} 
            expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
          >
            <Panel 
              header={
                <Space>
                  <Text strong>Payload</Text>
                  {payloadError && (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      <WarningOutlined /> {payloadError}
                    </Text>
                  )}
                </Space>
              } 
              key="payload"
            >
              <TextArea
                value={decodedPayload}
                onChange={handlePayloadChange}
                onBlur={() => formatOnBlur('payload')}
                placeholder="JWT Payload (JSON)"
                style={{ 
                  fontFamily: 'monospace',
                  borderColor: payloadError ? '#ff4d4f' : undefined,
                  height: headerExpanded ? 'calc(80vh - 480px)' : 'calc(80vh - 330px)',
                  minHeight: '180px',
                  maxHeight: '550px',
                  resize: 'none'
                }}
              />
            </Panel>
          </Collapse>
            </>
          ) : (
            /* Encoded Mode - Direct JWT Input */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Title level={5} style={{ marginBottom: 8 }}>Paste or Edit JWT Token</Title>
              <TextArea
                value={encodedInput}
                onChange={handleEncodedInputChange}
                placeholder="Paste your complete JWT token here (header.payload.signature)"
                style={{ 
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  borderColor: encodedInputError ? '#ff4d4f' : undefined,
                  minHeight: '200px'
                }}
              />
              {encodedInputError && (
                <Alert
                  message="JWT Parse Error"
                  description={encodedInputError}
                  type="error"
                  showIcon
                  style={{ marginTop: 8 }}
                />
              )}
              <Alert
                message="Direct Edit Mode"
                description="Paste a complete JWT token to decode and edit it. The decoded view will update automatically if the token is valid."
                type="info"
                showIcon
                style={{ marginTop: 8 }}
              />
            </div>
          )}
        </Col>

        {/* Right Pane - Preview and Options */}
        <Col span={10} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Fixed/Sticky Preview Section */}
          <div style={{ flexShrink: 0 }}>
            {/* Encoded JWT Preview Header - Sticky */}
            <Space style={{ 
              marginBottom: 8, 
              width: '100%', 
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              backgroundColor: token.colorBgContainer,
              zIndex: 1,
              paddingTop: 0
            }}>
              <Title level={5} style={{ marginTop: 0, marginBottom: 0 }}>Encoded JWT (Preview)</Title>
              <Tooltip title="Copy value of Encoded JWT">
                <Button
                  icon={<CopyOutlined />}
                  onClick={copyToClipboard}
                  size="small"
                >
                  Copy
                </Button>
              </Tooltip>
            </Space>
            
            {/* Preview Box - Fixed Height */}
            <div style={{ 
              height: '200px', 
              overflowY: 'auto',
              overflowX: 'hidden',
              border: `1px solid ${token.colorBorder}`,
              borderRadius: 4,
              padding: 8,
              backgroundColor: token.colorFillAlter,
              marginBottom: 8
            }}>
              {(() => {
                const displayToken = editMode === 'encoded' ? encodedInput : encodedToken;
                if (displayToken) {
                  return (
                    <div style={{ 
                      fontFamily: 'monospace',
                      fontSize: 12,
                      wordWrap: 'break-word',
                      wordBreak: 'break-all',
                      lineHeight: 1.5
                    }}>
                      {(() => {
                        const parts = displayToken.split('.');
                        if (parts.length === 3) {
                          return (
                            <>
                              <span style={{ color: '#d4380d' }}>{parts[0]}</span>
                              <span>.</span>
                              <span style={{ color: '#389e0d' }}>{parts[1]}</span>
                              <span>.</span>
                              <span style={{ color: '#1677ff' }}>{parts[2]}</span>
                            </>
                          );
                        }
                        return displayToken;
                      })()}
                    </div>
                  );
                } else {
                  return (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Encoded JWT will appear here
                    </Text>
                  );
                }
              })()}
            </div>

            {/* Token Structure - Inline */}
            <div style={{ 
              marginBottom: 16,
              fontSize: 12,
              fontFamily: 'monospace'
            }}>
              <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>Token Structure:</Text>
              <Text style={{ color: '#d4380d' }}>header</Text>
              <Text>.</Text>
              <Text style={{ color: '#389e0d' }}>payload</Text>
              <Text>.</Text>
              <Text style={{ color: '#1677ff' }}>signature</Text>
            </div>
          </div>

          {/* Scrollable Options Section */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            overflowX: 'hidden',
            minHeight: 0
          }}>
            {/* Expiration Status */}
            {renderExpirationStatus()}

            {/* Claims Helper */}
            {renderClaimsHelper() || <div style={{ marginBottom: 24 }} />}

            {/* Signature Section */}
            <div style={{ 
              padding: 12, 
              border: `1px solid ${token.colorBorder}`, 
              borderRadius: 4,
              backgroundColor: token.colorFillQuaternary,
              marginBottom: 16
            }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Checkbox 
                  checked={useSecretKey} 
                  onChange={(e) => handleUseSecretKeyToggle(e.target.checked)}
                >
                  <Space>
                    <KeyOutlined />
                    <Text strong>Sign with Secret Key (Optional)</Text>
                  </Space>
                </Checkbox>
                
                {useSecretKey && (
                  <>
                    <Select
                      value={algorithm}
                      onChange={handleAlgorithmChange}
                      style={{ width: '100%', marginTop: 8 }}
                      placeholder="Select signing algorithm"
                    >
                      <Select.OptGroup label="HMAC (Symmetric)">
                        <Select.Option value="HS256">HS256 (HMAC with SHA-256)</Select.Option>
                        <Select.Option value="HS384" disabled>HS384 (Coming Soon)</Select.Option>
                        <Select.Option value="HS512" disabled>HS512 (Coming Soon)</Select.Option>
                      </Select.OptGroup>
                      <Select.OptGroup label="RSA (Asymmetric)">
                        <Select.Option value="RS256">RS256 (RSA with SHA-256)</Select.Option>
                        <Select.Option value="RS384" disabled>RS384 (Coming Soon)</Select.Option>
                        <Select.Option value="RS512" disabled>RS512 (Coming Soon)</Select.Option>
                      </Select.OptGroup>
                      <Select.OptGroup label="ECDSA">
                        <Select.Option value="ES256" disabled>ES256 (Coming Soon)</Select.Option>
                        <Select.Option value="ES384" disabled>ES384 (Coming Soon)</Select.Option>
                        <Select.Option value="ES512" disabled>ES512 (Coming Soon)</Select.Option>
                      </Select.OptGroup>
                      <Select.OptGroup label="RSA-PSS">
                        <Select.Option value="PS256" disabled>PS256 (Coming Soon)</Select.Option>
                        <Select.Option value="PS384" disabled>PS384 (Coming Soon)</Select.Option>
                        <Select.Option value="PS512" disabled>PS512 (Coming Soon)</Select.Option>
                      </Select.OptGroup>
                    </Select>
                    
                    {algorithm.startsWith('RS') ? (
                      <TextArea
                        placeholder="Enter RSA private key (PEM format)&#10;-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                        value={secretKey}
                        onChange={handleSecretKeyChange}
                        autoSize={{ minRows: 4, maxRows: 8 }}
                        style={{ 
                          marginTop: 8,
                          fontFamily: 'monospace',
                          fontSize: 12
                        }}
                      />
                    ) : (
                      <Input.Password
                        placeholder="Enter secret key to sign the JWT"
                        value={secretKey}
                        onChange={handleSecretKeyChange}
                        prefix={<LockOutlined />}
                        style={{ marginTop: 8 }}
                      />
                    )}
                    
                    {signingError && (
                      <Alert
                        message="Signing Error"
                        description={signingError}
                        type="error"
                        showIcon
                        closable
                        style={{ marginTop: 8 }}
                      />
                    )}
                    {!signingError && secretKey && (
                      <Alert
                        message="Token will be re-signed"
                        description={`The JWT will be signed with your secret key using ${algorithm} algorithm`}
                        type="success"
                        showIcon
                        style={{ marginTop: 8 }}
                      />
                    )}
                  </>
                )}
                
                {!useSecretKey && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Without a secret key, the original signature will be preserved. The token may be rejected by servers if the payload was modified.
                  </Text>
                )}
              </Space>
            </div>

            {/* Modified Status Alert */}
            {isModified && (
              <Alert
                message="Changes Preview"
                description="The encoded token reflects your edits to the header and payload. Click Save to apply these changes."
                type="warning"
                showIcon
                style={{ marginTop: 'auto' }}
              />
            )}
          </div>
        </Col>
      </Row>
    </Modal>
  );
};

export default JWTEditorModal;