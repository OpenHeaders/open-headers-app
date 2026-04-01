import { useCallback, useEffect, useRef, useState } from 'react';

export interface KeyboardNavigationState {
  focusedRowIndex: number;
  nestedFocusIndex: number;
  pendingDeleteIndex: number;
  isShortcutsOverlayVisible: boolean;
  setIsShortcutsOverlayVisible: (visible: boolean) => void;
  setFocusedRowIndex: (index: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface UseKeyboardNavigationOptions {
  activeTab: string | null;
  onTabChange: (tab: string) => void;
  visibleRowCount: number;
  visibleRowIds: readonly (string | number)[];
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  onToggleRow?: (index: number) => void;
  onExpandRow?: (index: number) => void;
  onCollapseRow?: (index: number) => void;
  onEditRow?: (index: number) => void;
  onCopyRow?: (index: number) => void;
  onDeleteRow?: (index: number) => void;
  onAddRule?: () => void;
  onToggleRecording?: () => void;
  onToggleRulesPause?: () => void;
  onCycleTheme?: () => void;
  onToggleCompactMode?: () => void;
}

const TAB_KEYS: Record<string, string> = {
  '1': 'active-rules',
  '2': 'all-rules',
  '3': 'tag-manager',
};

function getActivePane(container: HTMLElement): Element {
  return container.querySelector('.ant-tabs-tabpane-active') ?? container;
}

function getNestedRowCount(container: HTMLElement, parentRowIndex: number): number {
  const activePane = getActivePane(container);
  const parentRows = activePane.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
  const parentRow = parentRows[parentRowIndex];
  if (!parentRow) return 0;
  const expandedRow = parentRow.nextElementSibling;
  if (!expandedRow?.classList.contains('ant-table-expanded-row')) return 0;
  return expandedRow.querySelectorAll('.ant-table-tbody > tr.ant-table-row').length;
}

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

export function useKeyboardNavigation(options: UseKeyboardNavigationOptions): KeyboardNavigationState {
  const {
    activeTab,
    onTabChange,
    visibleRowCount,
    visibleRowIds,
    hasNextPage,
    hasPrevPage,
    onNextPage,
    onPrevPage,
    onToggleRow,
    onExpandRow,
    onCollapseRow,
    onEditRow,
    onCopyRow,
    onDeleteRow,
    onAddRule,
    onToggleRecording,
    onToggleRulesPause,
    onCycleTheme,
    onToggleCompactMode,
  } = options;

  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const [nestedFocusIndex, setNestedFocusIndex] = useState(-1);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(-1);
  const [isShortcutsOverlayVisible, setIsShortcutsOverlayVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
    // If the same ID is still at the same index, nothing to do
    if (visibleRowIds[focusedRowIndex] === id) return;
    // Find where the ID moved to
    const newIndex = visibleRowIds.indexOf(id);
    if (newIndex >= 0) {
      setFocusedRowIndex(newIndex);
    } else if (visibleRowIds.length > 0) {
      // Item filtered out — snap to first row
      setFocusedRowIndex(0);
    } else {
      setFocusedRowIndex(-1);
    }
  }, [visibleRowIds]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const key = e.key;

      // Shortcuts overlay toggle — works even when overlay is open
      if (key === '?' && !isInputFocused()) {
        e.preventDefault();
        setIsShortcutsOverlayVisible((prev) => !prev);
        return;
      }

      // Close overlay with Escape — stopImmediatePropagation prevents the
      // browser from closing the entire extension popup on Escape.
      if (key === 'Escape' && isShortcutsOverlayVisible) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setIsShortcutsOverlayVisible(false);
        return;
      }

      // Don't process shortcuts while overlay or popover is open
      if (isShortcutsOverlayVisible) return;
      if (isOverlayOpen()) return;

      // Pending delete confirmation: Enter/d confirms, any other key cancels
      if (pendingDeleteIndex >= 0) {
        e.preventDefault();
        if ((key === 'Enter' || key === 'd') && onDeleteRow) {
          onDeleteRow(pendingDeleteIndex);
        }
        setPendingDeleteIndex(-1);
        return;
      }

      // Escape: exit nested focus / clear search & blur / reset row focus
      if (key === 'Escape') {
        if (nestedFocusIndex >= 0) {
          setNestedFocusIndex(-1);
          e.preventDefault();
          return;
        }
        if (isInputFocused()) {
          const input = document.activeElement as HTMLInputElement;
          // Clear the search value
          if (input.value) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value',
            )?.set;
            nativeInputValueSetter?.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          input.blur();
          if (focusedRowIndex < 0) setFocusedRowIndex(0);
          e.preventDefault();
          return;
        }
        if (focusedRowIndex >= 0) {
          setFocusedRowIndex(-1);
          e.preventDefault();
          return;
        }
        return;
      }

