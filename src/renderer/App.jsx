import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from './components/app/AppLayout';
import { useExportImport } from './hooks/useExportImport';
import { useAppEffects } from './hooks/app';
import { useSourceRefresh } from './hooks/sources';
import { useSources, useEnvironments, useWorkspaces, useCentralizedWorkspace } from './hooks/useCentralizedWorkspace';
import { useSettings, useNavigation, useRefreshManager, useWorkspaceSwitch } from './contexts';
import { useWorkspaceSwitchIntegration } from './hooks/useWorkspaceSwitchIntegration';
import { showMessage } from './utils';
import WorkspaceSwitchOverlay from './components/common/WorkspaceSwitchOverlay';
import { CompleteWorkspaceSkeleton } from './components/common/skeletons/WorkspaceSkeleton';
import TeamWorkspaceAcceptInviteModal from './components/modals/TeamWorkspaceAcceptInviteModal';

const AppComponent = () => {
    // Core hooks
    const {
        sources,
        addSource,
        removeSource,
        refreshSource,
        updateSource,
        exportSources
    } = useSources();
    
    const { workspaces, activeWorkspaceId, createWorkspace, switchWorkspace } = useWorkspaces();
    
    // App initialization state
    const { isReady } = useCentralizedWorkspace();
    const [startupTimerCompleted, setStartupTimerCompleted] = useState(false);
    
    // Start minimum 1 second timer when React mounts
    useEffect(() => {
        const timer = setTimeout(() => {
            setStartupTimerCompleted(true);
        }, 1000);
        
        return () => clearTimeout(timer);
    }, []);
    
    // Hide CSS overlay only when both app is ready AND minimum 1 second has passed
    useEffect(() => {
        if (isReady && startupTimerCompleted) {
            const initialOverlay = document.getElementById('initial-loading-overlay');
            if (initialOverlay) {
                initialOverlay.classList.add('hidden');
                // Remove it completely after fade animation
                setTimeout(() => {
                    initialOverlay.remove();
                }, 300);
            }
        }
    }, [isReady, startupTimerCompleted]);
    
    
    // Workspace switching UX
    const { switchState} = useWorkspaceSwitch();
    useWorkspaceSwitchIntegration();
    const { settings, saveSettings } = useSettings();
    const { 
        environments, 
        generateEnvironmentSchema, 
        createEnvironment,
        setVariable 
    } = useEnvironments();
    
    // Navigation
    const { navigate, clearAllHighlights, ACTIONS, TARGETS } = useNavigation();
    
    // Refresh Manager
    const { removeSource: removeFromRefreshManager, manualRefresh } = useRefreshManager();
    
    // Component state
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = useState(null);
    const [settingsAction, setSettingsAction] = useState(null);
    const [aboutModalVisible, setAboutModalVisible] = useState(false);
    const [activeTab, setActiveTab] = useState('record-viewer');
    const [currentRecord, setCurrentRecord] = useState(null);
    const [recordPlaybackTime, setRecordPlaybackTime] = useState(0);
    const [autoHighlight, setAutoHighlight] = useState(
        settings?.autoHighlightTableEntries !== undefined ? settings.autoHighlightTableEntries : false
    );
    const [appVersion, setAppVersion] = useState('');
    const [tabScrollPositions, setTabScrollPositions] = useState({});
    
    // Team workspace invite processing
    const [inviteModalVisible, setInviteModalVisible] = useState(false);
    const [inviteData, setInviteData] = useState(null);
    
    // Environment import data for protocol links
    const [preloadedEnvData, setPreloadedEnvData] = useState(null);

    // Update autoHighlight when settings change
    useEffect(() => {
        if (settings?.autoHighlightTableEntries !== undefined) {
            setAutoHighlight(settings.autoHighlightTableEntries);
        }
    }, [settings?.autoHighlightTableEntries]);

    // Import/Export hook
    const {
        loading,
        exportModalVisible,
        importModalVisible,
        showExportModal,
        showImportModal,
        setExportModalVisible,
        setImportModalVisible,
        handleExport,
        handleImport
    } = useExportImport({
        appVersion,
        sources,
        activeWorkspaceId,
        exportSources,
        removeSource,
        workspaces,
        createWorkspace,
        switchWorkspace,
        environments,
        createEnvironment,
        setVariable,
        generateEnvironmentSchema
    });

    // Source refresh hook
    const { refreshSourceWithHttp, handleAddSource } = useSourceRefresh({
        sources,
        updateSource,
        refreshSource,
        manualRefresh,
        addSource
    });

    // App effects hook
    const { updateNotificationRef, handleCheckForUpdates } = useAppEffects({
        setAppVersion,
        setActiveTab,
        setCurrentRecord,
        refreshSource,
        activeWorkspaceId,
        navigate,
        clearAllHighlights,
        ACTIONS,
        TARGETS,
        setSettingsInitialTab,
        setSettingsVisible,
        setSettingsAction
    });

    // Clear highlights when main tab changes
    useEffect(() => {
        clearAllHighlights();
    }, [activeTab, clearAllHighlights]);

    // Wrap removeSource to also remove from RefreshManager
    const removeSourceWithRefresh = useCallback(async (sourceId) => {
        // Remove from RefreshManager first
        await removeFromRefreshManager(sourceId);
        // Then remove from sources
        return removeSource(sourceId);
    }, [removeFromRefreshManager, removeSource]);

    // Handle settings
    const handleOpenSettings = useCallback(() => {
        setSettingsVisible(true);
    }, []);

    const handleSettingsCancel = useCallback(() => {
        setSettingsVisible(false);
        setSettingsInitialTab(null); // Reset initial tab
        setSettingsAction(null); // Reset action
    }, []);

    const handleSettingsSave = useCallback(async (newSettings) => {
        const success = await saveSettings(newSettings);
        if (success) {
            setSettingsVisible(false);
            setSettingsInitialTab(null); // Reset initial tab
            setSettingsAction(null); // Reset action
            showMessage('success', 'Settings saved successfully');
        }
    }, [saveSettings]);

    // Handle about modal
    const handleOpenAbout = useCallback(() => {
        setAboutModalVisible(true);
    }, []);

    const handleAboutCancel = useCallback(() => {
        setAboutModalVisible(false);
    }, []);

    // Handle tab scroll positions
    const handleTabScrollPositionChange = useCallback((tab, scrollTop) => {
        setTabScrollPositions(prev => ({
            ...prev,
            [tab]: scrollTop
        }));
    }, []);

    // Handle team workspace invite processing
    const handleInviteSuccess = useCallback(() => {
        setInviteModalVisible(false);
        setInviteData(null);
    }, []);

    const handleInviteCancel = useCallback(() => {
        setInviteModalVisible(false);
        setInviteData(null);
    }, []);

    // Handle environment config import
    const handleEnvironmentConfigImport = useCallback(async (envData) => {
        console.log('=== ENVIRONMENT CONFIG IMPORT DEBUG ===');
        console.log('Processing environment config import:', envData);
        console.log('Current importModalVisible:', importModalVisible);
        console.log('showImportModal function exists:', typeof showImportModal === 'function');
        
        if (envData) {
            try {
                // Store the environment data to be used by the import modal
                console.log('Setting preloaded env data...');
                setPreloadedEnvData(envData);
                
                // Switch to environments tab first
                console.log('Switching to environments tab...');
                setActiveTab('environments');
                
                // Add a small delay to ensure the UI is ready (especially on Windows)
                console.log('Waiting 100ms before showing import modal...');
                setTimeout(() => {
                    // Show the import modal
                    console.log('Calling showImportModal()...');
                    showImportModal();
                    console.log('showImportModal() called successfully');
                }, 100);
            } catch (error) {
                console.error('Failed to process environment config:', error);
                showMessage('error', `Failed to process environment configuration: ${error.message}`);
            }
        } else {
            console.warn('handleEnvironmentConfigImport called with no data');
        }
    }, [showImportModal, importModalVisible]);

    // Listen for team workspace invite events
    useEffect(() => {
        console.log('=== SETTING UP IPC LISTENERS IN APP.JSX ===');
        console.log('window.electronAPI exists:', !!window.electronAPI);
        console.log('onProcessTeamWorkspaceInvite exists:', typeof window.electronAPI?.onProcessTeamWorkspaceInvite);
        console.log('onProcessEnvironmentConfigImport exists:', typeof window.electronAPI?.onProcessEnvironmentConfigImport);
        
        const handleTeamWorkspaceInvite = (inviteData) => {
            try {
                // Validate invite data
                if (!inviteData.workspaceName || !inviteData.repoUrl) {
                    throw new Error('Invalid invite data structure');
                }

                console.log('Processing team workspace invite:', inviteData);
                setInviteData(inviteData);
                setInviteModalVisible(true);

                // Automatically switch to workspaces tab to show the invite modal
                setActiveTab('workspaces');
            } catch (error) {
                console.error('Error processing invite:', error);
                showMessage('error', `Invalid invite: ${error.message}`);
            }
        };

        const handleErrorMessage = (errorData) => {
            showMessage('error', errorData.message);
        };


        // Set up event listeners
        const cleanupInviteListener = window.electronAPI?.onProcessTeamWorkspaceInvite?.(handleTeamWorkspaceInvite);
        const cleanupErrorListener = window.electronAPI?.onShowErrorMessage?.(handleErrorMessage);
        const cleanupEnvImportListener = window.electronAPI?.onProcessEnvironmentConfigImport?.((envData) => {
            console.log('=== IPC EVENT RECEIVED ===');
            console.log('App.jsx: Received environment config import event', envData);
            console.log('window.electronAPI exists:', !!window.electronAPI);
            console.log('onProcessEnvironmentConfigImport exists:', typeof window.electronAPI?.onProcessEnvironmentConfigImport);
            handleEnvironmentConfigImport(envData);
        });

        // Signal to main process that renderer is ready for protocol messages
        window.electronAPI?.signalRendererReady?.();
        console.log('Signaled to main process that renderer is ready');

        return () => {
            // Cleanup listeners
            if (cleanupInviteListener) {
                cleanupInviteListener();
            }
            if (cleanupErrorListener) {
                cleanupErrorListener();
            }
            if (cleanupEnvImportListener) {
                cleanupEnvImportListener();
            }
        };
    }, [handleEnvironmentConfigImport, setActiveTab]);

    return (
        <>
            {/* Main App Layout */}
            {switchState.switching ? (
                <div style={{ 
                    position: 'relative',
                    filter: 'blur(2px)',
                    pointerEvents: 'none',
                    opacity: 0.6,
                    transition: 'all 0.3s ease'
                }}>
                    <CompleteWorkspaceSkeleton />
                </div>
            ) : (
                <AppLayout
                    // App state
                    appVersion={appVersion}
                    activeTab={activeTab}
                    tabScrollPositions={tabScrollPositions}
                    settingsVisible={settingsVisible}
                    settingsInitialTab={settingsInitialTab}
                    settingsAction={settingsAction}
                    aboutModalVisible={aboutModalVisible}
                    exportModalVisible={exportModalVisible}
                    importModalVisible={importModalVisible}
                    currentRecord={currentRecord}
                    recordPlaybackTime={recordPlaybackTime}
                    autoHighlight={autoHighlight}
                    loading={loading}
                    settings={settings}
                    sources={sources}
                    // Event handlers
                    onTabChange={setActiveTab}
                    onTabScrollPositionChange={handleTabScrollPositionChange}
                    onRecordChange={setCurrentRecord}
                    onPlaybackTimeChange={setRecordPlaybackTime}
                    onAutoHighlightChange={setAutoHighlight}
                    onAddSource={handleAddSource}
                    onRemoveSource={removeSourceWithRefresh}
                    onRefreshSource={refreshSourceWithHttp}
                    onUpdateSource={updateSource}
                    onExport={showExportModal}
                    onImport={showImportModal}
                    onCheckForUpdates={handleCheckForUpdates}
                    onOpenSettings={handleOpenSettings}
                    onOpenAbout={handleOpenAbout}
                    onSettingsCancel={handleSettingsCancel}
                    onAboutCancel={handleAboutCancel}
                    onSettingsSave={handleSettingsSave}
                    onExportModalCancel={() => setExportModalVisible(false)}
                    onImportModalCancel={() => {
                        setImportModalVisible(false);
                        setPreloadedEnvData(null); // Clear preloaded data
                    }}
                    onHandleExport={handleExport}
                    onHandleImport={handleImport}
                    preloadedEnvData={preloadedEnvData}
                    // Refs
                    updateNotificationRef={updateNotificationRef}
                />
            )}
            
            {/* Workspace Switch Overlay */}
            <WorkspaceSwitchOverlay
                visible={switchState.switching}
                targetWorkspace={switchState.targetWorkspace}
            />
            
            {/* Team Workspace Invite Modal */}
            <TeamWorkspaceAcceptInviteModal
                visible={inviteModalVisible}
                inviteData={inviteData}
                onCancel={handleInviteCancel}
                onSuccess={handleInviteSuccess}
            />
        </>
    );
};

export default AppComponent;