// @vitest-environment jsdom
/**
 * Tests for useWorkspaces hook
 *
 * Validates workspace CRUD, sync, delete guard, and clone logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

const mockShowMessage = vi.fn();
vi.mock('../../../../src/renderer/utils/ui/messageUtil', () => ({
  showMessage: (...args: unknown[]) => mockShowMessage(...args),
}));

const mockCreateWorkspace = vi.fn();
const mockSwitchWorkspace = vi.fn().mockResolvedValue(undefined);
const mockDeleteWorkspace = vi.fn();
const mockUpdateWorkspace = vi.fn();
const mockLoadWorkspaceData = vi.fn();
const mockSetState = vi.fn();
const mockSaveWorkspaces = vi.fn().mockResolvedValue(undefined);
const mockInitializeWorkspaceData = vi.fn().mockResolvedValue(undefined);
const mockCopyWorkspaceData = vi.fn().mockResolvedValue(undefined);
const mockWorkspaceManagerCreate = vi.fn();
const mockSyncGitWorkspace = vi.fn();

const mockState = {
  workspaces: [
    { id: 'ws-1', name: 'Personal', type: 'personal' },
    { id: 'ws-2', name: 'Team', type: 'git', gitUrl: 'https://github.com/org/repo' },
    { id: 'default-personal', name: 'Default', type: 'personal' },
  ],
  syncStatus: {},
};

vi.mock('../../../../src/renderer/hooks/useCentralizedWorkspace', () => ({
  useCentralizedWorkspace: () => ({
    workspaces: mockState.workspaces,
    activeWorkspaceId: 'ws-1',
    syncStatus: mockState.syncStatus,
    loading: false,
    service: {
      state: mockState,
      setState: mockSetState,
      createWorkspace: mockCreateWorkspace,
      switchWorkspace: mockSwitchWorkspace,
      deleteWorkspace: mockDeleteWorkspace,
      updateWorkspace: mockUpdateWorkspace,
      loadWorkspaceData: mockLoadWorkspaceData,
      saveWorkspaces: mockSaveWorkspaces,
      initializeWorkspaceData: mockInitializeWorkspaceData,
      copyWorkspaceData: mockCopyWorkspaceData,
      workspaceManager: { createWorkspace: mockWorkspaceManagerCreate },
    },
  }),
}));

Object.defineProperty(window, 'electronAPI', {
  value: {
    syncGitWorkspace: mockSyncGitWorkspace,
    send: vi.fn(),
  },
  writable: true,
});

import { useWorkspaces } from '../../../../src/renderer/hooks/workspace/useWorkspaces';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWorkspaces', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockState.syncStatus = {};
    mockCreateWorkspace.mockResolvedValue(null);
    mockSwitchWorkspace.mockResolvedValue(undefined);
    mockDeleteWorkspace.mockResolvedValue(true);
    mockUpdateWorkspace.mockResolvedValue(true);
    mockLoadWorkspaceData.mockResolvedValue(undefined);
    mockSaveWorkspaces.mockResolvedValue(undefined);
    mockInitializeWorkspaceData.mockResolvedValue(undefined);
    mockCopyWorkspaceData.mockResolvedValue(undefined);
    mockSyncGitWorkspace.mockResolvedValue({ success: true });
    mockShowMessage.mockClear();
  });

  // ── createWorkspace ────────────────────────────────────────────

  describe('createWorkspace', () => {
    it('creates workspace and shows success message', async () => {
      const newWs = { id: 'ws-new', name: 'New WS' };
      mockCreateWorkspace.mockResolvedValue(newWs);

      const { result } = renderHook(() => useWorkspaces());

      let created: Record<string, unknown> | null = null;
      await act(async () => {
        created = await result.current.createWorkspace({ name: 'New WS' });
      });

      expect(created).toEqual(newWs);
      expect(mockShowMessage).toHaveBeenCalledWith('success', expect.stringContaining('New WS'));
    });

    it('generates id if not provided', async () => {
      mockCreateWorkspace.mockResolvedValue({ id: 'generated' });

      const { result } = renderHook(() => useWorkspaces());
      await act(async () => {
        await result.current.createWorkspace({ name: 'No ID' });
      });

      expect(mockCreateWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'No ID', id: expect.any(String) })
      );
    });

    it('returns null and shows error on failure', async () => {
      mockCreateWorkspace.mockRejectedValue(new Error('Duplicate name'));

      const { result } = renderHook(() => useWorkspaces());

      let created: Record<string, unknown> | null = null;
      await act(async () => {
        created = await result.current.createWorkspace({ name: 'Bad' });
      });

      expect(created).toBeNull();
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Duplicate name');
    });
  });

  // ── deleteWorkspace ────────────────────────────────────────────

  describe('deleteWorkspace', () => {
    it('prevents deleting default-personal workspace', async () => {
      const { result } = renderHook(() => useWorkspaces());

      let deleted = true;
      await act(async () => {
        deleted = await result.current.deleteWorkspace('default-personal');
      });

      expect(deleted).toBe(false);
      expect(mockDeleteWorkspace).not.toHaveBeenCalled();
      expect(mockShowMessage).toHaveBeenCalledWith('error', expect.stringContaining('Cannot delete'));
    });

    it('deletes workspace and shows success', async () => {
      mockDeleteWorkspace.mockResolvedValue(true);

      const { result } = renderHook(() => useWorkspaces());

      let deleted = false;
      await act(async () => {
        deleted = await result.current.deleteWorkspace('ws-1');
      });

      expect(deleted).toBe(true);
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Workspace deleted');
    });
  });

  // ── switchWorkspace ────────────────────────────────────────────

  describe('switchWorkspace', () => {
    it('switches workspace and returns true', async () => {
      mockSwitchWorkspace.mockResolvedValue(undefined);

      const { result } = renderHook(() => useWorkspaces());

      let switched = false;
      await act(async () => {
        switched = await result.current.switchWorkspace('ws-2');
      });

      expect(switched).toBe(true);
      expect(mockSwitchWorkspace).toHaveBeenCalledWith('ws-2');
    });

    it('returns false and shows error on failure', async () => {
      mockSwitchWorkspace.mockRejectedValue(new Error('Data load failed'));

      const { result } = renderHook(() => useWorkspaces());

      let switched = true;
      await act(async () => {
        switched = await result.current.switchWorkspace('ws-2');
      });

      expect(switched).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', expect.stringContaining('Data load failed'));
    });
  });

  // ── syncWorkspace ──────────────────────────────────────────────

  describe('syncWorkspace', () => {
    it('syncs git workspace successfully', async () => {
      mockSyncGitWorkspace.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useWorkspaces());

      let synced = false;
      await act(async () => {
        synced = await result.current.syncWorkspace('ws-2');
      });

      expect(synced).toBe(true);
      expect(mockSetState).toHaveBeenCalledWith(
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            'ws-2': expect.objectContaining({ syncing: false, error: null })
          })
        }),
        ['syncStatus']
      );
    });

    it('rejects sync for non-git workspace', async () => {
      const { result } = renderHook(() => useWorkspaces());

      let synced = true;
      await act(async () => {
        synced = await result.current.syncWorkspace('ws-1'); // personal workspace
      });

      expect(synced).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', expect.stringContaining('git-based'));
    });

    it('rejects sync for non-existent workspace', async () => {
      const { result } = renderHook(() => useWorkspaces());

      let synced = true;
      await act(async () => {
        synced = await result.current.syncWorkspace('non-existent');
      });

      expect(synced).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', expect.stringContaining('not found'));
    });

    it('suppresses success message when silent option is set', async () => {
      mockSyncGitWorkspace.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useWorkspaces());
      await act(async () => {
        await result.current.syncWorkspace('ws-2', { silent: true });
      });

      expect(mockShowMessage).not.toHaveBeenCalledWith('success', expect.anything());
    });

    it('records sync error in syncStatus on failure', async () => {
      mockSyncGitWorkspace.mockResolvedValue({ success: false, error: 'Auth failed' });

      const { result } = renderHook(() => useWorkspaces());
      await act(async () => {
        await result.current.syncWorkspace('ws-2');
      });

      expect(mockSetState).toHaveBeenCalledWith(
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            'ws-2': expect.objectContaining({ syncing: false, error: 'Auth failed' })
          })
        }),
        ['syncStatus']
      );
    });
  });

  // ── updateWorkspace ────────────────────────────────────────────

  describe('updateWorkspace', () => {
    it('updates workspace and shows success', async () => {
      mockUpdateWorkspace.mockResolvedValue(true);

      const { result } = renderHook(() => useWorkspaces());

      let updated = false;
      await act(async () => {
        updated = await result.current.updateWorkspace('ws-1', { name: 'Renamed' });
      });

      expect(updated).toBe(true);
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Workspace updated');
    });
  });

  // ── cloneWorkspaceToPersonal ───────────────────────────────────

  describe('cloneWorkspaceToPersonal', () => {
    it('clones team workspace to personal', async () => {
      mockWorkspaceManagerCreate.mockImplementation((_workspaces: unknown, data: Record<string, unknown>) => data);

      const { result } = renderHook(() => useWorkspaces());

      let cloned: Record<string, unknown> | null = null;
      await act(async () => {
        cloned = await result.current.cloneWorkspaceToPersonal('ws-2');
      });

      expect(cloned).not.toBeNull();
      expect(cloned!.type).toBe('personal');
      expect(cloned!.name).toBe('Team (Personal Copy)');
      expect(cloned!.clonedFrom).toBe('ws-2');
      expect(mockInitializeWorkspaceData).toHaveBeenCalled();
      expect(mockCopyWorkspaceData).toHaveBeenCalledWith('ws-2', expect.stringContaining('personal-'));
      expect(mockSwitchWorkspace).toHaveBeenCalledWith(expect.stringContaining('personal-'));
      expect(mockShowMessage).toHaveBeenCalledWith('success', expect.stringContaining('personal copy'));
    });

    it('returns null for non-existent workspace', async () => {
      const { result } = renderHook(() => useWorkspaces());

      let cloned: unknown = 'not-null';
      await act(async () => {
        cloned = await result.current.cloneWorkspaceToPersonal('non-existent');
      });

      expect(cloned).toBeNull();
      expect(mockShowMessage).toHaveBeenCalledWith('error', expect.stringContaining('not found'));
    });
  });
});
