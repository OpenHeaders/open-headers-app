import type { RefObject } from 'react';
import { useCallback, useEffect } from 'react';
import type { RowActions } from '@/popup/utils/table-shared';

export interface FooterActions {
  onToggleRecording?: () => void;
  onToggleRulesPause?: () => void;
  onToggleOptions?: () => void;
}

interface UseKeyboardDispatchOptions {
  focusedRowIndex: number;
  setFocusedRowIndex: (index: number | ((prev: number) => number)) => void;
  nestedFocusIndex: number;
  setNestedFocusIndex: (index: number | ((prev: number) => number)) => void;
  pendingDeleteIndex: number;
  setPendingDeleteIndex: (index: number) => void;
  expandedRowKey: string | number | null;
  setExpandedRowKey: (key: string | number | null) => void;
  nestedRowCount: number;
  isShortcutsOverlayVisible: boolean;
  setIsShortcutsOverlayVisible: (visible: boolean | ((prev: boolean) => boolean)) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  onTabChange: (tab: string) => void;
  visibleRowCount: number;
  visibleRowIds: readonly (string | number)[];
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  rowActions: RowActions;
  footerActions: FooterActions;
  onCycleTheme?: () => void;
  onToggleCompactMode?: () => void;
  focusLastRowOnPageChange: RefObject<boolean>;
}

const TAB_KEYS: Record<string, string> = {
  '1': 'active-rules',
  '2': 'all-rules',
  '3': 'tag-manager',
};

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
}

function isOverlayOpen(): boolean {
  return (
    document.querySelector(
      '.ant-popconfirm, .ant-popover:not(.ant-popover-hidden), .ant-modal-root, .ant-dropdown:not(.ant-dropdown-hidden)',
    ) !== null
  );
}

