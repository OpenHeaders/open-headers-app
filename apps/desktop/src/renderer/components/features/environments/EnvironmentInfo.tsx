/**
 * Information and help components for environment variables
 * Displays warnings, tutorial info, and usage summaries
 */

import type { Source } from '@openheaders/core';
import { Alert, Divider, Space, Tag, Typography } from 'antd';
import { getSourcesUsingVariables } from './EnvironmentUtils';

const { Text } = Typography;

/**
 * Alert component for missing variables
 *  props - Component props
 *  props.missingVariables - Array of missing variable names
 */
interface MissingVariablesAlertProps {
  missingVariables: string[];
}
export const MissingVariablesAlert = ({ missingVariables }: MissingVariablesAlertProps) => {
  if (!missingVariables || missingVariables.length === 0) return null;

  return (
    <Alert
      type="warning"
      title="Missing Variables"
      description={`The following variables are used in sources and rules but not defined: ${missingVariables.join(', ')}`}
      showIcon
    />
  );
};

/**
 * Tutorial information component
 *  props - Component props
 *  props.showTutorial - Whether to show tutorial mode
 */
interface TutorialInfoProps {
  showTutorial: boolean;
}
export const TutorialInfo = ({ showTutorial }: TutorialInfoProps) => {
  if (!showTutorial) return null;

  return (
    <Alert
      title={
        <Space>
          <span>Use</span>
          <Tag color="purple" style={{ margin: 0 }}>
            {'{{VARIABLE_NAME}}'}
          </Tag>
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
 *  props - Component props
 *  props.sources - Array of source configurations
 */
interface VariableUsageSummaryProps {
  sources: Source[];
}
export const VariableUsageSummary = ({ sources }: VariableUsageSummaryProps) => {
  const sourcesUsingVariables = getSourcesUsingVariables(sources);

  if (!sourcesUsingVariables || sourcesUsingVariables.length === 0) return null;

  return (
    <>
      <Divider />
      <div>
        <Text type="secondary">Template sources using environment variables:</Text>
        <div style={{ marginTop: 8 }}>
          <Space wrap>
            {sourcesUsingVariables.map((source) => (
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
