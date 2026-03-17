/**
 * Utility functions for workflow viewer operations
 */

/**
 * Performs auto-scroll to the current entry in the active tab
 * @returns {Function} Debounced scroll function
 */
export const createAutoScrollHandler = () => {
  return () => {
    const scrollToCurrentEntry = () => {
      // Find the active tab
      const activeTabPane = document.querySelector('.record-viewer-tabs .ant-tabs-tabpane-active');
      if (!activeTabPane) {
        return;
      }

      // Find the scroll container and current entry
      const scrollContainer = activeTabPane.querySelector('.ant-table-body');

      // Try multiple selectors for finding the current entry
      let currentEntry = null;
      const selectors = [
        '.ant-table-tbody .ant-table-row.entry-current',
        '.ant-table-tbody tr.entry-current',
        'tbody .ant-table-row.entry-current',
        'tbody tr.entry-current',
        '.entry-current'
      ];

      for (const selector of selectors) {
        currentEntry = activeTabPane.querySelector(selector);
        if (currentEntry) {
          break;
        }
      }

      if (currentEntry && scrollContainer) {
        // Get the position of the current entry relative to the scroll container
        const containerRect = scrollContainer.getBoundingClientRect();
        const rowRect = currentEntry.getBoundingClientRect();

        // Check if row is already mostly visible
        const isVisible = rowRect.top >= containerRect.top - 20 && rowRect.bottom <= containerRect.bottom + 20;

        if (!isVisible) {
          // Find all rows to get the index
          const allRowSelectors = [
            '.ant-table-tbody .ant-table-row',
            '.ant-table-tbody tr',
            'tbody .ant-table-row',
            'tbody tr'
          ];

          let rows = [];
          for (const rowSelector of allRowSelectors) {
            rows = Array.from(scrollContainer.querySelectorAll(rowSelector));
            if (rows.length > 0) {
              break;
            }
          }

          const currentIndex = rows.indexOf(currentEntry);

          if (currentIndex !== -1) {
            // Calculate approximate scroll position
            const rowHeight = currentEntry.offsetHeight;
            const scrollTop = currentIndex * rowHeight - (scrollContainer.clientHeight / 2) + (rowHeight / 2);

            scrollContainer.scrollTo({
              top: Math.max(0, scrollTop),
              behavior: 'smooth'
            });
          }
        }
      }
    };

    // Use requestAnimationFrame to ensure DOM has been updated
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToCurrentEntry);
    });
  };
};


/**
 * Creates handlers for auto-highlight and auto-scroll functionality
 * @param {Function} setAutoHighlight - Function to set auto-highlight state
 * @param {Function} setAutoScroll - Function to set auto-scroll state
 * @returns {Object} Handler functions
 */
export const createHighlightHandlers = (setAutoHighlight, setAutoScroll) => {
  const handleAutoHighlightChange = (checked) => {
    setAutoHighlight(checked);
    // If auto-highlight is turned off, also turn off auto-scroll
    if (!checked) {
      setAutoScroll(false);
    }
  };

  return {
    handleAutoHighlightChange
  };
};