import { describe, it, expect } from 'vitest';
import { buildExtractionPrompt, parseExtractionResponse } from '../../packages/memory-engine/src/pipeline/stage1-extract.js';

describe('buildExtractionPrompt', () => {
  it('returns a non-empty system prompt string', () => {
    const prompt = buildExtractionPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain('decision');
    expect(prompt).toContain('action_item');
    expect(prompt).toContain('blocker');
  });
});

describe('parseExtractionResponse', () => {
  it('parses valid extraction response', () => {
    const raw = JSON.stringify({
      observations: [
        { category: 'decision', content: 'We chose Postgres', confidence: 0.92, citationIds: ['msg1'] },
      ],
    });
    const result = parseExtractionResponse(raw);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].category).toBe('decision');
    expect(result.observations[0].confidence).toBe(0.92);
  });

  it('returns empty observations array on empty model response', () => {
    const raw = JSON.stringify({ observations: [] });
    const result = parseExtractionResponse(raw);
    expect(result.observations).toHaveLength(0);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseExtractionResponse('not json')).toThrow();
  });

  it('filters out observations below minimum confidence', () => {
    const raw = JSON.stringify({
      observations: [
        { category: 'decision', content: 'Maybe we will use React', confidence: 0.29, citationIds: [] },
        { category: 'blocker', content: 'Auth is blocked', confidence: 0.85, citationIds: ['msg2'] },
      ],
    });
    const result = parseExtractionResponse(raw);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].category).toBe('blocker');
  });
});
