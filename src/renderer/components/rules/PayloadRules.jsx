import React from 'react';
import { Card, Empty, Typography } from 'antd';
import { FilePptOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const PayloadRules = () => {
    return (
        <div className="payload-rules-container">
            <Card>
                <Empty
                    image={<FilePptOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                    style={{ padding: '40px 0' }}
                    description={
                        <div style={{ marginTop: 16 }}>
                            <Title level={4}>Request/Response Payload Rules</Title>
                            <Text type="secondary">
                                Modify request and response payloads based on patterns.
                                Coming soon...
                            </Text>
                        </div>
                    }
                />
            </Card>
        </div>
    );
};

export default PayloadRules;