export function useKeyboardDispatch(options: UseKeyboardDispatchOptions): void {
  const {
    focusedRowIndex,
    setFocusedRowIndex,
    nestedFocusIndex,
    setNestedFocusIndex,
    pendingDeleteIndex,
    setPendingDeleteIndex,
    expandedRowKey,
    setExpandedRowKey,
    nestedRowCount,
    isShortcutsOverlayVisible,
    setIsShortcutsOverlayVisible,
    containerRef,
    onTabChange,
    visibleRowCount,
    visibleRowIds,
    hasNextPage,
    hasPrevPage,
    onNextPage,
    onPrevPage,
    rowActions,
    footerActions,
    onCycleTheme,
    onToggleCompactMode,
    focusLastRowOnPageChange,
  } = options;

  const {
    onToggleRow,
    onEditRow,
    onCopyRow,
    onDeleteRow,
    onAddRule,
  } = rowActions;

  const { onToggleRecording, onToggleRulesPause, onToggleOptions } = footerActions;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const key = e.key;

      // Block Cmd/Ctrl+A (select all) — not useful in popup, except in input fields
      if (key === 'a' && (e.metaKey || e.ctrlKey) && !isInputFocused()) {
        e.preventDefault();
        return;
      }

      // Shortcuts overlay toggle
      if (key === '?' && !isInputFocused()) {
        e.preventDefault();
        setIsShortcutsOverlayVisible((prev: boolean) => !prev);
        return;
      }

      // Close overlay with Escape
      if (key === 'Escape' && isShortcutsOverlayVisible) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setIsShortcutsOverlayVisible(false);
        return;
      }

      if (isShortcutsOverlayVisible) return;

      // Toggle options dropdown — must be handled before isOverlayOpen() bail-out
      // so pressing 'o' again can close the dropdown
      if (key === 'o' && !isInputFocused() && onToggleOptions) {
        e.preventDefault();
        onToggleOptions();
        return;
      }

      if (isOverlayOpen()) return;

      // Pending delete confirmation
      if (pendingDeleteIndex >= 0) {
        e.preventDefault();
        if ((key === 'Enter' || key === 'd') && onDeleteRow) {
          onDeleteRow(pendingDeleteIndex);
        }
        setPendingDeleteIndex(-1);
        return;
      }

      // Escape: only intercept for search bar and overlays.
      // Otherwise let the browser close the popup.
      if (key === 'Escape') {
        if (isInputFocused()) {
          // First Escape clears search text (handled by the input's onKeyDown).
          // Second Escape (when input is empty) blurs and enters row navigation.
          (document.activeElement as HTMLElement).blur();
          if (focusedRowIndex < 0) setFocusedRowIndex(0);
          e.preventDefault();
          return;
        }
        return;
      }

      // Enter in search input
      if (key === 'Enter' && isInputFocused()) {
        (document.activeElement as HTMLElement).blur();
        if (focusedRowIndex < 0) setFocusedRowIndex(0);
        e.preventDefault();
        return;
      }

      // Prevent Tab from moving focus
      if (key === 'Tab') {
        e.preventDefault();
        return;
      }

      if (isInputFocused()) return;

      // Tab switching: 1, 2, 3
      if (TAB_KEYS[key]) {
        e.preventDefault();
        onTabChange(TAB_KEYS[key]);
        return;
      }

      // Focus search: /
      if (key === '/') {
        e.preventDefault();
        const activePane = containerRef.current?.querySelector('.ant-tabs-tabpane-active') ?? containerRef.current;
        const searchInput = activePane?.querySelector<HTMLInputElement>(
          '.ant-input-search input, .ant-input-affix-wrapper input',
        );
        if (searchInput) {
          setFocusedRowIndex(-1);
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Page navigation: [ / ]
      if (key === '[') {
        e.preventDefault();
        if (hasPrevPage && onPrevPage) {
          onPrevPage();
          setFocusedRowIndex(0);
        }
        return;
      }
      if (key === ']') {
        e.preventDefault();
        if (hasNextPage && onNextPage) {
          onNextPage();
          setFocusedRowIndex(0);
        }
        return;
      }

      // === Nested focus mode (inside expanded row's sub-table) ===
      if (nestedFocusIndex >= 0 && focusedRowIndex >= 0) {
        if (key === 'j' || key === 'ArrowDown') {
          e.preventDefault();
          if (nestedRowCount > 0) {
            setNestedFocusIndex((prev: number) => (prev + 1 >= nestedRowCount ? 0 : prev + 1));
          }
          return;
        }
        if (key === 'k' || key === 'ArrowUp') {
          e.preventDefault();
          if (nestedRowCount > 0) {
            setNestedFocusIndex((prev: number) => (prev <= 0 ? nestedRowCount - 1 : prev - 1));
          }
          return;
        }
        if (key === 'ArrowLeft' || key === 'h') {
          e.preventDefault();
          setNestedFocusIndex(-1);
          setExpandedRowKey(null);
          return;
        }
        if (key === 'c' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          // Copy nested row URL — this is the one place we touch DOM for a user action
          const activePane = containerRef.current?.querySelector('.ant-tabs-tabpane-active') ?? containerRef.current;
          if (activePane) {
            const parentRows = activePane.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
            const parentRow = parentRows[focusedRowIndex];
            const expandedRow = parentRow?.nextElementSibling;
            if (expandedRow?.classList.contains('ant-table-expanded-row')) {
              const nestedRows = expandedRow.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
              const nestedRow = nestedRows[nestedFocusIndex];
              const copyIcon = nestedRow?.querySelector('.value-copy-icon') as HTMLElement | null;
              if (copyIcon) copyIcon.click();
            }
          }
          return;
        }
        // Other keys in nested mode — don't process as parent actions
        return;
      }

      // === Parent row navigation: j/k ===
      if (key === 'j' || key === 'ArrowDown') {
        e.preventDefault();
        if (visibleRowCount === 0) return;
        setFocusedRowIndex((prev: number) => {
          const next = prev + 1;
          if (next >= visibleRowCount) {
            if (hasNextPage && onNextPage) {
              onNextPage();
              return 0;
            }
            return 0;
          }
          return next;
        });
        return;
      }
      if (key === 'k' || key === 'ArrowUp') {
        e.preventDefault();
        if (visibleRowCount === 0) return;
        setFocusedRowIndex((prev: number) => {
          if (prev <= 0) {
            if (hasPrevPage && onPrevPage) {
              onPrevPage();
              focusLastRowOnPageChange.current = true;
              return 0;
            }
            return visibleRowCount - 1;
          }
          return prev - 1;
        });
        return;
      }

      // === Row actions (when a parent row is focused) ===
      if (focusedRowIndex >= 0) {
        if (key === 'ArrowRight' || key === 'l' || key === 'Enter') {
          e.preventDefault();
          const rowId = visibleRowIds[focusedRowIndex] ?? null;
          if (expandedRowKey === rowId && nestedRowCount > 0) {
            // Row is already expanded with nested content — enter nested navigation
            setNestedFocusIndex(0);
          } else if (rowId !== null) {
            // Expand this row (or collapse-then-expand if a different row was expanded)
            setExpandedRowKey(rowId);
            // Blur to prevent Ant Design from moving focus to an element in another tab pane
            (document.activeElement as HTMLElement)?.blur();
          }
          return;
        }
        if (key === 'ArrowLeft' || key === 'h') {
          e.preventDefault();
          setExpandedRowKey(null);
          return;
        }
        if (key === ' ' && onToggleRow) {
          e.preventDefault();
          onToggleRow(focusedRowIndex);
          return;
        }
        if (key === 'e' && onEditRow) {
          e.preventDefault();
          onEditRow(focusedRowIndex);
          return;
        }
        if (key === 'c' && onCopyRow && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          onCopyRow(focusedRowIndex);
          return;
        }
        if (key === 'd' && onDeleteRow) {
          e.preventDefault();
          setPendingDeleteIndex(focusedRowIndex);
          return;
        }
      }

      // Global actions
      if (key === 'a' && onAddRule) {
        e.preventDefault();
        onAddRule();
        return;
      }
      if (key === 'r' && onToggleRecording) {
        e.preventDefault();
        onToggleRecording();
        return;
      }
      if (key === 'p' && onToggleRulesPause) {
        e.preventDefault();
        onToggleRulesPause();
        return;
      }
      if (key === 't' && onCycleTheme) {
        e.preventDefault();
        onCycleTheme();
        return;
      }
      if (key === 'm' && onToggleCompactMode) {
        e.preventDefault();
        onToggleCompactMode();
        return;
      }
    },
    [
      focusedRowIndex,
      nestedFocusIndex,
      pendingDeleteIndex,
      expandedRowKey,
      nestedRowCount,
      visibleRowCount,
      visibleRowIds,
      hasNextPage,
      hasPrevPage,
      isShortcutsOverlayVisible,
      onTabChange,
      onNextPage,
      onPrevPage,
      onToggleRow,
      onEditRow,
      onCopyRow,
      onDeleteRow,
      onAddRule,
      onToggleRecording,
      onToggleRulesPause,
      onToggleOptions,
      onCycleTheme,
      onToggleCompactMode,
      setFocusedRowIndex,
      setNestedFocusIndex,
      setIsShortcutsOverlayVisible,
      setPendingDeleteIndex,
      setExpandedRowKey,
      containerRef,
      focusLastRowOnPageChange,
    ],
  );

  // Listen on document
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Capture-phase Escape interceptor: only prevent browser from closing
  // the popup when search is focused, shortcuts overlay is open, or
  // an Ant Design popover/dropdown is open.
  useEffect(() => {
    const handleEscapeCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isShortcutsOverlayVisible || isOverlayOpen() || isInputFocused()) {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleEscapeCapture, true);
    return () => document.removeEventListener('keydown', handleEscapeCapture, true);
  }, [isShortcutsOverlayVisible]);
}
