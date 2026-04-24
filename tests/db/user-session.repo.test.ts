import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUserSession,
  findSessionByToken,
  revokeSession,
  touchSession,
} from '../../packages/db/src/repositories/user-session.repo.js';

function sha256(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

const mockPrisma = {
  userSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('createUserSession', () => {
  it('stores SHA-256 hash of token, not the raw token', async () => {
    const rawToken = 'abc123rawtoken';
    mockPrisma.userSession.create.mockResolvedValue({ id: 's1' });

    await createUserSession(mockPrisma, {
      userId: 'u1',
      workspaceId: 'ws1',
      rawToken,
    });

    const call = mockPrisma.userSession.create.mock.calls[0][0];
    expect(call.data.tokenHash).toBe(sha256(rawToken));
    expect(JSON.stringify(call)).not.toContain(rawToken);
  });

  it('sets expiresAt 30 days from now', async () => {
    mockPrisma.userSession.create.mockResolvedValue({ id: 's1' });
    const before = Date.now();

    await createUserSession(mockPrisma, {
      userId: 'u1',
      workspaceId: 'ws1',
      rawToken: 'tok',
    });

    const call = mockPrisma.userSession.create.mock.calls[0][0];
    const expiresAt: Date = call.data.expiresAt;
    const diffDays = (expiresAt.getTime() - before) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });
});

describe('findSessionByToken', () => {
  it('looks up by SHA-256 hash of token', async () => {
    const rawToken = 'mytoken';
    mockPrisma.userSession.findUnique.mockResolvedValue(null);

    await findSessionByToken(mockPrisma, rawToken);

    expect(mockPrisma.userSession.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256(rawToken) },
    });
  });

  it('returns null when session is revoked', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue({
      id: 's1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000000),
    });

    const result = await findSessionByToken(mockPrisma, 'tok');
    expect(result).toBeNull();
  });

  it('returns null when session is expired', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue({
      id: 's1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await findSessionByToken(mockPrisma, 'tok');
    expect(result).toBeNull();
  });

  it('returns session when valid', async () => {
    const session = {
      id: 's1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000000),
      userId: 'u1',
      workspaceId: 'ws1',
    };
    mockPrisma.userSession.findUnique.mockResolvedValue(session);

    const result = await findSessionByToken(mockPrisma, 'tok');
    expect(result).toEqual(session);
  });
});

describe('revokeSession', () => {
  it('sets revokedAt on the session matching the token hash', async () => {
    const rawToken = 'mytoken';
    mockPrisma.userSession.update.mockResolvedValue({});

    await revokeSession(mockPrisma, rawToken);

    const call = mockPrisma.userSession.update.mock.calls[0][0];
    expect(call.where.tokenHash).toBe(sha256(rawToken));
    expect(call.data.revokedAt).toBeInstanceOf(Date);
  });
});

describe('touchSession', () => {
  it('updates lastSeenAt for the matching session', async () => {
    mockPrisma.userSession.update.mockResolvedValue({});

    await touchSession(mockPrisma, 'tok');

    const call = mockPrisma.userSession.update.mock.calls[0][0];
    expect(call.data.lastSeenAt).toBeInstanceOf(Date);
  });
});
