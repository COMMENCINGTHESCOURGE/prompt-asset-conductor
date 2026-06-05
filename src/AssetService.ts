import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface IngestedAsset {
  id: string;
  type: 'text' | 'image' | 'embedding';
  content: string | Buffer | number[];
  metadata?: Record<string, any>;
}

export class AssetService {
  private cache = new Map<string, any>();
  private imageCache = new Map<string, Buffer>();
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor() {}

  public getCacheMetrics() {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
    };
  }

  public async getAsset(id: string, type: 'text' | 'image' | 'embedding', fetcher: () => Promise<any>): Promise<any> {
    const cacheKey = `${type}:${id}`;
    if (this.cache.has(cacheKey)) {
      this.cacheHits++;
      return this.cache.get(cacheKey);
    }
    this.cacheMisses++;
    const data = await fetcher();
    this.cache.set(cacheKey, data);
    return data;
  }

  public clearCache(): void {
    this.cache.clear();
    this.imageCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  public async processImage(
    id: string,
    imageBuffer: Buffer,
    targetFormat: string,
    options?: { width?: number; height?: number }
  ): Promise<{ buffer: Buffer; fromCache: boolean }> {
    const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const width = options?.width ?? 0;
    const height = options?.height ?? 0;
    const cacheKey = `${hash}:${targetFormat}:${width}:${height}`;

    if (this.imageCache.has(cacheKey)) {
      this.cacheHits++;
      return { buffer: this.imageCache.get(cacheKey)!, fromCache: true };
    }

    this.cacheMisses++;
    // Simulate image transformation/re-encoding
    const transformedBuffer = Buffer.concat([
      Buffer.from(`optimized:${targetFormat}:${width}x${height}:`),
      imageBuffer
    ]);

    this.imageCache.set(cacheKey, transformedBuffer);
    return { buffer: transformedBuffer, fromCache: false };
  }

  public async readLogs(filePath: string): Promise<any> {
    try {
      const fullPath = path.resolve(filePath);
      const data = await fs.readFile(fullPath, 'utf8');
      return JSON.parse(data);
    } catch (error: any) {
      throw new Error(`Failed to read/parse log file at ${filePath}: ${error.message}`);
    }
  }

  public mapToSieveMatrix(values: number[], size: number = 24): number[][] {
    const matrix: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
    if (values.length === 0) {
      return matrix.map(row => row.map(() => -1.0));
    }
    
    // Compute density counts
    for (const val of values) {
      const row = Math.floor(val / size) % size;
      const col = val % size;
      matrix[row][col]++;
    }

    // Find max value for normalization
    let maxVal = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c] > maxVal) {
          maxVal = matrix[r][c];
        }
      }
    }

    // Normalize to range [-1.0, 1.0]
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        matrix[r][c] = (matrix[r][c] / maxVal) * 2.0 - 1.0;
      }
    }

    return matrix;
  }
}
