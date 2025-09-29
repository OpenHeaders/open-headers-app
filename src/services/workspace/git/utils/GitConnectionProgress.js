/**
 * Progress reporter for Git connection testing
 * Provides detailed feedback during connection testing
 */
class GitConnectionProgress {
  constructor(onProgress) {
    this.onProgress = onProgress || (() => {});
    this.steps = [];
  }

  report(step, status = 'running', details = null) {
    const update = {
      step,
      status, // 'running', 'success', 'error', 'warning'
      details,
      timestamp: Date.now()
    };
    
    this.steps.push(update);
    // Send the summary instead of all steps to avoid duplicates
    this.onProgress(update, this.getSummary());
  }

  success(step, details) {
    this.report(step, 'success', details);
  }

  error(step, details) {
    this.report(step, 'error', details);
  }

  warning(step, details) {
    this.report(step, 'warning', details);
  }

  getSteps() {
    return this.steps;
  }

  getLastError() {
    const errors = this.steps.filter(s => s.status === 'error');
    return errors.length > 0 ? errors[errors.length - 1] : null;
  }

  getSummary() {
    const grouped = {};
    this.steps.forEach(step => {
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

module.exports = GitConnectionProgress;