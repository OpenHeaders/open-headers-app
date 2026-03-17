import React from 'react';
import { Card, Empty, Typography } from 'antd';
import { FileSearchOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const ScriptsCssRules = () => {
    return (
        <div className="scripts-css-rules-container">
            <Card>
                <Empty
                    image={<FileSearchOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                    style={{ padding: '40px 0' }}
                    description={
                        <div style={{ marginTop: 16 }}>
                            <Title level={4}>Scripts/CSS Rules</Title>
                            <Text type="secondary">
                                Inject or modify JavaScript and CSS on web pages.
                                Coming soon...
                            </Text>
                        </div>
                    }
                />
            </Card>
        </div>
    );
};

export default ScriptsCssRules;