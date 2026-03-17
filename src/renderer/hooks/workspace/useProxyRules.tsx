import { useCallback } from 'react';
import { useCentralizedWorkspace } from '../useCentralizedWorkspace';
import { showMessage } from '../../utils';

interface UseProxyRulesReturn {
  rules: any[];
  addRule: (ruleData: any) => Promise<boolean>;
  removeRule: (ruleId: string) => Promise<boolean>;
}

/**
 * Hook for proxy rules management
 */
export function useProxyRules(): UseProxyRulesReturn {
  const { proxyRules, service } = useCentralizedWorkspace();

  const addRule = useCallback(async (ruleData: any): Promise<boolean> => {
    try {
      await service.addProxyRule(ruleData);
      showMessage('success', 'Proxy rule added');
      return true;
    } catch (error: any) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const removeRule = useCallback(async (ruleId: string): Promise<boolean> => {
    try {
      await service.removeProxyRule(ruleId);
      showMessage('success', 'Proxy rule removed');
      return true;
    } catch (error: any) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  return {
    rules: proxyRules,
    addRule,
    removeRule
  };
}
