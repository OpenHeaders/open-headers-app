import React from 'react';
import { Card, Empty, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const UrlRules = () => {
    return (
        <div className="url-rules-container">
            <Card>
                <Empty
                    image={<LinkOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                    style={{ padding: '40px 0' }}
                    description={
                        <div style={{ marginTop: 16 }}>
                            <Title level={4}>URL Rules</Title>
                            <Text type="secondary">
                                Modify, redirect, or block URLs based on patterns.
                                Coming soon...
                            </Text>
                        </div>
                    }
                />
            </Card>
        </div>
    );
};

export default UrlRules;