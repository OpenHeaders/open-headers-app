import { describe, expect, it, vi } from 'vitest';
import {
  addDomains,
  calculateInputWidth,
  createTagCloseHandler,
  createTagEditHandlers,
  formatDomainCount,
  removeDomain,
  validateDomainArray,
} from '../../../../src/renderer/components/features/domain-tags/DomainUtils';

// ======================================================================
// removeDomain
// ======================================================================
describe('removeDomain', () => {
  it('removes specified enterprise domain', () => {
    expect(
      removeDomain(
        ['*.openheaders.io', 'api.partner-service.io:8443', 'localhost:3000'],
        'api.partner-service.io:8443',
      ),
    ).toEqual(['*.openheaders.io', 'localhost:3000']);
  });

  it('returns same array when domain not found', () => {
    expect(removeDomain(['openheaders.io', 'staging.openheaders.io'], 'unknown.io')).toEqual([
      'openheaders.io',
      'staging.openheaders.io',
    ]);
  });

  it('returns empty array when removing last item', () => {
    expect(removeDomain(['openheaders.io'], 'openheaders.io')).toEqual([]);
  });

  it('removes all occurrences of duplicate domain', () => {
    expect(removeDomain(['openheaders.io', 'openheaders.io', 'staging.openheaders.io'], 'openheaders.io')).toEqual([
      'staging.openheaders.io',
    ]);
  });

  it('handles empty source array', () => {
    expect(removeDomain([], 'openheaders.io')).toEqual([]);
  });

  it('handles wildcard domains', () => {
    expect(removeDomain(['*.openheaders.io', '*.partner.io'], '*.openheaders.io')).toEqual(['*.partner.io']);
  });
});

// ======================================================================
// addDomains
// ======================================================================
describe('addDomains', () => {
  it('adds new enterprise domains', () => {
    expect(addDomains(['openheaders.io'], ['api.partner-service.io:8443'])).toEqual([
      'openheaders.io',
      'api.partner-service.io:8443',
    ]);
  });

  it('removes duplicates when adding', () => {
    expect(addDomains(['openheaders.io'], ['openheaders.io', 'staging.openheaders.io'])).toEqual([
      'openheaders.io',
      'staging.openheaders.io',
    ]);
  });

  it('handles single string domain', () => {
    expect(addDomains(['openheaders.io'], '*.openheaders.io')).toEqual(['openheaders.io', '*.openheaders.io']);
  });

  it('handles empty current array', () => {
    expect(addDomains([], ['openheaders.io', 'staging.openheaders.io'])).toEqual([
      'openheaders.io',
      'staging.openheaders.io',
    ]);
  });

  it('handles adding empty array', () => {
    expect(addDomains(['openheaders.io'], [])).toEqual(['openheaders.io']);
  });

  it('deduplicates within the new domains array', () => {
    expect(addDomains([], ['openheaders.io', 'openheaders.io', 'openheaders.io'])).toEqual(['openheaders.io']);
  });
});

