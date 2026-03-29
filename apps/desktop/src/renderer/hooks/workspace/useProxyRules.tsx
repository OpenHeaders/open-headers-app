import { useCallback } from 'react';
import type { ProxyRule } from '../../../types/proxy';
import { showMessage } from '../../utils';
import { useCentralizedWorkspace } from '../useCentralizedWorkspace';

interface UseProxyRulesReturn {
  rules: ProxyRule[];
  addRule: (ruleData: ProxyRule) => Promise<boolean>;
  removeRule: (ruleId: string) => Promise<boolean>;
}

/**
 * Hook for proxy rules management
 */
export function useProxyRules(): UseProxyRulesReturn {
  const { proxyRules, service } = useCentralizedWorkspace();

  const addRule = useCallback(
    async (ruleData: ProxyRule): Promise<boolean> => {
      try {
        await service.addProxyRule(ruleData);
        showMessage('success', 'Proxy rule added');
        return true;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service],
  );

  const removeRule = useCallback(
    async (ruleId: string): Promise<boolean> => {
      try {
        await service.removeProxyRule(ruleId);
        showMessage('success', 'Proxy rule removed');
        return true;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service],
  );

  return {
    rules: proxyRules,
    addRule,
    removeRule,
  };
}
