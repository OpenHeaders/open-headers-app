import { useCallback } from 'react';
import { useCentralizedWorkspace } from '../useCentralizedWorkspace';
import { showMessage } from '../../utils/ui/messageUtil';

interface HeaderRule {
  id: string;
  isEnabled?: boolean;
  [key: string]: unknown;
}

interface UseHeaderRulesReturn {
  rules: HeaderRule[];
  addRule: (ruleData: Record<string, unknown>) => Promise<boolean>;
  updateRule: (ruleId: string, updates: Record<string, unknown>) => Promise<boolean>;
  removeRule: (ruleId: string) => Promise<boolean>;
  toggleRule: (ruleId: string, enabled: boolean) => Promise<boolean>;
}

/**
 * Hook for header rules management
 */
export function useHeaderRules(): UseHeaderRulesReturn {
  const { rules, service } = useCentralizedWorkspace();
  const headerRules = rules.header || [];

  const addRule = useCallback(async (ruleData: Record<string, unknown>): Promise<boolean> => {
    try {
      await service.addHeaderRule(ruleData);
      showMessage('success', 'Rule added successfully');
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const updateRule = useCallback(async (ruleId: string, updates: Record<string, unknown>): Promise<boolean> => {
    try {
      await service.updateHeaderRule(ruleId, updates);
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const removeRule = useCallback(async (ruleId: string): Promise<boolean> => {
    try {
      await service.removeHeaderRule(ruleId);
      showMessage('success', 'Rule removed');
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const toggleRule = useCallback(async (ruleId: string, enabled: boolean): Promise<boolean> => {
    try {
      await service.updateHeaderRule(ruleId, { isEnabled: enabled });
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  return {
    rules: headerRules,
    addRule,
    updateRule,
    removeRule,
    toggleRule
  };
}
