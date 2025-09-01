import React, { useState, useEffect } from 'react';
import { Modal, Space, Button, theme } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { useEnvironments, useWorkspaces } from '../../../contexts';
import ExportPurposeSelector from './ExportPurposeSelector';
import ExportItemsSelector from './ExportItemsSelector';
import EnvironmentVariablesCard from './EnvironmentVariablesCard';
import WorkspaceConfigCard from './WorkspaceConfigCard';
import FileFormatSelector from './FileFormatSelector';
import ExportWarnings from './ExportWarnings';

/**
 * ExportModal component for exporting workspace configuration
 * Provides comprehensive interface for selecting export options including
 * purpose, items, environment variables, workspace config, and file format
 */
const ExportModal = ({ visible, onCancel, onExport }) => {
    const { token } = theme.useToken();
    const { environments, environmentsReady } = useEnvironments();
    const { workspaces, activeWorkspaceId } = useWorkspaces();
    
    // Export configuration state
    const [selectedItems, setSelectedItems] = useState({
        rules: true,
        sources: true,
        proxyRules: true
    });
    
    const [environmentOption, setEnvironmentOption] = useState('schema'); // 'none', 'schema', 'full'
    const [fileFormat, setFileFormat] = useState('single'); // 'single', 'separate'
    const [exportPurpose, setExportPurpose] = useState('team'); // 'team', 'backup'
    const [selectedEnvironments, setSelectedEnvironments] = useState({});
    const [includeWorkspace, setIncludeWorkspace] = useState(false);
    const [includeCredentials, setIncludeCredentials] = useState(false);
    
    // Get current workspace information
    const currentWorkspace = workspaces?.find(w => w.id === activeWorkspaceId);
    const isGitWorkspace = currentWorkspace?.type === 'git';

    /**
     * Initialize selected environments when environments load or modal opens
     */
    useEffect(() => {
        if (visible && environmentsReady && environments) {
            // Select all environments by default
            const allSelected = {};
            Object.keys(environments).forEach(envName => {
                allSelected[envName] = true;
            });
            setSelectedEnvironments(allSelected);
        }
    }, [visible, environmentsReady, environments]);
    
    /**
     * Reset workspace-related state when modal closes
     */
    useEffect(() => {
        if (!visible) {
            setIncludeWorkspace(false);
            setIncludeCredentials(false);
        }
    }, [visible]);

    /**
     * Handle export action with all selected options
     */
    const handleExport = () => {
        // Get list of selected environment names
        const selectedEnvNames = Object.entries(selectedEnvironments)
            .filter(([_, selected]) => selected)
            .map(([envName, _]) => envName);

        onExport({
            selectedItems,
            environmentOption,
            // Force single file format when no environment variables
            fileFormat: environmentOption === 'none' ? 'single' : fileFormat,
            selectedEnvironments: (environmentOption === 'schema' || environmentOption === 'full') ? selectedEnvNames : null,
            includeWorkspace: isGitWorkspace ? includeWorkspace : false,
            includeCredentials: includeWorkspace ? includeCredentials : false,
            currentWorkspace: includeWorkspace ? currentWorkspace : null
        });
    };

    /**
     * Handle individual export item selection changes
     */
    const handleItemChange = (item) => {
        setSelectedItems(prev => ({
            ...prev,
            [item]: !prev[item]
        }));
    };

    /**
     * Auto-select recommended options based on export purpose
     */
    const handlePurposeChange = (value) => {
        setExportPurpose(value);
        if (value === 'team') {
            setEnvironmentOption('schema');
            setFileFormat('single');
        } else {
            setEnvironmentOption('full');
            setFileFormat('single');
        }
    };

    /**
     * Handle environment selection changes
     */
    const handleEnvironmentSelectionChange = (envName, checked) => {
        setSelectedEnvironments(prev => ({
            ...prev,
            [envName]: checked
        }));
    };

    /**
     * Select all environments
     */
    const handleSelectAllEnvironments = () => {
        const allSelected = {};
        Object.keys(environments).forEach(envName => {
            allSelected[envName] = true;
        });
        setSelectedEnvironments(allSelected);
    };

    /**
     * Deselect all environments
     */
    const handleSelectNoEnvironments = () => {
        setSelectedEnvironments({});
    };

    // Determine if export button should be disabled
    const isExportDisabled = (!selectedItems.rules && !selectedItems.sources && !selectedItems.proxyRules) ||
                            (environmentOption === 'full' && Object.values(selectedEnvironments).every(v => !v));

    return (
        <Modal
            title={
                <Space>
                    <ExportOutlined />
                    <span>Export Workspace Configuration</span>
                </Space>
            }
            open={visible}
            onCancel={onCancel}
            width={700}
            height={600}
            footer={null}
            styles={{
                body: {
                    padding: 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column'
                }
            }}
        >
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: '550px'
            }}>
                {/* Scrollable Content Area */}
                <div style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: '24px',
                    paddingBottom: '16px'
                }}>
                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                        {/* Export Purpose Selection */}
                        <ExportPurposeSelector
                            exportPurpose={exportPurpose}
                            onPurposeChange={handlePurposeChange}
                        />

                        {/* What to Export */}
                        <ExportItemsSelector
                            selectedItems={selectedItems}
                            onItemChange={handleItemChange}
                        />

                        {/* Environment Variables Configuration */}
                        <EnvironmentVariablesCard
                            exportPurpose={exportPurpose}
                            environmentOption={environmentOption}
                            onEnvironmentOptionChange={setEnvironmentOption}
                            fileFormat={fileFormat}
                            onFileFormatChange={setFileFormat}
                            environments={environments}
                            environmentsReady={environmentsReady}
                            selectedEnvironments={selectedEnvironments}
                            onEnvironmentSelectionChange={handleEnvironmentSelectionChange}
                            onSelectAllEnvironments={handleSelectAllEnvironments}
                            onSelectNoEnvironments={handleSelectNoEnvironments}
                        />

                        {/* Workspace Configuration */}
                        <WorkspaceConfigCard
                            isGitWorkspace={isGitWorkspace}
                            includeWorkspace={includeWorkspace}
                            includeCredentials={includeCredentials}
                            onIncludeWorkspaceChange={setIncludeWorkspace}
                            onIncludeCredentialsChange={setIncludeCredentials}
                        />

                        {/* File Format Selection */}
                        <FileFormatSelector
                            fileFormat={fileFormat}
                            onFileFormatChange={setFileFormat}
                            environmentOption={environmentOption}
                        />

                        {/* Contextual Warnings and Info */}
                        <ExportWarnings
                            environmentOption={environmentOption}
                            includeWorkspace={includeWorkspace}
                            includeCredentials={includeCredentials}
                            exportPurpose={exportPurpose}
                        />
                    </Space>
                </div>
                
                {/* Sticky Footer */}
                <div style={{
                    borderTop: `1px solid ${token.colorBorder}`,
                    padding: '16px 24px',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center'
                }}>
                    <Space>
                        <Button onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            icon={<ExportOutlined />}
                            disabled={isExportDisabled}
                            onClick={handleExport}
                        >
                            Export
                        </Button>
                    </Space>
                </div>
            </div>
        </Modal>
    );
};

export default ExportModal;