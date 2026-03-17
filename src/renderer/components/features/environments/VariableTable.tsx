/**
 * Variables table component with inline editing capabilities
 * Displays environment variables with usage tracking and editing features
 */

import React, { useState } from 'react';
import { Table, Form, Space, Button, Tag, Typography, Tooltip, Popconfirm, Empty } from 'antd';
import { 
  EditOutlined, 
  DeleteOutlined, 
  EyeOutlined, 
  EyeInvisibleOutlined, 
  WarningOutlined,
  PlusOutlined,
  CopyOutlined,
  CheckCircleTwoTone
} from '@ant-design/icons';
import EditableCell from './EditableCell';
import JWTEditorModal from './JWTEditorModal';
import { showMessage } from '../../../utils';
import { isJWT } from '../../../utils/jwtUtils';

const { Text } = Typography;

/**
 * VariableTable component for displaying and editing environment variables
 * @param {Object} props - Component props
 * @param {Object} props.variablesWithMetadata - Variables with metadata
 * @param {Array} props.missingVariables - Array of missing variable names
 * @param {Object} props.variableUsage - Usage mapping for variables
 * @param {Array} props.sources - Source configurations for name lookup
 * @param {Object} props.rules - Rules object for rule name lookup
 * @param {Function} props.onAddVariable - Callback to add new variable
 * @param {Function} props.onEditVariable - Callback to edit variable
 * @param {Function} props.onDeleteVariable - Callback to delete variable
 * @param {Object} props.form - Ant Design form instance
 */
