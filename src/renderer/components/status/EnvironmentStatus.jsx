import { useEnvironments } from '../../contexts';
import React, { useState } from 'react';
import { Space, Tag, Dropdown, Button, Tooltip } from 'antd';
import { 
    DatabaseOutlined,
    CheckOutlined,
    DownOutlined,
    ShareAltOutlined
} from '@ant-design/icons';
import EnvironmentShareModal from '../modals/EnvironmentShareModal';

const EnvironmentStatus = () => {
    const { 
        environments, 
        activeEnvironment, 
        switchEnvironment,
        environmentsReady
    } = useEnvironments();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [shareModalVisible, setShareModalVisible] = useState(false);
    
    // Don't render if environments aren't ready
    if (!environmentsReady) {
        return null;
    }
    
    // Get list of environment names
    const environmentNames = Object.keys(environments || {});
    
    // Get display name for environment
    const getEnvironmentDisplayName = (envName) => {
        if (envName === 'Default') return 'Default Environment';
        return envName;
    };
    
    // All environments use the same icon
    const getEnvironmentIcon = () => {
        return <DatabaseOutlined />;
    };
    
    // All environments use the same color
    const getEnvironmentColor = () => {
        return 'default';
    };
    
    // Build menu items for environment dropdown
    const menuItems = environmentNames.map(envName => {
        const isActive = envName === activeEnvironment;
        const envIcon = getEnvironmentIcon();
        const variableCount = Object.keys(environments[envName] || {}).length;
        
        return {
            key: envName,
            label: (
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                        {envIcon}
                        <span>{getEnvironmentDisplayName(envName)}</span>
                        <span style={{ fontSize: 11, color: '#999' }}>
                            ({variableCount} vars)
                        </span>
                    </Space>
                    {isActive && <CheckOutlined style={{ color: '#1890ff' }} />}
                </Space>
            ),
            onClick: async () => {
                if (!isActive) {
                    try {
                        await switchEnvironment(envName);
                        // Don't show message here - switchEnvironment already shows one
                    } catch (error) {
                        // Error message is already shown by switchEnvironment
                    }
                }
                setDropdownOpen(false);
            }
        };
    });
    
    const menu = { items: menuItems };
    
    const currentIcon = getEnvironmentIcon();
    const currentColor = getEnvironmentColor();
    
    return (
        <Space size={4}>
            <Tooltip title="Share current environment with another user">
                <Button
                    type="text"
                    icon={<ShareAltOutlined />}
                    size="small"
                    onClick={() => setShareModalVisible(true)}
                    style={{ height: 22, padding: '0 6px' }}
                />
            </Tooltip>
            <Dropdown 
                menu={menu} 
                trigger={['click']}
                open={dropdownOpen}
                onOpenChange={setDropdownOpen}
                placement="bottomRight"
            >
                <Tag 
                    icon={currentIcon} 
                    color={currentColor} 
                    style={{ 
                        margin: 0, 
                        cursor: 'pointer',
                        paddingRight: 4
                    }}
                >
                    <Space size={4}>
                        <span>{getEnvironmentDisplayName(activeEnvironment)}</span>
                        <DownOutlined style={{ fontSize: 10, marginLeft: 2 }} />
                    </Space>
                </Tag>
            </Dropdown>
            
            <EnvironmentShareModal
                visible={shareModalVisible}
                environmentName={activeEnvironment}
                environmentData={environments[activeEnvironment]}
                onClose={() => setShareModalVisible(false)}
            />
        </Space>
    );
};

export default EnvironmentStatus;