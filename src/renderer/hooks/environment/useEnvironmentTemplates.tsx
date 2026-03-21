import { useCallback } from 'react';
import { useEnvironmentCore } from './useEnvironmentCore';

interface UseEnvironmentTemplatesReturn {
  resolveTemplate: (template: string) => string;
  resolveObjectTemplate: (obj: unknown) => unknown;
}

/**
 * Hook for environment template resolution
 */
export function useEnvironmentTemplates(): UseEnvironmentTemplatesReturn {
  const { service } = useEnvironmentCore();

  const resolveTemplate = useCallback((template: string): string => {
    return service.resolveTemplate(template);
  }, [service]);

  const resolveObjectTemplate = useCallback((obj: unknown): unknown => {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item: unknown) => resolveObjectTemplate(item));
    }

    const resolved: Record<string, string | unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, string | unknown>)) {
      if (typeof value === 'string') {
        resolved[key] = resolveTemplate(value);
      } else if (typeof value === 'object') {
        resolved[key] = resolveObjectTemplate(value);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }, [resolveTemplate]);

  return {
    resolveTemplate,
    resolveObjectTemplate
  };
}
