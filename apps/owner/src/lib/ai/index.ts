// lib/ai — the Anthropic client seam + the two publish-time text steps. Server-only.

export {
  COPY_MODEL,
  __resetAnthropicForTests,
  getAnthropic,
  isAiConfigured,
  type MessagesClient,
} from './anthropic';
export {
  AiCallError,
  AiNotConfiguredError,
  enhanceDescription,
  generateAllVariants,
  generateVariantCopy,
} from './copy';
