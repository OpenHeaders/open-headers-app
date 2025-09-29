/**
 * Information and help components for environment variables
 * Displays warnings, tutorial info, and usage summaries
 */

import React from 'react';
import { Alert, Space, Tag, Typography, Divider } from 'antd';
import { getSourcesUsingVariables } from './EnvironmentUtils';

const { Text } = Typography;

/**
 * Alert component for missing variables
 * @param {Object} props - Component props
 * @param {Array} props.missingVariables - Array of missing variable names
 */
export const MissingVariablesAlert = ({ missingVariables }) => {
  if (!missingVariables || missingVariables.length === 0) return null;

  return (
    <Alert
      type="warning"
      message="Missing Variables"
      description={`The following variables are used in sources and rules but not defined: ${missingVariables.join(', ')}`}
      showIcon
    />
  );
};

/**
 * Tutorial information component
 * @param {Object} props - Component props
 * @param {boolean} props.showTutorial - Whether to show tutorial mode
 */
export const TutorialInfo = ({ showTutorial }) => {
  if (!showTutorial) return null;

  return (
    <Alert
      message={
        <Space>
          <span>Use</span>
          <Tag color="purple" style={{ margin: 0 }}>{'{{VARIABLE_NAME}}'}</Tag>
          <span>in Rules + Sources</span>
          <span>[URL, headers, query params, body, options (response json filter, totp authentication)]</span>
        </Space>
      }
      description="Environment Variables are workspace-specific and stored locally. Team Workspaces auto-sync does not overwrite your values."
      type="info"
      showIcon
      closable
    />
  );
};

/**
 * Summary of sources using environment variables
 * @param {Object} props - Component props
 * @param {Array} props.sources - Array of source configurations
 */
export const VariableUsageSummary = ({ sources }) => {
  const sourcesUsingVariables = getSourcesUsingVariables(sources);
  
  if (!sourcesUsingVariables || sourcesUsingVariables.length === 0) return null;

  return (
    <>
      <Divider />
      <div>
        <Text type="secondary">
          Template sources using environment variables:
        </Text>
        <div style={{ marginTop: 8 }}>
          <Space wrap>
            {sourcesUsingVariables.map(source => (
              <Tag key={source.sourceId} color="purple">
                {source.sourceTag || `Source #${source.sourceId}`}
              </Tag>
            ))}
          </Space>
        </div>
      </div>
    </>
  );
};