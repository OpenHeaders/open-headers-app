import React, { useState } from 'react';
import { App, Card, Collapse, Segmented, Space, Switch, Typography, Tag, Button, InputNumber, Alert, Divider, Tooltip } from 'antd';
import {
    PlayCircleOutlined, PauseCircleOutlined, InfoCircleOutlined,
    CopyOutlined, ReloadOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

/**
 * Mask a token string: show first 4 and last 4 chars
 */
const maskToken = (token) => {
    if (!token || token.length <= 12) return token || '';
    return `${token.slice(0, 4)}..${token.slice(-4)}`;
};

/**
 * CliServerControls - Main CLI API server control panel
 *
 * Displays CLI API server status, token, uptime, and provides start/stop controls.
 * Shows discovery file path and available endpoints.
 *
 * @param {Object} status - Current CLI server status
 * @param {boolean} loading - Whether server operation is in progress
 * @param {boolean} tutorialMode - Whether to show educational content
 * @param {function} onToggleServer - Callback for start/stop operations
 * @param {function} onRegenerateToken - Callback to rotate the auth token
 * @returns {JSX.Element} CLI server control panel
 */
const CliServerControls = ({
    status,
    loading,
    tutorialMode,
    onToggleServer,
    onUpdatePort,
    onRegenerateToken
}) => {
    const { message } = App.useApp();
    const [showToken, setShowToken] = useState(false);
    const isWindows = navigator.platform === 'Win32';
    const [shellType, setShellType] = useState(isWindows ? 'powershell' : 'curl');
    const tokenValue = showToken && status.token ? status.token : '<token>';

    const handleCopyPath = () => {
        if (status.discoveryPath) {
            navigator.clipboard.writeText(status.discoveryPath);
            message.success('Value copied to clipboard');
        }
    };

    const handleCopyToken = () => {
        if (status.token) {
            navigator.clipboard.writeText(status.token);
            message.success('Value copied to clipboard');
        }
    };

    const copyCmd = (text) => {
        navigator.clipboard.writeText(text);
        message.success('Command copied to clipboard');
    };

    // Single-pass syntax highlighter for curl commands
    const highlightCmd = (cmd) => {
        const result = [];
        const c = (color, text, extra) => <span key={result.length} style={{ color, ...extra }}>{text}</span>;
        // Order matters: more specific patterns first
        const regex = /\b(curl)\b|(\\)\n|(-[HXd])\b|\b(GET|POST|PUT|DELETE|PATCH)\b|(https?:\/\/\S+)|("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|([{}[\]])|(')/gm;
        let last = 0;
        let match;
        while ((match = regex.exec(cmd)) !== null) {
            if (match.index > last) result.push(cmd.slice(last, match.index));
            if (match[1]) result.push(c('#7dd3fc', match[1]));                           // curl command
            else if (match[2]) result.push(c('#64748b', match[2]), '\n');                 // \ continuation
            else if (match[3]) result.push(c('#fbbf24', match[3]));                       // -H -X -d flags
            else if (match[4]) result.push(c('#c084fc', match[4]));                       // HTTP methods
            else if (match[5]) result.push(c('#93c5fd', match[5], { textDecoration: 'underline' })); // URLs
            else if (match[6]) result.push(c('#93c5fd', match[6]), ':');                  // JSON keys
            else if (match[7]) result.push(c('#a5d6a7', match[7]));                       // string values
            else if (match[8]) result.push(c('#fbbf24', match[8]));                       // booleans/null
            else if (match[9]) result.push(c('#94a3b8', match[9]));                       // braces
            else if (match[10]) result.push(c('#64748b', match[10]));                     // single quotes
            last = match.index + match[0].length;
        }
        if (last < cmd.length) result.push(cmd.slice(last));
        return result;
    };

    // Single-pass syntax highlighter for PowerShell commands
    const highlightPs = (cmd) => {
        const result = [];
        const c = (color, text, extra) => <span key={result.length} style={{ color, ...extra }}>{text}</span>;
        const regex = /\b(Invoke-RestMethod|ConvertTo-Json)\b|(`)\n|(-[A-Za-z]+)\b|(\$\w+)|(https?:\/\/\S+)|("(?:[^"\\]|\\.)*")\s*=|("(?:[^"\\]|\\.)*")|\b(POST|GET|PUT|DELETE|PATCH)\b|(@\{|[{}|;])/gm;
        let last = 0;
        let match;
        while ((match = regex.exec(cmd)) !== null) {
            if (match.index > last) result.push(cmd.slice(last, match.index));
            if (match[1]) result.push(c('#7dd3fc', match[1]));                           // cmdlets
            else if (match[2]) result.push(c('#64748b', match[2]), '\n');                 // ` continuation
            else if (match[3]) result.push(c('#fbbf24', match[3]));                       // -Parameters
            else if (match[4]) result.push(c('#67e8f9', match[4]));                       // $variables
            else if (match[5]) result.push(c('#93c5fd', match[5], { textDecoration: 'underline' })); // URLs
            else if (match[6]) result.push(c('#93c5fd', match[6]), '=');                  // hash keys
            else if (match[7]) result.push(c('#a5d6a7', match[7]));                       // string values
            else if (match[8]) result.push(c('#c084fc', match[8]));                       // HTTP methods
            else if (match[9]) result.push(c('#94a3b8', match[9]));                       // @{ } | ;
            last = match.index + match[0].length;
        }
        if (last < cmd.length) result.push(cmd.slice(last));
        return result;
    };

    const CodeBlock = ({ cmd }) => {
        const [copied, setCopied] = useState(false);
        const handleCopy = () => {
            copyCmd(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };
        return (
            <div style={{ margin: '4px 0 8px', maxWidth: '75%' }}>
                <pre style={{
                    background: '#1e293b',
                    borderRadius: '8px 8px 0 0',
                    padding: '14px 18px',
                    margin: 0,
                    fontSize: 12,
                    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                    color: '#e2e8f0',
                    overflowX: 'auto',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                }}>{(shellType === 'powershell' ? highlightPs : highlightCmd)(cmd)}</pre>
                <button
                    onClick={handleCopy}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '8px 16px',
                        margin: 0,
                        background: copied ? '#059669' : '#0052cc',
                        border: 'none',
                        borderRadius: '0 0 8px 8px',
                        cursor: 'pointer',
                        color: 'white',
                        fontSize: 13,
                        fontWeight: 500,
                        transition: 'background 0.2s ease'
                    }}
                >
                    <CopyOutlined /> {copied ? 'Copied!' : 'Copy command'}
                </button>
            </div>
        );
    };
    const paramTableStyle = {
        width: '100%',
        fontSize: 12,
        borderCollapse: 'collapse',
        marginBottom: 12
    };
    const thStyle = {
        textAlign: 'left',
        padding: '4px 8px',
        borderBottom: '1px solid var(--ant-color-border)',
        fontWeight: 600,
        fontSize: 11,
        color: 'var(--ant-color-text-secondary)'
    };
    const tdStyle = { padding: '3px 8px', fontSize: 12 };
    const tdReqStyle = { ...tdStyle, color: 'var(--ant-color-error)', fontWeight: 500 };
    const tdOptStyle = { ...tdStyle, color: 'var(--ant-color-text-tertiary)' };
    const paramCodeStyle = { fontSize: 11 };

    // Pre-built commands for curl and PowerShell
    const curlCmds = {
        health: `curl http://127.0.0.1:${status.port}/cli/health \\\n  -H "Authorization: Bearer ${tokenValue}"`,
        workspaceJoin: `curl -X POST http://127.0.0.1:${status.port}/cli/workspace/join \\\n  -H "Authorization: Bearer ${tokenValue}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "repoUrl": "https://github.com/org/repo.git",\n    "branch": "main",\n    "configPath": "config/open-headers.json",\n    "workspaceName": "My Team",\n    "authType": "token",\n    "authData": {"token": "ghp_...", "tokenType": "auto"},\n    "inviterName": "John"\n  }'`,
        envImport: `curl -X POST http://127.0.0.1:${status.port}/cli/environments/import \\\n  -H "Authorization: Bearer ${tokenValue}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "environments": {\n      "Default": {\n        "API_KEY": {"value": "sk-...", "isSecret": true}\n      }\n    }\n  }'`
    };
    const psCmds = {
        health: `Invoke-RestMethod -Uri "http://127.0.0.1:${status.port}/cli/health" \`\n  -Headers @{"Authorization" = "Bearer ${tokenValue}"}`,
        workspaceJoin: `$body = @{\n    repoUrl = "https://github.com/org/repo.git"\n    branch = "main"\n    configPath = "config/open-headers.json"\n    workspaceName = "My Team"\n    authType = "token"\n    authData = @{token = "ghp_..."; tokenType = "auto"}\n    inviterName = "John"\n} | ConvertTo-Json -Depth 3\n\nInvoke-RestMethod -Uri "http://127.0.0.1:${status.port}/cli/workspace/join" \`\n  -Method POST \`\n  -Headers @{"Authorization" = "Bearer ${tokenValue}"} \`\n  -ContentType "application/json" \`\n  -Body $body`,
        envImport: `$body = @{\n    environments = @{\n        Default = @{\n            API_KEY = @{value = "sk-..."; isSecret = $true}\n        }\n    }\n} | ConvertTo-Json -Depth 5\n\nInvoke-RestMethod -Uri "http://127.0.0.1:${status.port}/cli/environments/import" \`\n  -Method POST \`\n  -Headers @{"Authorization" = "Bearer ${tokenValue}"} \`\n  -ContentType "application/json" \`\n  -Body $body`
    };
    const cmds = shellType === 'powershell' ? psCmds : curlCmds;

    return (
        <Card>
            <Space direction="vertical" style={{ width: '100%' }}>
                {/* Header row: title + status + controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                        <Title level={4} style={{ margin: 0 }}>CLI Server</Title>
                        <Tag color={status.running ? 'default' : 'warning'}>
                            {status.running ? 'Running' : 'Stopped'}
                        </Tag>
                    </Space>
                    <Space>
                        <InputNumber
                            addonBefore="Port"
                            value={status.port}
                            onChange={onUpdatePort}
                            disabled={status.running}
                            style={{ width: 150 }}
                        />
                        <Button
                            type="primary"
                            icon={status.running ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                            onClick={onToggleServer}
                            loading={loading}
                        >
                            {status.running ? 'Stop' : 'Start'}
                        </Button>
                    </Space>
                </div>

                {/* Discovery file + Auth token (inline) */}
                {status.running && (status.discoveryPath || status.token) && (
                    <div style={{
                        background: 'var(--ant-color-fill-quaternary)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        marginTop: 4,
                        flexWrap: 'wrap'
                    }}>
                        {status.discoveryPath && (
                            <Space size={4}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Discovery file: <Text code style={{ fontSize: 12 }}>{status.discoveryPath}</Text>
                                </Text>
                                <Tooltip title="Copy path">
                                    <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyPath} />
                                </Tooltip>
                            </Space>
                        )}
                        {status.token && (
                            <Space size={4}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Auth token: <Text code style={{ fontSize: 12 }}>{maskToken(status.token)}</Text>
                                </Text>
                                <Tooltip title="Copy token">
                                    <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyToken} />
                                </Tooltip>
                                <Tooltip title="Regenerate token">
                                    <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRegenerateToken} />
                                </Tooltip>
                            </Space>
                        )}
                    </div>
                )}

                {/* Info panel */}
                {tutorialMode !== false && (
                    <Alert
                        style={{ marginTop: '16px' }}
                        message="About CLI Server"
                        description={
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Text>
                                    The CLI API server enables programmatic control of OpenHeaders from scripts and CLI tools.
                                    It listens on <Text code>127.0.0.1:{status.port}</Text> (localhost only) and requires a bearer token for authentication.
                                </Text>

                                <Divider style={{ margin: '8px 0' }} />

                                <Space size={12} align="center">
                                    <Text strong><InfoCircleOutlined /> Available Endpoints</Text>
                                    {isWindows && (
                                        <Segmented
                                            size="small"
                                            value={shellType}
                                            onChange={setShellType}
                                            options={[
                                                { label: 'curl', value: 'curl' },
                                                { label: 'PowerShell', value: 'powershell' }
                                            ]}
                                        />
                                    )}
                                    <Space size={6}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Include auth token</Text>
                                        <Switch size="small" checked={showToken} onChange={setShowToken} />
                                    </Space>
                                </Space>

                                <Collapse
                                    size="small"
                                    ghost
                                    items={[
                                        {
                                            key: 'health',
                                            label: <Text><Text code>GET /cli/health</Text> — Check if the app is running and ready.</Text>,
                                            children: (
                                                <CodeBlock cmd={cmds.health} />
                                            )
                                        },
                                        {
                                            key: 'workspace-join',
                                            label: <Text><Text code>POST /cli/workspace/join</Text> — Join a team workspace by git repo URL.</Text>,
                                            children: (() => {
                                                return (
                                                <>
                                                    <CodeBlock cmd={cmds.workspaceJoin} />
                                                    <table style={paramTableStyle}>
                                                        <thead>
                                                            <tr>
                                                                <th style={thStyle}>Parameter</th>
                                                                <th style={thStyle}>Required</th>
                                                                <th style={thStyle}>Description</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>repoUrl</Text></td><td style={tdReqStyle}>Yes</td><td style={tdStyle}>Git repository URL</td></tr>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>branch</Text></td><td style={tdOptStyle}>No</td><td style={tdStyle}>Branch name. Default: <Text code style={paramCodeStyle}>main</Text></td></tr>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>configPath</Text></td><td style={tdOptStyle}>No</td><td style={tdStyle}>Path to config file. Default: <Text code style={paramCodeStyle}>config/open-headers.json</Text></td></tr>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>workspaceName</Text></td><td style={tdOptStyle}>No</td><td style={tdStyle}>Display name. Default: <Text code style={paramCodeStyle}>Team Workspace</Text></td></tr>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>authType</Text></td><td style={tdOptStyle}>No</td><td style={tdStyle}>Auth method: <Text code style={paramCodeStyle}>none</Text> | <Text code style={paramCodeStyle}>token</Text> | <Text code style={paramCodeStyle}>ssh-key</Text> | <Text code style={paramCodeStyle}>basic</Text>. Default: <Text code style={paramCodeStyle}>none</Text></td></tr>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>authData</Text></td><td style={tdOptStyle}>No</td><td style={tdStyle}>Credentials for authType. Token: <Text code style={paramCodeStyle}>{`{"token", "tokenType"}`}</Text>. SSH: <Text code style={paramCodeStyle}>{`{"sshKey", "sshPassphrase"}`}</Text>. Basic: <Text code style={paramCodeStyle}>{`{"username", "password"}`}</Text></td></tr>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>inviterName</Text></td><td style={tdOptStyle}>No</td><td style={tdStyle}>Name of the person who shared the invite</td></tr>
                                                        </tbody>
                                                    </table>
                                                </>
                                                );
                                            })()
                                        },
                                        {
                                            key: 'env-import',
                                            label: <Text><Text code>POST /cli/environments/import</Text> — Import environment variables into the active workspace.</Text>,
                                            children: (() => {
                                                return (
                                                <>
                                                    <CodeBlock cmd={cmds.envImport} />
                                                    <table style={paramTableStyle}>
                                                        <thead>
                                                            <tr>
                                                                <th style={thStyle}>Parameter</th>
                                                                <th style={thStyle}>Required</th>
                                                                <th style={thStyle}>Description</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>environments</Text></td><td style={tdReqStyle}>Yes</td><td style={tdStyle}>Object mapping environment names to their variables</td></tr>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>environments[name]</Text></td><td style={tdReqStyle}>Yes</td><td style={tdStyle}>Object mapping variable names to their config</td></tr>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>value</Text></td><td style={tdReqStyle}>Yes</td><td style={tdStyle}>The variable value string</td></tr>
                                                            <tr><td style={tdStyle}><Text code style={paramCodeStyle}>isSecret</Text></td><td style={tdOptStyle}>No</td><td style={tdStyle}>Mask value in UI. Default: <Text code style={paramCodeStyle}>false</Text></td></tr>
                                                        </tbody>
                                                    </table>
                                                </>
                                                );
                                            })()
                                        }
                                    ]}
                                />
                            </Space>
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

export default CliServerControls;
