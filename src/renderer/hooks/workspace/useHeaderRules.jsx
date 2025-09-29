import { useCallback } from 'react';
import { useCentralizedWorkspace } from '../useCentralizedWorkspace';
import { showMessage } from '../../utils/ui/messageUtil';

/**
 * Hook for header rules management
 */
export function useHeaderRules() {
  const { rules, service } = useCentralizedWorkspace();
  const headerRules = rules.header || [];

  const addRule = useCallback(async (ruleData) => {
    try {
      await service.addHeaderRule(ruleData);
      showMessage('success', 'Rule added successfully');
      return true;
    } catch (error) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const updateRule = useCallback(async (ruleId, updates) => {
    try {
      await service.updateHeaderRule(ruleId, updates);
      return true;
    } catch (error) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const removeRule = useCallback(async (ruleId) => {
    try {
      await service.removeHeaderRule(ruleId);
      showMessage('success', 'Rule removed');
      return true;
    } catch (error) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const toggleRule = useCallback(async (ruleId, enabled) => {
    try {
      await service.updateHeaderRule(ruleId, { isEnabled: enabled });
      return true;
    } catch (error) {
      showMessage('error', error.message);
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