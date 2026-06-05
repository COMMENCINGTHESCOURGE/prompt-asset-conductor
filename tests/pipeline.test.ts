import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AssetService,
  PromptCompiler,
  ContextBuilder,
  InferenceOrchestrator,
  FeedbackTracker,
  AssetReference
} from '../src/index';

describe('Prompt-Asset Pipeline Unit Tests', () => {
  let assetService: AssetService;
  let promptCompiler: PromptCompiler;
  let contextBuilder: ContextBuilder;
  let inferenceOrchestrator: InferenceOrchestrator;
  let feedbackTracker: FeedbackTracker;

  beforeEach(() => {
    assetService = new AssetService();
    promptCompiler = new PromptCompiler();
    contextBuilder = new ContextBuilder(assetService, promptCompiler);
    feedbackTracker = new FeedbackTracker();
  });

  describe('AssetService', () => {
    it('should cache and retrieve text assets, updating cache metrics', async () => {
      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        return 'text-content';
      };

      const res1 = await assetService.getAsset('asset-1', 'text', fetcher);
      expect(res1).toBe('text-content');
      expect(fetchCount).toBe(1);
      expect(assetService.getCacheMetrics()).toEqual({ hits: 0, misses: 1 });

      const res2 = await assetService.getAsset('asset-1', 'text', fetcher);
      expect(res2).toBe('text-content');
      expect(fetchCount).toBe(1);
      expect(assetService.getCacheMetrics()).toEqual({ hits: 1, misses: 1 });
    });

    it('should cache and retrieve embeddings', async () => {
      const fetcher = async () => [0.1, 0.2, 0.3];
      const emb1 = await assetService.getAsset('emb-1', 'embedding', fetcher);
      expect(emb1).toEqual([0.1, 0.2, 0.3]);
      const emb2 = await assetService.getAsset('emb-1', 'embedding', fetcher);
      expect(emb2).toEqual([0.1, 0.2, 0.3]);
      expect(assetService.getCacheMetrics()).toEqual({ hits: 1, misses: 1 });
    });

    it('should only re-encode/process image when content or target options change (SHA-256 caching)', async () => {
      const imgBuffer1 = Buffer.from('image-raw-data-alpha');
      const imgBuffer2 = Buffer.from('image-raw-data-beta');

      // First call (miss)
      const res1 = await assetService.processImage('img-1', imgBuffer1, 'png', { width: 100, height: 100 });
      expect(res1.fromCache).toBe(false);
      expect(res1.buffer.toString()).toContain('optimized:png:100x100:');

      // Second call with same data & options (hit)
      const res2 = await assetService.processImage('img-1', imgBuffer1, 'png', { width: 100, height: 100 });
      expect(res2.fromCache).toBe(true);
      expect(res2.buffer).toEqual(res1.buffer);

      // Call with different dimensions (miss)
      const res3 = await assetService.processImage('img-1', imgBuffer1, 'png', { width: 200, height: 100 });
      expect(res3.fromCache).toBe(false);

      // Call with different format (miss)
      const res4 = await assetService.processImage('img-1', imgBuffer1, 'webp', { width: 100, height: 100 });
      expect(res4.fromCache).toBe(false);

      // Call with different buffer data (miss)
      const res5 = await assetService.processImage('img-2', imgBuffer2, 'png', { width: 100, height: 100 });
      expect(res5.fromCache).toBe(false);
    });

    it('should clear cache successfully', async () => {
      const fetcher = async () => 'hello';
      await assetService.getAsset('id', 'text', fetcher);
      expect(assetService.getCacheMetrics().misses).toBe(1);

      assetService.clearCache();
      expect(assetService.getCacheMetrics()).toEqual({ hits: 0, misses: 0 });

      await assetService.getAsset('id', 'text', fetcher);
      expect(assetService.getCacheMetrics().misses).toBe(1);
    });

    it('should read and parse a JSON log file via readLogs', async () => {
      const packageJson = await assetService.readLogs('./package.json');
      expect(packageJson.name).toBe('@COMMENCINGTHESCOURGE/prompt-asset-conductor');
    });

    it('should throw error when reading non-existent file via readLogs', async () => {
      await expect(assetService.readLogs('./non-existent.json')).rejects.toThrow('Failed to read/parse log file');
    });

    it('should map integer array values to normalized sieve matrix', () => {
      const values = [0, 1, 24, 25, 48];
      const matrix = assetService.mapToSieveMatrix(values, 24);

      expect(matrix).toHaveLength(24);
      expect(matrix[0]).toHaveLength(24);
      expect(matrix[0][0]).toBe(1.0);
      expect(matrix[0][1]).toBe(1.0);
      expect(matrix[1][0]).toBe(1.0);
      expect(matrix[1][1]).toBe(1.0);
      expect(matrix[2][0]).toBe(1.0);
      expect(matrix[0][2]).toBe(-1.0);
    });

    it('should return default empty matrix normalized to -1.0 for empty values list', () => {
      const matrix = assetService.mapToSieveMatrix([], 24);
      expect(matrix).toHaveLength(24);
      expect(matrix[0][0]).toBe(-1.0);
    });
  });

  describe('PromptCompiler', () => {
    it('should compile and render Handlebars template and cache it', () => {
      const template = 'Hello {{name}}! Welcome to {{system}}.';
      const context = { name: 'DaShawn', system: 'Ghost Braid' };

      const res1 = promptCompiler.compileAndRender('t-1', template, context);
      expect(res1).toBe('Hello DaShawn! Welcome to Ghost Braid.');
      expect(promptCompiler.getCompileMetrics()).toEqual({ hits: 0, misses: 1 });

      const res2 = promptCompiler.compileAndRender('t-1', template, context);
      expect(res2).toBe('Hello DaShawn! Welcome to Ghost Braid.');
      expect(promptCompiler.getCompileMetrics()).toEqual({ hits: 1, misses: 1 });
    });

    it('should compile new template when template ID differs', () => {
      const template = 'System: {{name}}';
      promptCompiler.compileAndRender('t-1', template, { name: 'Pangea' });
      promptCompiler.compileAndRender('t-2', template, { name: 'Vinculum' });
      expect(promptCompiler.getCompileMetrics().misses).toBe(2);
    });

    it('should clear compiler cache', () => {
      promptCompiler.compileAndRender('t-1', 'hi {{name}}', { name: 'a' });
      expect(promptCompiler.getCompileMetrics().misses).toBe(1);
      promptCompiler.clearCache();
      expect(promptCompiler.getCompileMetrics()).toEqual({ hits: 0, misses: 0 });
    });
  });

  describe('ContextBuilder', () => {
    it('should resolve referenced assets in parallel and build final render context', async () => {
      const assetRefs: AssetReference[] = [
        { id: 'txt-asset', type: 'text' },
        { id: 'emb-asset', type: 'embedding' },
        { id: 'img-asset', type: 'image', targetFormat: 'webp', imageOptions: { width: 50 } }
      ];

      const fetchers = {
        'txt-asset': async () => 'dynamic-text',
        'emb-asset': async () => [0.9, 0.8, 0.7],
        'img-asset': async () => Buffer.from('raw-image-bytes')
      };

      const template = 'Prompt text: "{{assets.txt-asset}}". Embedding size: {{assets.emb-asset.length}}. Image type: {{assets.img-asset.format}}. User: {{username}}';
      const variables = { username: 'Operator' };

      const context = await contextBuilder.buildContext('template-id', template, assetRefs, variables, fetchers);

      expect(context.renderedPrompt).toBe('Prompt text: "dynamic-text". Embedding size: 3. Image type: webp. User: Operator');
      expect(context.assets['txt-asset']).toBe('dynamic-text');
      expect(context.assets['emb-asset']).toEqual([0.9, 0.8, 0.7]);
      expect(context.assets['img-asset'].format).toBe('webp');
      expect(context.assets['img-asset'].buffer).toBeDefined();
    });

    it('should handle fallback default mock values when fetchers are missing', async () => {
      const assetRefs: AssetReference[] = [
        { id: 'txt-default', type: 'text' },
        { id: 'emb-default', type: 'embedding' },
        { id: 'img-default', type: 'image' }
      ];

      const template = 'Text: {{assets.txt-default}}, Emb: {{assets.emb-default.[0]}}';
      const context = await contextBuilder.buildContext('t-def', template, assetRefs, {});

      expect(context.renderedPrompt).toBe('Text: content-of-txt-default, Emb: 0.1');
    });
  });

  describe('InferenceOrchestrator', () => {
    it('should successfully run inference and return correct output metrics', async () => {
      inferenceOrchestrator = new InferenceOrchestrator();
      const promptContext = {
        renderedPrompt: 'Generate a short code block.',
        assets: {},
        timestamp: Date.now()
      };

      const result = await inferenceOrchestrator.runInference(promptContext, { model: 'primary-model' });
      expect(result.text).toContain('LLM Response from primary-model');
      expect(result.modelUsed).toBe('primary-model');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.tokensUsed).toBeGreaterThan(0);
    });

    it('should abort call and throw timeout error if LLM call exceeds timeoutMs', async () => {
      // Create client that hangs
      const slowClient = async (prompt: string, model: string, signal?: AbortSignal) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 1000);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('aborted'));
            });
          }
        });
        return { text: 'done', tokens: 10 };
      };

      inferenceOrchestrator = new InferenceOrchestrator(slowClient);
      const promptContext = {
        renderedPrompt: 'Slow prompt',
        assets: {},
        timestamp: Date.now()
      };

      await expect(
        inferenceOrchestrator.runInference(promptContext, { timeoutMs: 50 })
      ).rejects.toThrow('Inference orchestration failed: LLM call aborted due to timeout');
    });

    it('should switch to fallback model if primary model fails', async () => {
      let callCount = 0;
      const failingClient = async (prompt: string, model: string, signal?: AbortSignal) => {
        callCount++;
        if (model === 'fail-model') {
          throw new Error('connection reset');
        }
        return { text: `success-from-${model}`, tokens: 20 };
      };

      inferenceOrchestrator = new InferenceOrchestrator(failingClient);
      const promptContext = {
        renderedPrompt: 'test fallback',
        assets: {},
        timestamp: Date.now()
      };

      const result = await inferenceOrchestrator.runInference(promptContext, {
        model: 'fail-model',
        fallbackModel: 'good-fallback-model'
      });

      expect(result.text).toBe('success-from-good-fallback-model');
      expect(result.modelUsed).toBe('good-fallback-model');
      expect(callCount).toBe(2);
    });
  });

  describe('FeedbackTracker', () => {
    it('should correctly record metrics and compute averages and p95 overhead', () => {
      feedbackTracker.recordMetric({
        requestId: 'req-1',
        pipelineLatencyMs: 150,
        llmLatencyMs: 100,
        tokens: 500,
        cost: 0.002,
        feedbackScore: 0.9
      });

      feedbackTracker.recordMetric({
        requestId: 'req-2',
        pipelineLatencyMs: 120,
        llmLatencyMs: 100,
        tokens: 300,
        cost: 0.001,
        feedbackScore: 0.7
      });

      feedbackTracker.recordMetric({
        requestId: 'req-3',
        pipelineLatencyMs: 250,
        llmLatencyMs: 100,
        tokens: 700,
        cost: 0.003
      });

      const metrics = feedbackTracker.getMetrics();
      expect(metrics).toHaveLength(3);
      expect(metrics[0].overheadMs).toBe(50); // 150 - 100
      expect(metrics[1].overheadMs).toBe(20); // 120 - 100
      expect(metrics[2].overheadMs).toBe(150); // 250 - 100

      const summary = feedbackTracker.getMetricsSummary();
      expect(summary.count).toBe(3);
      expect(summary.avgPipelineLatency).toBe((150 + 120 + 250) / 3);
      expect(summary.avgLLMLatency).toBe(100);
      expect(summary.avgOverhead).toBe((50 + 20 + 150) / 3);
      expect(summary.totalTokens).toBe(1500);
      expect(summary.totalCost).toBe(0.006);
      expect(summary.avgFeedback).toBe(0.8); // (0.9 + 0.7) / 2 (ignoring req-3)

      // Overheads: 20, 50, 150. p95 calculation uses index Math.floor(3 * 0.95) = 2.
      // So overheads[2] is 150.
      expect(summary.p95Overhead).toBe(150);
    });

    it('should handle empty metrics summary gracefully', () => {
      const summary = feedbackTracker.getMetricsSummary();
      expect(summary.count).toBe(0);
      expect(summary.p95Overhead).toBe(0);
    });

    it('should clear metrics', () => {
      feedbackTracker.recordMetric({
        requestId: 'req-1',
        pipelineLatencyMs: 10,
        llmLatencyMs: 5,
        tokens: 100,
        cost: 0.0001
      });
      expect(feedbackTracker.getMetrics()).toHaveLength(1);
      feedbackTracker.clearMetrics();
      expect(feedbackTracker.getMetrics()).toHaveLength(0);
    });
  });

  describe('Integration & Load Test Performance Benchmark', () => {
    it('should handle simulated load of 5 req/s and keep p95 pipeline overhead below 200ms', async () => {
      // Simulate 5 requests per second overhead benchmark
      const totalRequests = 20; // run 20 requests
      const assetRefs: AssetReference[] = [
        { id: 'asset-text', type: 'text' },
        { id: 'asset-img', type: 'image', targetFormat: 'webp', imageOptions: { width: 256 } }
      ];

      const fetchers = {
        'asset-text': async () => 'standard content text for prompt compiler validation.',
        'asset-img': async () => Buffer.from('raw-mock-image-data-payload-1234567890-bytes')
      };

      const template = 'Template text rendering pipeline: {{assets.asset-text}}. Image format: {{assets.asset-img.format}}';
      const orchestrator = new InferenceOrchestrator();

      const runRequest = async (reqId: string) => {
        const pipelineStart = Date.now();

        // 1. Ingest/Context Construction
        const context = await contextBuilder.buildContext(
          'bench-template',
          template,
          assetRefs,
          {},
          fetchers
        );

        // 2. Inference
        const inferenceRes = await orchestrator.runInference(context, { model: 'benchmark-model' });

        const pipelineEnd = Date.now();
        const pipelineLatency = pipelineEnd - pipelineStart;

        feedbackTracker.recordMetric({
          requestId: reqId,
          pipelineLatencyMs: pipelineLatency,
          llmLatencyMs: inferenceRes.latencyMs,
          tokens: inferenceRes.tokensUsed,
          cost: 0.0005
        });
      };

      // Concurrent request load execution
      const promises: Promise<void>[] = [];
      for (let i = 0; i < totalRequests; i++) {
        promises.push(runRequest(`req-${i}`));
      }

      await Promise.all(promises);

      const summary = feedbackTracker.getMetricsSummary();
      console.log(`=== PIPELINE BENCHMARK SUMMARY ===`);
      console.log(`Total Requests Executed: ${summary.count}`);
      console.log(`Average Pipeline Latency: ${summary.avgPipelineLatency.toFixed(2)} ms`);
      console.log(`Average LLM Latency: ${summary.avgLLMLatency.toFixed(2)} ms`);
      console.log(`Average Pipeline Overhead: ${summary.avgOverhead.toFixed(2)} ms`);
      console.log(`p95 Pipeline Overhead: ${summary.p95Overhead.toFixed(2)} ms`);

      expect(summary.count).toBe(totalRequests);
      // Overhead is pipeline latency minus LLM latency (i.e. context assembly, hashing, rendering).
      // Since it's purely local and cached, the p95 overhead must be <= 200ms.
      expect(summary.p95Overhead).toBeLessThanOrEqual(200);
    });
  });
});
