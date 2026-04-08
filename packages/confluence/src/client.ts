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
    status: 'draft',
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
