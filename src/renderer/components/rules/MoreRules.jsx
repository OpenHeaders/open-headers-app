import React from 'react';
import { Card, Empty, Typography } from 'antd';
import { FileMarkdownOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const MoreRules = () => {
    return (
        <div className="more-rules-container">
            <Card>
                <Empty
                    image={<FileMarkdownOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                    style={{ padding: '40px 0' }}
                    description={
                        <div style={{ marginTop: 16 }}>
                            <Title level={4}>More Rule Types</Title>
                            <Text type="secondary">
                                Additional rule types and advanced features.
                                Coming soon...
                            </Text>
                        </div>
                    }
                />
            </Card>
        </div>
    );
};

export default MoreRules;