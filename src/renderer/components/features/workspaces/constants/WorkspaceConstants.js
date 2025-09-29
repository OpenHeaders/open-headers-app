/**
 * Constants and configurations for workspace management
 */

/**
 * Authentication types available for Git repositories
 */
export const AUTH_TYPES = {
    NONE: 'none',
    TOKEN: 'token',
    SSH_KEY: 'ssh-key',
    BASIC: 'basic'
};

/**
 * SSH key source options
 */
export const SSH_KEY_SOURCES = {
    TEXT: 'text',
    FILE: 'file'
};

/**
 * Workspace types
 */
export const WORKSPACE_TYPES = {
    PERSONAL: 'personal',
    TEAM: 'team',
    GIT: 'git'
};

/**
 * Token type options for various Git providers
 */
export const TOKEN_TYPES = [
    { value: 'auto', label: 'Auto-detect' },
    { value: 'github', label: 'GitHub' },
    { value: 'gitlab', label: 'GitLab' },
    { value: 'bitbucket', label: 'Bitbucket' },
    { value: 'azure', label: 'Azure DevOps' },
    { value: 'generic', label: 'Generic' }
];

/**
 * Default values for workspace forms
 */
export const DEFAULT_VALUES = {
    authType: AUTH_TYPES.NONE,
    sshKeySource: SSH_KEY_SOURCES.TEXT,
    workspaceType: WORKSPACE_TYPES.PERSONAL,
    gitBranch: 'main',
    gitPath: 'config/open-headers.json',
    tokenType: 'auto',
    autoSync: true
};

/**
 * Timing constants
 */
export const TIMING = {
    SYNC_TIMEOUT: 30000, // 30 seconds
    PROGRESS_MODAL_DELAY: 3000, // 3 seconds
    MESSAGE_DURATION: 5000 // 5 seconds
};



/**
 * Icons mapping for different Git providers
 */
export const PROVIDER_ICONS = {
    github: 'GithubOutlined',
    gitlab: 'GitlabOutlined',
    bitbucket: 'GitlabOutlined',
    azure: 'GlobalOutlined',
    generic: 'GlobalOutlined'
};

