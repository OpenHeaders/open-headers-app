import { describe, expect, it, vi } from 'vitest';
import { GitConnectionProgress } from '@/services/workspace/git/utils/GitConnectionProgress';

describe('GitConnectionProgress', () => {
  describe('construction', () => {
    it('starts with empty steps', () => {
      const progress = new GitConnectionProgress();
      expect(progress.getSteps()).toEqual([]);
    });

    it('works without a callback', () => {
      const progress = new GitConnectionProgress();
      progress.report('test', 'running');
      expect(progress.getSteps()).toHaveLength(1);
    });
  });

  describe('report()', () => {
    it('records step with all fields', () => {
      const progress = new GitConnectionProgress();
      progress.report('Validating authentication', 'running', 'Method: token');

      const steps = progress.getSteps();
      expect(steps).toHaveLength(1);
      expect(steps[0]).toEqual({
        step: 'Validating authentication',
        status: 'running',
        details: 'Method: token',
        timestamp: expect.any(Number),
      });
    });

    it('defaults details to null', () => {
      const progress = new GitConnectionProgress();
      progress.report('Testing repository access', 'running');

      expect(progress.getSteps()[0].details).toBeNull();
    });

    it('calls onProgress callback with update and summary', () => {
      const callback = vi.fn();
      const progress = new GitConnectionProgress(callback);
      progress.report('Starting connection test', 'running');

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'Starting connection test',
          status: 'running',
        }),
        expect.any(Array),
      );
    });

    it('accumulates multiple steps', () => {
      const progress = new GitConnectionProgress();
      progress.report('step1', 'running');
      progress.report('step2', 'running');
      progress.report('step3', 'running');

      expect(progress.getSteps()).toHaveLength(3);
    });
  });

  describe('success()', () => {
    it('records with status "success"', () => {
      const progress = new GitConnectionProgress();
      progress.success('Validating authentication', 'Authentication data validated');

      const step = progress.getSteps()[0];
      expect(step.status).toBe('success');
      expect(step.details).toBe('Authentication data validated');
    });
  });

  describe('error()', () => {
    it('records with status "error"', () => {
      const progress = new GitConnectionProgress();
      progress.error('Testing repository access', 'Repository not found');

      const step = progress.getSteps()[0];
      expect(step.status).toBe('error');
      expect(step.details).toBe('Repository not found');
    });
  });

  describe('warning()', () => {
    it('records with status "warning"', () => {
      const progress = new GitConnectionProgress();
      progress.warning('Branch validation', "Branch 'workspace/staging-env' not found (will be created automatically)");

      const step = progress.getSteps()[0];
      expect(step.status).toBe('warning');
      expect(step.details).toContain('workspace/staging-env');
    });
  });

  describe('getLastError()', () => {
    it('returns null when no errors exist', () => {
      const progress = new GitConnectionProgress();
      progress.success('step1', 'ok');
      progress.success('step2', 'ok');

      expect(progress.getLastError()).toBeNull();
    });

    it('returns the last error step', () => {
      const progress = new GitConnectionProgress();
      progress.success('Validating authentication', 'ok');
      progress.error('Testing repository access', 'Repository not accessible');
      progress.success('Branch validation', 'ok');
      progress.error('Configuration validation', 'No config files found');

      const lastError = progress.getLastError();
      expect(lastError).not.toBeNull();
      expect(lastError!.step).toBe('Configuration validation');
      expect(lastError!.details).toBe('No config files found');
    });

    it('returns null for empty progress', () => {
      const progress = new GitConnectionProgress();
      expect(progress.getLastError()).toBeNull();
    });
  });

  describe('getSummary()', () => {
    it('returns empty array when no steps', () => {
      const progress = new GitConnectionProgress();
      expect(progress.getSummary()).toEqual([]);
    });

    it('deduplicates by step name — final status wins over running', () => {
      const progress = new GitConnectionProgress();
      progress.report('Validating authentication', 'running', 'Checking...');
      progress.success('Validating authentication', 'Validated');

      const summary = progress.getSummary();
      expect(summary).toHaveLength(1);
      expect(summary[0].status).toBe('success');
      expect(summary[0].details).toBe('Validated');
    });

    it('keeps running status if no final status arrives', () => {
      const progress = new GitConnectionProgress();
      progress.report('Testing repository access', 'running', 'Checking...');

      const summary = progress.getSummary();
      expect(summary).toHaveLength(1);
      expect(summary[0].status).toBe('running');
    });

    it('preserves order of unique steps', () => {
      const progress = new GitConnectionProgress();
      progress.report('Starting connection test', 'running');
      progress.success('Starting connection test', 'Initialized');
      progress.report('Validating authentication', 'running');
      progress.success('Validating authentication', 'Valid');
      progress.report('Testing repository access', 'running');
      progress.success('Testing repository access', 'Accessible');

      const summary = progress.getSummary();
      expect(summary).toHaveLength(3);
      expect(summary[0].step).toBe('Starting connection test');
      expect(summary[1].step).toBe('Validating authentication');
      expect(summary[2].step).toBe('Testing repository access');
    });

    it('simulates full connection test flow', () => {
      const callback = vi.fn();
      const progress = new GitConnectionProgress(callback);

      // Simulate the full ConnectionTester flow
      progress.report('Starting connection test', 'running');
      progress.success('Starting connection test', 'Connection test initialized');
      progress.report('Validating authentication', 'running', 'Method: token');
      progress.success('Validating authentication', 'Authentication data validated');
      progress.report('Setting up authentication', 'running');
      progress.success('Setting up authentication', 'Authentication configured');
      progress.report('Validating GitHub token', 'running', 'Checking token validity');
      progress.success('Validating GitHub token', 'Token is valid');
      progress.report('Testing repository access', 'running', 'Checking repository availability');
      progress.success('Testing repository access', 'Repository is accessible');
      progress.report('Branch validation', 'running', "Checking branch 'main'");
      progress.success('Branch validation', "Branch 'main' found");
      progress.report('Configuration validation', 'running');
      progress.success('Configuration validation', 'Configuration check requires cloning');
      progress.success('Connection test complete', 'All checks passed');

      const summary = progress.getSummary();
      expect(summary).toHaveLength(8);
      expect(summary.every((s) => s.status === 'success')).toBe(true);
      expect(callback).toHaveBeenCalledTimes(15); // 7 running + 8 success (last success has no running)
    });
  });
});
