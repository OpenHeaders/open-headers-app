class MainTimeManager {
  private startTime = Date.now();

  now(): number {
    return Date.now();
  }

  getDate(timestamp: number | null = null): Date {
    return timestamp ? new Date(timestamp) : new Date();
  }

  getMonotonicTime(): number {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds * 1000 + nanoseconds / 1000000;
  }

  formatTimestamp(timestamp: number | null = null): string {
    const date = timestamp ? new Date(timestamp) : new Date();
    return date.toISOString();
  }
}

const timeManager = new MainTimeManager();

export { MainTimeManager, timeManager };
export default timeManager;
