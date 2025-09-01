const timeUtils = require('./timeUtils');
const log = require('./logger');

class TOTPGenerator {
    async generate(secret, period = 30, digits = 6, timeOffset = 0) {
        try {
            const totpId = timeUtils.now().toString(36) + Math.random().toString(36).substring(2, 5);

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

            const bitGroups = [];
            for (let i = 0; i < Math.floor(bits.length / 8); i++) {
                bitGroups.push(bits.substring(i * 8, i * 8 + 8));
            }

            const keyBytes = new Uint8Array(bitGroups.length);
            for (let i = 0; i < bitGroups.length; i++) {
                keyBytes[i] = parseInt(bitGroups[i], 2);
            }

            const currentTimeSeconds = Math.floor(timeUtils.now() / 1000) + timeOffset;
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
                const result = code.toString().padStart(digits, '0');

                return result;
            } catch (cryptoError) {
                log.error(`[${totpId}] Crypto operation failed:`, cryptoError);

                // Fallback for environments without crypto.subtle support
                try {

                    let fallbackHash = 0;
                    for (let i = 0; i < counterBytes.length; i++) {
                        for (let j = 0; j < keyBytes.length; j++) {
                            fallbackHash = ((fallbackHash << 5) - fallbackHash) + (counterBytes[i] ^ keyBytes[j % keyBytes.length]);
                        }
                    }

                    fallbackHash = Math.abs(fallbackHash);
                    let fallbackCode = fallbackHash % Math.pow(10, digits);
                    const result = fallbackCode.toString().padStart(digits, '0');

                    return result;
                } catch (fallbackError) {
                    log.error(`[${totpId}] Fallback TOTP generation failed:`, fallbackError);
                    return 'ERROR';
                }
            }
        } catch (error) {
            log.error('Error generating TOTP:', error);
            return 'ERROR';
        }
    }
}

module.exports = new TOTPGenerator();