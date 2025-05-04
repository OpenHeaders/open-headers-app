import React, { useState } from 'react';
import { Modal, Typography, Button, Space, Divider } from 'antd';
import { GithubOutlined, CompassOutlined } from '@ant-design/icons';

const { Title, Text, Link, Paragraph } = Typography;

/**
 * Redesigned AboutModal component with an Apple-inspired minimalist design
 */
const AboutModal = ({ open, onClose, appVersion }) => {
    const [activeTab, setActiveTab] = useState('about');

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
            open={open}
            onCancel={onClose}
            footer={null}
            width={440}
            centered
            className="about-modal"
            closable={false}
            bodyStyle={{
                padding: '32px 24px',
                textAlign: 'center',
                borderRadius: '12px',
                background: 'linear-gradient(to bottom, #fafafa, #f5f5f5)'
            }}
        >
            <div className="about-content">
                {/* App Icon */}
                <div className="app-icon-container">
                    <img
                        src="./images/icon128.png"
                        alt="Open Headers Logo"
                        className="app-icon"
                        style={{
                            width: 96,
                            height: 96,
                            borderRadius: '18px',
                            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.1)',
                            margin: '0 auto 16px',
                            display: 'block'
                        }}
                    />
                </div>

                {/* App Name and Version */}
                <Title level={3} style={{ margin: '0 0 4px', fontWeight: 500 }}>
                    Open Headers
                </Title>
                <Text style={{
                    fontSize: '14px',
                    color: '#86868b',
                    display: 'block',
                    marginBottom: '20px'
                }}>
                    Version {appVersion}
                </Text>

                {/* Description */}
                <Paragraph style={{
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: '#1d1d1f',
                    maxWidth: '340px',
                    margin: '0 auto 24px'
                }}>
                    A companion application for the Open Headers browser extension.
                    Manage dynamic sources from files, environment variables, and HTTP endpoints.
                </Paragraph>

                <Divider style={{ margin: '0 0 24px' }} />

                {/* Tab Selection Buttons */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: '20px',
                    gap: '8px'
                }}>
                    <Button
                        type={activeTab === 'about' ? 'primary' : 'text'}
                        size="small"
                        onClick={() => setActiveTab('about')}
                        style={{
                            borderRadius: '12px',
                            fontWeight: activeTab === 'about' ? 500 : 400
                        }}
                    >
                        About
                    </Button>
                    <Button
                        type={activeTab === 'extensions' ? 'primary' : 'text'}
                        size="small"
                        onClick={() => setActiveTab('extensions')}
                        style={{
                            borderRadius: '12px',
                            fontWeight: activeTab === 'extensions' ? 500 : 400
                        }}
                    >
                        Extensions
                    </Button>
                </div>

                {/* Tab Content */}
                {activeTab === 'about' ? (
                    <div className="tab-content">
                        <Button
                            icon={<GithubOutlined />}
                            onClick={() => openExternal('https://github.com/OpenHeaders/open-headers-app')}
                            style={{
                                width: '100%',
                                marginBottom: '12px',
                                borderRadius: '8px',
                                height: '36px'
                            }}
                        >
                            View on GitHub
                        </Button>

                        <Paragraph style={{
                            fontSize: '12px',
                            color: '#86868b',
                            margin: '24px 0 0'
                        }}>
                            © 2025 Open Headers
                        </Paragraph>
                    </div>
                ) : (
                    <div className="tab-content">
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <Button
                                icon={<CompassOutlined />}
                                onClick={() => openExternal('https://chromewebstore.google.com/detail/ablaikadpbfblkmhpmbbnbbfjoibeejb')}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    borderRadius: '8px',
                                    height: '36px'
                                }}
                            >
                                Chrome Extension
                            </Button>
                            <Button
                                icon={<CompassOutlined />}
                                onClick={() => openExternal('https://microsoftedge.microsoft.com/addons/detail/open-headers/gnbibobkkddlflknjkgcmokdlpddegpo')}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    borderRadius: '8px',
                                    height: '36px'
                                }}
                            >
                                Edge Extension
                            </Button>
                            <Button
                                icon={<CompassOutlined />}
                                onClick={() => openExternal('https://addons.mozilla.org/en-US/firefox/addon/open-headers/')}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    borderRadius: '8px',
                                    height: '36px'
                                }}
                            >
                                Firefox Extension
                            </Button>
                        </Space>
                    </div>
                )}

                {/* Close Button */}
                <div style={{ marginTop: '24px' }}>
                    <Button
                        onClick={onClose}
                        style={{
                            width: '100%',
                            borderRadius: '8px',
                            background: '#f5f5f7'
                        }}
                    >
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default AboutModal;