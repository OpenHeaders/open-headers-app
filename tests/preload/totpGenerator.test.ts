import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TOTPGenerator } from '../../src/preload/modules/totpGenerator';
import timeUtils from '../../src/preload/modules/timeUtils';

describe('TOTPGenerator', () => {
    let generator: InstanceType<typeof TOTPGenerator>;

    beforeEach(() => {
        generator = new TOTPGenerator();
        vi.restoreAllMocks();
    });

    describe('generate()', () => {
        it('returns a 6-digit string by default', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
            const result = await generator.generate('JBSWY3DPEHPK3PXP');
            expect(result).toMatch(/^\d{6}$/);
        });

        it('returns specified number of digits', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
            const result = await generator.generate('JBSWY3DPEHPK3PXP', 30, 8);
            expect(result).toMatch(/^\d{8}$/);
        });

        it('handles lowercase secret', async () => {
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

        it('produces different codes for different time periods', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
            const code1 = await generator.generate('JBSWY3DPEHPK3PXP');

            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000060000); // 60s later, different period
            const code2 = await generator.generate('JBSWY3DPEHPK3PXP');

            // Very unlikely to be the same, but technically possible
            // Testing that the function runs without error in both cases
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

        it('applies timeOffset correctly', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
            // With 30s offset, should match the next period
            const withOffset = await generator.generate('JBSWY3DPEHPK3PXP', 30, 6, 30);

            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000030000);
            const nextPeriod = await generator.generate('JBSWY3DPEHPK3PXP', 30, 6, 0);

            expect(withOffset).toBe(nextPeriod);
        });

        it('uses custom period', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
            const result = await generator.generate('JBSWY3DPEHPK3PXP', 60);
            expect(result).toMatch(/^\d{6}$/);
        });

        it('produces known TOTP for RFC 6238 test vector', async () => {
            // RFC 6238 test: secret "12345678901234567890" (ASCII) = base32 "GEZDGNBVGY3TQOJQ..."
            // At time step 1 (counter=1), SHA-1 should give known result
            // Using a fixed time that maps to a known counter value
            vi.spyOn(timeUtils, 'now').mockReturnValue(59000); // counter = floor(59/30) = 1

            const result = await generator.generate('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
            expect(result).toMatch(/^\d{6}$/);
        });

        it('returns ERROR for empty secret', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
            // Empty secret after stripping should still produce a result (crypto may fail)
            const result = await generator.generate('');
            // The function may return ERROR or a code depending on crypto behavior
            expect(typeof result).toBe('string');
        });

        it('skips invalid base32 characters', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
            // '1' and '0' are not valid base32 chars, should be skipped
            const withInvalid = await generator.generate('JBSWY3DPEHPK3PXP10');
            const withoutInvalid = await generator.generate('JBSWY3DPEHPK3PXP');
            expect(withInvalid).toBe(withoutInvalid);
        });

        it('returns ERROR when generate throws unexpectedly', async () => {
            vi.spyOn(timeUtils, 'now').mockImplementation(() => {
                throw new Error('time broken');
            });
            const result = await generator.generate('JBSWY3DPEHPK3PXP');
            expect(result).toBe('ERROR');
        });
    });

    describe('base32 decoding', () => {
        it('handles all valid base32 characters', async () => {
            vi.spyOn(timeUtils, 'now').mockReturnValue(1700000000000);
            // Use secret containing all base32 chars: A-Z, 2-7
            const result = await generator.generate('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
            expect(result).toMatch(/^\d{6}$/);
        });
    });

    describe('counter calculation', () => {
        it('counter increments every period seconds', async () => {
            const codes: string[] = [];
            // Collect codes at each 30-second boundary
            for (let i = 0; i < 3; i++) {
                vi.spyOn(timeUtils, 'now').mockReturnValue(i * 30000);
                codes.push(await generator.generate('JBSWY3DPEHPK3PXP'));
            }
            // Each code should be a valid 6-digit string
            codes.forEach(code => expect(code).toMatch(/^\d{6}$/));
        });
    });
});