      // Enter while in search input: keep filter, blur, start row navigation
      if (key === 'Enter' && isInputFocused()) {
        (document.activeElement as HTMLElement).blur();
        if (focusedRowIndex < 0) setFocusedRowIndex(0);
        e.preventDefault();
        return;
      }

      // Prevent Tab/Shift+Tab from moving focus to native elements
      // which would break our keyboard navigation system
      if (key === 'Tab') {
        e.preventDefault();
        return;
      }

      // All remaining shortcuts require no input focus
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
        const searchInput = containerRef.current?.querySelector<HTMLInputElement>(
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
        const nestedCount = containerRef.current ? getNestedRowCount(containerRef.current, focusedRowIndex) : 0;

        if (key === 'j' || key === 'ArrowDown') {
          e.preventDefault();
          setNestedFocusIndex((prev) => (prev + 1 >= nestedCount ? 0 : prev + 1));
          return;
        }
        if (key === 'k' || key === 'ArrowUp') {
          e.preventDefault();
          setNestedFocusIndex((prev) => (prev <= 0 ? nestedCount - 1 : prev - 1));
          return;
        }
        if (key === 'ArrowLeft' || key === 'h') {
          e.preventDefault();
          setNestedFocusIndex(-1);
          return;
        }
        // Other keys in nested mode — ignore row actions, fall through to globals
        if (key === 'c') {
          // Copy the nested row's URL — handled via DOM
          e.preventDefault();
          const activePane = containerRef.current ? getActivePane(containerRef.current) : null;
          if (activePane) {
            const parentRows = activePane.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
            const parentRow = parentRows[focusedRowIndex];
            const expandedRow = parentRow?.nextElementSibling;
            if (expandedRow?.classList.contains('ant-table-expanded-row')) {
              const nestedRows = expandedRow.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
              const nestedRow = nestedRows[nestedFocusIndex];
              // Find the copy icon and click it, or get text from the URL cell
              const copyIcon = nestedRow?.querySelector('.value-copy-icon') as HTMLElement | null;
              if (copyIcon) copyIcon.click();
            }
          }
          return;
        }
        // Don't process other row actions in nested mode
        return;
      }

