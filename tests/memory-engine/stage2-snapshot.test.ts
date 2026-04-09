import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  buildSnapshotPrompt,
  mergeDataSources,
  parseSnapshotResponse,
  reconcileObservationStates,
} from '../../packages/memory-engine/src/pipeline/stage2-snapshot.js';

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
    dataSources: ['jira', 'slack'],
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
    expect(result.dataSources).toEqual([]);
  });
});

describe('mergeDataSources', () => {
  it('keeps snapshot provenance stable across prior, new, and model-provided sources', () => {
    expect(
      mergeDataSources(['jira'], ['slack', 'jira', undefined], ['email', 'slack']),
    ).toEqual(['jira', 'slack', 'email']);
  });
});

describe('reconcileObservationStates', () => {
  it('marks observations as superseded when their content is absent from the new snapshot', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([
      { id: 'obs-1', category: 'blocker', content: 'OAuth credentials not received', state: 'active' },
      { id: 'obs-2', category: 'blocker', content: 'Auth service down', state: 'active' },
    ]);
    const prisma = { memoryObservation: { findMany, updateMany } } as unknown as PrismaClient;

    const snapshot = {
      headline: '',
      currentState: '',
      keyDecisions: [],
      openActions: [],
      // 'Auth service down' is still present; 'OAuth credentials not received' was dropped
      blockers: ['Auth service down'],
      openQuestions: [],
      owners: [],
      dataSources: [],
      confidence: 0.8,
    };

    await reconcileObservationStates(prisma, 'unit-1', snapshot);

    expect(findMany).toHaveBeenCalledWith({ where: { memoryUnitId: 'unit-1', state: 'active' } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['obs-1'] } },
      data: { state: 'superseded', supersededAt: expect.any(Date) },
    });
  });

  it('does not call updateMany when all active observations are still in the snapshot', async () => {
    const updateMany = vi.fn();
    const findMany = vi.fn().mockResolvedValue([
      { id: 'obs-1', category: 'blocker', content: 'Auth service down', state: 'active' },
    ]);
    const prisma = { memoryObservation: { findMany, updateMany } } as unknown as PrismaClient;

    await reconcileObservationStates(prisma, 'unit-1', {
      headline: '', currentState: '', keyDecisions: [], openActions: [],
      blockers: ['Auth service down'], openQuestions: [], owners: [], dataSources: [], confidence: 0.9,
    });

    expect(findMany).toHaveBeenCalledWith({ where: { memoryUnitId: 'unit-1', state: 'active' } });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not supersede observations in non-tracked categories (e.g. status_update)', async () => {
    const updateMany = vi.fn();
    const findMany = vi.fn().mockResolvedValue([
      { id: 'obs-1', category: 'status_update', content: 'Moved to in progress', state: 'active' },
    ]);
    const prisma = { memoryObservation: { findMany, updateMany } } as unknown as PrismaClient;

    await reconcileObservationStates(prisma, 'unit-1', {
      headline: '', currentState: '', keyDecisions: [], openActions: [],
      blockers: [], openQuestions: [], owners: [], dataSources: [], confidence: 0.8,
    });

    expect(findMany).toHaveBeenCalledWith({ where: { memoryUnitId: 'unit-1', state: 'active' } });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('matches action_item observations against openActions descriptions', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([
      { id: 'obs-1', category: 'action_item', content: 'Send follow-up email to vendor', state: 'active' },
    ]);
    const prisma = { memoryObservation: { findMany, updateMany } } as unknown as PrismaClient;

    // action_item obs content IS in openActions — should NOT be superseded
    await reconcileObservationStates(prisma, 'unit-1', {
      headline: '', currentState: '', keyDecisions: [],
      openActions: [{ description: 'Send follow-up email to vendor', assignee: undefined, dueDate: undefined }],
      blockers: [], openQuestions: [], owners: [], dataSources: [], confidence: 0.9,
    });

    expect(findMany).toHaveBeenCalledWith({ where: { memoryUnitId: 'unit-1', state: 'active' } });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
