// @vitest-environment jsdom
/**
 * Tests for useCentralizedEnvironments hook
 *
 * Validates that it correctly composes all sub-hooks into a unified API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for all sub-hooks
// ---------------------------------------------------------------------------

const mockCore = {
  environments: { Default: { FOO: { value: 'bar' } } },
  activeEnvironment: 'Default',
  isLoading: false,
  isReady: true,
  service: { id: 'mock-service' },
};

const mockOperations = {
  waitForEnvironments: vi.fn(),
  createEnvironment: vi.fn(),
  deleteEnvironment: vi.fn(),
  switchEnvironment: vi.fn(),
  cloneEnvironment: vi.fn(),
};

const mockVariables = {
  setVariable: vi.fn(),
  deleteVariable: vi.fn(),
  getVariable: vi.fn().mockReturnValue('bar'),
  getAllVariables: vi.fn().mockReturnValue({ FOO: 'bar' }),
  getAllVariablesWithMetadata: vi.fn().mockReturnValue({ FOO: { value: 'bar' } }),
};

const mockTemplates = {
  resolveTemplate: vi.fn().mockReturnValue('resolved'),
  resolveObjectTemplate: vi.fn().mockReturnValue({ key: 'resolved' }),
};

const mockSchema = {
  findVariableUsage: vi.fn().mockReturnValue({}),
  generateEnvironmentSchema: vi.fn().mockReturnValue({ environments: {}, variableDefinitions: {} }),
};

vi.mock('../../../../src/renderer/hooks/environment', () => ({
  useEnvironmentCore: () => mockCore,
  useEnvironmentOperations: () => mockOperations,
  useEnvironmentVariables: () => mockVariables,
  useEnvironmentTemplates: () => mockTemplates,
  useEnvironmentSchema: () => mockSchema,
}));

import { useCentralizedEnvironments, useEnvironments } from '../../../../src/renderer/hooks/useCentralizedEnvironments';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCentralizedEnvironments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes core state fields', () => {
    const { result } = renderHook(() => useCentralizedEnvironments());

    expect(result.current.environments).toEqual({ Default: { FOO: { value: 'bar' } } });
    expect(result.current.activeEnvironment).toBe('Default');
    expect(result.current.loading).toBe(false);
    expect(result.current.environmentsReady).toBe(true);
  });

  it('exposes operation functions', () => {
    const { result } = renderHook(() => useCentralizedEnvironments());

    expect(result.current.waitForEnvironments).toBe(mockOperations.waitForEnvironments);
    expect(result.current.createEnvironment).toBe(mockOperations.createEnvironment);
    expect(result.current.deleteEnvironment).toBe(mockOperations.deleteEnvironment);
    expect(result.current.switchEnvironment).toBe(mockOperations.switchEnvironment);
    expect(result.current.cloneEnvironment).toBe(mockOperations.cloneEnvironment);
  });

  it('exposes variable functions', () => {
    const { result } = renderHook(() => useCentralizedEnvironments());

    expect(result.current.setVariable).toBe(mockVariables.setVariable);
    expect(result.current.deleteVariable).toBe(mockVariables.deleteVariable);
    expect(result.current.getVariable).toBe(mockVariables.getVariable);
    expect(result.current.getAllVariables).toBe(mockVariables.getAllVariables);
    expect(result.current.getAllVariablesWithMetadata).toBe(mockVariables.getAllVariablesWithMetadata);
  });

  it('exposes template functions', () => {
    const { result } = renderHook(() => useCentralizedEnvironments());

    expect(result.current.resolveTemplate).toBe(mockTemplates.resolveTemplate);
    expect(result.current.resolveObjectTemplate).toBe(mockTemplates.resolveObjectTemplate);
  });

  it('exposes schema functions', () => {
    const { result } = renderHook(() => useCentralizedEnvironments());

    expect(result.current.findVariableUsage).toBe(mockSchema.findVariableUsage);
    expect(result.current.generateEnvironmentSchema).toBe(mockSchema.generateEnvironmentSchema);
  });

  it('exposes service reference', () => {
    const { result } = renderHook(() => useCentralizedEnvironments());

    expect(result.current.service).toBe(mockCore.service);
  });
});

describe('useEnvironments alias', () => {
  it('is the same function as useCentralizedEnvironments', () => {
    expect(useEnvironments).toBe(useCentralizedEnvironments);
  });
});