// ======================================================================
// createTagCloseHandler
// ======================================================================
describe('createTagCloseHandler', () => {
  it('creates handler that removes domain and calls onChange', () => {
    const onChange = vi.fn();
    const handler = createTagCloseHandler(
      ['*.openheaders.io', 'api.partner-service.io:8443', 'localhost:3000'],
      onChange,
    );
    handler('api.partner-service.io:8443');
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(['*.openheaders.io', 'localhost:3000']);
  });

  it('does not throw if onChange is undefined', () => {
    const handler = createTagCloseHandler(['openheaders.io'], undefined);
    expect(() => handler('openheaders.io')).not.toThrow();
  });

  it('passes full remaining array when removing last item', () => {
    const onChange = vi.fn();
    const handler = createTagCloseHandler(['openheaders.io'], onChange);
    handler('openheaders.io');
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

// ======================================================================
// createTagEditHandlers
// ======================================================================
describe('createTagEditHandlers', () => {
  it('returns all four handler functions', () => {
    const setEditIndex = vi.fn();
    const setEditValue = vi.fn();
    const handlers = createTagEditHandlers({ setEditIndex, setEditValue });
    expect(handlers).toEqual({
      handleEdit: expect.any(Function),
      handleEditChange: expect.any(Function),
      handleEditConfirm: expect.any(Function),
      handleEditKeyDown: expect.any(Function),
    });
  });

  it('handleEdit sets index and value', () => {
    const setEditIndex = vi.fn();
    const setEditValue = vi.fn();
    const { handleEdit } = createTagEditHandlers({ setEditIndex, setEditValue });
    handleEdit(2, '*.openheaders.io');
    expect(setEditIndex).toHaveBeenCalledWith(2);
    expect(setEditValue).toHaveBeenCalledWith('*.openheaders.io');
  });

  it('handleEditChange sets value from event target', () => {
    const setEditIndex = vi.fn();
    const setEditValue = vi.fn();
    const { handleEditChange } = createTagEditHandlers({ setEditIndex, setEditValue });
    const event = { target: { value: 'api.openheaders.io:8443' } } as React.ChangeEvent<HTMLInputElement>;
    handleEditChange(event);
    expect(setEditValue).toHaveBeenCalledWith('api.openheaders.io:8443');
  });

  it('handleEditConfirm resets edit state', () => {
    const setEditIndex = vi.fn();
    const setEditValue = vi.fn();
    const { handleEditConfirm } = createTagEditHandlers({ setEditIndex, setEditValue });
    handleEditConfirm();
    expect(setEditIndex).toHaveBeenCalledWith(-1);
    expect(setEditValue).toHaveBeenCalledWith('');
  });

  it('handleEditKeyDown confirms on Enter', () => {
    const setEditIndex = vi.fn();
    const setEditValue = vi.fn();
    const { handleEditKeyDown } = createTagEditHandlers({ setEditIndex, setEditValue });
    handleEditKeyDown({ key: 'Enter' } as React.KeyboardEvent<HTMLInputElement>);
    expect(setEditIndex).toHaveBeenCalledWith(-1);
    expect(setEditValue).toHaveBeenCalledWith('');
  });

  it('handleEditKeyDown cancels on Escape', () => {
    const setEditIndex = vi.fn();
    const setEditValue = vi.fn();
    const { handleEditKeyDown } = createTagEditHandlers({ setEditIndex, setEditValue });
    handleEditKeyDown({ key: 'Escape' } as React.KeyboardEvent<HTMLInputElement>);
    expect(setEditIndex).toHaveBeenCalledWith(-1);
    expect(setEditValue).toHaveBeenCalledWith('');
  });

  it('handleEditKeyDown does nothing for other keys', () => {
    const setEditIndex = vi.fn();
    const setEditValue = vi.fn();
    const { handleEditKeyDown } = createTagEditHandlers({ setEditIndex, setEditValue });
    handleEditKeyDown({ key: 'a' } as React.KeyboardEvent<HTMLInputElement>);
    expect(setEditIndex).not.toHaveBeenCalled();
    expect(setEditValue).not.toHaveBeenCalled();
  });
});

// ======================================================================
// formatDomainCount
// ======================================================================
describe('formatDomainCount', () => {
  it('singular for count 1', () => {
    expect(formatDomainCount(1, 'copied')).toBe('1 copied');
  });

  it('plural for count > 1', () => {
    expect(formatDomainCount(5, 'added')).toBe('5 addeds');
  });

  it('plural for count 0', () => {
    expect(formatDomainCount(0, 'domain')).toBe('0 domains');
  });

  it('default action is domain', () => {
    expect(formatDomainCount(1)).toBe('1 domain');
    expect(formatDomainCount(3)).toBe('3 domains');
  });

  it('handles large count', () => {
    expect(formatDomainCount(150, 'domain')).toBe('150 domains');
  });
});

// ======================================================================
// calculateInputWidth
// ======================================================================
describe('calculateInputWidth', () => {
  it('uses minimum width for empty content', () => {
    expect(calculateInputWidth('', 80, 400)).toBe(80);
  });

  it('calculates width based on char count', () => {
    // 10 chars * 8 + 20 = 100
    expect(calculateInputWidth('1234567890', 80, 400, 8)).toBe(100);
  });

  it('caps at max width', () => {
    const longText = 'x'.repeat(100); // 100 * 8 + 20 = 820 > 400
    expect(calculateInputWidth(longText, 80, 400, 8)).toBe(400);
  });

  it('respects minimum width for short content', () => {
    expect(calculateInputWidth('ab', 200, 400, 8)).toBe(200);
  });

  it('handles undefined content', () => {
    expect(calculateInputWidth(undefined, 80, 400)).toBe(80);
  });

  it('uses default parameters', () => {
    // Default: minWidth=80, maxWidth=400, charWidth=8
    const width = calculateInputWidth('openheaders.io');
    // 14 chars * 8 + 20 = 132
    expect(width).toBe(132);
  });

  it('handles enterprise domain-length input', () => {
    const domain = 'auth.internal.staging.openheaders.io:8443';
    // 41 chars * 8 + 20 = 348
    expect(calculateInputWidth(domain, 80, 400, 8)).toBe(348);
  });

  it('returns exact minimum when calculated equals min', () => {
    // 0 chars * 8 + 20 = 20 < 80 → 80
    expect(calculateInputWidth('', 80, 400, 8)).toBe(80);
  });
});

// ======================================================================
// validateDomainArray
// ======================================================================
describe('validateDomainArray', () => {
  it('returns valid with full shape for clean enterprise array', () => {
    const result = validateDomainArray(['*.openheaders.io', 'api.partner-service.io:8443', 'localhost:3000']);
    expect(result).toEqual({
      valid: true,
      issues: [],
      duplicateCount: 0,
      emptyCount: 0,
    });
  });

  it('detects duplicates with correct count', () => {
    const result = validateDomainArray(['openheaders.io', 'openheaders.io', 'staging.openheaders.io']);
    expect(result).toEqual({
      valid: false,
      issues: ['duplicates'],
      duplicateCount: 1,
      emptyCount: 0,
    });
  });

  it('detects empty values with correct count', () => {
    const result = validateDomainArray(['openheaders.io', '', 'staging.openheaders.io', '']);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('empty');
    // Two empty strings are duplicates of each other too
    expect(result.emptyCount).toBe(2);
  });

  it('detects whitespace-only as empty', () => {
    const result = validateDomainArray(['openheaders.io', '   ']);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('empty');
    expect(result.emptyCount).toBe(1);
  });

  it('detects multiple issues simultaneously', () => {
    const result = validateDomainArray(['openheaders.io', 'openheaders.io', '', '  ']);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('duplicates');
    expect(result.issues).toContain('empty');
    expect(result.duplicateCount).toBe(1);
    expect(result.emptyCount).toBe(2);
  });

  it('validates empty array as clean', () => {
    const result = validateDomainArray([]);
    expect(result).toEqual({
      valid: true,
      issues: [],
      duplicateCount: 0,
      emptyCount: 0,
    });
  });

  it('handles large domain array (100+ entries)', () => {
    const domains = Array.from({ length: 100 }, (_, i) => `service-${i}.openheaders.io`);
    const result = validateDomainArray(domains);
    expect(result.valid).toBe(true);
    expect(result.duplicateCount).toBe(0);
  });

  it('detects multiple duplicates', () => {
    const result = validateDomainArray([
      'openheaders.io',
      'openheaders.io',
      'openheaders.io',
      'staging.openheaders.io',
      'staging.openheaders.io',
    ]);
    expect(result.valid).toBe(false);
    expect(result.duplicateCount).toBe(3); // 5 total - 2 unique = 3 duplicates
  });
});
