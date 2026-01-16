import React, { useState, useEffect } from 'react';
import { Modal, Space, Typography, Button, message, theme } from 'antd';
import { ImportOutlined, UploadOutlined } from '@ant-design/icons';
import { DATA_FORMAT_VERSION } from '../../../../config/version.esm.js';

import ImportFileSelector from './ImportFileSelector';
import ImportFileAnalysis from './ImportFileAnalysis';
import ImportItemsSelector from './ImportItemsSelector';
import ImportEnvironmentSelector from './ImportEnvironmentSelector';
import ImportWorkspaceCard from './ImportWorkspaceCard';
import ImportModeSelector from './ImportModeSelector';
import ImportWarnings from './ImportWarnings';

import { useWorkspaces } from '../../../contexts';

const { Title } = Typography;

/**
 * ImportModal component for importing configuration files
 * Orchestrates the import process with file selection, analysis, and configuration
 * Provides a step-by-step interface for importing various configuration types
 * 
 * @param {boolean} visible - Whether the modal is visible
 * @param {function} onClose - Handler for modal close events
 * @param {function} onImport - Handler for import action
 * @param {Object} preloadedEnvData - Preloaded environment data from protocol links
 */
const ImportModal = ({ visible, onClose, onImport, preloadedEnvData }) => {
    // Get theme token
    const { token } = theme.useToken();
    
    // Step management - controls modal workflow
    const [step, setStep] = useState(1); // 1: File selection, 2: Configuration
    const [fileMode, setFileMode] = useState('single'); // 'single' or 'separate'
    
    // File handling state
    const [files, setFiles] = useState({
        single: null,
        sources: null,
        rules: null,
        proxyRules: null,
        environments: null
    });
    
    // File analysis results
    const [fileInfo, setFileInfo] = useState(null);
    const [combinedEnvInfo, setCombinedEnvInfo] = useState({
        hasEnvironmentSchema: false,
        hasEnvironments: false,
        variableCount: 0,
        environmentCount: 0
    });
    const [workspaceInfo, setWorkspaceInfo] = useState(null);
    
    /**
     * Analyze configuration data and extract information
     * @param {Object} data - The parsed configuration data
     * @returns {Object} Analysis result
     */
    const analyzeConfigData = (data) => {
        let totalVariableCount = 0;
        let environmentCount = 0;
        const envs = {};
        
        // Count sources, rules, and proxy rules
        const sourceCount = data.sources ? Object.keys(data.sources).length : 0;
        const ruleCount = data.rules ? data.rules.length : 0;
        const proxyRuleCount = data.proxyRules ? data.proxyRules.length : 0;
        
        // Extract available environments
        if (data.environments) {
            Object.entries(data.environments).forEach(([envName, vars]) => {
                const varCount = Object.keys(vars).length;
                totalVariableCount += varCount;
                environmentCount++;
                envs[envName] = {
                    varCount: varCount
                };
            });
        }
        
        return {
            version: data.version || DATA_FORMAT_VERSION,
            hasEnvironmentSchema: !!data.environmentSchema,
            hasEnvironments: environmentCount > 0,
            hasSources: sourceCount > 0,
            hasRules: ruleCount > 0,
            hasProxyRules: proxyRuleCount > 0,
            variableCount: totalVariableCount,
            environmentCount: environmentCount,
            sourceCount: sourceCount,
            ruleCount: ruleCount,
            proxyRuleCount: proxyRuleCount,
            isEmpty: totalVariableCount === 0 && sourceCount === 0 && ruleCount === 0 && proxyRuleCount === 0,
            rawData: data,
            environments: envs
        };
    };
    
    /**
     * Update combined environment info for separate files mode
     * @param {Object} mainAnalysis - Analysis from main file
     * @param {Object} envAnalysis - Analysis from environment file
     */
    const updateCombinedEnvInfo = (mainAnalysis, envAnalysis) => {
        setCombinedEnvInfo(() => {
            const main = mainAnalysis || files.sources?.analysis || {};
            const env = envAnalysis || files.environments?.analysis || {};
            
            return {
                hasEnvironmentSchema: env.hasEnvironmentSchema || main.hasEnvironmentSchema || false,
                hasEnvironments: env.hasEnvironments || main.hasEnvironments || false,
                variableCount: (env.variableCount || 0) + (main.variableCount || 0),
                environmentCount: Math.max(env.environmentCount || 0, main.environmentCount || 0)
            };
        });
    };
    
    // Environment management
    const [availableEnvironments, setAvailableEnvironments] = useState({});
    const [selectedEnvironments, setSelectedEnvironments] = useState({});
    
    // Import configuration state
    const [selectedItems, setSelectedItems] = useState({
        sources: true,
        rules: true,
        proxyRules: true,
        environments: true
    });
    const [importMode, setImportMode] = useState('merge'); // 'merge' or 'replace'
    const [importWorkspace, setImportWorkspace] = useState(false);
    const [importing, setImporting] = useState(false);

    // Context hooks
    const { workspaces } = useWorkspaces();
    
    // Handle preloaded environment data from protocol links
    useEffect(() => {
        console.log('ImportModal: visible=', visible, 'preloadedEnvData=', preloadedEnvData);
        if (visible && preloadedEnvData) {
            // Process the preloaded environment data
            try {
                console.log('ImportModal: Processing preloaded environment data');
                const analysis = analyzeConfigData(preloadedEnvData);
                
                // Create a virtual file for the environment data
                const envContent = JSON.stringify(preloadedEnvData);
                const virtualFile = new Blob([envContent], { type: 'application/json' });
                virtualFile.name = 'imported-environment.json';
                
                // Set up the file info
                setFiles({
                    single: { 
                        file: virtualFile, 
                        content: envContent, 
                        analysis 
                    },
                    sources: null,
                    rules: null,
                    proxyRules: null,
                    environments: null
                });
                
                setFileInfo(analysis);
                setCombinedEnvInfo({
                    hasEnvironmentSchema: analysis.hasEnvironmentSchema,
                    hasEnvironments: analysis.hasEnvironments,
                    variableCount: analysis.variableCount,
                    environmentCount: analysis.environmentCount
                });
                
                // Set available environments
                if (analysis.environments) {
                    setAvailableEnvironments(analysis.environments);
                    
                    // Select all environments by default
                    const allSelected = {};
                    Object.keys(analysis.environments).forEach(envName => {
                        allSelected[envName] = true;
                    });
                    setSelectedEnvironments(allSelected);
                }
                
                // Pre-select only environments for import
                setSelectedItems({
                    sources: false,
                    rules: false,
                    proxyRules: false,
                    environments: true
                });
                
                // For protocol-based imports, use 'replace' mode to update existing variables
                setImportMode('replace');
                
                // Move directly to step 2 (configuration)
                setStep(2);
            } catch (error) {
                console.error('Error processing preloaded environment data:', error);
                message.error('Failed to process environment configuration');
            }
        }
    }, [visible, preloadedEnvData]);

    /**
     * Handle file selection and analysis
     * @param {File} file - Selected file
     * @param {boolean} isEnvironmentFile - Whether this is an environment file
     */
    const handleFileSelection = async (file, isEnvironmentFile = false) => {
        try {
            const content = await file.text();
            const data = JSON.parse(content);
            const analysis = analyzeConfigData(data);
            
            // Update available environments
            if (analysis.environments) {
                setAvailableEnvironments(prev => ({ ...prev, ...analysis.environments }));
                
                // Select all environments by default
                const allSelected = {};
                Object.keys(analysis.environments).forEach(envName => {
                    allSelected[envName] = true;
                });
                setSelectedEnvironments(prev => ({ ...prev, ...allSelected }));
            }
            
            // Extract workspace information if present
            if (data.workspace) {
                setWorkspaceInfo(data.workspace);
                setImportWorkspace(true);
            }
            
            if (fileMode === 'single') {
                setFiles(prev => ({ ...prev, single: { file, content, analysis } }));
                setFileInfo(analysis);
                setCombinedEnvInfo({
                    hasEnvironmentSchema: analysis.hasEnvironmentSchema,
                    hasEnvironments: analysis.hasEnvironments,
                    variableCount: analysis.variableCount,
                    environmentCount: analysis.environmentCount
                });
            } else {
                if (isEnvironmentFile) {
                    setFiles(prev => ({ ...prev, environments: { file, content, analysis } }));
                } else {
                    setFiles(prev => ({ ...prev, sources: { file, content, analysis } }));
                    setFileInfo(analysis);
                }
                
                // Update combined environment info for separate files mode
                updateCombinedEnvInfo(isEnvironmentFile ? null : analysis, isEnvironmentFile ? analysis : null);
            }
        } catch (error) {
            console.error('File analysis failed:', error);
            message.error(`Failed to analyze file: ${error.message}`);
        }
        
        // Prevent default upload behavior
        return false;
    };

    /**
     * Handle item selection changes
     * @param {string} item - Item type to toggle
     */
    const handleItemChange = (item) => {
        setSelectedItems(prev => ({
            ...prev,
            [item]: !prev[item]
        }));
    };

    /**
     * Handle environment selection changes
     * @param {string} envName - Environment name
     * @param {boolean} checked - Selection state
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
        Object.keys(availableEnvironments).forEach(envName => {
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

    /**
     * Handle import mode change
     * @param {string} mode - Import mode ('merge' or 'replace')
     */
    const handleImportModeChange = (mode) => {
        setImportMode(mode);
    };

    /**
     * Handle workspace import toggle
     * @param {boolean} checked - Whether to import workspace
     */
    const handleImportWorkspaceChange = (checked) => {
        setImportWorkspace(checked);
    };

    /**
     * Handle the import process
     */
    const handleImport = async () => {
        setImporting(true);
        
        try {
            // Get list of selected environment names
            const selectedEnvNames = Object.entries(selectedEnvironments)
                .filter(([_, selected]) => selected)
                .map(([envName, _]) => envName);

            // Handle separate files mode where only environment file is selected
            if (fileMode === 'separate' && !files.sources && files.environments) {
                const envData = files.environments.analysis.rawData;
                const filteredEnvData = {};
                
                if (selectedItems.environments) {
                    if (envData.environmentSchema) {
                        filteredEnvData.environmentSchema = envData.environmentSchema;
                    }
                    if (envData.environments) {
                        // Filter environments based on selection
                        filteredEnvData.environments = {};
                        selectedEnvNames.forEach(envName => {
                            if (envData.environments[envName]) {
                                filteredEnvData.environments[envName] = envData.environments[envName];
                            }
                        });
                    }
                }
                
                const importData = {
                    fileContent: JSON.stringify({}), // Empty main file
                    envFileContent: JSON.stringify(filteredEnvData),
                    selectedItems: { environments: true }, // Only environments are being imported
                    importMode,
                    selectedEnvironments: selectedEnvNames,
                    workspaceInfo: importWorkspace ? workspaceInfo : null
                };
                
                // Call parent's onImport handler (this needs to be passed as prop)
                if (onImport) onImport(importData);
                onClose();
                return;
            }

            if (!files.single && !files.sources) {
                throw new Error('No files selected for import');
            }
            
            // Get the main file data
            const mainFile = files.single || files.sources;
            const mainData = mainFile.analysis.rawData;
            const envData = files.environments?.analysis?.rawData;
            
            // Create filtered data based on selected items
            const filteredMainData = {};
            const filteredEnvData = {};
            
            // Always include version if present
            if (mainData.version) {
                filteredMainData.version = mainData.version;
            }
            
            // Only include selected data types
            if (selectedItems.sources && mainData.sources) {
                filteredMainData.sources = mainData.sources;
            }
            
            if (selectedItems.rules && mainData.rules) {
                filteredMainData.rules = mainData.rules;
            }
            
            if (selectedItems.proxyRules && mainData.proxyRules) {
                filteredMainData.proxyRules = mainData.proxyRules;
            }
            
            if (selectedItems.environments) {
                // Include environment data from main file
                if (mainData.environmentSchema) {
                    filteredMainData.environmentSchema = mainData.environmentSchema;
                }
                if (mainData.environments) {
                    // Filter environments based on selection
                    filteredMainData.environments = {};
                    selectedEnvNames.forEach(envName => {
                        if (mainData.environments[envName]) {
                            filteredMainData.environments[envName] = mainData.environments[envName];
                        }
                    });
                }
                
                // Include environment data from env file if present
                if (envData) {
                    if (envData.environmentSchema) {
                        filteredEnvData.environmentSchema = envData.environmentSchema;
                    }
                    if (envData.environments) {
                        // Filter environments based on selection
                        filteredEnvData.environments = {};
                        selectedEnvNames.forEach(envName => {
                            if (envData.environments[envName]) {
                                filteredEnvData.environments[envName] = envData.environments[envName];
                            }
                        });
                    }
                }
            }
            
            const importData = {
                fileContent: JSON.stringify(filteredMainData),
                envFileContent: envData && selectedItems.environments ? JSON.stringify(filteredEnvData) : null,
                selectedItems,
                importMode,
                selectedEnvironments: selectedEnvNames,
                workspaceInfo: importWorkspace ? workspaceInfo : null
            };
            
            // Call parent's onImport handler (this needs to be passed as prop)
            if (onImport) onImport(importData);
            
            message.success('Configuration imported successfully!');
            onClose();
        } catch (error) {
            console.error('Import failed:', error);
            message.error(`Failed to import configuration: ${error.message}`);
        } finally {
            setImporting(false);
        }
    };

    /**
     * Reset modal state
     */
    const handleModalClose = () => {
        setStep(1);
        setFileMode('single');
        setFiles({
            single: null,
            sources: null,
            rules: null,
            proxyRules: null,
            environments: null
        });
        setFileInfo(null);
        setCombinedEnvInfo({
            hasEnvironmentSchema: false,
            hasEnvironments: false,
            variableCount: 0,
            environmentCount: 0
        });
        setWorkspaceInfo(null);
        setAvailableEnvironments({});
        setSelectedEnvironments({});
        setSelectedItems({
            sources: true,
            rules: true,
            proxyRules: true,
            environments: true
        });
        setImportMode('merge');
        setImportWorkspace(false);
        setImporting(false);
        onClose();
    };

    /**
     * Check if import can proceed
     */
    const canImport = () => {
        const hasSelectedItems = Object.values(selectedItems).some(Boolean);
        const hasFiles = fileMode === 'single' ? files.single : 
            (files.sources || files.environments);
        return hasSelectedItems && hasFiles;
    };

    return (
        <Modal
            title={
                <Space>
                    <ImportOutlined />
                    <Title level={4} style={{ margin: 0 }}>
                        Import Configuration
                    </Title>
                </Space>
            }
            open={visible}
            onCancel={handleModalClose}
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
                    {/* Step 1: File Selection */}
                    {step === 1 && (
                        <ImportFileSelector
                            importType={fileMode}
                            onImportTypeChange={setFileMode}
                            analyzing={false}
                            fileData={fileMode === 'single' ? files.single : files.sources}
                            envFileData={files.environments}
                            onFileSelect={handleFileSelection}
                            onFileRemove={() => {
                                setFiles(prev => ({ ...prev, single: null, sources: null }));
                                setFileInfo(null);
                                setCombinedEnvInfo({ hasEnvironmentSchema: false, hasEnvironments: false, variableCount: 0, environmentCount: 0 });
                            }}
                            onEnvFileRemove={() => {
                                setFiles(prev => ({ ...prev, environments: null }));
                                // Recalculate combined env info without environment file
                                updateCombinedEnvInfo(files.sources?.analysis, null);
                            }}
                            fileError={null}
                            onFileErrorClear={() => {}}
                        />
                    )}

                    {/* Step 2: Import Configuration */}
                    {step === 2 && (
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            {/* File Analysis Results */}
                            <ImportFileAnalysis
                                fileInfo={fileInfo}
                                envFileData={files.environments}
                                hasAnyData={fileInfo && (fileInfo.hasSources || fileInfo.hasRules || fileInfo.hasProxyRules || combinedEnvInfo.hasEnvironmentSchema || combinedEnvInfo.variableCount > 0)}
                                combinedEnvInfo={combinedEnvInfo}
                            />

                            {/* Item Selection */}
                            <ImportItemsSelector
                                fileInfo={fileInfo}
                                combinedEnvInfo={combinedEnvInfo}
                                selectedItems={selectedItems}
                                onItemChange={handleItemChange}
                                importMode={importMode}
                            />

                            {/* Environment Variable Selection */}
                            <ImportEnvironmentSelector
                                selectedItems={selectedItems}
                                combinedEnvInfo={combinedEnvInfo}
                                availableEnvironments={availableEnvironments}
                                selectedEnvironments={selectedEnvironments}
                                onEnvironmentSelectionChange={handleEnvironmentSelectionChange}
                                onSelectAllEnvironments={handleSelectAllEnvironments}
                                onSelectNoEnvironments={handleSelectNoEnvironments}
                            />

                            {/* Workspace Configuration */}
                            <ImportWorkspaceCard
                                workspaceInfo={workspaceInfo}
                                importWorkspace={importWorkspace}
                                onImportWorkspaceChange={handleImportWorkspaceChange}
                                workspaces={workspaces}
                            />

                            {/* Import Mode Selection */}
                            <ImportModeSelector
                                importMode={importMode}
                                onImportModeChange={handleImportModeChange}
                            />

                            {/* Contextual Warnings */}
                            <ImportWarnings
                                importMode={importMode}
                                selectedItems={selectedItems}
                                combinedEnvInfo={combinedEnvInfo}
                            />
                        </Space>
                    )}
                </div>
                
                {/* Sticky Footer */}
                <div style={{
                    borderTop: `1px solid ${token.colorBorder}`,
                    padding: '16px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        {step === 2 && (
                            <Button onClick={() => setStep(1)}>
                                Back to File Selection
                            </Button>
                        )}
                    </div>
                    <Space>
                        <Button onClick={handleModalClose}>
                            Cancel
                        </Button>
                        {step === 1 && (
                            <Button
                                type="primary"
                                icon={<UploadOutlined />}
                                disabled={!((fileMode === 'single' && files.single) || 
                                    (fileMode === 'separate' && (files.sources || files.environments)))}
                                onClick={() => {
                                    // Files are already analyzed when selected, just move to next step
                                    setStep(2);
                                }}
                            >
                                Continue to Import Options
                            </Button>
                        )}
                        {step === 2 && (
                            <Button
                                type="primary"
                                icon={<ImportOutlined />}
                                loading={importing}
                                disabled={!canImport()}
                                onClick={handleImport}
                            >
                                Import Selected Items
                            </Button>
                        )}
                    </Space>
                </div>
            </div>
        </Modal>
    );
};

export default ImportModal;