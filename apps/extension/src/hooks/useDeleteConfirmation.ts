import { useEffect, useState } from 'react';

interface UseDeleteConfirmationResult {
  pendingDeleteIndex: number;
  setPendingDeleteIndex: (index: number) => void;
}

export function useDeleteConfirmation(focusedRowIndex: number): UseDeleteConfirmationResult {
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(-1);

  // Clear pending delete when row focus changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusedRowIndex is intentionally watched
  useEffect(() => {
    setPendingDeleteIndex(-1);
  }, [focusedRowIndex]);

  return { pendingDeleteIndex, setPendingDeleteIndex };
}
