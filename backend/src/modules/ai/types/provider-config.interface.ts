/**
 * Configuration for an AI provider (Groq or OpenRouter).
 * Used to dynamically select and configure the AI service at runtime.
 */
export interface ProviderConfig {
  /** Base URL for the provider's API endpoint */
  baseUrl: string;
  /** Model identifier to use for chat completions */
  model: string;
  /** API key for authentication */
  apiKey: string;
  /** Human-readable provider name (e.g. "groq", "openrouter") */
  name: string;
  /** Prefix for error messages (e.g. "GROQ", "GEMINI") */
  errorPrefix: string;
  /** Optional additional headers to include in API requests */
  extraHeaders?: Record<string, string>;
}
