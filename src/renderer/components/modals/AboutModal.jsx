import React, { useState } from 'react';
import { Modal, Typography, Button, Space, Divider, theme } from 'antd';
import { GlobalOutlined, CompassOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

/**
 * About Modal Component
 * 
 * Displays application information, version details, and browser extension links
 * in a clean, modern design with tabbed interface.
 * 
 * Features:
 * - App icon, name, and version display
 * - About tab with website link and copyright
 * - Extensions tab with browser extension store links
 * - Responsive layout with consistent styling
 * - Apple-inspired minimalist design
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.open - Whether the modal is visible
 * @param {Function} props.onClose - Callback function when modal is closed
 * @param {string} props.appVersion - Current application version
 * @returns {JSX.Element} About modal component
 */
const AboutModal = ({ open, onClose, appVersion }) => {
    const [activeTab, setActiveTab] = useState('about');
    const { token } = theme.useToken();

    /**
     * Opens external URLs safely in the default browser
     * Falls back to window.open if Electron API is not available
     * 
     * @param {string} url - The URL to open
     */
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
            styles={{
                body: {
                    padding: '32px 24px',
                    textAlign: 'center',
                    borderRadius: '12px',
                    background: token.colorBgLayout
                }
            }}
        >
            <div className="about-content">
                {/* Application Icon with rounded corners and shadow */}
                <div className="app-icon-container">
                    <img
                        src={String(require('../../images/icon128.png'))}
                        alt="Open Headers Logo"
                        className="app-icon"
                        style={{
                            width: 96,
                            height: 96,
                            borderRadius: '18px',
                            boxShadow: token.boxShadow,
                            margin: '0 auto 16px',
                            display: 'block'
                        }}
                    />
                </div>

                {/* Application Name and Version Display */}
                <Title level={3} style={{ margin: '0 0 4px', fontWeight: 500 }}>
                    Open Headers
                </Title>
                <Text style={{
                    fontSize: '14px',
                    color: token.colorTextSecondary,
                    display: 'block',
                    marginBottom: '20px'
                }}>
                    Version {appVersion}
                </Text>

                {/* Application Description */}
                <Paragraph style={{
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: token.colorText,
                    maxWidth: '340px',
                    margin: '0 auto 24px'
                }}>
                    Record your browser tab. Modify HTTP Traffic. Team Workspaces. Everything local.
                </Paragraph>

                <Divider style={{ margin: '0 0 24px' }} />

                {/* Tab Navigation - About and Extensions tabs */}
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

                {/* 
                    Tab Content Container
                    Fixed height prevents layout shift when switching tabs
                */}
                <div style={{
                    minHeight: '156px', // Fixed height to accommodate 3 buttons + spacing
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    {activeTab === 'about' ? (
                        <div className="tab-content" style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            height: '100%'
                        }}>
                            {/* About Tab Content */}
                            <div>
                                {/* Website Link Button */}
                                <Button
                                    icon={<GlobalOutlined />}
                                    onClick={() => openExternal('https://openheaders.io')}
                                    style={{
                                        width: '100%',
                                        marginBottom: '12px',
                                        borderRadius: '8px',
                                        height: '36px'
                                    }}
                                >
                                    Visit Website
                                </Button>
                            </div>

                            {/* Copyright Notice */}
                            <Paragraph style={{
                                fontSize: '12px',
                                color: token.colorTextSecondary,
                                margin: '0',
                                marginTop: 'auto'
                            }}>
                                © 2025 Open Headers
                            </Paragraph>
                        </div>
                    ) : (
                        <div className="tab-content">
                            {/* Extensions Tab Content - Browser Extension Store Links */}
                            <Space direction="vertical" style={{ width: '100%' }}>
                                {/* Chrome Web Store Link */}
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
                                {/* Microsoft Edge Add-ons Store Link */}
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
                                {/* Firefox Add-ons Store Link */}
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
                </div>

                {/* Modal Close Button */}
                <div style={{ marginTop: '24px' }}>
                    <Button
                        onClick={onClose}
                        style={{
                            width: '100%',
                            borderRadius: '8px',
                            background: token.colorBgTextHover
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