const VariableTable = ({
  variablesWithMetadata,
  missingVariables,
  variableUsage,
  sources,
  rules,
  onAddVariable,
  onEditVariable,
  onDeleteVariable,
  form
}) => {
  const [editingKey, setEditingKey] = useState('');
  const [showSensitive, setShowSensitive] = useState({});
  const [jwtModalVisible, setJwtModalVisible] = useState(false);
  const [jwtModalData, setJwtModalData] = useState(null);

  /**
   * Checks if a record is currently being edited
   * @param {Object} record - Table record
   * @returns {boolean} True if record is being edited
   */
  const isEditing = (record) => record.key === editingKey;

  /**
   * Starts editing a record
   * @param {Object} record - Record to edit
   */
  const edit = (record) => {
    // Check if the value is a JWT token
    if (record.value && isJWT(record.value)) {
      // Open JWT editor modal for JWT tokens
      setJwtModalData({
        variableName: record.name,
        value: record.value,
        isSecret: record.isSecret
      });
      setJwtModalVisible(true);
    } else {
      // Use inline editing for non-JWT values
      form.setFieldsValue({
        ...record,
      });
      setEditingKey(record.key);
      
      // Automatically show secret values when editing
      if (record.isSecret) {
        setShowSensitive(prev => ({
          ...prev,
          [record.name]: true
        }));
      }
    }
  };

  /**
   * Cancels editing
   */
  const cancel = () => {
    setEditingKey('');
    // Note: We'll hide the secret after determining which record was being edited
  };

  /**
   * Saves the edited record
   * @param {string} key - Record key
   */
  const save = async (key) => {
    try {
      const row = await form.validateFields();
      await onEditVariable(key, row);
      setEditingKey('');
      
      // Hide the secret value again after saving if it's a secret
      // The key is the variable name in this case
      if (row.isSecret) {
        setShowSensitive(prev => ({
          ...prev,
          [row.name]: false
        }));
      }
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
    }
  };

  /**
   * Toggles visibility of sensitive variable values
   * @param {string} varName - Variable name
   */
  const toggleSensitive = (varName) => {
    setShowSensitive(prev => ({
      ...prev,
      [varName]: !prev[varName]
    }));
  };

  /**
   * Copies variable value to clipboard
   * @param {string} value - Value to copy
   * @param {string} varName - Variable name for feedback
   */
  const copyToClipboard = async (value, varName) => {
    try {
      await navigator.clipboard.writeText(value || '');
      showMessage('success', `Variable "${varName}" value copied to clipboard`);
    } catch (error) {
      showMessage('error', 'Failed to copy to clipboard');
    }
  };

  /**
   * Handle JWT modal save
   * @param {string} newToken - New JWT token value
   * @param {boolean} isSecret - Whether the variable should be secret
   */
  const handleJwtSave = async (newToken, isSecret) => {
    if (jwtModalData) {
      await onEditVariable(jwtModalData.variableName, {
        name: jwtModalData.variableName,
        value: newToken,
        isSecret: isSecret
      });
      setJwtModalVisible(false);
      // Don't clear data immediately to allow animation to complete
      setTimeout(() => {
        setJwtModalData(null);
      }, 500);
    }
  };

  /**
   * Handle JWT modal cancel
   */
  const handleJwtCancel = () => {
    setJwtModalVisible(false);
    // Don't clear data immediately to allow animation to complete
    setTimeout(() => {
      setJwtModalData(null);
    }, 300);
  };

  /**
   * Renders the variable value with appropriate visibility controls
   * @param {string} value - Variable value
   * @param {Object} record - Record data
   * @returns {React.ReactNode} Rendered value
   */
  const renderVariableValue = (value, record) => {
    const editable = isEditing(record);
    if (editable) return value;
    
    const isSensitive = record.isSecret;
    const isVisible = showSensitive[record.name];
    const isEmpty = !value || value === '';

    // Show (empty) for empty values regardless of secret status
    if (isEmpty) {
      return (
        <Space>
          <Text type="secondary">(empty)</Text>
          {isSensitive && (
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => toggleSensitive(record.name)}
              disabled
            />
          )}
        </Space>
      );
    }

    // For non-empty secret values
    if (isSensitive && !isVisible) {
      return (
        <Space>
          <Text>••••••••</Text>
          <Button
            type="text"
            size="small"
            icon={<EyeInvisibleOutlined />}
            onClick={() => toggleSensitive(record.name)}
          />
          <Button
            size="small"
            onClick={() => toggleSensitive(record.name)}
            style={{ width: 60 }}
          >
            Show
          </Button>
        </Space>
      );
    }

    // Check if this is a domain variable with comma-separated values
    const isDomainVariable = record.name.toLowerCase().includes('domain');
    const hasCommas = value && value.includes(',');
    
    if (isDomainVariable && hasCommas) {
      // Split by comma and create tags
      const domains = value.split(',').map(domain => domain.trim()).filter(domain => domain);
      
      return (
        <Space wrap>
          {domains.map((domain, index) => (
            <Tag key={index} color="default">
              {domain}
            </Tag>
          ))}
          {isSensitive && (
            <>
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => toggleSensitive(record.name)}
              />
              <Button
                size="small"
                onClick={() => toggleSensitive(record.name)}
                style={{ width: 60 }}
              >
                Hide
              </Button>
            </>
          )}
        </Space>
      );
    }

    // For visible values (either non-secret or shown secret)
    return (
      <Space>
        <Text>{value}</Text>
        {isSensitive && (
          <>
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => toggleSensitive(record.name)}
            />
            <Button
              size="small"
              onClick={() => toggleSensitive(record.name)}
              style={{ width: 60 }}
            >
              Hide
            </Button>
          </>
        )}
      </Space>
    );
  };

  /**
   * Renders variable usage information
   * @param {Array} usedIn - Array of source IDs
   * @returns {React.ReactNode} Rendered usage info
   */
  const renderUsageInfo = (usedIn) => (
    <Space wrap>
      {usedIn && usedIn.length > 0 ? (
        usedIn.map(sourceId => {
          // Check if this is a rule identifier
          if (sourceId.startsWith('rule-')) {
            const ruleId = sourceId.substring(5); // Remove 'rule-' prefix
            let ruleName = `Rule #${ruleId}`;
            
            // Try to find the actual rule to get its name
            if (rules && rules.header) {
              const rule = rules.header.find(r => r.id === ruleId);
              if (rule) {
                ruleName = rule.headerName || `Header Rule`;
              }
            }
            
            return (
              <Tag key={sourceId} color="green">
                {ruleName}
              </Tag>
            );
          }
          
          // Regular source
          const source = sources.find(s => s.sourceId === sourceId);
          const sourceName = source?.sourceName || source?.name || `Source ${sourceId}`;
          return (
            <Tag key={sourceId} color="blue">
              {sourceName}
            </Tag>
          );
        })
      ) : (
        <Text type="secondary">Not used</Text>
      )}
    </Space>
  );

  /**
   * Renders action buttons for each row
   * @param {Object} record - Record data
   * @returns {React.ReactNode} Rendered actions
   */
  const renderActions = (record) => {
    const editable = isEditing(record);
    
    if (editable) {
      return (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => save(record.key)}
          >
            Save
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              cancel();
              // Hide the secret value when cancelling
              if (record.isSecret) {
                setShowSensitive(prev => ({
                  ...prev,
                  [record.name]: false
                }));
              }
            }}
          >
            Cancel
          </Button>
        </Space>
      );
    }

    return (
      <Space>
        <Tooltip title="Copy value">
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            disabled={editingKey !== ''}
            onClick={() => copyToClipboard(record.value, record.name)}
          />
        </Tooltip>
        <Tooltip title={record.value && isJWT(record.value) ? "Edit JWT Token" : "Edit"}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            disabled={editingKey !== ''}
            onClick={() => edit(record)}
          />
        </Tooltip>
        <Popconfirm
          title="Delete variable?"
          description={`Are you sure you want to delete '${record.name}'?`}
          onConfirm={() => onDeleteVariable(record.name)}
        >
          <Tooltip title="Delete">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={editingKey !== ''}
            />
          </Tooltip>
        </Popconfirm>
      </Space>
    );
  };

  /**
   * Table column configuration
   */
  const columns = [
    {
      title: 'Variable Name',
      dataIndex: 'name',
      key: 'name',
      width: '25%',
      editable: true,
      render: (name, record) => {
        const editable = isEditing(record);
        const isJwtToken = record.value && isJWT(record.value);
        const isDomainVariable = name.toLowerCase().includes('domain');
        const hasCommas = record.value && record.value.includes(',');
        const isDomainList = isDomainVariable && hasCommas;
        
        return editable ? name : (
          <Space>
            <Text strong>{name}</Text>
            {isJwtToken && (
              <Tooltip title="Detected JWT: Edit action customized">
                <CheckCircleTwoTone />
              </Tooltip>
            )}
            {isDomainList && (
              <Tooltip title="Detected Domains: Value displayed as tags">
                <CheckCircleTwoTone />
              </Tooltip>
            )}
            {missingVariables.includes(name) && (
              <Tooltip title="This variable is used in sources but not defined">
                <WarningOutlined style={{ color: '#faad14' }} />
              </Tooltip>
            )}
          </Space>
        );
      }
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: '30%',
      editable: true,
      render: renderVariableValue
    },
    {
      title: 'Type',
      dataIndex: 'isSecret',
      key: 'isSecret',
      width: '15%',
      editable: true,
      render: (isSecret) => (
        <Tag color="default">
          {isSecret ? 'Secret' : 'Default'}
        </Tag>
      )
    },
    {
      title: 'Used In',
      dataIndex: 'usedIn',
      key: 'usedIn',
      width: '20%',
      render: renderUsageInfo
    },
    {
      title: 'Actions',
      key: 'actions',
      width: '10%',
      render: (_, record) => renderActions(record)
    }
  ];

  /**
   * Enhances columns with editable cell configuration
   */
  const mergedColumns = columns.map((col) => {
    if (!col.editable) return col;
    
    return {
      ...col,
      onCell: (record) => ({
        record,
        inputType: col.dataIndex === 'isSecret' ? 'radio' : 
                   (col.dataIndex === 'value') ? 'dynamic' : 'text',
        dataIndex: col.dataIndex,
        title: col.title,
        editing: isEditing(record),
      }),
    };
  });

  /**
   * Prepares table data from variables and missing variables
   */
  const existingVariableNames = new Set(Object.keys(variablesWithMetadata));
  
  const tableData = [
    // Existing variables
    ...Object.entries(variablesWithMetadata).map(([name, variable]) => ({
      key: name,
      name,
      value: variable.value,
      isSecret: variable.isSecret,
      usedIn: variableUsage[name] || []
    })),
    // Missing variables (used but not defined)
    ...missingVariables
      .filter(name => !existingVariableNames.has(name))
      .map(name => ({
        key: name,
        name,
        value: '',
        isSecret: false,
        usedIn: variableUsage[name] || [],
        missing: true
      }))
  ];

  return (
    <>
      <Form form={form} component={false}>
        <Table
          components={{
            body: {
              cell: EditableCell,
            },
          }}
          dataSource={tableData}
          columns={mergedColumns}
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                description="No variables defined"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={onAddVariable}
                >
                  Add Your First Variable
                </Button>
              </Empty>
            )
          }}
        />
      </Form>
      
      {/* JWT Editor Modal */}
      {jwtModalData && (
        <JWTEditorModal
          visible={jwtModalVisible}
          variableName={jwtModalData.variableName}
          initialValue={jwtModalData.value}
          isSecret={jwtModalData.isSecret}
          onSave={handleJwtSave}
          onCancel={handleJwtCancel}
        />
      )}
    </>
  );
};

export default VariableTable;