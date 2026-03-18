import React, { useState, useEffect } from 'react';
import { Modal, Space, Typography, Button, message, theme } from 'antd';
import { ImportOutlined, UploadOutlined } from '@ant-design/icons';
import { DATA_FORMAT_VERSION } from '../../../../config/version.esm';

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
interface ImportModalProps {
    visible: boolean;
    onClose: () => void;
    onImport: ((data: Record<string, unknown>) => Promise<void>) | null;
    preloadedEnvData: Record<string, unknown> | null;
}

interface FileAnalysis {
    version: string | number;
    hasEnvironmentSchema: boolean;
    hasEnvironments: boolean;
    hasSources: boolean;
    hasRules: boolean;
    hasProxyRules: boolean;
    variableCount: number;
    environmentCount: number;
    sourceCount: number;
    ruleCount: number;
    proxyRuleCount: number;
    isEmpty: boolean;
    rawData: Record<string, unknown>;
    environments: Record<string, { varCount: number }>;
    [key: string]: unknown;
}

interface FileEntry {
    file: File | (Blob & { name: string });
    content: string;
    analysis: FileAnalysis;
    [key: string]: unknown;
}

interface FilesState {
    single: FileEntry | null;
    sources: FileEntry | null;
    rules: FileEntry | null;
    proxyRules: FileEntry | null;
    environments: FileEntry | null;
}

interface CombinedEnvInfo {
    hasEnvironmentSchema: boolean;
    hasEnvironments: boolean;
    variableCount: number;
    environmentCount: number;
    [key: string]: unknown;
}

