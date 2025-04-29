import React from 'react';
import { Modal, Typography, Space, Button, Divider, Row, Col } from 'antd';
import {
    GithubOutlined,
    QuestionCircleOutlined,
    ChromeOutlined,
    CompassOutlined,
    SafetyCertificateOutlined
} from '@ant-design/icons';

const { Title, Text, Link, Paragraph } = Typography;

/**
 * AboutModal component to display app information
 */
const AboutModal = ({ open, onClose, appVersion }) => {
    // Helper function to open external links
    const openExternal = (url) => {
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    };

    return (
        <Modal
            title={
                <Space align="center">
                    <QuestionCircleOutlined />
                    <span>About Open Headers</span>
                </Space>
            }
            open={open}
            onCancel={onClose}
            footer={[
                <Button key="close" onClick={onClose}>
                    Close
                </Button>
            ]}
            width={500}
        >
            <div className="about-modal-content">
                <div className="app-info" style={{ textAlign: 'center', marginBottom: 20 }}>
                    <img
                        src="./images/icon128.png"
                        alt="Open Headers Logo"
                        style={{ width: 80, height: 80, marginBottom: 16 }}
                    />
                    <Title level={4} style={{ marginBottom: 4 }}>Open Headers - Dynamic Sources</Title>
                    {appVersion && (
                        <Text type="secondary">Version {appVersion}</Text>
                    )}
                </div>

                <Paragraph>
                    A companion application for the Open Headers browser extension that manages dynamic sources from files, environment variables, and HTTP endpoints.
                </Paragraph>

                <Divider />

                <Row gutter={[8, 16]}>
                    <Col span={12}>
                        <Button
                            type="link"
                            icon={<GithubOutlined />}
                            onClick={() => openExternal('https://github.com/OpenHeaders/open-headers-app')}
                            style={{ textAlign: 'left', padding: 0 }}
                        >
                            GitHub Repository
                        </Button>
                    </Col>
                    <Col span={12}>
                        <Button
                            type="link"
                            icon={<ChromeOutlined />}
                            onClick={() => openExternal('https://chromewebstore.google.com/detail/ablaikadpbfblkmhpmbbnbbfjoibeejb')}
                            style={{ textAlign: 'left', padding: 0 }}
                        >
                            Chrome Extension
                        </Button>
                    </Col>
                    <Col span={12}>
                        <Button
                            type="link"
                            icon={<CompassOutlined />}
                            onClick={() => openExternal('https://microsoftedge.microsoft.com/addons/detail/open-headers/gnbibobkkddlflknjkgcmokdlpddegpo')}
                            style={{ textAlign: 'left', padding: 0 }}
                        >
                            Edge Extension
                        </Button>
                    </Col>
                    <Col span={12}>
                        <Button
                            type="link"
                            icon={<SafetyCertificateOutlined />}
                            onClick={() => openExternal('https://addons.mozilla.org/en-US/firefox/addon/open-headers/')}
                            style={{ textAlign: 'left', padding: 0 }}
                        >
                            Firefox Extension
                        </Button>
                    </Col>
                </Row>

                <Divider />

                <Paragraph style={{ marginBottom: 0 }}>
                    <Text type="secondary">
                        © 2025 Open Headers
                    </Text>
                </Paragraph>
            </div>
        </Modal>
    );
};

export default AboutModal;