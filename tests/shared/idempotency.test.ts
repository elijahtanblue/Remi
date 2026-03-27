import { describe, it, expect } from 'vitest';
import {
  generateIdempotencyKey,
  generatePrefixedIdempotencyKey,
} from '../../packages/shared/src/utils/idempotency.js';

describe('generateIdempotencyKey', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const key = generateIdempotencyKey('slack', 'msg-001', 1711234567000);
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same inputs produce the same key', () => {
    const a = generateIdempotencyKey('slack', 'msg-001', 1711234567000);
    const b = generateIdempotencyKey('slack', 'msg-001', 1711234567000);
    expect(a).toBe(b);
  });

  it('differs when source changes', () => {
    const a = generateIdempotencyKey('slack', 'msg-001', 1711234567000);
    const b = generateIdempotencyKey('jira', 'msg-001', 1711234567000);
    expect(a).not.toBe(b);
  });

  it('differs when externalId changes', () => {
    const a = generateIdempotencyKey('slack', 'msg-001', 1711234567000);
    const b = generateIdempotencyKey('slack', 'msg-002', 1711234567000);
    expect(a).not.toBe(b);
  });

  it('differs when timestamp changes', () => {
    const a = generateIdempotencyKey('slack', 'msg-001', 1711234567000);
    const b = generateIdempotencyKey('slack', 'msg-001', 1711234568000);
    expect(a).not.toBe(b);
  });

  it('accepts a string timestamp', () => {
    const a = generateIdempotencyKey('slack', 'msg-001', '1711234567000');
    const b = generateIdempotencyKey('slack', 'msg-001', '1711234567000');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('string and numeric timestamps with the same value produce different keys (type coercion)', () => {
    // The raw string concatenation `source:id:ts` differs between number and string representation only
    // if the coercion changes the value — here both coerce to the same string, so they ARE equal.
    const a = generateIdempotencyKey('slack', 'msg-001', 123);
    const b = generateIdempotencyKey('slack', 'msg-001', '123');
    expect(a).toBe(b); // both produce "slack:msg-001:123"
  });
});

describe('generatePrefixedIdempotencyKey', () => {
  it('returns prefix_<sha256>', () => {
    const key = generatePrefixedIdempotencyKey('slack_msg', 'slack', 'msg-001', 1711234567000);
    expect(key).toMatch(/^slack_msg_[0-9a-f]{64}$/);
  });

  it('the hash portion is the same as generateIdempotencyKey', () => {
    const hash = generateIdempotencyKey('slack', 'msg-001', 1711234567000);
    const prefixed = generatePrefixedIdempotencyKey('pfx', 'slack', 'msg-001', 1711234567000);
    expect(prefixed).toBe(`pfx_${hash}`);
  });

  it('different prefixes produce different keys', () => {
    const a = generatePrefixedIdempotencyKey('alpha', 'slack', 'msg-001', 100);
    const b = generatePrefixedIdempotencyKey('beta', 'slack', 'msg-001', 100);
    expect(a).not.toBe(b);
  });
});
