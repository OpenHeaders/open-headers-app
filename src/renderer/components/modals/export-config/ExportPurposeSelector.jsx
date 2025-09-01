import React from 'react';
import { Space, Typography, Segmented } from 'antd';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

/**
 * ExportPurposeSelector component for selecting export purpose
 * Provides user-friendly selection between team sharing and personal backup modes
 * 
 * @param {string} exportPurpose - Current export purpose ('team' or 'backup')
 * @param {function} onPurposeChange - Handler for purpose selection changes
 */
const ExportPurposeSelector = ({ exportPurpose, onPurposeChange }) => {
    return (
        <div>
            <Title level={5} style={{ marginBottom: 12 }}>Export Purpose</Title>
            <Segmented
                value={exportPurpose}
                onChange={onPurposeChange}
                options={[
                    {
                        label: (
                            <Space>
                                <TeamOutlined />
                                <span>Team Sharing</span>
                            </Space>
                        ),
                        value: 'team'
                    },
                    {
                        label: (
                            <Space>
                                <UserOutlined />
                                <span>Personal Backup</span>
                            </Space>
                        ),
                        value: 'backup'
                    }
                ]}
                block
                size="large"
            />
            {/* Dynamic description based on selected purpose */}
            <Text type="secondary" style={{ fontSize: '12px', marginTop: 8, display: 'block' }}>
                {exportPurpose === 'team' 
                    ? 'Share configuration with team members via Git (excludes sensitive values)'
                    : 'Create a complete backup including all sensitive data'
                }
            </Text>
        </div>
    );
};

export default ExportPurposeSelector;