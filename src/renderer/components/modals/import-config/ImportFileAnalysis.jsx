import React from 'react';
import { Card, Space, Typography, Alert, Statistic, Row, Col } from 'antd';
import { ApiOutlined, NodeExpandOutlined, DatabaseOutlined, ClusterOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * ImportFileAnalysis component for displaying file analysis results
 * Shows file information, statistics, and validation results
 */
const ImportFileAnalysis = ({ fileInfo, envFileData, hasAnyData, combinedEnvInfo }) => {
    if (!fileInfo && !envFileData) {
        return null;
    }

    return (
        <>
            {/* File Information */}
            {fileInfo && (
                <Card size="small" title="File Information">
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Text>
                            <strong>Version:</strong> {fileInfo.version}
                        </Text>
                        {!hasAnyData && (
                            <Alert
                                message="Empty Configuration"
                                description="This file doesn't contain any data to import."
                                type="warning"
                                showIcon
                            />
                        )}
                    </Space>
                </Card>
            )}

            {/* Import Statistics */}
            {hasAnyData && (
                <Card size="small" title="Import Preview">
                    <Row gutter={16}>
                        {fileInfo && fileInfo.sourceCount > 0 && (
                            <Col span={6}>
                                <Statistic
                                    title="Sources"
                                    value={fileInfo.sourceCount}
                                    prefix={<ApiOutlined />}
                                />
                            </Col>
                        )}
                        {fileInfo && fileInfo.ruleCount > 0 && (
                            <Col span={6}>
                                <Statistic
                                    title="Rules"
                                    value={fileInfo.ruleCount}
                                    prefix={<NodeExpandOutlined />}
                                />
                            </Col>
                        )}
                        {fileInfo && fileInfo.proxyRuleCount > 0 && (
                            <Col span={6}>
                                <Statistic
                                    title="Proxy Rules"
                                    value={fileInfo.proxyRuleCount}
                                    prefix={<DatabaseOutlined />}
                                />
                            </Col>
                        )}
                        {combinedEnvInfo.variableCount > 0 && (
                            <Col span={6}>
                                <Statistic
                                    title="Env Variables"
                                    value={combinedEnvInfo.variableCount}
                                    prefix={<ClusterOutlined />}
                                />
                            </Col>
                        )}
                    </Row>
                    
                    {/* Rule breakdown */}
                    {fileInfo && fileInfo.ruleCount > 0 && Object.keys(fileInfo.ruleBreakdown).length > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <Text type="secondary">Rule Types: </Text>
                            {Object.entries(fileInfo.ruleBreakdown).map(([type, count], index) => (
                                <span key={type}>
                                    {index > 0 && ', '}
                                    <Text>{type} ({count})</Text>
                                </span>
                            ))}
                        </div>
                    )}
                </Card>
            )}
        </>
    );
};

export default ImportFileAnalysis;