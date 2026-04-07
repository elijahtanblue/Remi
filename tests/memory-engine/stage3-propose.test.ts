import { describe, it, expect } from 'vitest';
import { buildProposalPrompt, parseProposalResponse } from '../../packages/memory-engine/src/pipeline/stage3-propose.js';

describe('buildProposalPrompt', () => {
  it('instructs model to return commentBody and confidence', () => {
    const prompt = buildProposalPrompt();
    expect(prompt).toContain('commentBody');
    expect(prompt).toContain('confidence');
    expect(prompt).toContain('Remi Memory Update');
  });
});

describe('parseProposalResponse', () => {
  it('parses valid proposal response', () => {
    const raw = JSON.stringify({
      commentBody: 'Remi Memory Update\nCurrent state: Work is on track.',
      confidence: 0.88,
    });
    const result = parseProposalResponse(raw);
    expect(result.commentBody).toContain('Remi Memory Update');
    expect(result.confidence).toBe(0.88);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseProposalResponse('bad')).toThrow();
  });
});
