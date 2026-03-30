export interface MemoryModelClient {
  /**
   * Send a completion request. Returns the raw text response from the model.
   * Throws on non-retryable errors. Callers are responsible for JSON parsing.
   */
  complete(systemPrompt: string, userContent: string): Promise<string>;
}