const ImportModal = ({ visible, onClose, onImport, preloadedEnvData }: ImportModalProps) => {
    // Get theme token
    const { token } = theme.useToken();

    // Step management - controls modal workflow
    const [step, setStep] = useState(1); // 1: File selection, 2: Configuration
    const [fileMode, setFileMode] = useState('single'); // 'single' or 'separate'

    // File handling state
    const [files, setFiles] = useState<FilesState>({
        single: null,
        sources: null,
        rules: null,
        proxyRules: null,
        environments: null
    });

    // File analysis results
    const [fileInfo, setFileInfo] = useState<FileAnalysis | null>(null);
    const [combinedEnvInfo, setCombinedEnvInfo] = useState<CombinedEnvInfo>({
        hasEnvironmentSchema: false,
        hasEnvironments: false,
        variableCount: 0,
        environmentCount: 0
    });
    const [workspaceInfo, setWorkspaceInfo] = useState<Record<string, unknown> | null>(null);
    
    /**
     * Analyze configuration data and extract information
     * @param {Object} data - The parsed configuration data
     * @returns {Object} Analysis result
     */
    const analyzeConfigData = (data: Record<string, unknown>): FileAnalysis => {
        let totalVariableCount = 0;
        let environmentCount = 0;
        const envs: Record<string, { varCount: number }> = {};
        
        // Count sources, rules, and proxy rules
        const sourceCount = data.sources ? Object.keys(data.sources as Record<string, unknown>).length : 0;
        const ruleCount = data.rules ? (data.rules as unknown[]).length : 0;
        const proxyRuleCount = data.proxyRules ? (data.proxyRules as unknown[]).length : 0;

        // Extract available environments
        if (data.environments) {
            Object.entries(data.environments as Record<string, Record<string, unknown>>).forEach(([envName, vars]) => {
                const varCount = Object.keys(vars).length;
                totalVariableCount += varCount;
                environmentCount++;
                envs[envName] = {
                    varCount: varCount
                };
            });
        }
        
        return {
            version: (data.version as string | number) || DATA_FORMAT_VERSION,
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
    const updateCombinedEnvInfo = (mainAnalysis: FileAnalysis | null, envAnalysis: FileAnalysis | null) => {
        setCombinedEnvInfo(() => {
            const main: Partial<FileAnalysis> = mainAnalysis || files.sources?.analysis || {};
            const env: Partial<FileAnalysis> = envAnalysis || files.environments?.analysis || {};

            return {
                hasEnvironmentSchema: !!(env.hasEnvironmentSchema || main.hasEnvironmentSchema),
                hasEnvironments: !!(env.hasEnvironments || main.hasEnvironments),
                variableCount: (env.variableCount || 0) + (main.variableCount || 0),
                environmentCount: Math.max(env.environmentCount || 0, main.environmentCount || 0)
            };
        });
    };
    
    // Environment management
    const [availableEnvironments, setAvailableEnvironments] = useState<Record<string, { varCount: number }>>({});
    const [selectedEnvironments, setSelectedEnvironments] = useState<Record<string, boolean>>({});
    
    // Import configuration state
    const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({
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
        if (visible && preloadedEnvData) {
            // Process the preloaded environment data
            try {
                console.log('ImportModal: Processing preloaded environment data');
                const analysis = analyzeConfigData(preloadedEnvData as Record<string, unknown>);
                
                // Create a virtual file for the environment data
                const envContent = JSON.stringify(preloadedEnvData);
                const virtualFile = new Blob([envContent], { type: 'application/json' }) as Blob & { name: string };
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
                    const allSelected: Record<string, boolean> = {};
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
    const handleFileSelection = async (file: File, isEnvironmentFile = false) => {
        try {
            const content = await file.text();
            const data = JSON.parse(content);
            const analysis = analyzeConfigData(data);
            
            // Update available environments
            if (analysis.environments) {
                setAvailableEnvironments(prev => ({ ...prev, ...analysis.environments }));
                
                // Select all environments by default
                const allSelected: Record<string, boolean> = {};
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
            message.error(`Failed to analyze file: ${(error as Error).message}`);
        }
        
        // Prevent default upload behavior
        return false;
    };

    /**
     * Handle item selection changes
     * @param {string} item - Item type to toggle
     */
    const handleItemChange = (item: string) => {
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
    const handleEnvironmentSelectionChange = (envName: string, checked: boolean) => {
        setSelectedEnvironments(prev => ({
            ...prev,
            [envName]: checked
        }));
    };

    /**
     * Select all environments
     */
    const handleSelectAllEnvironments = () => {
        const allSelected: Record<string, boolean> = {};
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
    const handleImportModeChange = (mode: string) => {
        setImportMode(mode);
    };

    /**
     * Handle workspace import toggle
     * @param {boolean} checked - Whether to import workspace
     */
    const handleImportWorkspaceChange = (checked: boolean) => {
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
                const filteredEnvData: Record<string, unknown> = {};

                if (selectedItems.environments) {
                    if (envData.environmentSchema) {
                        filteredEnvData.environmentSchema = envData.environmentSchema;
                    }
                    const envDataEnvs = envData.environments as Record<string, unknown> | undefined;
                    if (envDataEnvs) {
                        // Filter environments based on selection
                        const filteredEnvs: Record<string, unknown> = {};
                        selectedEnvNames.forEach(envName => {
                            if (envDataEnvs[envName]) {
                                filteredEnvs[envName] = envDataEnvs[envName];
                            }
                        });
                        filteredEnvData.environments = filteredEnvs;
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
                
                // Call parent's onImport handler and wait for it to complete
                if (onImport) await onImport(importData);
                onClose();
                return;
            }

            if (!files.single && !files.sources) {
                throw new Error('No files selected for import');
            }
            
            // Get the main file data
            const mainFile = files.single || files.sources;
            if (!mainFile) {
                throw new Error('No files selected for import');
            }
            const mainData = mainFile.analysis.rawData;
            const envData = files.environments?.analysis?.rawData;

            // Create filtered data based on selected items
            const filteredMainData: Record<string, unknown> = {};
            const filteredEnvData: Record<string, unknown> = {};

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
                const mainEnvs = mainData.environments as Record<string, unknown> | undefined;
                if (mainEnvs) {
                    // Filter environments based on selection
                    const filteredMainEnvs: Record<string, unknown> = {};
                    selectedEnvNames.forEach(envName => {
                        if (mainEnvs[envName]) {
                            filteredMainEnvs[envName] = mainEnvs[envName];
                        }
                    });
                    filteredMainData.environments = filteredMainEnvs;
                }

                // Include environment data from env file if present
                if (envData) {
                    if (envData.environmentSchema) {
                        filteredEnvData.environmentSchema = envData.environmentSchema;
                    }
                    const envDataEnvs = envData.environments as Record<string, unknown> | undefined;
                    if (envDataEnvs) {
                        // Filter environments based on selection
                        const filteredEnvEnvs: Record<string, unknown> = {};
                        selectedEnvNames.forEach(envName => {
                            if (envDataEnvs[envName]) {
                                filteredEnvEnvs[envName] = envDataEnvs[envName];
                            }
                        });
                        filteredEnvData.environments = filteredEnvEnvs;
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
            
            // Call parent's onImport handler and wait for it to complete
            // ImportService handles its own success/info notifications
            if (onImport) await onImport(importData);

            onClose();
        } catch (error) {
            console.error('Import failed:', error);
            // Only show error here — ImportService already shows success/info
            message.error(`Failed to import configuration: ${(error as Error).message}`);
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
                                updateCombinedEnvInfo(files.sources?.analysis ?? null, null);
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
                                fileInfo={fileInfo as { version?: string; sourceCount?: number; ruleCount?: number; proxyRuleCount?: number; isEmpty?: boolean; [key: string]: unknown } | null}
                                envFileData={files.environments}
                                hasAnyData={!!(fileInfo && (fileInfo.hasSources || fileInfo.hasRules || fileInfo.hasProxyRules || combinedEnvInfo.hasEnvironmentSchema || combinedEnvInfo.variableCount > 0))}
                                combinedEnvInfo={combinedEnvInfo}
                            />

                            {/* Item Selection */}
                            <ImportItemsSelector
                                fileInfo={fileInfo as unknown as Record<string, number | boolean>}
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