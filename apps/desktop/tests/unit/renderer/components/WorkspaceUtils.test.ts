import { describe, expect, it } from 'vitest';
import { PROVIDER_ICONS } from '../../../../src/renderer/components/features/workspaces/constants/WorkspaceConstants';
import type { WorkspaceFormValues } from '../../../../src/renderer/components/features/workspaces/utils/WorkspaceUtils';
import {
  extractRepoName,
  formatValidationDetails,
  getProviderIcon,
  prepareWorkspaceData,
} from '../../../../src/renderer/components/features/workspaces/utils/WorkspaceUtils';

function makeFormValues(overrides: Partial<WorkspaceFormValues> = {}): WorkspaceFormValues {
  return { name: 'OpenHeaders — Production', authType: 'none', ...overrides };
}

// ======================================================================
// extractRepoName
// ======================================================================
describe('extractRepoName', () => {
  it('returns empty string for null', () => {
    expect(extractRepoName(null as unknown as string)).toBe('');
  });

  it('returns empty string for empty', () => {
    expect(extractRepoName('')).toBe('');
  });

  it('extracts repo name from HTTPS URL', () => {
    expect(extractRepoName('https://github.com/openheaders/shared-headers.git')).toBe('shared-headers');
  });

  it('extracts repo name from SSH URL', () => {
    expect(extractRepoName('git@github.com:openheaders/shared-headers.git')).toBe('shared-headers');
  });

  it('handles URL without .git suffix', () => {
    expect(extractRepoName('https://github.com/openheaders/shared-headers')).toBe('shared-headers');
  });

  it('extracts repo name from enterprise GitLab URL', () => {
    expect(extractRepoName('https://gitlab.openheaders.io/platform/shared-headers.git')).toBe('shared-headers');
  });
});

// ======================================================================
// getProviderIcon
// ======================================================================
describe('getProviderIcon', () => {
  it('returns generic icon for null', () => {
    expect(getProviderIcon(null as unknown as string)).toBe(PROVIDER_ICONS.generic);
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
    const values = makeFormValues({ gitUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git' });
    const result = prepareWorkspaceData(values, null, { token: 'glpat-xxxxxxxxxxxxxxxxxxxx' });
    expect(result.name).toBe('OpenHeaders — Production');
    expect(result.type).toBe('git');
    expect(result.authData).toEqual({ token: 'glpat-xxxxxxxxxxxxxxxxxxxx' });
  });

  it('creates personal workspace without authData', () => {
    const values = makeFormValues();
    const result = prepareWorkspaceData(values, null, {});
    expect(result.type).toBe('personal');
    expect(result.authData).toBeUndefined();
  });

  it('uses existing workspace id when editing', () => {
    const values = makeFormValues();
    const result = prepareWorkspaceData(values, { id: 'existing-123' }, {});
    expect(result.id).toBe('existing-123');
  });

  it('generates new id when creating', () => {
    const values = makeFormValues();
    const result = prepareWorkspaceData(values, null, {});
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
  });

  it('removes sensitive auth fields', () => {
    const values = makeFormValues({
      gitUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
      authType: 'token',
      gitToken: 'secret-token',
      sshKey: 'ssh-key',
      sshKeyPath: '/path',
      sshPassphrase: 'pass',
      gitUsername: 'user',
      gitPassword: 'pass',
      tokenType: 'github',
    });
    const result = prepareWorkspaceData(values, null, { token: 'x' }) as Record<string, unknown>;
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
    const details = { sourceCount: 15, ruleCount: 8, proxyRuleCount: 4, variableCount: 25 };
    const items = formatValidationDetails(details);
    expect(items).toContain('15 sources');
    expect(items).toContain('8 rules');
    expect(items).toContain('4 proxy rules');
    expect(items).toContain('25 environment variables');
    expect(items).toHaveLength(4);
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
