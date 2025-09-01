import { useCallback } from 'react';
import { useCentralizedWorkspace } from '../useCentralizedWorkspace';
import { showMessage } from '../../utils';

/**
 * Hook for proxy rules management
 */
export function useProxyRules() {
  const { proxyRules, service } = useCentralizedWorkspace();

  const addRule = useCallback(async (ruleData) => {
    try {
      await service.addProxyRule(ruleData);
      showMessage('success', 'Proxy rule added');
      return true;
    } catch (error) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const removeRule = useCallback(async (ruleId) => {
    try {
      await service.removeProxyRule(ruleId);
      showMessage('success', 'Proxy rule removed');
      return true;
    } catch (error) {
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