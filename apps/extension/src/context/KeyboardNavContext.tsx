import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useDeleteConfirmation } from '@/hooks/useDeleteConfirmation';
import { type FooterActions, useKeyboardDispatch } from '@/hooks/useKeyboardDispatch';
import { useKeyboardFocus } from '@/hooks/useKeyboardFocus';
import { useKeyboardScrollAndHighlight } from '@/hooks/useKeyboardScrollAndHighlight';
import type { PageInfo, RowActions } from '@/popup/utils/table-shared';

export type { FooterActions };

export interface KeyboardNavContextValue {
  activeTab: string | null;
  onTabChange: (tab: string) => void;
  focusedRowIndex: number;
  pendingDeleteIndex: number;
  expandedRowKey: string | number | null;
  nestedFocusIndex: number;
  isShortcutsOverlayVisible: boolean;
  setIsShortcutsOverlayVisible: (visible: boolean | ((prev: boolean) => boolean)) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  setPageInfo: (info: PageInfo) => void;
  setRowActions: (actions: RowActions) => void;
  setFooterActions: (actions: FooterActions) => void;
  setNestedRowCount: (count: number) => void;
  toggleExpandedRow: (key: string | number, rowIndex?: number) => void;
}

const KeyboardNavContext = createContext<KeyboardNavContextValue | undefined>(undefined);

interface KeyboardNavProviderProps {
  activeTab: string | null;
  onTabChange: (tab: string) => void;
  onCycleTheme?: () => void;
  onToggleCompactMode?: () => void;
  children: React.ReactNode;
}

export const KeyboardNavProvider: React.FC<KeyboardNavProviderProps> = ({
  activeTab,
  onTabChange,
  onCycleTheme,
  onToggleCompactMode,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isShortcutsOverlayVisible, setIsShortcutsOverlayVisible] = useState(false);

  const [pageInfo, setPageInfo] = useState<PageInfo>({
    visibleRowCount: 0,
    visibleRowIds: [],
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [rowActions, setRowActions] = useState<RowActions>({});
  const [footerActions, setFooterActions] = useState<FooterActions>({});
  const [expandedRowKey, setExpandedRowKey] = useState<string | number | null>(null);
  const [nestedRowCount, setNestedRowCount] = useState(0);

  const focus = useKeyboardFocus({
    activeTab,
    visibleRowIds: pageInfo.visibleRowIds,
    visibleRowCount: pageInfo.visibleRowCount,
  });

  const { pendingDeleteIndex, setPendingDeleteIndex } = useDeleteConfirmation(focus.focusedRowIndex);

  useKeyboardDispatch({
    focusedRowIndex: focus.focusedRowIndex,
    setFocusedRowIndex: focus.setFocusedRowIndex,
    nestedFocusIndex: focus.nestedFocusIndex,
    setNestedFocusIndex: focus.setNestedFocusIndex,
    pendingDeleteIndex,
    setPendingDeleteIndex,
    expandedRowKey,
    setExpandedRowKey,
    nestedRowCount,
    isShortcutsOverlayVisible,
    setIsShortcutsOverlayVisible,
    containerRef,
    onTabChange,
    visibleRowCount: pageInfo.visibleRowCount,
    visibleRowIds: pageInfo.visibleRowIds,
    hasNextPage: pageInfo.hasNextPage,
    hasPrevPage: pageInfo.hasPrevPage,
    onNextPage: pageInfo.onNextPage,
    onPrevPage: pageInfo.onPrevPage,
    rowActions,
    footerActions,
    onCycleTheme,
    onToggleCompactMode,
    focusLastRowOnPageChange: focus.focusLastRowOnPageChange,
  });

  useKeyboardScrollAndHighlight(focus.focusedRowIndex, focus.nestedFocusIndex, expandedRowKey, containerRef);

  // Auto-enter nested mode when a row is expanded and nested content becomes available
  useEffect(() => {
    if (expandedRowKey !== null && nestedRowCount > 0 && focus.nestedFocusIndex < 0) {
      focus.setNestedFocusIndex(0);
    }
  }, [expandedRowKey, nestedRowCount, focus.nestedFocusIndex, focus.setNestedFocusIndex]);

  // Stable setter refs to avoid unnecessary re-renders
  const setPageInfoStable = useCallback((info: PageInfo) => setPageInfo(info), []);
  const setRowActionsStable = useCallback((actions: RowActions) => setRowActions(actions), []);
  const setFooterActionsStable = useCallback((actions: FooterActions) => setFooterActions(actions), []);
  const setNestedRowCountStable = useCallback((count: number) => setNestedRowCount(count), []);
  const toggleExpandedRow = useCallback(
    (key: string | number, rowIndex?: number) => {
      setExpandedRowKey((prev) => {
        if (prev === key) {
          // Collapsing — exit nested mode
          focus.setNestedFocusIndex(-1);
          return null;
        }
        // Expanding — set focus to the clicked row
        if (rowIndex !== undefined) {
          focus.setFocusedRowIndex(rowIndex);
        }
        return key;
      });
    },
    [focus.setFocusedRowIndex, focus.setNestedFocusIndex],
  );

  const value: KeyboardNavContextValue = {
    activeTab,
    onTabChange,
    focusedRowIndex: focus.focusedRowIndex,
    pendingDeleteIndex,
    expandedRowKey,
    nestedFocusIndex: focus.nestedFocusIndex,
    isShortcutsOverlayVisible,
    setIsShortcutsOverlayVisible,
    containerRef,
    setPageInfo: setPageInfoStable,
    setRowActions: setRowActionsStable,
    setFooterActions: setFooterActionsStable,
    setNestedRowCount: setNestedRowCountStable,
    toggleExpandedRow,
  };

  return <KeyboardNavContext.Provider value={value}>{children}</KeyboardNavContext.Provider>;
};

export function useKeyboardNav(): KeyboardNavContextValue {
  const context = useContext(KeyboardNavContext);
  if (!context) {
    throw new Error('useKeyboardNav must be used within a KeyboardNavProvider');
  }
  return context;
}
