import { useState, useEffect, useCallback } from 'react';
import { App } from 'antd';
import { prepareAuthData, formatValidationDetails } from '../../utils';
import { TIMING } from '../../constants';

const { createLogger } = require('../../../../../utils/error-handling/logger');
const log = createLogger('GitActions');

/**
 * Custom hook for Git-related operations
 * 
 * Handles Git status monitoring, installation, and connection testing
 * with proper progress tracking and error handling.
 * 
 * @returns {Object} Git actions and state
 */
export const useGitActions = () => {
    const { message } = App.useApp();
    
    // Git-related state
    const [gitStatus, setGitStatus] = useState(null);
    const [checkingGitStatus, setCheckingGitStatus] = useState(false);
    const [installingGit, setInstallingGit] = useState(false);
    const [gitInstallProgress, setGitInstallProgress] = useState('');
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionTested, setConnectionTested] = useState(false);
    const [connectionProgress, setConnectionProgress] = useState([]);
    const [showProgressModal, setShowProgressModal] = useState(false);
    
    // Git installation progress subscription
    useEffect(() => {
        let unsubscribe;
        if (installingGit) {
            unsubscribe = window.electronAPI.onGitInstallProgress((data) => {
                setGitInstallProgress(data.message || '');
            });
        }
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [installingGit]);
    
    /**
     * Checks Git installation status
     */
    const checkGitStatus = useCallback(async () => {
        setCheckingGitStatus(true);
        try {
            const status = await window.electronAPI.getGitStatus();
            log.info('Git status:', status);
            setGitStatus(status);
        } catch (error) {
            log.error('Failed to check Git status:', error);
            setGitStatus({ isInstalled: false, error: error.message });
        } finally {
            setCheckingGitStatus(false);
        }
    }, []);
    
    /**
     * Installs Git automatically
     */
    const handleInstallGit = useCallback(async () => {
        setInstallingGit(true);
        setGitInstallProgress('Starting Git installation...');
        
        try {
            const result = await window.electronAPI.installGit();
            
            if (result.success) {
                message.success(result.message || 'Git installed successfully');
                await checkGitStatus();
            } else {
                message.error(result.error || 'Failed to install Git');
            }
        } catch (error) {
            log.error('Git installation error:', error);
            message.error('Failed to install Git: ' + error.message);
        } finally {
            setInstallingGit(false);
            setGitInstallProgress('');
        }
    }, [checkGitStatus, message]);
    
    /**
     * Tests Git connection with progress tracking
     * @param {Object} formValues - Form values for connection test
     */
    const handleTestConnection = useCallback(async (formValues) => {
        if (!formValues.gitUrl) {
            message.warning('Please enter a Git repository URL');
            return;
        }

        setTestingConnection(true);
        setConnectionProgress([]);
        setShowProgressModal(true);
        
        // Subscribe to progress updates
        const unsubscribe = window.electronAPI.onGitConnectionProgress((data) => {
            setConnectionProgress(data.summary || []);
        });
        
        try {
            const authData = await prepareAuthData(formValues, formValues.authType);
            
            const result = await window.electronAPI.testGitConnection({
                url: formValues.gitUrl,
                branch: formValues.gitBranch || 'main',
                authType: formValues.authType || 'none',
                authData,
                filePath: formValues.gitPath || 'config/open-headers.json'
            });

            if (result.success) {
                setConnectionTested(true);
                handleConnectionSuccess(result);
            } else {
                setConnectionTested(false);
                handleConnectionError(result);
            }
        } catch (error) {
            message.error(`Connection test failed: ${error.message}`);
            setConnectionTested(false);
        } finally {
            setTestingConnection(false);
            if (unsubscribe) unsubscribe();
            
            // Keep modal open for a moment to show final status
            setTimeout(() => {
                setShowProgressModal(false);
            }, TIMING.PROGRESS_MODAL_DELAY);
        }
    }, [message]);
    
    /**
     * Handles successful connection test
     * @param {Object} result - Connection test result
     */
    const handleConnectionSuccess = (result) => {
        if (result.warning) {
            void message.warning(result.warning);
        } else if (result.configFileValid) {
            handleValidConfigFile(result);
        } else {
            void message.success(`Git connection successful! Found ${result.branches || 0} branches.`);
        }
    };
    
    /**
     * Handles valid config file in connection test
     * @param {Object} result - Connection test result
     */
    const handleValidConfigFile = (result) => {
        if (result.validationDetails) {
            const items = formatValidationDetails(result.validationDetails);
            
            if (items.length > 0) {
                const isMultiFile = result.message && result.message.includes('multi-file');
                void message.success(
                    <div>
                        <div style={{ fontWeight: 500 }}>✅ Connection successful!</div>
                        <div style={{ marginTop: 4, fontSize: '12px' }}>
                            {isMultiFile ? 'Multi-file configuration detected' : 'Configuration validated'}: {items.join(', ')}
                        </div>
                    </div>,
                    TIMING.MESSAGE_DURATION
                );
            } else {
                void message.warning(
                    <div>
                        <div style={{ fontWeight: 500 }}>⚠️ Connection successful!</div>
                        <div style={{ marginTop: 4, fontSize: '12px' }}>
                            Configuration file is valid but empty. You may want to add some data before using this workspace.
                        </div>
                    </div>,
                    7
                );
            }
        } else {
            void message.success(result.message || `Git connection successful! Found ${result.branches || 0} branches and verified config file.`);
        }
    };
    
    /**
     * Handles connection test error
     * @param {Object} result - Connection test result
     */
    const handleConnectionError = (result) => {
        if (result.validationDetails) {
            void message.error(
                <div>
                    <div style={{ fontWeight: 500 }}>❌ {result.error}</div>
                    <div style={{ marginTop: 8, fontSize: '12px', opacity: 0.8 }}>
                        The configuration file exists but failed validation. Please ensure it's a valid Open Headers export file.
                    </div>
                </div>,
                10
            );
        } else if (result.hint) {
            void message.error(
                <div>
                    <div>{result.error}</div>
                    <div style={{ marginTop: 8, fontSize: '12px', opacity: 0.8 }}>
                        💡 {result.hint}
                    </div>
                </div>,
                10
            );
        } else if (result.debugHint) {
            void message.error(
                <div>
                    <div>{result.error}</div>
                    <div style={{ marginTop: 8, fontSize: '12px', opacity: 0.8 }}>
                        💡 {result.debugHint}
                    </div>
                </div>,
                15
            );
        } else {
            void message.error(`Connection failed: ${result.error}`);
        }
    };
    
    /**
     * Resets connection test state
     */
    const resetConnectionTest = useCallback(() => {
        setConnectionTested(false);
        setConnectionProgress([]);
        setShowProgressModal(false);
    }, []);
    
    return {
        // State
        gitStatus,
        checkingGitStatus,
        installingGit,
        gitInstallProgress,
        testingConnection,
        connectionTested,
        connectionProgress,
        showProgressModal,
        
        // Actions
        checkGitStatus,
        handleInstallGit,
        handleTestConnection,
        resetConnectionTest,
        
        // Utilities
        setShowProgressModal
    };
};
