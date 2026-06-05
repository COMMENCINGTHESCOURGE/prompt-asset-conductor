import { AssetService } from './AssetService';
import { PromptCompiler } from './PromptCompiler';

export interface AssetReference {
  id: string;
  type: 'text' | 'image' | 'embedding';
  targetFormat?: string;
  imageOptions?: { width?: number; height?: number };
}

export interface PromptContext {
  renderedPrompt: string;
  assets: Record<string, any>;
  timestamp: number;
}

export class ContextBuilder {
  constructor(
    private assetService: AssetService,
    private promptCompiler: PromptCompiler
  ) {}

  public async buildContext(
    templateId: string,
    templateContent: string,
    assetRefs: AssetReference[],
    variables: Record<string, any>,
    assetFetchers: Record<string, () => Promise<any>> = {}
  ): Promise<PromptContext> {
    // Parallel loading of assets using Promise.all
    const assetPromises = assetRefs.map(async (ref) => {
      let resolvedContent: any;
      if (ref.type === 'image') {
        const rawImage = assetFetchers[ref.id]
          ? await assetFetchers[ref.id]()
          : Buffer.from(`mock-raw-image-data-for-${ref.id}`);
        
        const targetFormat = ref.targetFormat ?? 'png';
        const result = await this.assetService.processImage(ref.id, rawImage, targetFormat, ref.imageOptions);
        resolvedContent = {
          buffer: result.buffer.toString('base64'),
          fromCache: result.fromCache,
          format: targetFormat
        };
      } else {
        resolvedContent = await this.assetService.getAsset(ref.id, ref.type, async () => {
          if (assetFetchers[ref.id]) {
            return await assetFetchers[ref.id]();
          }
          if (ref.type === 'embedding') {
            return [0.1, 0.2, 0.3];
          }
          return `content-of-${ref.id}`;
        });
      }
      return { key: ref.id, value: resolvedContent };
    });

    const loadedAssetsList = await Promise.all(assetPromises);
    const assetsMap: Record<string, any> = {};
    for (const item of loadedAssetsList) {
      assetsMap[item.key] = item.value;
    }

    const renderContext = {
      ...variables,
      assets: assetsMap
    };

    const renderedPrompt = this.promptCompiler.compileAndRender(templateId, templateContent, renderContext);

    return {
      renderedPrompt,
      assets: assetsMap,
      timestamp: Date.now()
    };
  }
}
