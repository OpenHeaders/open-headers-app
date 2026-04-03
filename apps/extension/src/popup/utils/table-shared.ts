/**
 * Shared types, constants, and utilities used by table components
 * (ThisPageRules, HeaderTable, RulesList).
 */

export interface PageInfo {
  visibleRowCount: number;
  visibleRowIds: readonly (string | number)[];
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
}

export interface RowActions {
  onToggleRow?: (index: number) => void;
  onEditRow?: (index: number) => void;
  onCopyRow?: (index: number) => void;
  onDeleteRow?: (index: number) => void;
  onAddRule?: () => void;
}

export const PAGE_SIZE = 10;

export const TAG_COLORS = [
  'blue',
  'volcano',
  'green',
  'purple',
  'orange',
  'cyan',
  'magenta',
  'gold',
  'geekblue',
  'red',
] as const;

export function getTagColor(tag: string): string {
  let hash = 5381;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash * 33) ^ tag.charCodeAt(i)) >>> 0;
  }
  return TAG_COLORS[hash % TAG_COLORS.length];
}
