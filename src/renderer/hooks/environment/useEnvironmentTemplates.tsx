import { useCallback } from 'react';
import { useEnvironmentCore } from './useEnvironmentCore';

interface UseEnvironmentTemplatesReturn {
  resolveTemplate: (template: string) => string;
  resolveObjectTemplate: (obj: any) => any;
}

/**
 * Hook for environment template resolution
 */
export function useEnvironmentTemplates(): UseEnvironmentTemplatesReturn {
  const { service } = useEnvironmentCore();

  const resolveTemplate = useCallback((template: string): string => {
    return service.resolveTemplate(template);
  }, [service]);

  const resolveObjectTemplate = useCallback((obj: any): any => {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item: any) => resolveObjectTemplate(item));
    }

    const resolved: Record<string, any> = {};
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
