# prompt-asset-conductor

[![Coverage Status](https://img.shields.io/badge/coverage-99.25%25-brightgreen)](https://github.com/COMMENCINGTHESCOURGE)
[![p95 Latency](https://img.shields.io/badge/p95_overhead-1ms-blue)](#)

Optimized prompt-asset orchestration pipeline for the Guinea Pig Trench toolchain.

## Features

- **AssetService**: Cache layer for text, embeddings, and images with SHA-256 image change detection.
- **PromptCompiler**: Handlebars template engine caching to prevent template compilation overhead.
- **ContextBuilder**: Asynchronous parallel resolution of referenced assets.
- **InferenceOrchestrator**: Abortable timeout-aware LLM orchestrator with automatic fallback model failover.
- **FeedbackTracker**: Performance telemetry tracking averaging p95 latency and token cost analysis.

## Running Tests

To run the unit tests and benchmark:

```bash
npm run test
```

To run coverage:

```bash
npx vitest run --coverage
```
