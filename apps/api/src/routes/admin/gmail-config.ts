/**
 * Pure validation helpers for the Gmail configure endpoint.
 * Extracted so unit tests can import and exercise these without a live server.
 */

export function validateGmailConfigBody(body: unknown): { error: string } | null {
  const b = body as Record<string, unknown>;
  if (!b.workspaceId || !b.serviceAccountJson || !b.domain) {
    return { error: 'workspaceId, serviceAccountJson, and domain are required' };
  }
  try {
    const key = JSON.parse(b.serviceAccountJson as string) as Record<string, unknown>;
    if (!key.client_email || !key.private_key) {
      return { error: 'serviceAccountJson must contain client_email and private_key' };
    }
  } catch {
    return { error: 'serviceAccountJson is not valid JSON' };
  }
  return null;
}
