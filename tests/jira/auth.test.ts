import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { JIRA_CONNECT_APP_KEY } from '../../packages/jira/src/constants.js';
import { createJiraJwt, verifyJiraJwt } from '../../packages/jira/src/auth.js';

/** Build a minimal HS256 JWT without going through jsonwebtoken — allows setting arbitrary exp. */
function craftJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

const CLIENT_KEY = 'test-client-key';
const SHARED_SECRET = 'super-secret-shared-key-for-tests-only';

describe('createJiraJwt', () => {
  it('returns a string token', () => {
    const token = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/rest/api/2/issue/PROJ-1',
    );
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('includes the app key as iss plus iat, exp, qsh claims', () => {
    const token = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/rest/api/2/issue/PROJ-1',
    );
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
    expect(payload.iss).toBe(JIRA_CONNECT_APP_KEY);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(typeof payload.qsh).toBe('string');
    expect(payload.qsh).toHaveLength(64);
  });

  it('exp is approximately iat + 180 (3 minutes)', () => {
    const token = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/rest/api/2/issue/PROJ-1',
    );
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
    expect(payload.exp - payload.iat).toBeGreaterThanOrEqual(179);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(181);
  });

  it('qsh changes with HTTP method', () => {
    const url = 'https://example.atlassian.net/rest/api/2/issue/PROJ-1';
    const getToken = createJiraJwt(JIRA_CONNECT_APP_KEY, SHARED_SECRET, 'GET', url);
    const postToken = createJiraJwt(JIRA_CONNECT_APP_KEY, SHARED_SECRET, 'POST', url);
    const decodedGet = verifyJiraJwt(getToken, SHARED_SECRET);
    const decodedPost = verifyJiraJwt(postToken, SHARED_SECRET);
    expect(decodedGet.qsh).not.toBe(decodedPost.qsh);
  });

  it('qsh changes with different paths', () => {
    const t1 = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/rest/api/2/issue/PROJ-1',
    );
    const t2 = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/rest/api/2/issue/PROJ-2',
    );
    const d1 = verifyJiraJwt(t1, SHARED_SECRET);
    const d2 = verifyJiraJwt(t2, SHARED_SECRET);
    expect(d1.qsh).not.toBe(d2.qsh);
  });

  it('is case-insensitive for HTTP method (GET == get)', () => {
    const upper = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/path',
    );
    const lower = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'get',
      'https://example.atlassian.net/path',
    );
    const d1 = verifyJiraJwt(upper, SHARED_SECRET);
    const d2 = verifyJiraJwt(lower, SHARED_SECRET);
    expect(d1.qsh).toBe(d2.qsh);
  });
});

describe('verifyJiraJwt', () => {
  it('verifies a valid token signed with the correct secret', () => {
    const token = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/path',
    );
    expect(() => verifyJiraJwt(token, SHARED_SECRET)).not.toThrow();
  });

  it('throws when the secret is wrong', () => {
    const token = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/path',
    );
    expect(() => verifyJiraJwt(token, 'wrong-secret')).toThrow();
  });

  it('throws when the token is tampered', () => {
    const token = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/path',
    );
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}TAMPERED.${parts[2]}`;
    expect(() => verifyJiraJwt(tamperedToken, SHARED_SECRET)).toThrow();
  });

  it('a freshly minted token is not yet expired', () => {
    const token = createJiraJwt(
      JIRA_CONNECT_APP_KEY,
      SHARED_SECRET,
      'GET',
      'https://example.atlassian.net/path',
    );
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('throws TokenExpiredError when exp is in the past', () => {
    const expiredToken = craftJwt(
      { iss: CLIENT_KEY, qsh: 'test', exp: Math.floor(Date.now() / 1000) - 60 },
      SHARED_SECRET,
    );
    expect(() => verifyJiraJwt(expiredToken, SHARED_SECRET)).toThrow(/expired/i);
  });
});
