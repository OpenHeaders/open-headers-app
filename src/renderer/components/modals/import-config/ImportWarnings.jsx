import React from 'react';
import { Alert, Typography } from 'antd';
import { WarningOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * ImportWarnings component for displaying contextual warnings and information alerts
 * Shows dynamic warnings based on import mode and data types being imported
 * 
 * @param {string} importMode - Import mode ('merge' or 'replace')
 * @param {Object} selectedItems - Selected items to import
 * @param {Object} combinedEnvInfo - Combined environment information
 */
const ImportWarnings = ({ 
    importMode,
    selectedItems,
    combinedEnvInfo
}) => {
    return (
        <>
            {/* Replace mode warning */}
            {importMode === 'replace' && (
                <Alert
                    message="Data Will Be Replaced"
                    description={
                        <div>
                            <Text>Sources, rules, and proxy rules will be completely replaced - all existing items will be deleted.</Text>
                            <br />
                            <Text strong>Environment variables:</Text> Only variables with matching names will be replaced. Others will remain unchanged.
                        </div>
                    }
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                />
            )}

            {/* Sensitive data warning */}
            {combinedEnvInfo.hasEnvironments && selectedItems.environments && (
                <Alert
                    message="Contains Sensitive Data"
                    description="This file contains environment variable values which may include sensitive data like API keys and passwords."
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                />
            )}

            {/* Schema only info */}
            {combinedEnvInfo.hasEnvironmentSchema && !combinedEnvInfo.hasEnvironments && selectedItems.environments && (
                <Alert
                    message="Environment Schema Only"
                    description="This file contains only the environment variable schema. You'll need to provide your own values after import."
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                />
            )}
        </>
    );
};

export default ImportWarnings;