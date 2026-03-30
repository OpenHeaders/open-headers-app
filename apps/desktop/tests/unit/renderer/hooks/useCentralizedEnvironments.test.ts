// @vitest-environment jsdom
/**
 * Tests for useCentralizedEnvironments hook
 *
 * Validates that it correctly composes all sub-hooks into a unified API.
 */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Enterprise-like mock data
// ---------------------------------------------------------------------------

const mockCore = {
  environments: {
    Production: {
      API_KEY: { value: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc', isSecret: true },
      API_URL: { value: 'https://api.openheaders.io' },
      BEARER_TOKEN: { value: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig', isSecret: true },
    },
    Staging: {
      API_KEY: { value: 'ohk_test_abc123', isSecret: true },
      API_URL: { value: 'https://api.staging.openheaders.io' },
    },
    Development: {
      API_KEY: { value: 'dev-key-123' },
      API_URL: { value: 'http://localhost:3000' },
    },
  },
  activeEnvironment: 'Production',
  isLoading: false,
  isReady: true,
  service: { id: 'env-service-a1b2c3d4' },
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
  getVariable: vi.fn().mockReturnValue('ohk_live_4eC39HqLyjWDarjtT1zdp7dc'),
  getAllVariables: vi.fn().mockReturnValue({
    API_KEY: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
    API_URL: 'https://api.openheaders.io',
  }),
  getAllVariablesWithMetadata: vi.fn().mockReturnValue(mockCore.environments.Production),
};

const mockTemplates = {
  resolveTemplate: vi.fn().mockReturnValue('https://api.openheaders.io/v2/config'),
  resolveObjectTemplate: vi.fn().mockReturnValue({ url: 'https://api.openheaders.io' }),
};

const mockSchema = {
  findVariableUsage: vi.fn().mockReturnValue({
    API_KEY: ['source-gateway', 'source-auth'],
    API_URL: ['source-gateway'],
  }),
  generateEnvironmentSchema: vi.fn().mockReturnValue({
    environments: { Production: {}, Staging: {}, Development: {} },
    variableDefinitions: {
      API_KEY: { description: 'API key', isSecret: true },
      API_URL: { description: 'API base URL' },
    },
  }),
};

vi.mock('../../../../src/renderer/hooks/environment', () => ({
  useEnvironmentCore: () => mockCore,
  useEnvironmentOperations: () => mockOperations,
  useEnvironmentVariables: () => mockVariables,
  useEnvironmentTemplates: () => mockTemplates,
  useEnvironmentSchema: () => mockSchema,
}));

import { useCentralizedEnvironments, useEnvironments } from '@/renderer/hooks/useCentralizedEnvironments';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCentralizedEnvironments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes core state fields with enterprise environment data', () => {
    const { result } = renderHook(() => useCentralizedEnvironments());

    expect(result.current.environments).toBe(mockCore.environments);
    expect(result.current.activeEnvironment).toBe('Production');
    expect(result.current.loading).toBe(false);
    expect(result.current.environmentsReady).toBe(true);
  });

  it('exposes all operation functions', () => {
    const { result } = renderHook(() => useCentralizedEnvironments());

    expect(result.current.waitForEnvironments).toBe(mockOperations.waitForEnvironments);
    expect(result.current.createEnvironment).toBe(mockOperations.createEnvironment);
    expect(result.current.deleteEnvironment).toBe(mockOperations.deleteEnvironment);
    expect(result.current.switchEnvironment).toBe(mockOperations.switchEnvironment);
    expect(result.current.cloneEnvironment).toBe(mockOperations.cloneEnvironment);
  });

  it('exposes all variable functions', () => {
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

  it('returns stable references across renders', () => {
    const { result, rerender } = renderHook(() => useCentralizedEnvironments());

    const firstRender = result.current;
    rerender();
    const secondRender = result.current;

    // Functions from mock modules should be the same reference
    expect(secondRender.setVariable).toBe(firstRender.setVariable);
    expect(secondRender.createEnvironment).toBe(firstRender.createEnvironment);
  });
});

describe('useEnvironments alias', () => {
  it('is the same function as useCentralizedEnvironments', () => {
    expect(useEnvironments).toBe(useCentralizedEnvironments);
  });
});
