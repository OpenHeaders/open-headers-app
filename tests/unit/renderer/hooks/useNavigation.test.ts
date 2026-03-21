// @vitest-environment jsdom
/**
 * Tests for useNavigation hook
 *
 * Validates the navigation state machine: tab switching, sub-tab mapping,
 * action mapping, settings navigation, and event cleanup.
 *
 * The hook subscribes to window.electronAPI.onNavigateTo and delegates to
 * callback dependencies. We mock electronAPI and invoke the registered
 * callback directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { useNavigation, type NavigationIntent, type SettingsAction } from '../../../../src/renderer/hooks/app/useNavigation';

// ---------------------------------------------------------------------------
// Test constants (mirror the real app constants)
// ---------------------------------------------------------------------------

const ACTIONS = {
  EDIT: 'EDIT',
  DELETE: 'DELETE',
  TOGGLE: 'TOGGLE',
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  DUPLICATE: 'DUPLICATE',
  HIGHLIGHT: 'HIGHLIGHT',
};

const TARGETS = {
  RULES_HEADERS: 'RULES_HEADERS',
  RULES_PAYLOAD: 'RULES_PAYLOAD',
  RULES_URL: 'RULES_URL',
  RULES_SCRIPTS: 'RULES_SCRIPTS',
  RULES_MORE: 'RULES_MORE',
  RECORDS: 'RECORDS',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavigationRequest {
  tab?: string;
  subTab?: string;
  itemId?: string;
  action?: string;
  settingsTab?: string;
  value?: string | boolean;
}

interface UseNavigationDeps {
  setActiveTab: (tab: string) => void;
  navigate: (intent: NavigationIntent) => void;
  ACTIONS: Record<string, string>;
  TARGETS: Record<string, string>;
  setSettingsInitialTab: (tab: string | null) => void;
  setSettingsVisible: (visible: boolean) => void;
  setSettingsAction: (action: SettingsAction) => void;
}

interface MockElectronAPI {
  onNavigateTo: ReturnType<typeof vi.fn>;
  showMainWindow: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Captures the callback registered via onNavigateTo */
let navigationCallback: ((nav: NavigationRequest) => void) | null = null;
let unsubscribeFn: ReturnType<typeof vi.fn>;

function setupElectronAPI() {
  unsubscribeFn = vi.fn();

  const api: MockElectronAPI = {
    onNavigateTo: vi.fn((cb: (nav: NavigationRequest) => void) => {
      navigationCallback = cb;
      return unsubscribeFn;
    }),
    showMainWindow: vi.fn(),
  };

  vi.stubGlobal('electronAPI', api);

  // Also set on window directly for the window.electronAPI pattern
  (window as unknown as { electronAPI: MockElectronAPI }).electronAPI = api;
}

function makeDeps(overrides: Partial<UseNavigationDeps> = {}): UseNavigationDeps {
  return {
    setActiveTab: vi.fn(),
    navigate: vi.fn(),
    ACTIONS,
    TARGETS,
    setSettingsInitialTab: vi.fn(),
    setSettingsVisible: vi.fn(),
    setSettingsAction: vi.fn(),
    ...overrides,
  };
}

