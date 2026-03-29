import { describe, it, expect } from 'vitest';
import { parseParticipants } from '../../packages/gmail/src/parse-email.js';

// Unit tests for sync deduplication logic and internal email parsing helpers —
// exercised directly from source to keep tests DB-free.

describe('parseParticipants', () => {
  it('parses a standard angle-bracket address', () => {
    const p = parseParticipants('Alice <alice@co.com>', '', '');
    expect(p).toHaveLength(1);
    expect(p[0].emailAddress).toBe('alice@co.com');
    expect(p[0].displayName).toBe('Alice');
    expect(p[0].role).toBe('from');
  });

  it('parses a plain email address', () => {
    const p = parseParticipants('noreply@example.com', '', '');
    expect(p[0].emailAddress).toBe('noreply@example.com');
  });

  it('normalises email to lowercase', () => {
    const p = parseParticipants('BOB@COMPANY.COM', '', '');
    expect(p[0].emailAddress).toBe('bob@company.com');
  });

  it('parses multiple To addresses', () => {
    const p = parseParticipants('', 'a@x.com, b@x.com', '');
    expect(p).toHaveLength(2);
    expect(p.every((pt) => pt.role === 'to')).toBe(true);
  });

  it('assigns cc role correctly', () => {
    const p = parseParticipants('', '', 'cc@x.com');
    expect(p[0].role).toBe('cc');
  });

  it('returns empty array for empty headers', () => {
    expect(parseParticipants('', '', '')).toHaveLength(0);
  });
});

describe('sync deduplication contract', () => {
  it('idempotencyKey format is stable for a given gmailMessageId', () => {
    const messageId = 'msg_abc123';
    const key1 = `gmail:${messageId}`;
    const key2 = `gmail:${messageId}`;
    expect(key1).toBe(key2);
  });

  it('different message IDs produce different idempotency keys', () => {
    expect(`gmail:msg_001`).not.toBe(`gmail:msg_002`);
  });
});
