import { describe, it, expect } from 'vitest';
import { buildSnapshotPrompt, parseSnapshotResponse } from '../../packages/memory-engine/src/pipeline/stage2-snapshot.js';

describe('buildSnapshotPrompt', () => {
  it('returns a string containing key schema fields', () => {
    const prompt = buildSnapshotPrompt();
    expect(prompt).toContain('headline');
    expect(prompt).toContain('keyDecisions');
    expect(prompt).toContain('openActions');
    expect(prompt).toContain('blockers');
    expect(prompt).toContain('openQuestions');
    expect(prompt).toContain('confidence');
  });
});

describe('parseSnapshotResponse', () => {
  const validSnapshot = {
    headline: 'Auth service is blocked on OAuth provider.',
    currentState: 'Team is waiting for vendor credentials.',
    keyDecisions: ['Use OAuth2 for auth'],
    openActions: [{ description: 'Chase vendor for credentials', assignee: 'alice' }],
    blockers: ['OAuth credentials not received'],
    openQuestions: ['Which OAuth provider to use?'],
    owners: ['alice', 'bob'],
    confidence: 0.82,
  };

  it('parses a valid snapshot', () => {
    const result = parseSnapshotResponse(JSON.stringify(validSnapshot));
    expect(result.headline).toBe(validSnapshot.headline);
    expect(result.keyDecisions).toHaveLength(1);
    expect(result.openActions[0].assignee).toBe('alice');
    expect(result.confidence).toBe(0.82);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseSnapshotResponse('bad json')).toThrow();
  });

  it('defaults missing array fields to empty arrays', () => {
    const minimal = { headline: 'Test', currentState: 'Running', confidence: 0.7 };
    const result = parseSnapshotResponse(JSON.stringify(minimal));
    expect(result.keyDecisions).toEqual([]);
    expect(result.openActions).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.openQuestions).toEqual([]);
    expect(result.owners).toEqual([]);
  });
});
