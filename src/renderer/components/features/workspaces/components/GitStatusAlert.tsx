import React from 'react';
import { Alert, Button, Spin } from 'antd';
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';

/**
 * Git status alert component showing installation status and actions
 * @param {Object} props - Component props
 * @param {boolean} props.checkingGitStatus - Whether Git status is being checked
 * @param {Object} props.gitStatus - Git status object
 * @param {boolean} props.installingGit - Whether Git is being installed
 * @param {string} props.gitInstallProgress - Git installation progress message
 * @param {Function} props.onInstallGit - Handler for Git installation
 * @returns {JSX.Element} GitStatusAlert component
 */
const GitStatusAlert = ({
    checkingGitStatus,
    gitStatus,
    installingGit,
    gitInstallProgress,
    onInstallGit
}) => {
    /**
     * Renders the checking status alert
     * @returns {JSX.Element} Checking status alert
     */
    const renderCheckingAlert = () => (
        <Alert
            message="Checking Git status..."
            description={<Spin size="small" />}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
        />
    );

    /**
     * Renders the Git not installed alert with installation options
     * @returns {JSX.Element} Git not installed alert
     */
    const renderNotInstalledAlert = () => (
        <Alert
            message="Git Required for Team Workspaces"
            description={
                <div>
                    <p style={{ marginBottom: 8 }}>
                        Team workspaces require Git to synchronize configurations with your repository.
                    </p>
                    {window.electronAPI.platform === 'win32' ? (
                        <p style={{ marginBottom: 8 }}>
                            Git appears to be missing. Please ensure the application was installed correctly.
                        </p>
                    ) : (
                        <>
                            <p style={{ marginBottom: 8 }}>
                                {window.electronAPI.platform === 'darwin' 
                                    ? 'Git will be installed using Xcode Command Line Tools or Homebrew.'
                                    : 'Git will be installed using your system package manager.'}
                            </p>
                            {installingGit ? (
                                <div>
                                    <Spin size="small" style={{ marginRight: 8 }} />
                                    {gitInstallProgress || 'Installing Git...'}
                                </div>
                            ) : (
                                <Button 
                                    type="primary" 
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    onClick={onInstallGit}
                                >
                                    Install Git Automatically
                                </Button>
                            )}
                        </>
                    )}
                </div>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
        />
    );

    /**
     * Renders the Git installed success alert
     * @returns {JSX.Element} Git installed alert
     */
    const renderInstalledAlert = () => (
        <Alert
            message={
                <span>
                    <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                    Git is installed and ready
                </span>
            }
            description={`Git found at: ${gitStatus.gitPath || 'System PATH'}`}
            type="success"
            style={{ marginBottom: 16 }}
        />
    );

    // Only render alerts when there are issues or installation is in progress
    if (checkingGitStatus) {
        return renderCheckingAlert();
    }

    if (!gitStatus) {
        return null;
    }

    // Only show alert if Git is NOT installed or if installation is in progress
    if (!gitStatus.isInstalled || installingGit) {
        return renderNotInstalledAlert();
    }

    // When Git is installed and working properly, don't show anything
    return null;
};

export default GitStatusAlert;
