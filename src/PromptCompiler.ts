import Handlebars from 'handlebars';

export class PromptCompiler {
  private compiledTemplates = new Map<string, Handlebars.TemplateDelegate>();
  private compileHits = 0;
  private compileMisses = 0;

  public compileAndRender(templateId: string, templateContent: string, context: Record<string, any>): string {
    let renderFn = this.compiledTemplates.get(templateId);
    if (!renderFn) {
      this.compileMisses++;
      renderFn = Handlebars.compile(templateContent);
      this.compiledTemplates.set(templateId, renderFn);
    } else {
      this.compileHits++;
    }
    return renderFn(context);
  }

  public getCompileMetrics() {
    return {
      hits: this.compileHits,
      misses: this.compileMisses,
    };
  }

  public clearCache(): void {
    this.compiledTemplates.clear();
    this.compileHits = 0;
    this.compileMisses = 0;
  }
}
