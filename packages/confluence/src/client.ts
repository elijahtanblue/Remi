/**
 * Confluence Cloud REST API client.
 * Auth: OAuth 2.0 (3LO). Access tokens are stored per workspace install.
 *
 * Confluence storage format docs:
 * https://developer.atlassian.com/cloud/confluence/confluence-storage-format/
 */

export interface CreatePageParams {
  cloudId: string;
  accessToken: string;
  spaceKey: string;
  title: string;
  body: string; // Confluence storage format
  parentPageId?: string;
}

export interface CreatedPage {
  id: string;
  title: string;
  _links: { webui: string; base: string };
}

export async function refreshConfluenceToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Confluence token refresh failed ${res.status}: ${text}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  return { accessToken: data.access_token, expiresAt };
}

export async function createConfluencePage(params: CreatePageParams): Promise<CreatedPage> {
  const { cloudId, accessToken, spaceKey, title, body, parentPageId } = params;

  const payload: Record<string, unknown> = {
    type: 'page',
    title,
    space: { key: spaceKey },
    body: {
      storage: {
        value: body,
        representation: 'storage',
      },
    },
    status: 'current',
  };

  if (parentPageId) {
    payload.ancestors = [{ id: parentPageId }];
  }

  const res = await fetch(
    `https://api.atlassian.com/ex/confluence/${cloudId}/rest/api/content`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Confluence API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<CreatedPage>;
}

export async function updateConfluencePage(params: {
  cloudId: string;
  accessToken: string;
  pageId: string;
  title: string;
  body: string;
  currentVersion: number;
}): Promise<CreatedPage> {
  const { cloudId, accessToken, pageId, title, body, currentVersion } = params;

  const buildPayload = (version: number) => ({
    type: 'page',
    title,
    version: { number: version },
    body: { storage: { value: body, representation: 'storage' } },
    status: 'current',
  });

  const res = await fetch(
    `https://api.atlassian.com/ex/confluence/${cloudId}/rest/api/content/${pageId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(buildPayload(currentVersion + 1)),
    },
  );

  if (res.status === 409) {
    // Version conflict — re-fetch the current version and retry once
    const metaRes = await fetch(
      `https://api.atlassian.com/ex/confluence/${cloudId}/rest/api/content/${pageId}?expand=version`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
    );
    if (!metaRes.ok) throw new Error(`Confluence version fetch failed ${metaRes.status}`);
    const meta = await metaRes.json() as { version: { number: number } };
    const retryRes = await fetch(
      `https://api.atlassian.com/ex/confluence/${cloudId}/rest/api/content/${pageId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(buildPayload(meta.version.number + 1)),
      },
    );
    if (!retryRes.ok) {
      const text = await retryRes.text().catch(() => '');
      throw new Error(`Confluence update retry failed ${retryRes.status}: ${text}`);
    }
    return retryRes.json() as Promise<CreatedPage>;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Confluence API update error ${res.status}: ${text}`);
  }

  return res.json() as Promise<CreatedPage>;
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 * Called during the OAuth callback flow.
 */
export async function exchangeConfluenceCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken: string; cloudId: string; siteUrl: string; scopes: string[] }> {
  const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    throw new Error(`Confluence token exchange failed ${tokenRes.status}: ${text}`);
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    scope: string;
  };

  // Fetch the accessible resources to get cloudId + siteUrl
  const resourcesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
  });

  if (!resourcesRes.ok) {
    throw new Error(`Confluence accessible-resources failed ${resourcesRes.status}`);
  }

  const resources = await resourcesRes.json() as Array<{ id: string; url: string }>;
  const site = resources[0];
  if (!site) throw new Error('No Confluence sites found for this OAuth token');

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    cloudId: site.id,
    siteUrl: site.url,
    scopes: tokens.scope.split(' '),
  };
}
