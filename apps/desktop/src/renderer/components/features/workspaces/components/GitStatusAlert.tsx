import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Spin } from 'antd';
import type React from 'react';

/**
 * Git status alert component showing installation status and actions
 *  props - Component props
 *  props.checkingGitStatus - Whether Git status is being checked
 *  props.gitStatus - Git status object
 *  props.installingGit - Whether Git is being installed
 *  props.gitInstallProgress - Git installation progress message
 *  props.onInstallGit - Handler for Git installation
 *  GitStatusAlert component
 */
interface GitStatusAlertProps {
  checkingGitStatus: boolean;
  gitStatus: { isInstalled: boolean; gitPath?: string; error?: string } | null;
  installingGit: boolean;
  gitInstallProgress: string;
  onInstallGit: () => void;
  style?: React.CSSProperties;
}

const GitStatusAlert = ({
  checkingGitStatus,
  gitStatus,
  installingGit,
  gitInstallProgress,
  onInstallGit,
}: GitStatusAlertProps) => {
  /**
   * Renders the checking status alert
   *  Checking status alert
   */
  const renderCheckingAlert = () => (
    <Alert
      title="Checking Git status..."
      description={<Spin size="small" />}
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
    />
  );

  /**
   * Renders the Git not installed alert with installation options
   *  Git not installed alert
   */
  const renderNotInstalledAlert = () => (
    <Alert
      title="Git Required for Team Workspaces"
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
                <Button type="primary" size="small" icon={<ReloadOutlined />} onClick={onInstallGit}>
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
   *  Git installed alert
   */
  const _renderInstalledAlert = () => (
    <Alert
      title={
        <span>
          <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          Git is installed and ready
        </span>
      }
      description={`Git found at: ${gitStatus?.gitPath || 'System PATH'}`}
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
