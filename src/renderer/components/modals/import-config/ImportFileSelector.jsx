import React from 'react';
import { Tabs, Alert, Upload, Space, Typography, Tooltip, Button } from 'antd';
import { FileOutlined, FolderOutlined, UploadOutlined, QuestionCircleOutlined } from '@ant-design/icons';

const { Paragraph } = Typography;

/**
 * ImportFileSelector component for file selection with multiple import modes
 * Provides tabbed interface for single file vs separate files import
 * 
 * @param {string} importType - Current import type ('single' or 'separate')
 * @param {function} onImportTypeChange - Handler for import type changes
 * @param {boolean} analyzing - Whether files are being analyzed
 * @param {Object} fileData - Main file data object
 * @param {Object} envFileData - Environment file data object
 * @param {function} onFileSelect - Handler for file selection
 * @param {function} onFileRemove - Handler for main file removal
 * @param {function} onEnvFileRemove - Handler for environment file removal
 * @param {string} fileError - File error message if any
 * @param {function} onFileErrorClear - Handler for clearing file errors
 */
const ImportFileSelector = ({
    importType,
    onImportTypeChange,
    analyzing,
    fileData,
    envFileData,
    onFileSelect,
    onFileRemove,
    onEnvFileRemove,
    fileError,
    onFileErrorClear
}) => {
    return (
        <Tabs
            activeKey={importType}
            onChange={(key) => {
                onImportTypeChange(key);
                // Clear error when switching tabs
                if (fileError) {
                    onFileErrorClear();
                }
            }}
            items={[
                {
                    key: 'single',
                    label: (
                        <Space>
                            <FileOutlined />
                            <span>Single File</span>
                            <Tooltip title="Import everything from one combined configuration file">
                                <QuestionCircleOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                            </Tooltip>
                        </Space>
                    ),
                    children: (
                        <div>
                            {/* Single file mode explanation */}
                            <Alert
                                message="Single File Import"
                                description="Use this option when you have one JSON file that contains all your configuration data (sources, rules, proxy rules, and optionally environment variables)."
                                type="info"
                                showIcon
                                style={{ marginBottom: 16 }}
                            />
                            
                            {/* Single file upload area */}
                            <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed #d9d9d9', borderRadius: '6px' }}>
                                <Upload
                                    accept=".json"
                                    showUploadList={false}
                                    beforeUpload={(file) => onFileSelect(file)}
                                    disabled={analyzing}
                                >
                                    <Button 
                                        type="primary" 
                                        icon={<UploadOutlined />} 
                                        size="large"
                                        disabled={analyzing}
                                    >
                                        Browse Files
                                    </Button>
                                </Upload>
                                <div style={{ marginTop: '12px', color: '#8c8c8c' }}>
                                    Accepts any Open Headers JSON file (combined or environment-only)
                                </div>
                            </div>
                            
                            {/* Selected file confirmation */}
                            {fileData && (
                                <Alert
                                    message={`Selected: ${fileData.file.name}`}
                                    type="success"
                                    showIcon
                                    closable
                                    onClose={onFileRemove}
                                    style={{ marginTop: 16 }}
                                />
                            )}
                        </div>
                    )
                },
                {
                    key: 'separate',
                    label: (
                        <Space>
                            <FolderOutlined />
                            <span>Separate Files</span>
                            <Tooltip title="Import configuration and environment variables from separate files">
                                <QuestionCircleOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                            </Tooltip>
                        </Space>
                    ),
                    children: (
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <Alert
                                message="Separate Files Import"
                                description="Use this option when you want to keep environment variables (which may contain sensitive data) in a separate file from your main configuration."
                                type="info"
                                showIcon
                                style={{ marginBottom: 16 }}
                            />
                            
                            {/* Main Configuration File */}
                            <div>
                                <span style={{ fontWeight: 'bold' }}>Main Configuration File:</span>
                                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                                    Contains sources, rules, and proxy rules (without sensitive environment values)
                                </Paragraph>
                                <div style={{ textAlign: 'center', padding: '30px 20px', border: '1px dashed #d9d9d9', borderRadius: '6px' }}>
                                    <Upload
                                        accept=".json"
                                        showUploadList={false}
                                        beforeUpload={(file) => onFileSelect(file)}
                                        disabled={analyzing}
                                    >
                                        <Button 
                                            icon={<UploadOutlined />}
                                            disabled={analyzing}
                                        >
                                            Browse Files
                                        </Button>
                                    </Upload>
                                    <div style={{ marginTop: '8px', color: '#8c8c8c', fontSize: '12px' }}>
                                        Must contain sources, rules, or proxy rules (not environment-only)
                                    </div>
                                </div>
                                {fileData && (
                                    <Alert
                                        message={`Selected: ${fileData.file.name}`}
                                        type="success"
                                        showIcon
                                        closable
                                        onClose={onFileRemove}
                                        style={{ marginTop: 8 }}
                                    />
                                )}
                            </div>
                            
                            {/* Environment File */}
                            <div>
                                <span style={{ fontWeight: 'bold' }}>Environment File (Optional):</span>
                                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                                    Contains environment variable definitions and values (can be imported independently)
                                </Paragraph>
                                <div style={{ textAlign: 'center', padding: '30px 20px', border: '1px dashed #d9d9d9', borderRadius: '6px' }}>
                                    <Upload
                                        accept=".json"
                                        showUploadList={false}
                                        beforeUpload={(file) => onFileSelect(file, true)}
                                        disabled={analyzing}
                                    >
                                        <Button 
                                            icon={<UploadOutlined />}
                                            disabled={analyzing}
                                        >
                                            Browse Files
                                        </Button>
                                    </Upload>
                                    <div style={{ marginTop: '8px', color: '#8c8c8c', fontSize: '12px' }}>
                                        Must contain only environment data (no sources, rules, or proxy rules)
                                    </div>
                                </div>
                                {envFileData && (
                                    <Alert
                                        message="Environment file loaded"
                                        type="success"
                                        showIcon
                                        closable
                                        onClose={onEnvFileRemove}
                                        style={{ marginTop: 8 }}
                                    />
                                )}
                            </div>
                        </Space>
                    )
                }
            ]}
        />
    );
};

export default ImportFileSelector;