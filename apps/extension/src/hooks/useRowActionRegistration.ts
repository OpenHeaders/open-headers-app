import { useEffect } from 'react';
import type { RowActions } from '@/popup/utils/table-shared';

export function useRowActionRegistration(
  onRowActionsChange: ((actions: RowActions) => void) | undefined,
  actions: RowActions,
): void {
  const { onToggleRow, onEditRow, onCopyRow, onDeleteRow, onAddRule } = actions;
  useEffect(() => {
    if (!onRowActionsChange) return;
    onRowActionsChange({ onToggleRow, onEditRow, onCopyRow, onDeleteRow, onAddRule });
  }, [onRowActionsChange, onToggleRow, onEditRow, onCopyRow, onDeleteRow, onAddRule]);
}
