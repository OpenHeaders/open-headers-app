/**
 * Environment selector and management component
 * Handles environment switching with missing variable warnings
 */

import React, { useState } from 'react';
import { Row, Col, Space, Select, Button, Dropdown, Modal, Typography, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  SettingOutlined,
  WarningOutlined,
  ShareAltOutlined
} from '@ant-design/icons';
import { checkMissingVariables } from './EnvironmentUtils';
import EnvironmentShareModal from '../../modals/EnvironmentShareModal';

const { Option } = Select;
const { Text } = Typography;

interface ThemeToken {
  colorWarning: string;
}

interface EnvironmentSelectorProps {
  environments: Record<string, Record<string, unknown>>;
  activeEnvironment: string;
  sources: Array<Record<string, unknown>>;
  onEnvironmentSwitch: (envName: string) => void;
  onCreateEnvironment: () => void;
  onCopyEnvironment: (envName: string) => void;
  onDeleteEnvironment: (envName: string) => void;
  onAddVariable: () => void;
  theme: ThemeToken;
}

/**
 * EnvironmentSelector component for managing and switching environments
 */
const EnvironmentSelector: React.FC<EnvironmentSelectorProps> = ({
  environments,
  activeEnvironment,
  sources,
  onEnvironmentSwitch,
  onCreateEnvironment,
  onCopyEnvironment,
  onDeleteEnvironment,
  onAddVariable,
  theme
}) => {
  const [shareModalVisible, setShareModalVisible] = useState(false);
  /**
   * Handles environment switching with missing variable validation
   * @param {string} targetEnv - Target environment name
   */
  const handleEnvironmentSwitch = (targetEnv: string) => {
    const targetVars = environments[targetEnv] || {};
    const missingVars = checkMissingVariables(sources, targetVars);
    
    if (missingVars.length > 0) {
      Modal.confirm({
        title: 'Missing Variables Warning',
        icon: <WarningOutlined style={{ color: theme.colorWarning }} />,
        content: (
          <div>
            <p>The following variables are used in your sources but are not defined in the '{targetEnv}' environment:</p>
            <div style={{ marginTop: 8, marginBottom: 16 }}>
              {missingVars.map((varName: string) => (
                <Tag key={varName} color="error" style={{ marginBottom: 4 }}>
                  {`{{${varName}}}`}
                </Tag>
              ))}
            </div>
            <p>This may cause HTTP sources to fail. Do you want to continue?</p>
          </div>
        ),
        okText: 'Switch Anyway',
        cancelText: 'Cancel',
        okButtonProps: { danger: true },
        onOk: () => onEnvironmentSwitch(targetEnv)
      });
    } else {
      onEnvironmentSwitch(targetEnv);
    }
  };

  /**
   * Handles environment deletion with confirmation
   */
  const handleDeleteEnvironment = () => {
    Modal.confirm({
      title: 'Delete environment?',
      content: `Are you sure you want to delete '${activeEnvironment}' environment?`,
      onOk: () => onDeleteEnvironment(activeEnvironment),
      okText: 'Delete',
      okButtonProps: { danger: true }
    });
  };

  /**
   * Handles sharing environment configuration
   */
  const handleShareEnvironment = () => {
    setShareModalVisible(true);
  };


  /**
   * Generates dropdown menu items for environment management
   */
  const getDropdownItems = () => {
    const items: NonNullable<MenuProps['items']> = [
      {
        key: 'new',
        icon: <PlusOutlined />,
        label: 'New Environment',
        onClick: onCreateEnvironment
      },
      {
        key: 'clone',
        icon: <CopyOutlined />,
        label: 'Clone Current',
        onClick: () => onCopyEnvironment(activeEnvironment)
      },
      {
        key: 'share',
        icon: <ShareAltOutlined />,
        label: 'Share Environment',
        onClick: handleShareEnvironment
      }
    ];

    // Add delete option for non-default environments
    if (activeEnvironment !== 'Default') {
      items.push(
        { key: 'divider', type: 'divider' as const },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: 'Delete Current',
          danger: true,
          onClick: handleDeleteEnvironment
        }
      );
    }

    return items;
  };

  return (
    <>
      <Row gutter={[16, 16]} align="middle" justify="space-between">
        <Col flex="auto">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text type="secondary">Active Environment</Text>
            <Select
              value={activeEnvironment}
              onChange={handleEnvironmentSwitch}
              style={{ width: 200 }}
            >
              {Object.keys(environments).map(env => {
                const varCount = Object.keys(environments[env] || {}).length;
                return (
                  <Option key={env} value={env}>
                    <Space>
                      <span>{env}</span>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        ({varCount} {varCount === 1 ? 'var' : 'vars'})
                      </Text>
                    </Space>
                  </Option>
                );
              })}
            </Select>
          </Space>
        </Col>
        <Col>
          <Space>
            <Dropdown
              menu={{ items: getDropdownItems() }}
              trigger={['click']}
            >
              <Button icon={<SettingOutlined />}>
                Manage Environment
              </Button>
            </Dropdown>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onAddVariable}
            >
              Add Variable
            </Button>
          </Space>
        </Col>
      </Row>
      
      <EnvironmentShareModal
        visible={shareModalVisible}
        environmentName={activeEnvironment}
        environmentData={environments[activeEnvironment]}
        onClose={() => setShareModalVisible(false)}
      />
    </>
  );
};

export default EnvironmentSelector;