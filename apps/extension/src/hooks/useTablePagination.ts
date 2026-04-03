import { useCallback, useEffect, useMemo, useState } from 'react';
import { PAGE_SIZE, type PageInfo } from '@/popup/utils/table-shared';

interface UseTablePaginationOptions<T extends { key: string | number }> {
  dataSource: T[];
  onPageInfoChange?: (info: PageInfo) => void;
}

interface UseTablePaginationResult {
  currentPage: number;
  setCurrentPage: (page: number) => void;
  visibleRowCount: number;
  visibleRowIds: readonly (string | number)[];
  paginationConfig: {
    current: number;
    pageSize: number;
    size: 'small';
    showSizeChanger: false;
    showTotal: (total: number, range: [number, number]) => string;
    style: { marginBottom: number; marginTop: number };
    onChange: (page: number) => void;
  };
}

export function useTablePagination<T extends { key: string | number }>({
  dataSource,
  onPageInfoChange,
}: UseTablePaginationOptions<T>): UseTablePaginationResult {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(dataSource.length / PAGE_SIZE));
  // Clamp to valid page when items are deleted
  const effectivePage = Math.min(currentPage, totalPages);
  if (effectivePage !== currentPage) {
    setCurrentPage(effectivePage);
  }
  const pageStart = (effectivePage - 1) * PAGE_SIZE;
  const pageSlice = dataSource.slice(pageStart, pageStart + PAGE_SIZE);
  const visibleRowCount = pageSlice.length;

  const visibleRowIdsKey = pageSlice.map((r) => r.key).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleRowIdsKey is a stable string representation
  const visibleRowIds = useMemo(() => pageSlice.map((r) => r.key), [visibleRowIdsKey]);

  const goToNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, totalPages));
  }, [totalPages]);

  const goToPrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(p - 1, 1));
  }, []);

  useEffect(() => {
    if (!onPageInfoChange) return;
    onPageInfoChange({
      visibleRowCount,
      visibleRowIds,
      hasNextPage: effectivePage < totalPages,
      hasPrevPage: effectivePage > 1,
      onNextPage: goToNextPage,
      onPrevPage: goToPrevPage,
    });
  }, [onPageInfoChange, visibleRowCount, visibleRowIds, effectivePage, totalPages, goToNextPage, goToPrevPage]);

  const paginationConfig = useMemo(
    () => ({
      current: effectivePage,
      pageSize: PAGE_SIZE,
      size: 'small' as const,
      showSizeChanger: false as const,
      showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} of ${total}`,
      style: { marginBottom: 0, marginTop: 4 },
      onChange: (page: number) => setCurrentPage(page),
    }),
    [effectivePage],
  );

  return {
    currentPage: effectivePage,
    setCurrentPage,
    visibleRowCount,
    visibleRowIds,
    paginationConfig,
  };
}
