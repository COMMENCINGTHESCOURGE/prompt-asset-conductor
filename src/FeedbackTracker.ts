export interface RequestMetric {
  requestId: string;
  pipelineLatencyMs: number;
  llmLatencyMs: number;
  overheadMs: number;
  tokens: number;
  cost: number;
  timestamp: number;
  feedbackScore?: number;
}

export class FeedbackTracker {
  private metrics: RequestMetric[] = [];

  public recordMetric(metric: Omit<RequestMetric, 'overheadMs' | 'timestamp'>) {
    const overheadMs = Math.max(0, metric.pipelineLatencyMs - metric.llmLatencyMs);
    this.metrics.push({
      ...metric,
      overheadMs,
      timestamp: Date.now()
    });
  }

  public getMetricsSummary() {
    if (this.metrics.length === 0) {
      return {
        count: 0,
        avgPipelineLatency: 0,
        avgLLMLatency: 0,
        avgOverhead: 0,
        p95Overhead: 0,
        totalTokens: 0,
        totalCost: 0,
        avgFeedback: 0
      };
    }

    const count = this.metrics.length;
    let totalPipeline = 0;
    let totalLLM = 0;
    let totalOverhead = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let feedbackSum = 0;
    let feedbackCount = 0;

    const overheads: number[] = [];

    for (const m of this.metrics) {
      totalPipeline += m.pipelineLatencyMs;
      totalLLM += m.llmLatencyMs;
      totalOverhead += m.overheadMs;
      totalTokens += m.tokens;
      totalCost += m.cost;
      overheads.push(m.overheadMs);
      if (m.feedbackScore !== undefined) {
        feedbackSum += m.feedbackScore;
        feedbackCount++;
      }
    }

    overheads.sort((a, b) => a - b);
    const p95Idx = Math.floor(count * 0.95);
    const p95Overhead = overheads[p95Idx] ?? overheads[overheads.length - 1];

    return {
      count,
      avgPipelineLatency: totalPipeline / count,
      avgLLMLatency: totalLLM / count,
      avgOverhead: totalOverhead / count,
      p95Overhead,
      totalTokens,
      totalCost,
      avgFeedback: feedbackCount > 0 ? feedbackSum / feedbackCount : 0
    };
  }

  public getMetrics(): RequestMetric[] {
    return this.metrics;
  }

  public clearMetrics() {
    this.metrics = [];
  }
}
