import { describe, it, expect, vi } from 'vitest';
import {
  extractRepoName,
  getProviderIcon,
  prepareWorkspaceData,
  formatValidationDetails,
} from '../../../../src/renderer/components/features/workspaces/utils/WorkspaceUtils';
import { PROVIDER_ICONS } from '../../../../src/renderer/components/features/workspaces/constants/WorkspaceConstants';

// ======================================================================
// extractRepoName
// ======================================================================
describe('extractRepoName', () => {
  it('returns empty string for null', () => {
    expect(extractRepoName(null)).toBe('');
  });

  it('returns empty string for empty', () => {
    expect(extractRepoName('')).toBe('');
  });

  it('extracts repo name from HTTPS URL', () => {
    expect(extractRepoName('https://github.com/user/my-repo.git')).toBe('my-repo');
  });

  it('extracts repo name from SSH URL', () => {
    expect(extractRepoName('git@github.com:user/my-repo.git')).toBe('my-repo');
  });

  it('handles URL without .git suffix', () => {
    expect(extractRepoName('https://github.com/user/my-repo')).toBe('my-repo');
  });
});

// ======================================================================
// getProviderIcon
// ======================================================================
describe('getProviderIcon', () => {
  it('returns generic icon for null', () => {
    expect(getProviderIcon(null)).toBe(PROVIDER_ICONS.generic);
  });

  it('returns github icon for github URL', () => {
    expect(getProviderIcon('https://github.com/user/repo')).toBe(PROVIDER_ICONS.github);
  });

  it('returns gitlab icon for gitlab URL', () => {
    expect(getProviderIcon('https://gitlab.com/user/repo')).toBe(PROVIDER_ICONS.gitlab);
  });

  it('returns bitbucket icon for bitbucket URL', () => {
    expect(getProviderIcon('https://bitbucket.org/user/repo')).toBe(PROVIDER_ICONS.bitbucket);
  });

  it('returns azure icon for azure URL', () => {
    expect(getProviderIcon('https://dev.azure.com/org/project')).toBe(PROVIDER_ICONS.azure);
  });

  it('returns generic icon for unknown provider', () => {
    expect(getProviderIcon('https://custom-git.example.com/repo')).toBe(PROVIDER_ICONS.generic);
  });
});

// ======================================================================
// prepareWorkspaceData
// ======================================================================
describe('prepareWorkspaceData', () => {
  it('creates workspace object with authData for git URL', () => {
    const values = { name: 'ws', gitUrl: 'https://github.com/u/r', authType: 'none' };
    const result = prepareWorkspaceData(values, null, { token: 'abc' });
    expect(result.name).toBe('ws');
    expect(result.type).toBe('git');
    expect(result.authData).toEqual({ token: 'abc' });
  });

  it('creates personal workspace without authData', () => {
    const values = { name: 'ws', authType: 'none' };
    const result = prepareWorkspaceData(values, null, {});
    expect(result.type).toBe('personal');
    expect(result.authData).toBeUndefined();
  });

  it('uses existing workspace id when editing', () => {
    const values = { name: 'ws', authType: 'none' };
    const result = prepareWorkspaceData(values, { id: 'existing-123' }, {});
    expect(result.id).toBe('existing-123');
  });

  it('generates new id when creating', () => {
    const values = { name: 'ws', authType: 'none' };
    const result = prepareWorkspaceData(values, null, {});
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
  });

  it('removes sensitive auth fields', () => {
    const values = {
      name: 'ws',
      gitUrl: 'https://github.com/u/r',
      authType: 'token',
      gitToken: 'secret-token',
      sshKey: 'ssh-key',
      sshKeyPath: '/path',
      sshPassphrase: 'pass',
      gitUsername: 'user',
      gitPassword: 'pass',
      tokenType: 'github',
    };
    const result = prepareWorkspaceData(values, null, { token: 'x' });
    expect(result.gitToken).toBeUndefined();
    expect(result.sshKey).toBeUndefined();
    expect(result.sshKeyPath).toBeUndefined();
    expect(result.sshPassphrase).toBeUndefined();
    expect(result.gitUsername).toBeUndefined();
    expect(result.gitPassword).toBeUndefined();
    expect(result.tokenType).toBeUndefined();
  });
});

// ======================================================================
// formatValidationDetails
// ======================================================================
describe('formatValidationDetails', () => {
  it('returns items for each non-zero count', () => {
    const details = { sourceCount: 3, ruleCount: 2, proxyRuleCount: 1, variableCount: 5 };
    const items = formatValidationDetails(details);
    expect(items).toContain('3 sources');
    expect(items).toContain('2 rules');
    expect(items).toContain('1 proxy rules');
    expect(items).toContain('5 environment variables');
  });

  it('skips zero counts', () => {
    const details = { sourceCount: 0, ruleCount: 2, proxyRuleCount: 0, variableCount: 0 };
    const items = formatValidationDetails(details);
    expect(items).toEqual(['2 rules']);
  });

  it('returns empty array for all zeros', () => {
    const details = { sourceCount: 0, ruleCount: 0, proxyRuleCount: 0, variableCount: 0 };
    expect(formatValidationDetails(details)).toEqual([]);
  });
});
