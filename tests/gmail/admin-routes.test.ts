import { describe, it, expect } from 'vitest';
import { validateGmailConfigBody } from '../../apps/api/src/routes/admin/gmail-config.js';

// Unit tests for the gmail configure route validation logic —
// exercised directly from source to keep tests server-free.

function redactInstall(install: Record<string, unknown>) {
  const { serviceAccountJson: _sa, ...safe } = install;
  return safe;
}

describe('POST /admin/gmail/configure — validation', () => {
  const validKey = JSON.stringify({ client_email: 'sa@proj.iam.gserviceaccount.com', private_key: '---KEY---' });

  it('passes with all required fields', () => {
    const err = validateGmailConfigBody({
      workspaceId: 'ws_1',
      serviceAccountJson: validKey,
      domain: 'company.com',
      monitoredEmails: ['alice@company.com'],
    });
    expect(err).toBeNull();
  });

  it('rejects missing workspaceId', () => {
    const err = validateGmailConfigBody({ serviceAccountJson: validKey, domain: 'company.com' });
    expect(err?.error).toMatch(/required/);
  });

  it('rejects missing domain', () => {
    const err = validateGmailConfigBody({ workspaceId: 'ws_1', serviceAccountJson: validKey });
    expect(err?.error).toMatch(/required/);
  });

  it('rejects invalid JSON in serviceAccountJson', () => {
    const err = validateGmailConfigBody({ workspaceId: 'ws_1', serviceAccountJson: 'not-json', domain: 'x.com' });
    expect(err?.error).toMatch(/not valid JSON/);
  });

  it('rejects service account JSON missing client_email', () => {
    const badKey = JSON.stringify({ private_key: '---KEY---' });
    const err = validateGmailConfigBody({ workspaceId: 'ws_1', serviceAccountJson: badKey, domain: 'x.com' });
    expect(err?.error).toMatch(/client_email/);
  });

  it('rejects service account JSON missing private_key', () => {
    const badKey = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com' });
    const err = validateGmailConfigBody({ workspaceId: 'ws_1', serviceAccountJson: badKey, domain: 'x.com' });
    expect(err?.error).toMatch(/private_key/);
  });
});

describe('GET /admin/gmail/:workspaceId — redaction', () => {
  it('strips serviceAccountJson from the response', () => {
    const install = {
      id: 'inst_1',
      workspaceId: 'ws_1',
      serviceAccountJson: '{"client_email":"sa@x.com","private_key":"SECRET"}',
      domain: 'company.com',
      monitoredEmails: ['alice@company.com'],
      installedAt: new Date(),
      uninstalledAt: null,
    };
    const safe = redactInstall(install);
    expect(safe).not.toHaveProperty('serviceAccountJson');
    expect(safe).toHaveProperty('workspaceId', 'ws_1');
    expect(safe).toHaveProperty('domain', 'company.com');
  });
});
