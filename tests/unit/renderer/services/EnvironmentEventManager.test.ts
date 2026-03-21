import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const EnvironmentEventManager = (
  await import('../../../../src/renderer/services/environment/EnvironmentEventManager')
).default;

describe('EnvironmentEventManager', () => {
  let manager: InstanceType<typeof EnvironmentEventManager>;
  let addEventListenerSpy: ReturnType<typeof vi.fn>;
  let removeEventListenerSpy: ReturnType<typeof vi.fn>;
  let dispatchEventSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addEventListenerSpy = vi.fn();
    removeEventListenerSpy = vi.fn();
    dispatchEventSpy = vi.fn();

    vi.stubGlobal('window', {
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
      dispatchEvent: dispatchEventSpy,
      electronAPI: undefined,
    });

    (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class CustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, opts?: { detail?: unknown }) {
        this.type = type;
        this.detail = opts?.detail;
      }
    };

    manager = new EnvironmentEventManager();
  });

  afterEach(() => {
    manager.cleanup();
    vi.unstubAllGlobals();
  });

  // ========================================================================
  // dispatchEnvironmentsLoaded
  // ========================================================================
  describe('dispatchEnvironmentsLoaded', () => {
    it('dispatches environments-loaded event with correct detail', () => {
      const environments = { Default: { KEY: { value: 'val' } } };
      manager.dispatchEnvironmentsLoaded('ws-1', environments, 'Default');

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0];
      expect(event.type).toBe('environments-loaded');
      expect(event.detail.workspaceId).toBe('ws-1');
      expect(event.detail.environments).toEqual(environments);
      expect(event.detail.activeEnvironment).toBe('Default');
    });
  });

  // ========================================================================
  // dispatchVariablesChanged
  // ========================================================================
  describe('dispatchVariablesChanged', () => {
    it('dispatches environment-variables-changed event', () => {
      const variables = { KEY: 'val' };
      manager.dispatchVariablesChanged('Default', variables);

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0];
      expect(event.type).toBe('environment-variables-changed');
      expect(event.detail.environment).toBe('Default');
      expect(event.detail.variables).toEqual(variables);
    });
  });

  // ========================================================================
  // dispatchEnvironmentChanged
  // ========================================================================
  describe('dispatchEnvironmentChanged', () => {
    it('dispatches environment-switched event', () => {
      const variables = { KEY: 'val' };
      manager.dispatchEnvironmentChanged('Production', variables);

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0];
      expect(event.type).toBe('environment-switched');
      expect(event.detail.environment).toBe('Production');
      expect(event.detail.variables).toEqual(variables);
    });
  });

  // ========================================================================
  // dispatchEnvironmentDeleted
  // ========================================================================
  describe('dispatchEnvironmentDeleted', () => {
    it('dispatches environment-deleted event', () => {
      manager.dispatchEnvironmentDeleted('Staging');

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0];
      expect(event.type).toBe('environment-deleted');
      expect(event.detail.environment).toBe('Staging');
    });
  });

  // ========================================================================
  // setupWorkspaceListener
  // ========================================================================
  describe('setupWorkspaceListener', () => {
    it('registers listeners for workspace-switched and workspace-data-applied', () => {
      manager.setupWorkspaceListener(vi.fn());
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'workspace-switched',
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'workspace-data-applied',
        expect.any(Function)
      );
    });

    it('calls onWorkspaceChange when event fires with workspaceId', async () => {
      const onWorkspaceChange = vi.fn();
      manager.setupWorkspaceListener(onWorkspaceChange);

      // Get the registered handler
      const handler = addEventListenerSpy.mock.calls[0][1];
      await handler({ detail: { workspaceId: 'ws-2' } });

      expect(onWorkspaceChange).toHaveBeenCalledWith('ws-2');
    });

    it('ignores events without workspaceId', async () => {
      const onWorkspaceChange = vi.fn();
      manager.setupWorkspaceListener(onWorkspaceChange);

      const handler = addEventListenerSpy.mock.calls[0][1];
      await handler({ detail: {} });

      expect(onWorkspaceChange).not.toHaveBeenCalled();
    });

    it('ignores events with null detail', async () => {
      const onWorkspaceChange = vi.fn();
      manager.setupWorkspaceListener(onWorkspaceChange);

      const handler = addEventListenerSpy.mock.calls[0][1];
      await handler({ detail: null });

      expect(onWorkspaceChange).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // setupEnvironmentStructureListener
  // ========================================================================
  describe('setupEnvironmentStructureListener', () => {
    it('registers listener for environments-structure-changed', () => {
      manager.setupEnvironmentStructureListener(vi.fn());
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'environments-structure-changed',
        expect.any(Function)
      );
    });

    it('calls onStructureChange when event fires', async () => {
      const onStructureChange = vi.fn();
      manager.setupEnvironmentStructureListener(onStructureChange);

      const handler = addEventListenerSpy.mock.calls[0][1];
      await handler({ detail: { workspaceId: 'ws-1', action: 'create' } });

      expect(onStructureChange).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        action: 'create',
      });
    });

    it('ignores events without data or workspaceId', async () => {
      const onStructureChange = vi.fn();
      manager.setupEnvironmentStructureListener(onStructureChange);

      const handler = addEventListenerSpy.mock.calls[0][1];
      await handler({ detail: null });
      expect(onStructureChange).not.toHaveBeenCalled();

      await handler({ detail: {} });
      expect(onStructureChange).not.toHaveBeenCalled();
    });

    it('sets up IPC listener when electronAPI is available', () => {
      const mockUnsubscribe = vi.fn();
      const mockOnStructureChanged = vi.fn().mockReturnValue(mockUnsubscribe);

      vi.stubGlobal('window', {
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
        dispatchEvent: dispatchEventSpy,
        electronAPI: {
          onEnvironmentsStructureChanged: mockOnStructureChanged,
        },
      });

      const newManager = new EnvironmentEventManager();
      newManager.setupEnvironmentStructureListener(vi.fn());

      expect(mockOnStructureChanged).toHaveBeenCalled();
      newManager.cleanup();
    });
  });

  // ========================================================================
  // cleanup
  // ========================================================================
  describe('cleanup', () => {
    it('removes all registered listeners', () => {
      manager.setupWorkspaceListener(vi.fn());
      manager.cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'workspace-switched',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'workspace-data-applied',
        expect.any(Function)
      );
    });

    it('clears the listeners array', () => {
      manager.setupWorkspaceListener(vi.fn());
      manager.cleanup();
      expect(manager.listeners).toEqual([]);
    });

    it('handles errors during cleanup gracefully', () => {
      manager.listeners = [
        () => { throw new Error('cleanup error'); },
        vi.fn(),
      ];
      expect(() => manager.cleanup()).not.toThrow();
    });

    it('is safe to call multiple times', () => {
      manager.cleanup();
      manager.cleanup();
      expect(manager.listeners).toEqual([]);
    });
  });
});
