import type { RefObject } from 'react';
import { useEffect } from 'react';

function getActivePane(container: HTMLElement): Element {
  return container.querySelector('.ant-tabs-tabpane-active') ?? container;
}

function scrollIntoScrollContainer(element: HTMLElement, container: HTMLElement): void {
  // Find the Ant Design table scroll container (parent .ant-table-body)
  // Use the outermost one to handle nested tables correctly
  const scrollContainer = container.querySelector('.ant-table-body');
  if (!scrollContainer) {
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  const containerRect = scrollContainer.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  if (elementRect.bottom > containerRect.bottom) {
    scrollContainer.scrollTop += elementRect.bottom - containerRect.bottom;
  } else if (elementRect.top < containerRect.top) {
    scrollContainer.scrollTop -= containerRect.top - elementRect.top;
  }
}

export function useKeyboardScrollAndHighlight(
  focusedRowIndex: number,
  nestedFocusIndex: number,
  expandedRowKey: string | number | null,
  containerRef: RefObject<HTMLDivElement | null>,
): void {
  // Scroll focused parent row into view
  useEffect(() => {
    if (focusedRowIndex < 0) return;
    const container = containerRef.current;
    if (!container) return;
    const activePane = getActivePane(container) as HTMLElement;
    // Use .keyboard-focused-row class (already applied by rowClassName) to find the row
    const row = activePane.querySelector('.keyboard-focused-row') as HTMLElement | null;
    if (row) scrollIntoScrollContainer(row, activePane);
  }, [focusedRowIndex, containerRef]);

  // Scroll expanded row content into view when entering nested mode.
  // Uses expandedRowKey to find the row by data-row-key attribute (set by Ant Design).
  useEffect(() => {
    if (expandedRowKey === null || nestedFocusIndex < 0) return;
    const container = containerRef.current;
    if (!container) return;

    // Wait two frames: one for React render, one for Ant Design style update
    let frame1 = requestAnimationFrame(() => {
      frame1 = requestAnimationFrame(() => {
        const activePane = getActivePane(container) as HTMLElement;
        // Find expanded row by the data-row-key that Ant Design puts on each tr
        const parentRow = activePane.querySelector(`tr[data-row-key="${expandedRowKey}"]`);
        const expandedRow = parentRow?.nextElementSibling as HTMLElement | null;
        if (!expandedRow?.classList.contains('ant-table-expanded-row')) return;

        // Scroll the bottom of the expanded content into view
        scrollIntoScrollContainer(expandedRow, activePane);

        // Virtual nested tables use React rowClassName + scrollTo ref — skip DOM manipulation
        const isVirtual = expandedRow.querySelector('.ant-table-virtual') !== null;
        if (isVirtual) return;

        // For non-virtual nested tables, highlight and scroll via DOM
        container.querySelectorAll('.keyboard-focused-nested-row').forEach((el) => {
          el.classList.remove('keyboard-focused-nested-row');
        });
        const nestedRows = expandedRow.querySelectorAll('.ant-table-row[data-row-key]');
        const nestedRow = nestedRows[nestedFocusIndex] as HTMLElement | undefined;
        if (nestedRow) {
          nestedRow.classList.add('keyboard-focused-nested-row');
          const nestedScrollContainer = expandedRow.querySelector('.ant-table-body');
          if (nestedScrollContainer) {
            const nestedContainerRect = nestedScrollContainer.getBoundingClientRect();
            const nestedRowRect = nestedRow.getBoundingClientRect();
            if (nestedRowRect.bottom > nestedContainerRect.bottom) {
              nestedScrollContainer.scrollTop += nestedRowRect.bottom - nestedContainerRect.bottom;
            } else if (nestedRowRect.top < nestedContainerRect.top) {
              nestedScrollContainer.scrollTop -= nestedContainerRect.top - nestedRowRect.top;
            }
          }
        }
      });
    });
    return () => cancelAnimationFrame(frame1);
  }, [nestedFocusIndex, expandedRowKey, containerRef]);

  // Clean up nested highlights when exiting nested mode
  useEffect(() => {
    if (nestedFocusIndex >= 0) return;
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('.keyboard-focused-nested-row').forEach((el) => {
      el.classList.remove('keyboard-focused-nested-row');
    });
  }, [nestedFocusIndex, containerRef]);
}
