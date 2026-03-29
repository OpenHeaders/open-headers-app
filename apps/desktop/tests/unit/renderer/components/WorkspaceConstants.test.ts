import { describe, expect, it } from 'vitest';
import {
  AUTH_TYPES,
  DEFAULT_VALUES,
  PROVIDER_ICONS,
  SSH_KEY_SOURCES,
  TIMING,
  TOKEN_TYPES,
  WORKSPACE_TYPES,
} from '../../../../src/renderer/components/features/workspaces/constants/WorkspaceConstants';

// ======================================================================
// AUTH_TYPES
// ======================================================================
describe('AUTH_TYPES', () => {
  it('has expected keys', () => {
    expect(AUTH_TYPES.NONE).toBe('none');
    expect(AUTH_TYPES.TOKEN).toBe('token');
    expect(AUTH_TYPES.SSH_KEY).toBe('ssh-key');
    expect(AUTH_TYPES.BASIC).toBe('basic');
  });
});

// ======================================================================
// SSH_KEY_SOURCES
// ======================================================================
describe('SSH_KEY_SOURCES', () => {
  it('has text and file', () => {
    expect(SSH_KEY_SOURCES.TEXT).toBe('text');
    expect(SSH_KEY_SOURCES.FILE).toBe('file');
  });
});

// ======================================================================
// WORKSPACE_TYPES
// ======================================================================
describe('WORKSPACE_TYPES', () => {
  it('has expected types', () => {
    expect(WORKSPACE_TYPES.PERSONAL).toBe('personal');
    expect(WORKSPACE_TYPES.TEAM).toBe('team');
    expect(WORKSPACE_TYPES.GIT).toBe('git');
  });
});

// ======================================================================
// TOKEN_TYPES
// ======================================================================
describe('TOKEN_TYPES', () => {
  it('is an array of objects with value and label', () => {
    expect(Array.isArray(TOKEN_TYPES)).toBe(true);
    expect(TOKEN_TYPES.length).toBeGreaterThan(0);
    TOKEN_TYPES.forEach((t) => {
      expect(t).toHaveProperty('value');
      expect(t).toHaveProperty('label');
    });
  });

  it('includes auto-detect option', () => {
    expect(TOKEN_TYPES.some((t) => t.value === 'auto')).toBe(true);
  });

  it('includes major providers', () => {
    expect(TOKEN_TYPES.some((t) => t.value === 'github')).toBe(true);
    expect(TOKEN_TYPES.some((t) => t.value === 'gitlab')).toBe(true);
    expect(TOKEN_TYPES.some((t) => t.value === 'bitbucket')).toBe(true);
    expect(TOKEN_TYPES.some((t) => t.value === 'azure')).toBe(true);
  });
});

// ======================================================================
// DEFAULT_VALUES
// ======================================================================
describe('DEFAULT_VALUES', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_VALUES.authType).toBe(AUTH_TYPES.NONE);
    expect(DEFAULT_VALUES.sshKeySource).toBe(SSH_KEY_SOURCES.TEXT);
    expect(DEFAULT_VALUES.workspaceType).toBe(WORKSPACE_TYPES.PERSONAL);
    expect(DEFAULT_VALUES.gitBranch).toBe('main');
    expect(DEFAULT_VALUES.gitPath).toBe('config/open-headers.json');
    expect(DEFAULT_VALUES.tokenType).toBe('auto');
    expect(DEFAULT_VALUES.autoSync).toBe(true);
  });
});

// ======================================================================
// TIMING
// ======================================================================
describe('TIMING', () => {
  it('has positive timing values', () => {
    expect(TIMING.SYNC_TIMEOUT).toBeGreaterThan(0);
    expect(TIMING.PROGRESS_MODAL_DELAY).toBeGreaterThan(0);
    expect(TIMING.MESSAGE_DURATION).toBeGreaterThan(0);
  });

  it('sync timeout is 30 seconds', () => {
    expect(TIMING.SYNC_TIMEOUT).toBe(30000);
  });
});

// ======================================================================
// PROVIDER_ICONS
// ======================================================================
describe('PROVIDER_ICONS', () => {
  it('maps providers to icon names', () => {
    expect(PROVIDER_ICONS.github).toBe('GithubOutlined');
    expect(PROVIDER_ICONS.gitlab).toBe('GitlabOutlined');
    expect(PROVIDER_ICONS.generic).toBe('GlobalOutlined');
  });
});
