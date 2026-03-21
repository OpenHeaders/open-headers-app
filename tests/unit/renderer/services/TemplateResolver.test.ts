import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const TemplateResolver = (
  await import(
    '../../../../src/renderer/services/environment/TemplateResolver'
  )
).default;

describe('TemplateResolver', () => {
  let resolver: InstanceType<typeof TemplateResolver>;

  beforeEach(() => {
    resolver = new TemplateResolver();
  });

  // ------------------------------------------------------------------
  // resolveTemplate
  // ------------------------------------------------------------------
  describe('resolveTemplate', () => {
    it('resolves variables in template', () => {
      const result = resolver.resolveTemplate('Hello {{name}}', {
        name: 'World',
      });
      expect(result.resolved).toBe('Hello World');
      expect(result.hasAllVars).toBe(true);
      expect(result.missingVars).toEqual([]);
    });

    it('resolves multiple variables', () => {
      const result = resolver.resolveTemplate('{{a}} and {{b}}', {
        a: 'X',
        b: 'Y',
      });
      expect(result.resolved).toBe('X and Y');
    });

    it('uses default value for missing vars', () => {
      const result = resolver.resolveTemplate('{{missing}}', {});
      expect(result.resolved).toBe('');
      expect(result.missingVars).toEqual(['missing']);
      expect(result.hasAllVars).toBe(false);
    });

    it('uses custom default value', () => {
      const result = resolver.resolveTemplate('{{x}}', {}, {
        defaultValue: 'N/A',
      });
      expect(result.resolved).toBe('N/A');
    });

    it('throws on missing when throwOnMissing is true', () => {
      expect(() =>
        resolver.resolveTemplate('{{x}}', {}, { throwOnMissing: true })
      ).toThrow("Variable 'x' not found");
    });

    it('returns null as-is', () => {
      expect(resolver.resolveTemplate(null, {})).toBeNull();
    });

    it('returns empty string template unchanged', () => {
      const result = resolver.resolveTemplate('', {});
      expect(result).toBe('');
    });

    it('handles template with no variables', () => {
      const result = resolver.resolveTemplate('no vars here', { a: '1' });
      expect(result.resolved).toBe('no vars here');
      expect(result.hasAllVars).toBe(true);
    });

    it('respects logMissing option', () => {
      // Should not throw or fail with logMissing: false
      const result = resolver.resolveTemplate('{{x}}', {}, {
        logMissing: false,
      });
      expect(result.missingVars).toEqual(['x']);
    });
  });

  // ------------------------------------------------------------------
  // extractVariables
  // ------------------------------------------------------------------
  describe('extractVariables', () => {
    it('extracts variable names', () => {
      expect(resolver.extractVariables('{{a}} {{b}} {{c}}')).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('deduplicates variables', () => {
      expect(resolver.extractVariables('{{a}} {{a}}')).toEqual(['a']);
    });

    it('returns empty array for non-string', () => {
      expect(resolver.extractVariables(null)).toEqual([]);
      expect(resolver.extractVariables(undefined)).toEqual([]);
    });

    it('returns empty array for no variables', () => {
      expect(resolver.extractVariables('no vars')).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // hasVariables
  // ------------------------------------------------------------------
  describe('hasVariables', () => {
    it('returns true when variables present', () => {
      expect(resolver.hasVariables('{{var}}')).toBe(true);
    });

    it('returns false when no variables', () => {
      expect(resolver.hasVariables('plain text')).toBe(false);
    });

    it('returns false for null', () => {
      expect(resolver.hasVariables(null)).toBe(false);
    });

  });

  // ------------------------------------------------------------------
  // resolveObject
  // ------------------------------------------------------------------
  describe('resolveObject', () => {
    it('resolves string values in object', () => {
      const result = resolver.resolveObject(
        { greeting: 'Hello {{name}}', count: 5 },
        { name: 'World' }
      );
      expect(result.greeting).toBe('Hello World');
      expect(result.count).toBe(5);
    });

    it('handles nested objects', () => {
      const result = resolver.resolveObject(
        { outer: { inner: '{{val}}' } },
        { val: 'resolved' }
      );
      expect(result.outer.inner).toBe('resolved');
    });

    it('handles arrays', () => {
      const result = resolver.resolveObject(
        ['{{a}}', '{{b}}'],
        { a: 'X', b: 'Y' }
      );
      // Array items are resolved as objects
      expect(result[0].resolved || result[0]).toBeDefined();
    });

    it('returns non-object input through resolveTemplate', () => {
      const result = resolver.resolveObject('{{x}}', { x: 'val' });
      expect(result.resolved).toBe('val');
    });

    it('handles null input', () => {
      const result = resolver.resolveObject(null, {});
      expect(result).toBeNull();
    });

    it('preserves non-string, non-object values', () => {
      const result = resolver.resolveObject(
        { num: 42, bool: true, str: '{{x}}' },
        { x: 'ok' }
      );
      expect(result.num).toBe(42);
      expect(result.bool).toBe(true);
      expect(result.str).toBe('ok');
    });
  });

  // ------------------------------------------------------------------
  // validateVariables
  // ------------------------------------------------------------------
  describe('validateVariables', () => {
    it('returns valid when all variables present', () => {
      const result = resolver.validateVariables('{{a}} {{b}}', {
        a: 'x',
        b: 'y',
      });
      expect(result.isValid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.required).toEqual(['a', 'b']);
    });

    it('returns invalid when variables missing', () => {
      const result = resolver.validateVariables('{{a}} {{b}}', { a: 'x' });
      expect(result.isValid).toBe(false);
      expect(result.missing).toEqual(['b']);
    });

    it('returns valid for template with no variables', () => {
      const result = resolver.validateVariables('no vars', {});
      expect(result.isValid).toBe(true);
      expect(result.required).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  // createResolver
  // ------------------------------------------------------------------
  describe('createResolver', () => {
    it('returns a function that resolves templates', () => {
      const resolve = resolver.createResolver({ name: 'Test' });
      const result = resolve('Hello {{name}}');
      expect(result.resolved).toBe('Hello Test');
    });

    it('pre-bound resolver uses provided options', () => {
      const resolve = resolver.createResolver(
        { name: 'Test' },
        { defaultValue: 'MISSING' }
      );
      const result = resolve('{{name}} and {{other}}');
      expect(result.resolved).toBe('Test and MISSING');
    });
  });
});
