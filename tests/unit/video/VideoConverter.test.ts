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
            // 20MB should be ~2x the bitrate of 10MB
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

        it('is also accessible as a static method on the class', () => {
            expect(VideoConverter.calculateBitrate(10, 60)).toBe(calculateBitrate(10, 60));
        });
    });

    describe('constructor', () => {
        it('stores the ffmpeg path', () => {
            const converter = new VideoConverter('/usr/bin/ffmpeg');
            expect(converter.ffmpegPath).toBe('/usr/bin/ffmpeg');
        });
    });
});
