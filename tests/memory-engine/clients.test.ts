import { describe, it, expect } from 'vitest';
import { createGeminiClient } from '../../packages/memory-engine/src/clients/gemini.js';
import { createOpenAiClient } from '../../packages/memory-engine/src/clients/openai.js';

describe('createGeminiClient', () => {
  it('returns an object with a complete method', () => {
    const client = createGeminiClient('fake-key');
    expect(typeof client.complete).toBe('function');
  });
});

describe('createOpenAiClient', () => {
  it('returns an object with a complete method', () => {
    const client = createOpenAiClient('fake-key');
    expect(typeof client.complete).toBe('function');
  });
});