function triggerNavigation(nav: NavigationRequest) {
  if (!navigationCallback) throw new Error('No navigation callback registered');
  act(() => navigationCallback!(nav));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useNavigation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupElectronAPI();
    navigationCallback = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ---- Subscription lifecycle ----

  it('subscribes to electronAPI.onNavigateTo on mount', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    expect((window as unknown as { electronAPI: MockElectronAPI }).electronAPI.onNavigateTo).toHaveBeenCalledTimes(1);
    expect(navigationCallback).toBeInstanceOf(Function);
  });

  it('calls unsubscribe on unmount', () => {
    const deps = makeDeps();
    const { unmount } = renderHook(() => useNavigation(deps));

    unmount();
    expect(unsubscribeFn).toHaveBeenCalledTimes(1);
  });

  it('calls showMainWindow on every navigation', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'sources' });
    expect((window as unknown as { electronAPI: MockElectronAPI }).electronAPI.showMainWindow).toHaveBeenCalled();
  });

  // ---- Basic tab switching ----

  it('calls setActiveTab when tab is provided', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'sources' });
    expect(deps.setActiveTab).toHaveBeenCalledWith('sources');
  });

  it('does nothing when navigation has no tab', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({});
    expect(deps.setActiveTab).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  // ---- Rules sub-tab mapping ----

  it('maps rules/headers to RULES_HEADERS target', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'headers', action: 'edit', itemId: 'r1' });

    expect(deps.setActiveTab).toHaveBeenCalledWith('rules');
    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'rules',
      subTab: 'headers',
      target: TARGETS.RULES_HEADERS,
      action: ACTIONS.EDIT,
      itemId: 'r1',
    }));
  });

  it('maps rules/payload to RULES_PAYLOAD target', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'payload', itemId: 'p1' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      target: TARGETS.RULES_PAYLOAD,
      action: ACTIONS.HIGHLIGHT, // itemId without action defaults to HIGHLIGHT
    }));
  });

  it('maps rules/url to RULES_URL target', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'url', action: 'create' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      target: TARGETS.RULES_URL,
      action: ACTIONS.CREATE,
    }));
  });

  it('maps rules/query-params to RULES_URL target (alias)', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'query-params', action: 'edit' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      target: TARGETS.RULES_URL,
      // subTab is rewritten to 'url'
      subTab: 'url',
    }));
  });

  it('maps rules/scripts to RULES_SCRIPTS target', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'scripts', action: 'view' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      target: TARGETS.RULES_SCRIPTS,
      action: ACTIONS.VIEW,
    }));
  });

  it('maps rules/inject to RULES_SCRIPTS target (alias)', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'inject', action: 'delete' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      target: TARGETS.RULES_SCRIPTS,
      subTab: 'scripts',
    }));
  });

  it('maps rules/block to RULES_MORE target', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'block', action: 'toggle' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      target: TARGETS.RULES_MORE,
      subTab: 'more',
      action: ACTIONS.TOGGLE,
    }));
  });

  it('maps rules/redirect to RULES_MORE target', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'redirect', action: 'duplicate' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      target: TARGETS.RULES_MORE,
      subTab: 'more',
      action: ACTIONS.DUPLICATE,
    }));
  });

  it('does not navigate when rules subTab is unrecognized', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'unknown' });

    expect(deps.setActiveTab).toHaveBeenCalledWith('rules');
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  // ---- Record viewer ----

  it('maps record-viewer tab to RECORDS target', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'record-viewer', subTab: 'any', itemId: 'rec-1' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      target: TARGETS.RECORDS,
    }));
  });

  // ---- Action mapping ----

  it('maps unknown actions to HIGHLIGHT', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'headers', action: 'unknownAction' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTIONS.HIGHLIGHT,
    }));
  });

  it('defaults to HIGHLIGHT when itemId is provided without action', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'rules', subTab: 'headers', itemId: 'rule-42' });

    expect(deps.navigate).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTIONS.HIGHLIGHT,
      itemId: 'rule-42',
    }));
  });

  // ---- Settings navigation ----

  it('opens settings with workflows tab', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'settings', settingsTab: 'workflows' });

    expect(deps.setSettingsInitialTab).toHaveBeenCalledWith('3');
    expect(deps.setSettingsVisible).toHaveBeenCalledWith(true);
    // Settings navigation does NOT call setActiveTab
    expect(deps.setActiveTab).not.toHaveBeenCalled();
  });

  it('opens settings with general tab', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'settings', settingsTab: 'general' });

    expect(deps.setSettingsInitialTab).toHaveBeenCalledWith('1');
    expect(deps.setSettingsVisible).toHaveBeenCalledWith(true);
  });

  it('opens settings with appearance tab', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'settings', settingsTab: 'appearance' });

    expect(deps.setSettingsInitialTab).toHaveBeenCalledWith('2');
    expect(deps.setSettingsVisible).toHaveBeenCalledWith(true);
  });

  it('handles toggleVideoRecording settings action with string "true"', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({
      tab: 'settings',
      settingsTab: 'general',
      action: 'toggleVideoRecording',
      value: 'true',
    });

    expect(deps.setSettingsAction).toHaveBeenCalledWith({
      action: 'toggleVideoRecording',
      value: true,
    });
  });

  it('handles toggleVideoRecording settings action with boolean true', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({
      tab: 'settings',
      settingsTab: 'general',
      action: 'toggleVideoRecording',
      value: true,
    });

    expect(deps.setSettingsAction).toHaveBeenCalledWith({
      action: 'toggleVideoRecording',
      value: true,
    });
  });

  it('handles toggleVideoRecording with string "false"', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({
      tab: 'settings',
      action: 'toggleVideoRecording',
      value: 'false',
    });

    expect(deps.setSettingsAction).toHaveBeenCalledWith({
      action: 'toggleVideoRecording',
      value: false,
    });
  });

  it('handles editHotkey settings action', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({
      tab: 'settings',
      action: 'editHotkey',
    });

    expect(deps.setSettingsAction).toHaveBeenCalledWith({
      action: 'editHotkey',
    });
  });

  it('handles toggleRecordingHotkey settings action', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({
      tab: 'settings',
      action: 'toggleRecordingHotkey',
      value: true,
    });

    expect(deps.setSettingsAction).toHaveBeenCalledWith({
      action: 'toggleRecordingHotkey',
      value: true,
    });
  });

  it('does not set settings action for unrecognized actions', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({
      tab: 'settings',
      settingsTab: 'general',
      action: 'somethingUnknown',
    });

    expect(deps.setSettingsAction).not.toHaveBeenCalled();
    expect(deps.setSettingsVisible).toHaveBeenCalledWith(true);
  });

  // ---- Tab focus (DOM-level, just ensure no errors) ----

  it('does not throw during tab focus handling', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    // Trigger navigation that will call handleTabFocus with setTimeout
    triggerNavigation({ tab: 'sources' });

    // Advance timers past the 100ms setTimeout in handleTabFocus
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // No error means success – the DOM queries run against jsdom
    expect(deps.setActiveTab).toHaveBeenCalledWith('sources');
  });

  // ---- Simple tab with no subtab/action ----

  it('switches tab without navigating when no subTab/itemId/action provided', () => {
    const deps = makeDeps();
    renderHook(() => useNavigation(deps));

    triggerNavigation({ tab: 'workspaces' });

    expect(deps.setActiveTab).toHaveBeenCalledWith('workspaces');
    expect(deps.navigate).not.toHaveBeenCalled();
  });
});