      // === Parent row navigation: j/k or Arrow Down/Up ===
      if (key === 'j' || key === 'ArrowDown') {
        e.preventDefault();
        if (visibleRowCount === 0) return;
        setFocusedRowIndex((prev) => {
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
        setFocusedRowIndex((prev) => {
          if (prev <= 0) {
            if (hasPrevPage && onPrevPage) {
              onPrevPage();
              focusLastRowOnPageChange.current = true;
              return 0; // temporary — will be resolved when visibleRowCount updates
            }
            return visibleRowCount - 1;
          }
          return prev - 1;
        });
        return;
      }

      // Row actions — only when a parent row is focused
      if (focusedRowIndex >= 0) {
        if (key === 'ArrowRight' || key === 'l' || key === 'Enter') {
          e.preventDefault();
          // If row is already expanded, enter nested focus
          const nestedCount = containerRef.current ? getNestedRowCount(containerRef.current, focusedRowIndex) : 0;
          if (nestedCount > 0) {
            setNestedFocusIndex(0);
            return;
          }
          // Otherwise expand it
          if (onExpandRow) onExpandRow(focusedRowIndex);
          return;
        }

        if ((key === 'ArrowLeft' || key === 'h') && onCollapseRow) {
          e.preventDefault();
          onCollapseRow(focusedRowIndex);
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

        if (key === 'c' && onCopyRow) {
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
      visibleRowCount,
      hasNextPage,
      hasPrevPage,
      isShortcutsOverlayVisible,
      onTabChange,
      onNextPage,
      onPrevPage,
      onToggleRow,
      onExpandRow,
      onCollapseRow,
      onEditRow,
      onCopyRow,
      onDeleteRow,
      onAddRule,
      onToggleRecording,
      onToggleRulesPause,
      onCycleTheme,
      onToggleCompactMode,
    ],
  );

  // Listen on document so shortcuts work regardless of which element has focus
  // (e.g. after opening the overlay from a Menu dropdown).
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Capture-phase Escape interceptor: prevent the browser from closing
  // the entire extension popup when Escape is used to close dropdowns,
  // popovers, or modals. preventDefault stops the browser's native
  // popup-close behavior while still letting the event reach antd handlers.
  useEffect(() => {
    const handleEscapeCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOverlayOpen()) {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleEscapeCapture, true);
    return () => document.removeEventListener('keydown', handleEscapeCapture, true);
  }, []);

  // Resolve "focus last row" after page change — triggered when visibleRowCount updates
  useEffect(() => {
    if (focusLastRowOnPageChange.current && visibleRowCount > 0) {
      focusLastRowOnPageChange.current = false;
      setFocusedRowIndex(visibleRowCount - 1);
    }
  }, [visibleRowCount]);

  // Scroll focused row into view within Ant Design's table scroll container.
  // Scope to the active tab pane since destroyOnHidden={false} keeps inactive tables in the DOM.
  useEffect(() => {
    if (focusedRowIndex < 0) return;
    const container = containerRef.current;
    if (!container) return;
    const activePane = container.querySelector('.ant-tabs-tabpane-active') ?? container;
    const scrollContainer = activePane.querySelector('.ant-table-body');
    const rows = activePane.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
    const row = rows[focusedRowIndex] as HTMLElement | undefined;
    if (!row) return;
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      if (rowRect.bottom > containerRect.bottom) {
        scrollContainer.scrollTop += rowRect.bottom - containerRect.bottom;
      } else if (rowRect.top < containerRect.top) {
        scrollContainer.scrollTop -= containerRect.top - rowRect.top;
      }
    } else {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedRowIndex]);

  // Highlight nested focused row via DOM class (since we can't pass props into the nested table)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Clear all previous nested highlights
    container.querySelectorAll('.keyboard-focused-nested-row').forEach((el) => {
      el.classList.remove('keyboard-focused-nested-row');
    });
    if (nestedFocusIndex < 0 || focusedRowIndex < 0) return;
    const activePane = getActivePane(container);
    const parentRows = activePane.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
    const parentRow = parentRows[focusedRowIndex];
    const expandedRow = parentRow?.nextElementSibling;
    if (!expandedRow?.classList.contains('ant-table-expanded-row')) return;
    const nestedRows = expandedRow.querySelectorAll('.ant-table-tbody > tr.ant-table-row');
    const nestedRow = nestedRows[nestedFocusIndex];
    if (nestedRow) {
      nestedRow.classList.add('keyboard-focused-nested-row');
      nestedRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [nestedFocusIndex, focusedRowIndex]);

  // Reset nested focus when parent row changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusedRowIndex is intentionally watched
  useEffect(() => {
    setNestedFocusIndex(-1);
  }, [focusedRowIndex]);

  // Clear pending delete when row focus changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusedRowIndex is intentionally watched
  useEffect(() => {
    setPendingDeleteIndex(-1);
  }, [focusedRowIndex]);

  return {
    focusedRowIndex,
    nestedFocusIndex,
    pendingDeleteIndex,
    isShortcutsOverlayVisible,
    setIsShortcutsOverlayVisible,
    setFocusedRowIndex,
    containerRef,
  };
}
