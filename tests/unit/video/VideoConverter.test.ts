import { describe, it, expect } from 'vitest';
import { VideoConverter, parseDuration, calculateBitrate } from '../../../src/services/video/video-converter';

describe('VideoConverter', () => {
    describe('parseDuration()', () => {
        it('converts 00:00:00 to 0 seconds', () => {
            expect(parseDuration('00', '00', '00')).toBe(0);
        });

        it('converts 00:00:30 to 30 seconds', () => {
            expect(parseDuration('00', '00', '30')).toBe(30);
        });

        it('converts 00:01:00 to 60 seconds', () => {
            expect(parseDuration('00', '01', '00')).toBe(60);
        });

        it('converts 01:00:00 to 3600 seconds', () => {
            expect(parseDuration('01', '00', '00')).toBe(3600);
        });

        it('converts 01:30:45 to 5445 seconds', () => {
            expect(parseDuration('01', '30', '45')).toBe(3600 + 1800 + 45);
        });

        it('converts 00:02:15 to 135 seconds', () => {
            expect(parseDuration('00', '02', '15')).toBe(135);
        });

        it('handles leading zeros correctly', () => {
            expect(parseDuration('02', '05', '09')).toBe(2 * 3600 + 5 * 60 + 9);
        });

        it('converts enterprise-length recording 03:45:12', () => {
            expect(parseDuration('03', '45', '12')).toBe(3 * 3600 + 45 * 60 + 12);
        });

        it('converts max typical recording 23:59:59', () => {
            expect(parseDuration('23', '59', '59')).toBe(23 * 3600 + 59 * 60 + 59);
        });

        it('is also accessible as a static method on the class', () => {
            expect(VideoConverter.parseDuration('00', '10', '00')).toBe(600);
        });
    });

    describe('calculateBitrate()', () => {
        it('returns a positive number for valid inputs', () => {
            const bitrate = calculateBitrate(10, 60);
            expect(bitrate).toBeGreaterThan(0);
        });

        it('applies 95% safety margin', () => {
            const targetSizeMB = 10;
            const durationSeconds = 60;
            const targetBits = targetSizeMB * 1024 * 1024 * 8;
            const expectedBitrate = Math.floor(targetBits / durationSeconds * 0.95);
            expect(calculateBitrate(targetSizeMB, durationSeconds)).toBe(expectedBitrate);
        });

        it('scales linearly with file size', () => {
            const bitrate10 = calculateBitrate(10, 60);
            const bitrate20 = calculateBitrate(20, 60);
            expect(bitrate20).toBe(bitrate10 * 2);
        });

        it('halves when duration doubles', () => {
            const bitrate60 = calculateBitrate(10, 60);
            const bitrate120 = calculateBitrate(10, 120);
            expect(bitrate120).toBe(Math.floor(bitrate60 / 2));
        });

        it('returns floor of calculated value', () => {
            const bitrate = calculateBitrate(1, 7);
            expect(Number.isInteger(bitrate)).toBe(true);
        });

        it('calculates bitrate for enterprise 25MB Slack limit, 5min recording', () => {
            const bitrate = calculateBitrate(25, 300);
            // 25 * 1024 * 1024 * 8 / 300 * 0.95 ≈ 665,272 bps
            expect(bitrate).toBeGreaterThan(600000);
            expect(bitrate).toBeLessThan(700000);
        });

        it('calculates bitrate for large 100MB recording, 1hr duration', () => {
            const bitrate = calculateBitrate(100, 3600);
            expect(bitrate).toBeGreaterThan(200000);
            expect(bitrate).toBeLessThan(250000);
        });

        it('is also accessible as a static method on the class', () => {
            expect(VideoConverter.calculateBitrate(10, 60)).toBe(calculateBitrate(10, 60));
        });
    });

    describe('constructor', () => {
        it('stores the ffmpeg path', () => {
            const converter = new VideoConverter('/usr/local/bin/ffmpeg');
            expect(converter.ffmpegPath).toBe('/usr/local/bin/ffmpeg');
        });

        it('stores homebrew ffmpeg path', () => {
            const converter = new VideoConverter('/opt/homebrew/bin/ffmpeg');
            expect(converter.ffmpegPath).toBe('/opt/homebrew/bin/ffmpeg');
        });

        it('stores path with spaces', () => {
            const converter = new VideoConverter('/Users/Jane Doe/Applications/ffmpeg');
            expect(converter.ffmpegPath).toBe('/Users/Jane Doe/Applications/ffmpeg');
        });
    });
});
