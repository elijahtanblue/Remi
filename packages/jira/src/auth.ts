import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';

export interface JiraConnectAuth {
  clientKey: string;
  sharedSecret: string;
  baseUrl: string;
}

export function verifyJiraJwt(
  token: string,
  sharedSecret: string,
): { iss: string; iat: number; exp: number; qsh: string } {
  return jwt.verify(token, sharedSecret, { algorithms: ['HS256'] }) as {
    iss: string;
    iat: number;
    exp: number;
    qsh: string;
  };
}

export function createJiraJwt(
  clientKey: string,
  sharedSecret: string,
  method: string,
  url: string,
): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3 * 60;

  const parsed = new URL(url);
  // Jira QSH spec: METHOD&canonical_path&canonical_query
  // Query params must be sorted alphabetically and URL-encoded
  const sortedQuery = Array.from(parsed.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const canonicalRequest = `${method.toUpperCase()}&${parsed.pathname}&${sortedQuery}`;
  const qsh = createHash('sha256').update(canonicalRequest).digest('hex');

  // noTimestamp is NOT used — jsonwebtoken v9 strips manually-set iat when
  // noTimestamp:true is present. Let the library manage iat automatically.
  return jwt.sign({ iss: clientKey, exp, qsh }, sharedSecret, {
    algorithm: 'HS256',
  });
}
