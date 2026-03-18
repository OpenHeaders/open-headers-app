import React, { useState, useEffect, useCallback } from 'react';
import { App, Card, Space, Typography, Tag, Tooltip, Button, InputNumber, Alert } from 'antd';
import { CopyOutlined, SafetyCertificateOutlined, FolderOpenOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

/**
 * ConnectionsServerStatus - WebSocket server status display
 *
 * Shows WS and WSS server running state, ports, certificate fingerprint,
 * certificate file path, trust status, and trust action button.
 * Follows the same UI pattern as CLI and Proxy server controls.
 *
 * @param {Object} status - Current connection status from useConnectionsServer
 * @param {boolean} tutorialMode - Whether to show educational content
 * @returns {JSX.Element} Server status card
 */
interface ConnectionsServerStatus {
    wsServerRunning?: boolean;
    wssServerRunning?: boolean;
    wsPort?: number;
    wssPort?: number;
    certificateFingerprint?: string;
    certificatePath?: string;
    certificateSubject?: string;
    certificateExpiry?: string;
}
interface ConnectionsServerStatusProps { status: ConnectionsServerStatus; tutorialMode: boolean; }
const ConnectionsServerStatus = ({ status, tutorialMode }: ConnectionsServerStatusProps) => {
    const { message } = App.useApp();
    const [fingerprintCopied, setFingerprintCopied] = useState(false);
    const [pathCopied, setPathCopied] = useState(false);
    const [certTrusted, setCertTrusted] = useState(null); // null = loading, true/false
    const [trustLoading, setTrustLoading] = useState(false);

    const checkTrust = useCallback(async () => {
        if (!status.wssServerRunning || !status.certificatePath) {
            setCertTrusted(null);
            return;
        }
        try {
            const result = await window.electronAPI.wsCheckCertTrust();
            setCertTrusted(result.trusted);
        } catch {
            setCertTrusted(null);
        }
    }, [status.wssServerRunning, status.certificatePath]);

    useEffect(() => {
        checkTrust();
    }, [checkTrust]);

    const handleTrustCert = async () => {
        setTrustLoading(true);
        try {
            const result = await window.electronAPI.wsTrustCert();
            if (result.success) {
                message.success('Certificate trusted successfully');
                setCertTrusted(true);
            } else {
                message.error(result.error || 'Failed to trust certificate');
            }
        } catch (err) {
            message.error(err.message || 'Failed to trust certificate');
        } finally {
            setTrustLoading(false);
            // Re-check trust status
            setTimeout(checkTrust, 500);
        }
    };

    const handleUntrustCert = async () => {
        setTrustLoading(true);
        try {
            const result = await window.electronAPI.wsUntrustCert();
            // Brief delay so the user sees the loading state
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (result.success) {
                message.success('Certificate removed from trust store');
                setCertTrusted(false);
            } else {
                message.error(result.error || 'Failed to remove certificate');
            }
        } catch (err) {
            message.error(err.message || 'Failed to remove certificate');
        } finally {
            setTrustLoading(false);
            setTimeout(checkTrust, 500);
        }
    };

    const handleCopyFingerprint = () => {
        if (status.certificateFingerprint) {
            navigator.clipboard.writeText(status.certificateFingerprint);
            message.success('Fingerprint copied to clipboard');
            setFingerprintCopied(true);
            setTimeout(() => setFingerprintCopied(false), 2000);
        }
    };

    const handleCopyPath = () => {
        if (status.certificatePath) {
            navigator.clipboard.writeText(status.certificatePath);
            message.success('Path copied to clipboard');
            setPathCopied(true);
            setTimeout(() => setPathCopied(false), 2000);
        }
    };

    const handleRevealCert = () => {
        if (status.certificatePath) {
            window.electronAPI.showItemInFolder(status.certificatePath);
        }
    };

    const bothRunning = status.wsServerRunning && status.wssServerRunning;
    const anyRunning = status.wsServerRunning || status.wssServerRunning;

    return (
        <Card>
            <Space direction="vertical" style={{ width: '100%' }}>
                {/* Header row: title + status + port controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                        <Title level={4} style={{ margin: 0 }}>WebSocket Server</Title>
                        <Tag color={bothRunning ? 'success' : anyRunning ? 'warning' : 'error'}>
                            {bothRunning ? 'Running' : anyRunning ? 'Partial' : 'Stopped'}
                        </Tag>
                    </Space>
                    <Space align="start">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <InputNumber
                                addonBefore="WS"
                                value={status.wsPort}
                                disabled
                                style={{ width: 130 }}
                            />
                            {status.wssServerRunning && certTrusted !== null && (
                                <Tooltip title={certTrusted
                                    ? 'Remove certificate from OS trust store'
                                    : 'Add certificate to your OS trust store so browsers accept the secure WSS connection'
                                }>
                                    <Button
                                        type={certTrusted ? 'default' : 'primary'}
                                        size="small"
                                        icon={<SafetyCertificateOutlined />}
                                        loading={trustLoading}
                                        onClick={certTrusted ? handleUntrustCert : handleTrustCert}
                                        block
                                        style={{ borderRadius: '0 0 6px 6px' }}
                                    >
                                        {certTrusted ? 'Delete cert' : 'Trust cert'}
                                    </Button>
                                </Tooltip>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <InputNumber
                                addonBefore="WSS"
                                value={status.wssPort}
                                disabled
                                style={{ width: 140 }}
                            />
                            {status.wssServerRunning && certTrusted !== null && (
                                <Tag
                                    icon={certTrusted ? <SafetyCertificateOutlined /> : null}
                                    color={certTrusted ? 'success' : 'warning'}
                                    style={{
                                        margin: 0,
                                        borderRadius: '0 0 6px 6px',
                                        textAlign: 'center',
                                        padding: '2px 0',
                                        width: '100%',
                                        display: 'flex',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {certTrusted ? 'Trusted' : 'Not trusted'}
                                </Tag>
                            )}
                        </div>
                    </Space>
                </div>

                {/* Certificate info panel */}
                {status.wssServerRunning && (status.certificateFingerprint || status.certificatePath) && (
                    <div style={{
                        background: 'var(--ant-color-fill-quaternary)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        marginTop: 4
                    }}>
                        {/* Fingerprint row */}
                        {status.certificateFingerprint && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                                <Space size={4}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        WSS certificate fingerprint: <Text code style={{ fontSize: 12 }}>{status.certificateFingerprint}</Text>
                                    </Text>
                                    <Tooltip title={fingerprintCopied ? 'Copied!' : 'Copy fingerprint'}>
                                        <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyFingerprint} />
                                    </Tooltip>
                                </Space>
                            </div>
                        )}

                        {/* Certificate path row */}
                        {status.certificatePath && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                                <Space size={4}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Certificate file: <Text code style={{ fontSize: 12 }}>{status.certificatePath}</Text>
                                    </Text>
                                    <Tooltip title={pathCopied ? 'Copied!' : 'Copy path'}>
                                        <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyPath} />
                                    </Tooltip>
                                    <Tooltip title="Reveal in file manager">
                                        <Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={handleRevealCert} />
                                    </Tooltip>
                                </Space>
                            </div>
                        )}

                        {/* Certificate subject + expiry row */}
                        {(status.certificateSubject || status.certificateExpiry) && (() => {
                            // Parse subject: "O=OpenHeaders\nCN=localhost" → "OpenHeaders (localhost)"
                            let subject = null;
                            if (status.certificateSubject) {
                                const parts = {};
                                status.certificateSubject.split('\n').forEach(line => {
                                    const [key, ...val] = line.split('=');
                                    if (key && val.length) parts[key.trim()] = val.join('=').trim();
                                });
                                const org = parts['O'];
                                const cn = parts['CN'];
                                subject = org && cn ? `${org} (${cn})` : org || cn || status.certificateSubject;
                            }

                            let expiryStr, label, isExpired, isExpiringSoon;
                            if (status.certificateExpiry) {
                                const expiry = new Date(status.certificateExpiry);
                                const now = new Date();
                                const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                isExpired = daysLeft <= 0;
                                isExpiringSoon = daysLeft > 0 && daysLeft <= 30;
                                expiryStr = expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                                label = isExpired
                                    ? 'Expired'
                                    : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;
                            }

                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {subject && (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            Certificate name: <Text code style={{ fontSize: 12 }}>{subject}</Text>
                                        </Text>
                                    )}
                                    {expiryStr && (
                                        <>
                                            {subject && <Text type="secondary" style={{ fontSize: 12 }}>·</Text>}
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                Expires: <Text code style={{ fontSize: 12 }}>{expiryStr}</Text>
                                            </Text>
                                            <Tag
                                                color={isExpired ? 'error' : isExpiringSoon ? 'warning' : 'default'}
                                                style={{ margin: 0 }}
                                            >
                                                {label}
                                            </Tag>
                                        </>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Info panel */}
                {tutorialMode !== false && (
                    <Alert
                        style={{ marginTop: '16px' }}
                        message="About WebSocket Servers"
                        description={
                            <div>
                                <div>WebSocket servers enable real-time communication between this app and your browser extensions.</div>
                                <div style={{ marginTop: 8 }}>
                                    <Text code>WS :{status.wsPort}</Text> — Used by Chrome, Edge, Safari
                                </div>
                                <div style={{ marginTop: 4 }}>
                                    <Text code>WSS :{status.wssPort}</Text> — Secure connection for Firefox
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    Both listen on localhost only — connections are never exposed to your network, only local browser extensions can connect.
                                </div>
                            </div>
                        }
                        type="info"
                        showIcon
                        closable
                    />
                )}
            </Space>
        </Card>
    );
};

export default ConnectionsServerStatus;
