import { AUTH_TYPES, PROVIDER_ICONS } from '../constants';

/**
 * Utility functions for workspace management
 */

/**
 * Gets relative time string from a date
 * @param {Date} date - The date to calculate relative time from
 * @returns {string} Human-readable relative time string
 */
export const getTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
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
export const extractRepoName = (url) => {
    if (!url) return '';
    return url.split('/').pop().replace('.git', '');
};

/**
 * Determines the appropriate icon for a Git provider based on URL
 * @param {string} url - The Git repository URL
 * @returns {string} Icon component name
 */
export const getProviderIcon = (url) => {
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
export const prepareAuthData = async (values, authType) => {
    let authData = {};
    
    switch (authType) {
        case AUTH_TYPES.TOKEN:
            authData = {
                token: values.gitToken,
                tokenType: values.tokenType || 'auto'
            };
            break;
            
        case AUTH_TYPES.SSH_KEY:
            let sshKeyContent = '';
            if (values.sshKeySource === 'file' && values.sshKeyPath) {
                try {
                    sshKeyContent = await window.electronAPI.readFile(values.sshKeyPath);
                } catch (error) {
                    throw new Error(`Failed to read SSH key file: ${error.message}`);
                }
            } else {
                sshKeyContent = values.sshKey;
            }
            
            authData = {
                sshKey: sshKeyContent,
                sshPassphrase: values.sshPassphrase
            };
            break;
            
        case AUTH_TYPES.BASIC:
            authData = {
                username: values.gitUsername,
                password: values.gitPassword
            };
            break;
            
        default:
            authData = {};
    }
    
    return authData;
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
export const prepareWorkspaceData = (values, editingWorkspace, authData) => {
    const workspace = {
        ...values,
        id: editingWorkspace?.id || Date.now().toString(),
        type: values.gitUrl ? 'git' : 'personal',
        authData: values.gitUrl ? authData : undefined,
        sshKeySource: values.authType === AUTH_TYPES.SSH_KEY ? values.sshKeySource : undefined
    };
    
    // Remove individual auth fields from workspace object
    const fieldsToRemove = [
        'gitToken', 'tokenType', 'sshKey', 'sshKeyPath', 
        'sshPassphrase', 'gitUsername', 'gitPassword'
    ];
    
    fieldsToRemove.forEach(field => {
        delete workspace[field];
    });
    
    return workspace;
};


/**
 * Formats validation details for display
 * @param {Object} validationDetails - Validation details from API
 * @returns {string[]} Array of formatted validation items
 */
export const formatValidationDetails = (validationDetails) => {
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