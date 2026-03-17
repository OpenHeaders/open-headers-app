import { describe, it, expect, beforeEach } from 'vitest';
import { SystemHandlers } from '../../src/main/modules/ipc/handlers/systemHandlers';

describe('SystemHandlers', () => {
    let handlers: SystemHandlers;

    beforeEach(() => {
        handlers = new SystemHandlers();
    });

    describe('mapWindowsToIANA', () => {
        it('maps Pacific Standard Time correctly', () => {
            expect(handlers.mapWindowsToIANA('Pacific Standard Time')).toBe('America/Los_Angeles');
        });

        it('maps Eastern Standard Time correctly', () => {
            expect(handlers.mapWindowsToIANA('Eastern Standard Time')).toBe('America/New_York');
        });

        it('maps Central Standard Time correctly', () => {
            expect(handlers.mapWindowsToIANA('Central Standard Time')).toBe('America/Chicago');
        });

        it('maps Mountain Standard Time correctly', () => {
            expect(handlers.mapWindowsToIANA('Mountain Standard Time')).toBe('America/Denver');
        });

        it('maps GMT Standard Time to Europe/London', () => {
            expect(handlers.mapWindowsToIANA('GMT Standard Time')).toBe('Europe/London');
        });

        it('maps Central European Standard Time to Europe/Berlin', () => {
            expect(handlers.mapWindowsToIANA('Central European Standard Time')).toBe('Europe/Berlin');
        });

        it('maps Tokyo Standard Time to Asia/Tokyo', () => {
            expect(handlers.mapWindowsToIANA('Tokyo Standard Time')).toBe('Asia/Tokyo');
        });

        it('maps India Standard Time to Asia/Kolkata', () => {
            expect(handlers.mapWindowsToIANA('India Standard Time')).toBe('Asia/Kolkata');
        });

        it('maps UTC correctly', () => {
            expect(handlers.mapWindowsToIANA('UTC')).toBe('UTC');
        });

        it('maps AUS Eastern Standard Time to Australia/Sydney', () => {
            expect(handlers.mapWindowsToIANA('AUS Eastern Standard Time')).toBe('Australia/Sydney');
        });

        it('maps New Zealand Standard Time to Pacific/Auckland', () => {
            expect(handlers.mapWindowsToIANA('New Zealand Standard Time')).toBe('Pacific/Auckland');
        });

        it('maps Hawaiian Standard Time to Pacific/Honolulu', () => {
            expect(handlers.mapWindowsToIANA('Hawaiian Standard Time')).toBe('Pacific/Honolulu');
        });

        it('maps US Mountain Standard Time to America/Phoenix', () => {
            expect(handlers.mapWindowsToIANA('US Mountain Standard Time')).toBe('America/Phoenix');
        });

        it('maps Mexico timezone variants correctly', () => {
            expect(handlers.mapWindowsToIANA('Pacific Standard Time (Mexico)')).toBe('America/Tijuana');
            expect(handlers.mapWindowsToIANA('Central Standard Time (Mexico)')).toBe('America/Mexico_City');
        });

        it('returns the input unchanged for unknown timezone IDs', () => {
            expect(handlers.mapWindowsToIANA('Some Unknown Timezone')).toBe('Some Unknown Timezone');
        });

        it('handles empty string gracefully', () => {
            expect(handlers.mapWindowsToIANA('')).toBe('');
        });

        it('covers all major world regions', () => {
            // South America
            expect(handlers.mapWindowsToIANA('Argentina Standard Time')).toBe('America/Buenos_Aires');
            expect(handlers.mapWindowsToIANA('Brasilia Standard Time')).toBe('America/Sao_Paulo');

            // Asia
            expect(handlers.mapWindowsToIANA('China Standard Time')).toBe('Asia/Shanghai');
            expect(handlers.mapWindowsToIANA('Korea Standard Time')).toBe('Asia/Seoul');
            expect(handlers.mapWindowsToIANA('Singapore Standard Time')).toBe('Asia/Singapore');

            // Africa
            expect(handlers.mapWindowsToIANA('South Africa Standard Time')).toBe('Africa/Johannesburg');
            expect(handlers.mapWindowsToIANA('Egypt Standard Time')).toBe('Africa/Cairo');

            // Middle East
            expect(handlers.mapWindowsToIANA('Israel Standard Time')).toBe('Asia/Jerusalem');
            expect(handlers.mapWindowsToIANA('Arabian Standard Time')).toBe('Asia/Dubai');
            expect(handlers.mapWindowsToIANA('Iran Standard Time')).toBe('Asia/Tehran');

            // Russia
            expect(handlers.mapWindowsToIANA('Russian Standard Time')).toBe('Europe/Moscow');
            expect(handlers.mapWindowsToIANA('Ekaterinburg Standard Time')).toBe('Asia/Yekaterinburg');
        });
    });
});
