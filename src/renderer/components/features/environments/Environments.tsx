/**
 * Main Environments component for managing environment variables
 * Provides interface for creating, editing, and managing environment variables
 * with support for multiple environments and variable usage tracking
 */

import React, { useState, useEffect } from 'react';
import { Card, Space, Form, theme } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';

import { useEnvironments, useSources, useSettings, useWorkspaces } from '../../../contexts';
import { showMessage } from '../../../utils/ui/messageUtil';

import EnvironmentSelector from './EnvironmentSelector';
import VariableTable from './VariableTable';
import { CreateEnvironmentModal, AddVariableModal } from './EnvironmentModals';
import { MissingVariablesAlert, TutorialInfo, VariableUsageSummary } from './EnvironmentInfo';
import { generateUniqueEnvironmentName } from './EnvironmentUtils';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('Environments');

/**
 * Main Environments component
 * Manages environment variables with full CRUD operations and usage tracking
 */
const Environments = () => {
  const { token } = theme.useToken();
  
  // Context hooks
  const {
    environments,
    activeEnvironment,
    loading,
    createEnvironment,
    deleteEnvironment,
    switchEnvironment,
    setVariable,
    deleteVariable,
    getAllVariablesWithMetadata,
    findVariableUsage,
    cloneEnvironment
  } = useEnvironments();

  const { sources } = useSources();
  const { settings } = useSettings();
  const { activeWorkspaceId } = useWorkspaces();

  // Form instances
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();
  const [variableForm] = Form.useForm();

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddVariableModal, setShowAddVariableModal] = useState(false);

  // Data states
  const [variableUsage, setVariableUsage] = useState({});
  const [missingVariables, setMissingVariables] = useState([]);
  const [rules, setRules] = useState(null);

  /**
   * Load rules to check for environment variable usage
   */
  useEffect(() => {
    const loadRules = async () => {
      if (!activeWorkspaceId) return;
      
      try {
        const rulesPath = `workspaces/${activeWorkspaceId}/rules.json`;
        const rulesData = await window.electronAPI.loadFromStorage(rulesPath);
        if (rulesData) {
          const rulesStorage = JSON.parse(rulesData);
          setRules(rulesStorage.rules || {});
        } else {
          setRules({});
        }
      } catch (error) {
        log.error('Failed to load rules for environment checking:', error);
        setRules({});
      }
    };
    
    loadRules();
    
    // Listen for rules updates
    const handleRulesUpdate = () => {
      loadRules();
    };
    
    window.addEventListener('rules-updated', handleRulesUpdate);
    
    return () => {
      window.removeEventListener('rules-updated', handleRulesUpdate);
    };
  }, [activeWorkspaceId]);

  /**
   * Updates variable usage information when sources or rules change
   */
  useEffect(() => {
    // Get usage from sources
    const usage = findVariableUsage(sources);
    
    // Add usage from rules
    if (rules && rules.header) {
      rules.header.forEach(rule => {
        if (rule.hasEnvVars && rule.envVars) {
          rule.envVars.forEach(varName => {
            if (!usage[varName]) {
              usage[varName] = [];
            }
            // Add a special identifier for rules
            const ruleIdentifier = `rule-${rule.id}`;
            if (!usage[varName].includes(ruleIdentifier)) {
              usage[varName].push(ruleIdentifier);
            }
          });
        }
      });
    }
    
    log.debug('Variable usage found (sources + rules):', usage);
    setVariableUsage(usage);

    // Find missing variables in current environment
    const variablesMetadata = getAllVariablesWithMetadata();
    const missing = Object.keys(usage).filter(varName => !variablesMetadata[varName]);
    setMissingVariables(missing);
  }, [sources, rules, getAllVariablesWithMetadata, findVariableUsage]);

  /**
   * Listens for environment schema updates from team workspace sync
   */
  useEffect(() => {
    const handleSchemaUpdate = (event) => {
      const { requiredVariables } = event.detail;
      if (requiredVariables && requiredVariables.length > 0) {
        showMessage('info', 
          `Team workspace requires ${requiredVariables.length} environment variable(s). ` +
          `Please configure them in the Environments tab.`
        );
      }
    };

    window.addEventListener('environment-schema-updated', handleSchemaUpdate);
    return () => {
      window.removeEventListener('environment-schema-updated', handleSchemaUpdate);
    };
  }, []);

  /**
   * Handles environment creation
   */
  const handleCreateEnvironment = async () => {
    try {
      const values = await createForm.validateFields();
      const success = await createEnvironment(values.name);
      if (success) {
        setShowCreateModal(false);
        createForm.resetFields();
        showMessage('success', `Environment '${values.name}' created successfully`);
      }
    } catch (error) {
      log.error('Failed to create environment:', error);
    }
  };

  /**
   * Handles variable addition
   */
  const handleAddVariable = async () => {
    try {
      const values = await variableForm.validateFields();
      const success = await setVariable(values.name, values.value, null, values.isSecret);
      if (success) {
        setShowAddVariableModal(false);
        variableForm.resetFields();
        showMessage('success', 'Variable added successfully');
      }
    } catch (error) {
      log.error('Failed to add variable:', error);
    }
  };

  /**
   * Handles variable editing with name change support
   * @param {string} oldName - Original variable name
   * @param {Object} newData - New variable data
   */
  const handleEditVariable = async (oldName, newData) => {
    try {
      // If name changed, delete old and create new
      if (oldName !== newData.name) {
        const deleteSuccess = await deleteVariable(oldName);
        if (!deleteSuccess) {
          showMessage('error', 'Failed to rename variable');
          return;
        }
      }
      
      const success = await setVariable(newData.name, newData.value, null, newData.isSecret);
      if (success) {
        showMessage('success', 'Variable updated successfully');
      }
    } catch (error) {
      log.error('Failed to edit variable:', error);
      showMessage('error', 'Failed to update variable');
    }
  };

  /**
   * Handles environment copying
   * @param {string} fromEnv - Source environment name
   */
  const handleCopyEnvironment = async (fromEnv) => {
    const newName = generateUniqueEnvironmentName(fromEnv, environments);
    const success = await cloneEnvironment(fromEnv, newName);
    
    if (success) {
      showMessage('success', `Environment '${newName}' created with all variables from '${fromEnv}'`);
    }
  };

  /**
   * Handles environment switching (delegates to EnvironmentSelector)
   */
  const handleEnvironmentSwitch = async (targetEnv) => {
    try {
      await switchEnvironment(targetEnv);
      showMessage('success', `Switched to '${targetEnv}' environment`);
    } catch (error) {
      log.error('Failed to switch environment:', error);
      showMessage('error', 'Failed to switch environment');
    }
  };

  /**
   * Handles environment deletion
   */
  const handleDeleteEnvironment = async (envName) => {
    try {
      const success = await deleteEnvironment(envName);
      if (success) {
        showMessage('success', `Environment '${envName}' deleted successfully`);
      }
    } catch (error) {
      log.error('Failed to delete environment:', error);
      showMessage('error', 'Failed to delete environment');
    }
  };

  // Show loading state
  if (loading) {
    return <Card loading={true} />;
  }

  const variablesWithMetadata = getAllVariablesWithMetadata();
  const showTutorial = settings?.tutorialMode !== false;

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <EnvironmentOutlined />
            <span>Environment Variables</span>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Environment Selector */}
          <EnvironmentSelector
            environments={environments}
            activeEnvironment={activeEnvironment}
            sources={sources}
            onEnvironmentSwitch={handleEnvironmentSwitch}
            onCreateEnvironment={() => setShowCreateModal(true)}
            onCopyEnvironment={handleCopyEnvironment}
            onDeleteEnvironment={handleDeleteEnvironment}
            onAddVariable={() => setShowAddVariableModal(true)}
            theme={token}
          />

          {/* Missing Variables Warning */}
          <MissingVariablesAlert missingVariables={missingVariables} />

          {/* Tutorial Information */}
          <TutorialInfo showTutorial={showTutorial} />

          {/* Variables Table */}
          <VariableTable
            variablesWithMetadata={variablesWithMetadata}
            missingVariables={missingVariables}
            variableUsage={variableUsage}
            sources={sources}
            rules={rules}
            onAddVariable={() => setShowAddVariableModal(true)}
            onEditVariable={handleEditVariable}
            onDeleteVariable={deleteVariable}
            form={form}
          />

          {/* Usage Summary */}
          <VariableUsageSummary sources={sources} />
        </Space>
      </Card>

      {/* Create Environment Modal */}
      <CreateEnvironmentModal
        visible={showCreateModal}
        onOk={handleCreateEnvironment}
        onCancel={() => {
          setShowCreateModal(false);
          createForm.resetFields();
        }}
        form={createForm}
      />

      {/* Add Variable Modal */}
      <AddVariableModal
        visible={showAddVariableModal}
        onOk={handleAddVariable}
        onCancel={() => {
          setShowAddVariableModal(false);
          variableForm.resetFields();
        }}
        form={variableForm}
      />
    </div>
  );
};

export default Environments;