/**
 * Progress reporter for Git connection testing
 * Provides detailed feedback during connection testing
 */

interface ProgressStep {
  step: string;
  status: string;
  details: string | null;
  timestamp: number;
}

type OnProgressCallback = (update: ProgressStep, summary: ProgressStep[]) => void;

class GitConnectionProgress {
  private onProgress: OnProgressCallback;
  private steps: ProgressStep[];

  constructor(onProgress?: OnProgressCallback) {
    this.onProgress = onProgress || (() => {});
    this.steps = [];
  }

  report(step: string, status = 'running', details: string | null = null): void {
    const update: ProgressStep = {
      step,
      status, // 'running', 'success', 'error', 'warning'
      details,
      timestamp: Date.now(),
    };

    this.steps.push(update);
    // Send the summary instead of all steps to avoid duplicates
    this.onProgress(update, this.getSummary());
  }

  success(step: string, details: string): void {
    this.report(step, 'success', details);
  }

  error(step: string, details: string): void {
    this.report(step, 'error', details);
  }

  warning(step: string, details: string): void {
    this.report(step, 'warning', details);
  }

  getSteps(): ProgressStep[] {
    return this.steps;
  }

  getLastError(): ProgressStep | null {
    const errors = this.steps.filter((s) => s.status === 'error');
    return errors.length > 0 ? errors[errors.length - 1] : null;
  }

  getSummary(): ProgressStep[] {
    const grouped: Record<string, ProgressStep> = {};
    this.steps.forEach((step) => {
      if (!grouped[step.step]) {
        grouped[step.step] = step;
      } else if (step.status !== 'running') {
        // Update with final status
        grouped[step.step] = step;
      }
    });
    return Object.values(grouped);
  }
}

export type { OnProgressCallback, ProgressStep };
export { GitConnectionProgress };
export default GitConnectionProgress;
