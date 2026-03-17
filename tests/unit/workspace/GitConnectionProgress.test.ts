import { describe, it, expect, vi } from 'vitest';
import { GitConnectionProgress } from '../../../src/services/workspace/git/utils/GitConnectionProgress';

describe('GitConnectionProgress', () => {
    it('starts with empty steps', () => {
        const progress = new GitConnectionProgress();
        expect(progress.getSteps()).toEqual([]);
    });

    it('records reported steps', () => {
        const progress = new GitConnectionProgress();
        progress.report('connecting', 'running', 'Testing...');

        const steps = progress.getSteps();
        expect(steps).toHaveLength(1);
        expect(steps[0].step).toBe('connecting');
        expect(steps[0].status).toBe('running');
        expect(steps[0].details).toBe('Testing...');
        expect(steps[0].timestamp).toBeGreaterThan(0);
    });

    it('success() records with status "success"', () => {
        const progress = new GitConnectionProgress();
        progress.success('auth', 'Token accepted');

        expect(progress.getSteps()[0].status).toBe('success');
    });

    it('error() records with status "error"', () => {
        const progress = new GitConnectionProgress();
        progress.error('clone', 'Failed to clone');

        expect(progress.getSteps()[0].status).toBe('error');
    });

    it('warning() records with status "warning"', () => {
        const progress = new GitConnectionProgress();
        progress.warning('branch', 'Using fallback branch');

        expect(progress.getSteps()[0].status).toBe('warning');
    });

    it('calls onProgress callback', () => {
        const callback = vi.fn();
        const progress = new GitConnectionProgress(callback);
        progress.report('test', 'running');

        expect(callback).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledWith(
            expect.objectContaining({ step: 'test', status: 'running' }),
            expect.any(Array)
        );
    });

    it('getLastError returns last error step', () => {
        const progress = new GitConnectionProgress();
        progress.success('step1', 'ok');
        progress.error('step2', 'failed');
        progress.success('step3', 'ok');
        progress.error('step4', 'also failed');

        const lastError = progress.getLastError();
        expect(lastError?.step).toBe('step4');
    });

    it('getLastError returns null when no errors', () => {
        const progress = new GitConnectionProgress();
        progress.success('ok', 'done');

        expect(progress.getLastError()).toBeNull();
    });

    it('getSummary deduplicates by step name (latest wins)', () => {
        const progress = new GitConnectionProgress();
        progress.report('auth', 'running');
        progress.report('auth', 'success', 'Done');

        const summary = progress.getSummary();
        expect(summary).toHaveLength(1);
        expect(summary[0].status).toBe('success');
    });
});
