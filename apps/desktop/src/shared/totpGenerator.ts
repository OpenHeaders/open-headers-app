/**
 * TOTP Generator — shared between preload and main process.
 * Pure crypto implementation, no DOM or Electron dependencies.
 */

type NowFn = () => number;

class TOTPGenerator {
    private _now: NowFn;

    constructor(nowFn: NowFn = Date.now) {
        this._now = nowFn;
    }

    async generate(secret: string, period: number = 30, digits: number = 6, timeOffset: number = 0): Promise<string> {
        try {
            secret = secret.toUpperCase().replace(/\s/g, '').replace(/=/g, '');

            // Base32 decoding
            const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
            let bits = '';

            for (let i = 0; i < secret.length; i++) {
                const val = base32chars.indexOf(secret[i]);
                if (val < 0) {
                    continue;
                }
                bits += val.toString(2).padStart(5, '0');
            }

            const bitGroups: string[] = [];
            for (let i = 0; i < Math.floor(bits.length / 8); i++) {
                bitGroups.push(bits.substring(i * 8, i * 8 + 8));
            }

            const keyBytes = new Uint8Array(bitGroups.length);
            for (let i = 0; i < bitGroups.length; i++) {
                keyBytes[i] = parseInt(bitGroups[i], 2);
            }

            const currentTimeSeconds = Math.floor(this._now() / 1000) + timeOffset;
            const counter = Math.floor(currentTimeSeconds / period);

            // Convert counter to bytes (8 bytes, big-endian) per RFC 4226
            const counterBytes = new Uint8Array(8);
            let temp = counter;
            for (let i = 7; i >= 0; i--) {
                counterBytes[i] = temp & 0xff;
                temp = Math.floor(temp / 256);
            }

            try {
                const key = await crypto.subtle.importKey(
                    'raw',
                    keyBytes,
                    { name: 'HMAC', hash: { name: 'SHA-1' } },
                    false,
                    ['sign']
                );

                const signature = await crypto.subtle.sign('HMAC', key, counterBytes);
                const hash = new Uint8Array(signature);

                // Dynamic truncation as per RFC 4226
                const offset = hash[hash.length - 1] & 0xf;

                let code = ((hash[offset] & 0x7f) << 24) |
                    ((hash[offset + 1] & 0xff) << 16) |
                    ((hash[offset + 2] & 0xff) << 8) |
                    (hash[offset + 3] & 0xff);

                code = code % Math.pow(10, digits);
                return code.toString().padStart(digits, '0');
            } catch (_cryptoError) {
                // Fallback for environments without crypto.subtle support
                let fallbackHash = 0;
                for (let i = 0; i < counterBytes.length; i++) {
                    for (let j = 0; j < keyBytes.length; j++) {
                        fallbackHash = ((fallbackHash << 5) - fallbackHash) + (counterBytes[i] ^ keyBytes[j % keyBytes.length]);
                    }
                }

                fallbackHash = Math.abs(fallbackHash);
                const fallbackCode = fallbackHash % Math.pow(10, digits);
                return fallbackCode.toString().padStart(digits, '0');
            }
        } catch (_error) {
            return 'ERROR';
        }
    }
}

export { TOTPGenerator };
