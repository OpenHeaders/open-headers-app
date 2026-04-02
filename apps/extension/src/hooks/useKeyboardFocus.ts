import { type RefObject, useEffect, useRef, useState } from 'react';

interface UseKeyboardFocusOptions {
  activeTab: string | null;
  visibleRowIds: readonly (string | number)[];
  visibleRowCount: number;
}

interface UseKeyboardFocusResult {
  focusedRowIndex: number;
  setFocusedRowIndex: (index: number | ((prev: number) => number)) => void;
  nestedFocusIndex: number;
  setNestedFocusIndex: (index: number | ((prev: number) => number)) => void;
  focusLastRowOnPageChange: RefObject<boolean>;
}

export function useKeyboardFocus({
  activeTab,
  visibleRowIds,
  visibleRowCount,
}: UseKeyboardFocusOptions): UseKeyboardFocusResult {
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const [nestedFocusIndex, setNestedFocusIndex] = useState(-1);
  const focusPerTab = useRef<Record<string, number>>({});
  const prevTabRef = useRef<string | null>(activeTab);
  const focusLastRowOnPageChange = useRef(false);
  const focusedRowIdRef = useRef<string | number | null>(null);

  // Save/restore row focus when switching tabs
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeTab is intentionally watched to save/restore focus on tab switch
  useEffect(() => {
    const prevTab = prevTabRef.current;
    if (prevTab && prevTab !== activeTab) {
      focusPerTab.current[prevTab] = focusedRowIndex;
    }
    if (activeTab) {
      setFocusedRowIndex(focusPerTab.current[activeTab] ?? -1);
    }
    prevTabRef.current = activeTab;
  }, [activeTab]);

  // Keep focusedRowIdRef in sync when index changes
  useEffect(() => {
    focusedRowIdRef.current = focusedRowIndex >= 0 ? (visibleRowIds[focusedRowIndex] ?? null) : null;
  }, [focusedRowIndex, visibleRowIds]);

  // When visible rows change (filtering/sorting), find where the focused item moved
  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleRowIds is intentionally watched to resolve ID-based focus
  useEffect(() => {
    const id = focusedRowIdRef.current;
    if (id === null || focusedRowIndex < 0) return;
    if (visibleRowIds[focusedRowIndex] === id) return;
    const newIndex = visibleRowIds.indexOf(id);
    if (newIndex >= 0) {
      setFocusedRowIndex(newIndex);
    } else if (visibleRowIds.length > 0) {
      setFocusedRowIndex(0);
    } else {
      setFocusedRowIndex(-1);
    }
  }, [visibleRowIds]);

  // Resolve "focus last row" after page change
  useEffect(() => {
    if (focusLastRowOnPageChange.current && visibleRowCount > 0) {
      focusLastRowOnPageChange.current = false;
      setFocusedRowIndex(visibleRowCount - 1);
    }
  }, [visibleRowCount]);

  // Reset nested focus when parent row changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusedRowIndex is intentionally watched
  useEffect(() => {
    setNestedFocusIndex(-1);
  }, [focusedRowIndex]);

  return {
    focusedRowIndex,
    setFocusedRowIndex,
    nestedFocusIndex,
    setNestedFocusIndex,
    focusLastRowOnPageChange,
  };
}
