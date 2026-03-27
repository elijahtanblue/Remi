import { describe, it, expect } from 'vitest';
import {
  assertWorkspaceId,
  scopeToWorkspace,
  assertBelongsToWorkspace,
} from '../../packages/shared/src/utils/tenant.js';
import { AuthenticationError } from '../../packages/shared/src/errors.js';

describe('assertWorkspaceId', () => {
  it('returns the workspaceId when present', () => {
    expect(assertWorkspaceId('ws-123')).toBe('ws-123');
  });

  it('throws AuthenticationError when undefined', () => {
    expect(() => assertWorkspaceId(undefined)).toThrow(AuthenticationError);
  });

  it('throws AuthenticationError when null', () => {
    expect(() => assertWorkspaceId(null)).toThrow(AuthenticationError);
  });

  it('throws AuthenticationError when empty string', () => {
    expect(() => assertWorkspaceId('')).toThrow(AuthenticationError);
  });

  it('error has statusCode 401 and AUTHENTICATION_ERROR code', () => {
    expect.assertions(2);
    try {
      assertWorkspaceId(null);
    } catch (e) {
      expect((e as AuthenticationError).statusCode).toBe(401);
      expect((e as AuthenticationError).code).toBe('AUTHENTICATION_ERROR');
    }
  });
});

describe('scopeToWorkspace', () => {
  it('merges workspaceId into the filter object', () => {
    const result = scopeToWorkspace('ws-abc', { status: 'active' });
    expect(result).toEqual({ status: 'active', workspaceId: 'ws-abc' });
  });

  it('returns a new object without mutating the input', () => {
    const filter = { status: 'active' };
    const result = scopeToWorkspace('ws-abc', filter);
    expect(result).not.toBe(filter);
    expect(filter).not.toHaveProperty('workspaceId');
  });

  it('works with an empty filter', () => {
    const result = scopeToWorkspace('ws-xyz', {});
    expect(result).toEqual({ workspaceId: 'ws-xyz' });
  });

  it('overwrites existing workspaceId if present in filter', () => {
    const result = scopeToWorkspace('ws-new', { workspaceId: 'ws-old' });
    expect(result.workspaceId).toBe('ws-new');
  });
});

describe('assertBelongsToWorkspace', () => {
  it('passes silently when workspaceId matches', () => {
    expect(() =>
      assertBelongsToWorkspace({ workspaceId: 'ws-123' }, 'ws-123'),
    ).not.toThrow();
  });

  it('throws AuthenticationError when workspaceId does not match', () => {
    expect(() =>
      assertBelongsToWorkspace({ workspaceId: 'ws-123' }, 'ws-456'),
    ).toThrow(AuthenticationError);
  });

  it('includes entityName in the error message', () => {
    expect.assertions(1);
    try {
      assertBelongsToWorkspace({ workspaceId: 'ws-123' }, 'ws-456', 'Issue');
    } catch (e) {
      expect((e as Error).message).toContain('Issue');
    }
  });

  it('uses default entity name "Entity" when not provided', () => {
    expect.assertions(1);
    try {
      assertBelongsToWorkspace({ workspaceId: 'ws-123' }, 'ws-456');
    } catch (e) {
      expect((e as Error).message).toContain('Entity');
    }
  });
});
