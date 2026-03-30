import type { AuthType, WorkspaceAuthData, WorkspaceType } from '../../../../../types/workspace';
import { AUTH_TYPES, PROVIDER_ICONS } from '../constants';

/** Form values from workspace creation/edit forms */
export interface WorkspaceFormValues {
  name?: string;
  description?: string;
  type?: WorkspaceType;
  gitUrl?: string;
  gitBranch?: string;
  gitPath?: string;
  authType?: AuthType;
  autoSync?: boolean;
  gitToken?: string;
  tokenType?: string;
  sshKeySource?: string;
  sshKey?: string;
  sshKeyPath?: string;
  sshPassphrase?: string;
  gitUsername?: string;
  gitPassword?: string;
  environmentOption?: string;
  fileFormat?: string;
  initialCommit?: { files: Record<string, string>; message: string };
  inviteMetadata?: { invitedBy?: string; inviteId?: string; joinedAt?: string };
}

/**
 * Utility functions for workspace management
 */

/**
 * Gets relative time string from a date
 * @param {Date} date - The date to calculate relative time from
 * @returns {string} Human-readable relative time string
 */
export const getTimeAgo = (date: Date) => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/**
 * Extracts repository name from a Git URL
 * @param {string} url - The Git repository URL
 * @returns {string} Repository name
 */
export const extractRepoName = (url: string) => {
  if (!url) return '';
  return (url.split('/').pop() ?? '').replace('.git', '');
};

/**
 * Determines the appropriate icon for a Git provider based on URL
 * @param {string} url - The Git repository URL
 * @returns {string} Icon component name
 */
export const getProviderIcon = (url: string) => {
  if (!url) return PROVIDER_ICONS.generic;

  if (url.includes('github.com')) {
    return PROVIDER_ICONS.github;
  } else if (url.includes('gitlab')) {
    return PROVIDER_ICONS.gitlab;
  } else if (url.includes('bitbucket')) {
    return PROVIDER_ICONS.bitbucket;
  } else if (url.includes('azure')) {
    return PROVIDER_ICONS.azure;
  }

  return PROVIDER_ICONS.generic;
};

/**
 * Prepares authentication data based on form values and auth type
 * @param {Object} values - Form values containing authentication fields
 * @param {string} values.gitToken - Git personal access token (for TOKEN auth)
 * @param {string} values.gitUsername - Git username (for BASIC auth)
 * @param {string} values.gitPassword - Git password (for BASIC auth)
 * @param {string} values.tokenType - Token type for TOKEN auth
 * @param {string} values.sshKeySource - SSH key source ('file' or 'text')
 * @param {string} values.sshKeyPath - Path to SSH key file
 * @param {string} values.sshKey - SSH key content
 * @param {string} values.sshPassphrase - SSH key passphrase
 * @param {string} authType - Selected authentication type
 * @returns {Object} Prepared authentication data
 */
export const prepareAuthData = async (values: WorkspaceFormValues, authType: string): Promise<WorkspaceAuthData> => {
  switch (authType) {
    case AUTH_TYPES.TOKEN:
      return {
        token: values.gitToken,
        tokenType: values.tokenType || 'auto',
      };

    case AUTH_TYPES.SSH_KEY: {
      let sshKeyContent = '';
      if (values.sshKeySource === 'file' && values.sshKeyPath) {
        try {
          sshKeyContent = String(await window.electronAPI.readFile(values.sshKeyPath, 'utf-8'));
        } catch (error) {
          throw new Error(`Failed to read SSH key file: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        sshKeyContent = values.sshKey || '';
      }

      return {
        sshKey: sshKeyContent,
        sshPassphrase: values.sshPassphrase,
      };
    }

    case AUTH_TYPES.BASIC:
      return {
        username: values.gitUsername,
        password: values.gitPassword,
      };

    default:
      return {};
  }
};

/**
 * Prepares workspace object for saving, removing sensitive form fields
 * @param {Object} values - Form values containing workspace configuration
 * @param {string} values.name - Workspace name
 * @param {string} values.gitUrl - Git repository URL
 * @param {string} values.gitBranch - Git branch
 * @param {string} values.gitPath - Path to config file in repository
 * @param {string} values.authType - Authentication type
 * @param {Object} editingWorkspace - Existing workspace being edited (if any)
 * @param {Object} authData - Prepared authentication data
 * @returns {Object} Prepared workspace object with sensitive fields removed
 */
export const prepareWorkspaceData = (
  values: WorkspaceFormValues,
  editingWorkspace: { id?: string } | null,
  authData: WorkspaceAuthData,
) => {
  // Extract form-only fields that shouldn't be stored on the workspace
  const {
    gitToken: _gitToken,
    tokenType: _tokenType,
    sshKey: _sshKey,
    sshKeyPath: _sshKeyPath,
    sshPassphrase: _sshPassphrase,
    gitUsername: _gitUsername,
    gitPassword: _gitPassword,
    ...rest
  } = values;

  return {
    ...rest,
    id: editingWorkspace?.id || Date.now().toString(),
    type: values.gitUrl ? ('git' as const) : ('personal' as const),
    authData: values.gitUrl ? authData : undefined,
    sshKeySource: values.authType === AUTH_TYPES.SSH_KEY ? values.sshKeySource : undefined,
  };
};

/**
 * Formats validation details for display
 * @param {Object} validationDetails - Validation details from API
 * @returns {string[]} Array of formatted validation items
 */
export const formatValidationDetails = (validationDetails: {
  sourceCount: number;
  ruleCount: number;
  proxyRuleCount: number;
  variableCount: number;
}) => {
  const items = [];
  if (validationDetails.sourceCount > 0) {
    items.push(`${validationDetails.sourceCount} sources`);
  }
  if (validationDetails.ruleCount > 0) {
    items.push(`${validationDetails.ruleCount} rules`);
  }
  if (validationDetails.proxyRuleCount > 0) {
    items.push(`${validationDetails.proxyRuleCount} proxy rules`);
  }
  if (validationDetails.variableCount > 0) {
    items.push(`${validationDetails.variableCount} environment variables`);
  }
  return items;
};
