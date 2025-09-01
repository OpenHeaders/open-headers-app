import React from 'react';
import { Checkbox, Space, Typography } from 'antd';

const { Text } = Typography;

/**
 * ImportEnvironmentSelector component for selecting specific environments
 * Handles environment selection with counts and helper actions
 */
const ImportEnvironmentSelector = ({ 
    selectedItems,
    combinedEnvInfo,
    availableEnvironments,
    selectedEnvironments,
    onEnvironmentSelectionChange,
    onSelectAllEnvironments,
    onSelectNoEnvironments
}) => {
    // Only show if environments are selected and available
    if (!selectedItems.environments || !combinedEnvInfo.hasEnvironments || 
        Object.keys(availableEnvironments).length === 0) {
        return null;
    }

    return (
        <div style={{ marginLeft: 24, marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginBottom: 8 }}>
                Select which environments to import:
            </Text>
            <Space direction="vertical" style={{ width: '100%' }}>
                {Object.entries(availableEnvironments).map(([envName, envInfo]) => (
                    <Checkbox
                        key={envName}
                        checked={selectedEnvironments[envName] || false}
                        onChange={(e) => onEnvironmentSelectionChange(envName, e.target.checked)}
                    >
                        <Space>
                            <Text>{envName}</Text>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                                ({envInfo.varCount} variables)
                            </Text>
                        </Space>
                    </Checkbox>
                ))}
                <div style={{ marginTop: 8 }}>
                    <Space>
                        <Text 
                            type="link" 
                            style={{ fontSize: '12px', cursor: 'pointer' }}
                            onClick={onSelectAllEnvironments}
                        >
                            Select All
                        </Text>
                        <Text type="secondary">|</Text>
                        <Text 
                            type="link" 
                            style={{ fontSize: '12px', cursor: 'pointer' }}
                            onClick={onSelectNoEnvironments}
                        >
                            Select None
                        </Text>
                    </Space>
                </div>
            </Space>
        </div>
    );
};

export default ImportEnvironmentSelector;