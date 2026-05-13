// lib/ai — the Gemini client seam + the two publish-time text steps. Server-only.

export {
  COPY_MODEL,
  __resetGenAiForTests,
  getGenAi,
  isAiConfigured,
  type GenAiClient,
} from './gemini';
export {
  AiCallError,
  AiNotConfiguredError,
  enhanceDescription,
  generateAllVariants,
  generateVariantCopy,
} from './copy';
