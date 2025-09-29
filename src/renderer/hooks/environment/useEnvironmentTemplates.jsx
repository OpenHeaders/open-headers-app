import { useCallback } from 'react';
import { useEnvironmentCore } from './useEnvironmentCore';

/**
 * Hook for environment template resolution
 */
export function useEnvironmentTemplates() {
  const { service } = useEnvironmentCore();

  const resolveTemplate = useCallback((template) => {
    return service.resolveTemplate(template);
  }, [service]);

  const resolveObjectTemplate = useCallback((obj) => {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => resolveObjectTemplate(item));
    }

    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
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