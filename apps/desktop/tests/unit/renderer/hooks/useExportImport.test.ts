// @vitest-environment jsdom
/**
 * Tests for useExportImport hook
 *
 * Validates modal state management, loading flags, service health checks,
 * and export/import handler behaviour (success, failure, modal auto-close).
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks – must be declared before the hook is imported
// ---------------------------------------------------------------------------

// Mock the logger so we don't get noise
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// We control what createExportImportServices and validateDependencies return
const mockExportExecute = vi.fn();
const mockImportExecute = vi.fn();

vi.mock('../../../../src/renderer/services/export-import', () => ({
  createExportImportServices: vi.fn(() => ({
    exportService: { execute: mockExportExecute },
    importService: { execute: mockImportExecute },
  })),
  validateDependencies: vi.fn(() => ({ success: true })),
}));

// Now import the hook and the mocked modules so we can tweak per-test
import { useExportImport } from '../../../../src/renderer/hooks/useExportImport';
import { createExportImportServices, validateDependencies } from '../../../../src/renderer/services/export-import';
import type { ExportImportDependencies } from '../../../../src/renderer/services/export-import/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { ExportOptions, ImportOptions } from '../../../../src/renderer/services/export-import/core/types';

function makeDeps(overrides: Partial<ExportImportDependencies> = {}): ExportImportDependencies {
  return {
    appVersion: '3.2.0',
    sources: [],
    activeWorkspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    exportSources: vi.fn(() => []),
    removeSource: vi.fn(async () => true),
    workspaces: [],
    createWorkspace: vi.fn(async () => ({})),
    switchWorkspace: vi.fn(async () => true),
    environments: {},
    createEnvironment: vi.fn(async () => true),
    setVariable: vi.fn(async () => true),
    generateEnvironmentSchema: vi.fn(() => ({})),
    rules: { header: [], request: [], response: [] },
    addHeaderRule: vi.fn(async () => true),
    updateHeaderRule: vi.fn(async () => true),
    removeHeaderRule: vi.fn(async () => true),
    ...overrides,
  } as unknown as ExportImportDependencies;
}

function makeExportOptions(overrides: Record<string, unknown> = {}): ExportOptions {
  return {
    selectedItems: {},
    fileFormat: 'single',
    environmentOption: 'none',
    includeWorkspace: false,
    ...overrides,
  } as ExportOptions;
}

function makeImportOptions(overrides: Record<string, unknown> = {}): ImportOptions {
  return { fileContent: '{}', selectedItems: {}, importMode: 'merge', ...overrides } as ImportOptions;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useExportImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default healthy mocks
    (validateDependencies as ReturnType<typeof vi.fn>).mockReturnValue({ success: true });
    (createExportImportServices as ReturnType<typeof vi.fn>).mockReturnValue({
      exportService: { execute: mockExportExecute },
      importService: { execute: mockImportExecute },
    });
    mockExportExecute.mockResolvedValue(undefined);
    mockImportExecute.mockResolvedValue(undefined);
  });

  // ---- Initial state ----

  it('returns initial loading state as false for both export and import', () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    expect(result.current.loading.export).toBe(false);
    expect(result.current.loading.import).toBe(false);
  });

  it('returns both modals hidden initially', () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    expect(result.current.exportModalVisible).toBe(false);
    expect(result.current.importModalVisible).toBe(false);
  });

  it('reports service as healthy when validation passes and services are created', () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));
    expect(result.current.isServiceHealthy).toBe(true);
  });

  // ---- Dependency validation failure ----

  it('reports service as unhealthy when validation fails', () => {
    (validateDependencies as ReturnType<typeof vi.fn>).mockReturnValue({
      success: false,
      error: 'Missing required dependencies: sources',
    });

    const { result } = renderHook(() => useExportImport(makeDeps()));
    expect(result.current.isServiceHealthy).toBe(false);
    expect(result.current.dependencyValidation.success).toBe(false);
  });

  it('sets services to null when validation fails', () => {
    (validateDependencies as ReturnType<typeof vi.fn>).mockReturnValue({
      success: false,
      error: 'Missing required dependencies: sources',
    });

    const { result } = renderHook(() => useExportImport(makeDeps()));
    expect(result.current.exportService).toBeNull();
    expect(result.current.importService).toBeNull();
  });

  // ---- Service creation failure ----

  it('sets services to null when createExportImportServices throws', () => {
    (createExportImportServices as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('boom');
    });

    const { result } = renderHook(() => useExportImport(makeDeps()));
    expect(result.current.exportService).toBeNull();
    expect(result.current.importService).toBeNull();
    expect(result.current.isServiceHealthy).toBe(false);
  });

  // ---- Modal show / hide ----

  it('showExportModal sets exportModalVisible to true', () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.showExportModal());
    expect(result.current.exportModalVisible).toBe(true);
  });

  it('showExportModal does nothing when export service is null', () => {
    (createExportImportServices as ReturnType<typeof vi.fn>).mockReturnValue({
      exportService: null,
      importService: { execute: mockImportExecute },
    });

    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.showExportModal());
    expect(result.current.exportModalVisible).toBe(false);
  });

  it('showImportModal sets importModalVisible to true', () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.showImportModal());
    expect(result.current.importModalVisible).toBe(true);
  });

  it('hideExportModal sets exportModalVisible to false', () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.showExportModal());
    expect(result.current.exportModalVisible).toBe(true);
    act(() => result.current.hideExportModal());
    expect(result.current.exportModalVisible).toBe(false);
  });

  it('hideImportModal sets importModalVisible to false', () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.showImportModal());
    expect(result.current.importModalVisible).toBe(true);
    act(() => result.current.hideImportModal());
    expect(result.current.importModalVisible).toBe(false);
  });

  it('setExportModalVisible directly controls export modal', () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.setExportModalVisible(true));
    expect(result.current.exportModalVisible).toBe(true);
    act(() => result.current.setExportModalVisible(false));
    expect(result.current.exportModalVisible).toBe(false);
  });

  it('setImportModalVisible directly controls import modal', () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.setImportModalVisible(true));
    expect(result.current.importModalVisible).toBe(true);
    act(() => result.current.setImportModalVisible(false));
    expect(result.current.importModalVisible).toBe(false);
  });

  // ---- handleExport ----

  it('handleExport sets loading.export true during execution and false after', async () => {
    let resolveFn!: () => void;
    mockExportExecute.mockReturnValue(
      new Promise<void>((r) => {
        resolveFn = r;
      }),
    );

    const { result } = renderHook(() => useExportImport(makeDeps()));

    let exportPromise!: Promise<void>;
    act(() => {
      exportPromise = result.current.handleExport(makeExportOptions({ fileFormat: 'json' }));
    });

    // While in-flight, loading.export should be true
    expect(result.current.loading.export).toBe(true);
    expect(result.current.loading.import).toBe(false);

    await act(async () => {
      resolveFn();
      await exportPromise;
    });

    expect(result.current.loading.export).toBe(false);
  });

  it('handleExport closes export modal on success', async () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.showExportModal());
    expect(result.current.exportModalVisible).toBe(true);

    await act(async () => {
      await result.current.handleExport(makeExportOptions({ fileFormat: 'json' }));
    });

    expect(result.current.exportModalVisible).toBe(false);
  });

  it('handleExport re-throws service errors and resets loading', async () => {
    mockExportExecute.mockRejectedValue(new Error('export failed'));

    const { result } = renderHook(() => useExportImport(makeDeps()));

    await expect(
      act(async () => {
        await result.current.handleExport(makeExportOptions({ fileFormat: 'json' }));
      }),
    ).rejects.toThrow('export failed');

    expect(result.current.loading.export).toBe(false);
  });

  it('handleExport throws when export service is null', async () => {
    (createExportImportServices as ReturnType<typeof vi.fn>).mockReturnValue({
      exportService: null,
      importService: { execute: mockImportExecute },
    });

    const { result } = renderHook(() => useExportImport(makeDeps()));

    await expect(
      act(async () => {
        await result.current.handleExport(makeExportOptions());
      }),
    ).rejects.toThrow('Export service is not available');
  });

  it('handleExport does not affect import loading state', async () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    await act(async () => {
      await result.current.handleExport(makeExportOptions({ fileFormat: 'json' }));
    });

    expect(result.current.loading.import).toBe(false);
  });

  // ---- handleImport ----

  it('handleImport sets loading.import true during execution and false after', async () => {
    let resolveFn!: () => void;
    mockImportExecute.mockReturnValue(
      new Promise<void>((r) => {
        resolveFn = r;
      }),
    );

    const { result } = renderHook(() => useExportImport(makeDeps()));

    let importPromise!: Promise<void>;
    act(() => {
      importPromise = result.current.handleImport(makeImportOptions());
    });

    expect(result.current.loading.import).toBe(true);
    expect(result.current.loading.export).toBe(false);

    await act(async () => {
      resolveFn();
      await importPromise;
    });

    expect(result.current.loading.import).toBe(false);
  });

  it('handleImport closes import modal on success for non-git-sync', async () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.showImportModal());
    expect(result.current.importModalVisible).toBe(true);

    await act(async () => {
      await result.current.handleImport(makeImportOptions({ isGitSync: false }));
    });

    expect(result.current.importModalVisible).toBe(false);
  });

  it('handleImport keeps modal open for git-sync operations', async () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    act(() => result.current.showImportModal());

    await act(async () => {
      await result.current.handleImport(makeImportOptions({ isGitSync: true }));
    });

    expect(result.current.importModalVisible).toBe(true);
  });

  it('handleImport re-throws service errors and resets loading', async () => {
    mockImportExecute.mockRejectedValue(new Error('import failed'));

    const { result } = renderHook(() => useExportImport(makeDeps()));

    await expect(
      act(async () => {
        await result.current.handleImport(makeImportOptions());
      }),
    ).rejects.toThrow('import failed');

    expect(result.current.loading.import).toBe(false);
  });

  it('handleImport throws when import service is null', async () => {
    (createExportImportServices as ReturnType<typeof vi.fn>).mockReturnValue({
      exportService: { execute: mockExportExecute },
      importService: null,
    });

    const { result } = renderHook(() => useExportImport(makeDeps()));

    await expect(
      act(async () => {
        await result.current.handleImport(makeImportOptions());
      }),
    ).rejects.toThrow('Import service is not available');
  });

  it('handleImport does not affect export loading state', async () => {
    const { result } = renderHook(() => useExportImport(makeDeps()));

    await act(async () => {
      await result.current.handleImport(makeImportOptions());
    });

    expect(result.current.loading.export).toBe(false);
  });

  // ---- Concurrent export and import ----

  it('allows concurrent export and import with independent loading states', async () => {
    let resolveExport!: () => void;
    let resolveImport!: () => void;
    mockExportExecute.mockReturnValue(
      new Promise<void>((r) => {
        resolveExport = r;
      }),
    );
    mockImportExecute.mockReturnValue(
      new Promise<void>((r) => {
        resolveImport = r;
      }),
    );

    const { result } = renderHook(() => useExportImport(makeDeps()));

    let exportPromise!: Promise<void>;
    let importPromise!: Promise<void>;

    act(() => {
      exportPromise = result.current.handleExport(makeExportOptions({ fileFormat: 'json' }));
      importPromise = result.current.handleImport(makeImportOptions());
    });

    expect(result.current.loading.export).toBe(true);
    expect(result.current.loading.import).toBe(true);

    // Resolve export first
    await act(async () => {
      resolveExport();
      await exportPromise;
    });

    expect(result.current.loading.export).toBe(false);
    expect(result.current.loading.import).toBe(true);

    // Resolve import second
    await act(async () => {
      resolveImport();
      await importPromise;
    });

    expect(result.current.loading.export).toBe(false);
    expect(result.current.loading.import).toBe(false);
  });
});
