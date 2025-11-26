type PerformanceMetric = {
  timestamp: number;
  operation: string;
  duration: number;
  data: {
    basePointCount?: number;
    playerCount?: number;
    responseSize?: number;
    dbTime?: number;
    processingTime?: number;
  };
};

class PerformanceTracker {
  private static instance: PerformanceTracker;
  private metrics: PerformanceMetric[] = [];
  private readonly MAX_METRICS = 1000;

  private constructor() {}

  public static getInstance(): PerformanceTracker {
    if (!PerformanceTracker.instance) {
      PerformanceTracker.instance = new PerformanceTracker();
    }
    return PerformanceTracker.instance;
  }

  public track(
    operation: string,
    duration: number,
    data: PerformanceMetric['data'] = {}
  ): void {
    this.metrics.push({
      timestamp: Date.now(),
      operation,
      duration,
      data,
    });

    // Keep only the most recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }

  public getMetrics(operation?: string): PerformanceMetric[] {
    if (operation) {
      return this.metrics.filter((m) => m.operation === operation);
    }
    return [...this.metrics];
  }

  public getAverageDuration(operation: string, lastN: number = 100): number {
    const relevant = this.getMetrics(operation).slice(-lastN);
    if (relevant.length === 0) return 0;
    
    const total = relevant.reduce((sum, m) => sum + m.duration, 0);
    return total / relevant.length;
  }

  public shouldOptimize(operation: string, thresholdMs: number): boolean {
    return this.getAverageDuration(operation) > thresholdMs;
  }
}

export const performanceTracker = PerformanceTracker.getInstance();
