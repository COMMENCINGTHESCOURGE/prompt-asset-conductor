import { PromptContext } from './ContextBuilder';

export interface InferenceOptions {
  timeoutMs?: number;
  temperature?: number;
  model?: string;
  fallbackModel?: string;
}

export interface InferenceResult {
  text: string;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: number;
}

export class InferenceOrchestrator {
  constructor(
    private llmClient?: (prompt: string, model: string, signal?: AbortSignal) => Promise<{ text: string; tokens: number }>
  ) {
    if (!this.llmClient) {
      this.llmClient = async (prompt, model, signal) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 30);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('LLM call aborted'));
            });
          }
        });
        return {
          text: `LLM Response from ${model} for prompt: "${prompt.substring(0, 30)}..."`,
          tokens: Math.floor(prompt.length / 4) + 15
        };
      };
    }
  }

  public async runInference(
    context: PromptContext,
    options: InferenceOptions = {}
  ): Promise<InferenceResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 5000;
    const model = options.model ?? 'primary-llm';
    const fallbackModel = options.fallbackModel ?? 'fallback-llm';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      try {
        const res = await this.llmClient!(context.renderedPrompt, model, controller.signal);
        clearTimeout(timer);
        return {
          text: res.text,
          modelUsed: model,
          latencyMs: Date.now() - startTime,
          tokensUsed: res.tokens
        };
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message?.includes('aborted') || controller.signal.aborted) {
          throw new Error('LLM call aborted due to timeout');
        }
        // Fallback model logic
        const fallbackRes = await this.llmClient!(context.renderedPrompt, fallbackModel, controller.signal);
        clearTimeout(timer);
        return {
          text: fallbackRes.text,
          modelUsed: fallbackModel,
          latencyMs: Date.now() - startTime,
          tokensUsed: fallbackRes.tokens
        };
      }
    } catch (err: any) {
      clearTimeout(timer);
      throw new Error(`Inference orchestration failed: ${err.message}`);
    }
  }
}
