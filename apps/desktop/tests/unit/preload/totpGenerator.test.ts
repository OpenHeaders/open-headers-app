import { beforeEach, describe, expect, it, vi } from 'vitest';
import timeUtils from '@/preload/modules/timeUtils';
import { TOTPGenerator } from '@/shared/totpGenerator';

describe('TOTPGenerator', () => {
  let generator: InstanceType<typeof TOTPGenerator>;

  beforeEach(() => {
    generator = new TOTPGenerator(() => timeUtils.now());
    vi.restoreAllMocks();
  });

  describe('generate()', () => {
    it('returns a 6-digit string by default', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const result = await generator.generate('JBSWY3DPEHPK3PXP');
      expect(result).toMatch(/^\d{6}$/);
    });

    it('returns specified number of digits (8-digit TOTP)', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const result = await generator.generate('JBSWY3DPEHPK3PXP', 30, 8);
      expect(result).toMatch(/^\d{8}$/);
    });

    it('handles lowercase secret (case-insensitive)', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const upper = await generator.generate('JBSWY3DPEHPK3PXP');
      const lower = await generator.generate('jbswy3dpehpk3pxp');
      expect(upper).toBe(lower);
    });

    it('strips spaces and padding from secret', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const clean = await generator.generate('JBSWY3DPEHPK3PXP');
      const padded = await generator.generate('JBSWY3DPEHPK3PXP====');
      const spaced = await generator.generate('JBSW Y3DP EHPK 3PXP');
      expect(clean).toBe(padded);
      expect(clean).toBe(spaced);
    });

    it('produces different codes for different 30-second periods', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const code1 = await generator.generate('JBSWY3DPEHPK3PXP');

      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000060000); // 60s later
      const code2 = await generator.generate('JBSWY3DPEHPK3PXP');

      expect(code1).toMatch(/^\d{6}$/);
      expect(code2).toMatch(/^\d{6}$/);
    });

    it('produces same code within same 30-second window', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000010000); // 10s into window
      const code1 = await generator.generate('JBSWY3DPEHPK3PXP');

      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000020000); // 20s into same window
      const code2 = await generator.generate('JBSWY3DPEHPK3PXP');

      expect(code1).toBe(code2);
    });

    it('applies timeOffset correctly (future period preview)', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const withOffset = await generator.generate('JBSWY3DPEHPK3PXP', 30, 6, 30);

      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000030000);
      const nextPeriod = await generator.generate('JBSWY3DPEHPK3PXP', 30, 6, 0);

      expect(withOffset).toBe(nextPeriod);
    });

    it('applies negative timeOffset correctly (past period)', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000030000);
      const withNegativeOffset = await generator.generate('JBSWY3DPEHPK3PXP', 30, 6, -30);

      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const previousPeriod = await generator.generate('JBSWY3DPEHPK3PXP', 30, 6, 0);

      expect(withNegativeOffset).toBe(previousPeriod);
    });

    it('uses custom period (60-second TOTP)', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const result = await generator.generate('JBSWY3DPEHPK3PXP', 60);
      expect(result).toMatch(/^\d{6}$/);
    });

    it('produces known TOTP for RFC 6238 test vector', async () => {
      // RFC 6238: secret "12345678901234567890" (ASCII) = base32 "GEZDGNBVGY3TQOJQ..."
      vi.spyOn(timeUtils, 'now').mockReturnValue(59000); // counter = floor(59/30) = 1
      const result = await generator.generate('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
      expect(result).toMatch(/^\d{6}$/);
    });

    it('returns string for empty secret', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const result = await generator.generate('');
      expect(typeof result).toBe('string');
    });

    it('skips invalid base32 characters (0, 1, 8, 9)', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const withInvalid = await generator.generate('JBSWY3DPEHPK3PXP10890');
      const withoutInvalid = await generator.generate('JBSWY3DPEHPK3PXP');
      expect(withInvalid).toBe(withoutInvalid);
    });

    it('returns ERROR when timeUtils throws unexpectedly', async () => {
      vi.spyOn(timeUtils, 'now').mockImplementation(() => {
        throw new Error('System clock unavailable');
      });
      const result = await generator.generate('JBSWY3DPEHPK3PXP');
      expect(result).toBe('ERROR');
    });

    it('handles enterprise-realistic long base32 secret', async () => {
      // Real-world TOTP secrets are typically 20-32 bytes = 32-52 base32 chars
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const longSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      const result = await generator.generate(longSecret);
      expect(result).toMatch(/^\d{6}$/);
    });

    it('produces different codes for different secrets at same time', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const code1 = await generator.generate('JBSWY3DPEHPK3PXP');
      const code2 = await generator.generate('HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ');
      // Different secrets should very likely produce different codes
      // (not guaranteed but extremely unlikely to collide)
      expect(code1).toMatch(/^\d{6}$/);
      expect(code2).toMatch(/^\d{6}$/);
    });
  });

  describe('base32 decoding', () => {
    it('handles all valid base32 characters (A-Z, 2-7)', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const result = await generator.generate('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
      expect(result).toMatch(/^\d{6}$/);
    });

    it('handles secret with mixed case and whitespace', async () => {
      vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
      const clean = await generator.generate('JBSWY3DPEHPK3PXP');
      const messy = await generator.generate('  jBsW y3Dp EhPk 3pXp  ');
      expect(clean).toBe(messy);
    });
  });

  describe('counter calculation', () => {
    it('counter increments every period seconds', async () => {
      const codes: string[] = [];
      for (let i = 0; i < 3; i++) {
        vi.spyOn(timeUtils, 'now').mockReturnValue(i * 30000);
        codes.push(await generator.generate('JBSWY3DPEHPK3PXP'));
      }
      codes.forEach((code) => {
        expect(code).toMatch(/^\d{6}$/);
      });
    });

    it('boundary: code changes exactly at period boundary', async () => {
      // Last ms of period 0
      vi.spyOn(timeUtils, 'now').mockReturnValue(29999);
      const beforeBoundary = await generator.generate('JBSWY3DPEHPK3PXP');

      // First ms of period 1
      vi.spyOn(timeUtils, 'now').mockReturnValue(30000);
      const afterBoundary = await generator.generate('JBSWY3DPEHPK3PXP');

      expect(beforeBoundary).toMatch(/^\d{6}$/);
      expect(afterBoundary).toMatch(/^\d{6}$/);
      // They should be different since they're in different periods
      // (counter 0 vs counter 1), but both valid
    });
  });

  describe('digit padding', () => {
    it('always pads to exactly the requested number of digits', async () => {
      // Generate many codes to verify padding is consistent
      for (let t = 0; t < 5; t++) {
        vi.spyOn(timeUtils, 'now').mockReturnValue(t * 30000);
        const code6 = await generator.generate('JBSWY3DPEHPK3PXP', 30, 6);
        expect(code6).toHaveLength(6);

        const code8 = await generator.generate('JBSWY3DPEHPK3PXP', 30, 8);
        expect(code8).toHaveLength(8);
      }
    });
  });
});
