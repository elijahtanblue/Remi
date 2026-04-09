# Cumulative Snapshots + Proactive Doc Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Confluence write fix, cumulative strikethrough snapshots (Option A), and proactive handoff doc generation on ticket Done (Option C).

**Architecture:** A DB migration adds observation state tracking (`active`/`superseded`) and Confluence page versioning. Stage 2 of the memory pipeline reconciles observation state after each snapshot. The doc worker creates-or-updates a single canonical Confluence page per issue+docType rather than always creating new pages. The Jira event handler enqueues a handoff doc job whenever a ticket moves to `statusCategory === 'done'`.

**Tech Stack:** Prisma (schema + migration), Vitest (tests), TypeScript, Atlassian Confluence REST API, Slack Web API, pnpm workspaces / turbo.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/db/prisma/schema.prisma` | Modify | Add `state`/`supersededAt` to `MemoryObservation`; `tokenExpiresAt`/`defaultSpaceKey` to `ConfluenceWorkspaceInstall`; `confluenceVersion`/`updatedAt` to `ConfluencePage` |
| `packages/shared/src/types/events.ts` | Modify | Add `triggerChannelId` + `autoTriggered` to `DocGenerateJobMessage.payload`; make `replyChannelId` optional |
| `apps/worker/src/config.ts` | Modify | Add `CONFLUENCE_CLIENT_ID` + `CONFLUENCE_CLIENT_SECRET` env vars |
| `packages/confluence/src/client.ts` | Modify | Add `refreshConfluenceToken`, `updateConfluencePage`; fix `status: 'draft'` → `'current'`; export new fns |
| `packages/confluence/src/index.ts` | Modify | Export new client functions |
| `packages/db/src/repositories/confluence.repo.ts` | Modify | Add `findConfluencePage`, `updateConfluenceInstallToken` |
| `packages/db/src/index.ts` | Modify | Export new repo functions |
| `packages/memory-engine/src/pipeline/stage2-snapshot.ts` | Modify | Add `reconcileObservationStates`; call it at end of `runStage2` |
| `packages/confluence/src/types.ts` | Modify | Add `superseded: boolean` + `supersededAt?: Date` to observation arrays in `IssueDocContext` |
| `packages/confluence/src/build-context.ts` | Modify | `findFirst` → `findMany`; populate `superseded`/`supersededAt` on observations |
| `packages/confluence/src/page-writer.ts` | Modify | Render superseded items as `<s>strikethrough</s>` after active items in each section |
| `apps/worker/src/handlers/doc-generate-jobs.ts` | Modify | Token refresh; create-or-update page; auto-trigger Slack wording |
| `apps/worker/src/handlers/jira-events.ts` | Modify | Done status trigger; channel resolution; Confluence guard |
| `tests/confluence/client.test.ts` | Create | Tests for `refreshConfluenceToken`, `updateConfluencePage`, `status: 'current'` |
| `tests/confluence/build-context.test.ts` | Create | Tests for multi-unit aggregation + superseded field population |
| `tests/confluence/page-writer.test.ts` | Modify | Add tests for strikethrough rendering of superseded items |
| `tests/memory-engine/stage2-snapshot.test.ts` | Modify | Add tests for `reconcileObservationStates` |
| `tests/worker/jira-events-doc-trigger.test.ts` | Create | Tests for done-trigger enqueue logic |

---

## Task 1: Schema Migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add fields to schema**

Open `packages/db/prisma/schema.prisma` and make the following three edits.

In `model MemoryObservation` (around line 527), add after `extractedAt DateTime @default(now())`:
```prisma
state        String    @default("active")  // 'active' | 'superseded'
supersededAt DateTime?
```

In `model ConfluenceWorkspaceInstall` (around line 373), add after `installedAt DateTime @default(now())`:
```prisma
tokenExpiresAt  DateTime?
defaultSpaceKey String?
```

In `model ConfluencePage` (around line 390), add after `createdAt DateTime @default(now())`:
```prisma
confluenceVersion Int      @default(1)
updatedAt         DateTime @updatedAt
```

- [ ] **Step 2: Generate and apply migration**

```bash
cd packages/db && pnpm prisma migrate dev --name add_observation_state_and_confluence_versioning
```

Expected: migration file created under `packages/db/prisma/migrations/`, Prisma client regenerated with no errors.

- [ ] **Step 3: Verify types compile**

```bash
cd ../.. && pnpm typecheck
```

Expected: zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat: add observation state, confluence versioning, and token expiry fields"
```

---

## Task 2: Extend DocGenerateJobMessage Shared Type

**Files:**
- Modify: `packages/shared/src/types/events.ts:103-113`

- [ ] **Step 1: Update the DocGenerateJobMessage type**

Replace the `DocGenerateJobMessage` interface with:
```ts
export interface DocGenerateJobMessage extends BaseQueueMessage {
  type: 'doc_generate_job';
  payload: {
    issueId: string;
    issueKey: string;
    docType: 'handoff' | 'summary' | 'escalation';
    /** Set for manual /doc commands — channel to post the reply into */
    replyChannelId?: string;
    replyThreadTs?: string;
    /** Set for auto-triggered docs — most recently active linked Slack channel */
    triggerChannelId?: string | null;
    /** True when generated automatically by a Jira status change, not a /doc command */
    autoTriggered?: boolean;
  };
}
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/events.ts
git commit -m "feat: add triggerChannelId and autoTriggered to DocGenerateJobMessage"
```

---

## Task 3: Add Confluence Env Vars to Worker Config

**Files:**
- Modify: `apps/worker/src/config.ts`

The worker needs `CONFLUENCE_CLIENT_ID` and `CONFLUENCE_CLIENT_SECRET` to refresh OAuth tokens. These already exist in `apps/api/src/config.ts` — the worker just needs the same vars.

- [ ] **Step 1: Add vars to worker config schema**

In `apps/worker/src/config.ts`, add inside the `z.object({...})`:
```ts
CONFLUENCE_CLIENT_ID: z.string().optional(),
CONFLUENCE_CLIENT_SECRET: z.string().optional(),
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/config.ts
git commit -m "feat: add confluence client credentials to worker config"
```

---

## Task 4: Confluence Client — Token Refresh, Page Update, Fix Draft Status

**Files:**
- Modify: `packages/confluence/src/client.ts`
- Modify: `packages/confluence/src/index.ts`
- Create: `tests/confluence/client.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/confluence/client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the pure logic only — actual fetch calls are mocked.
// refreshConfluenceToken and updateConfluencePage are tested with vi.stubGlobal('fetch').

describe('refreshConfluenceToken', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns accessToken and expiresAt on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-token', expires_in: 3600 }),
    }));
    const { refreshConfluenceToken } = await import('../../packages/confluence/src/client.js');
    const result = await refreshConfluenceToken({
      refreshToken: 'rtoken',
      clientId: 'cid',
      clientSecret: 'csec',
    });
    expect(result.accessToken).toBe('new-token');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }));
    const { refreshConfluenceToken } = await import('../../packages/confluence/src/client.js');
    await expect(
      refreshConfluenceToken({ refreshToken: 'r', clientId: 'c', clientSecret: 's' })
    ).rejects.toThrow('401');
  });
});

describe('updateConfluencePage', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('sends PUT with incremented version number', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'p1', title: 'T', _links: { webui: '/p1', base: '' } }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const { updateConfluencePage } = await import('../../packages/confluence/src/client.js');
    await updateConfluencePage({
      cloudId: 'cloud1',
      accessToken: 'tok',
      pageId: 'p1',
      title: 'T',
      body: '<p>body</p>',
      currentVersion: 3,
    });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(opts.body as string);
    expect(sent.version.number).toBe(4);
    expect(sent.status).toBe('current');
  });

  it('throws on non-2xx non-409 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    }));
    const { updateConfluencePage } = await import('../../packages/confluence/src/client.js');
    await expect(
      updateConfluencePage({ cloudId: 'c', accessToken: 't', pageId: 'p', title: 'T', body: '', currentVersion: 1 })
    ).rejects.toThrow('403');
  });
});

describe('createConfluencePage', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('sends status: current (not draft)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'p1', title: 'T', _links: { webui: '/p1', base: '' } }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const { createConfluencePage } = await import('../../packages/confluence/src/client.js');
    await createConfluencePage({
      cloudId: 'c', accessToken: 't', spaceKey: 'ENG', title: 'T', body: '<p>b</p>',
    });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(opts.body as string);
    expect(sent.status).toBe('current');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/confluence/client.test.ts
```

Expected: FAIL — `refreshConfluenceToken` and `updateConfluencePage` are not exported.

- [ ] **Step 3: Implement the changes in client.ts**

Add `refreshConfluenceToken` before `createConfluencePage`. Also add `updateConfluencePage` after it. Fix `status: 'draft'` → `'current'`.

The full updated `packages/confluence/src/client.ts`:
```ts
/**
 * Confluence Cloud REST API client.
 * Auth: OAuth 2.0 (3LO). Access tokens are stored per workspace install.
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
    body: { storage: { value: body, representation: 'storage' } },
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
```

- [ ] **Step 4: Export new functions from package index**

In `packages/confluence/src/index.ts`, replace the client line:
```ts
export { createConfluencePage, exchangeConfluenceCode, refreshConfluenceToken, updateConfluencePage } from './client.js';
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
pnpm test tests/confluence/client.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/confluence/src/client.ts packages/confluence/src/index.ts tests/confluence/client.test.ts
git commit -m "feat: add token refresh and page update to confluence client; fix draft status"
```

---

## Task 5: Confluence DB Repo — findConfluencePage + Token Update

**Files:**
- Modify: `packages/db/src/repositories/confluence.repo.ts`
- Modify: `packages/db/src/index.ts`

The worker needs to find an existing Confluence page for an issue (to update it) and to update the stored access token after refresh.

- [ ] **Step 1: Add two functions to confluence.repo.ts**

Append to `packages/db/src/repositories/confluence.repo.ts`:
```ts
/**
 * Find the canonical Confluence page for an issue + doc type combination.
 * Returns null if no page has been created yet.
 */
export async function findConfluencePage(
  prisma: PrismaClient,
  issueId: string,
  docType: string,
) {
  return prisma.confluencePage.findFirst({
    where: { issueId, docType },
    orderBy: { createdAt: 'asc' }, // oldest = canonical
  });
}

/**
 * Update the stored access token and its expiry after a refresh.
 */
export async function updateConfluenceInstallToken(
  prisma: PrismaClient,
  workspaceId: string,
  accessToken: string,
  tokenExpiresAt: Date,
) {
  return prisma.confluenceWorkspaceInstall.update({
    where: { workspaceId },
    data: { accessToken, tokenExpiresAt },
  });
}
```

Note: `packages/db/src/index.ts` already re-exports everything via `export * from './repositories/index.js'` → `export * from './confluence.repo.js'`, so no manual export change is needed.

- [ ] **Step 2: Verify types compile**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/repositories/confluence.repo.ts
git commit -m "feat: add findConfluencePage and updateConfluenceInstallToken to db repo"
```

---

## Task 6: Stage 2 — Reconcile Observation States After Snapshot

**Files:**
- Modify: `packages/memory-engine/src/pipeline/stage2-snapshot.ts`
- Modify: `tests/memory-engine/stage2-snapshot.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/memory-engine/stage2-snapshot.test.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import { vi } from 'vitest';
import { reconcileObservationStates } from '../../packages/memory-engine/src/pipeline/stage2-snapshot.js';

describe('reconcileObservationStates', () => {
  it('marks observations as superseded when their content is absent from the new snapshot', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([
      { id: 'obs-1', category: 'blocker', content: 'OAuth credentials not received', state: 'active' },
      { id: 'obs-2', category: 'blocker', content: 'Auth service down', state: 'active' },
    ]);
    const prisma = { memoryObservation: { findMany, updateMany } } as unknown as PrismaClient;

    const snapshot = {
      headline: '',
      currentState: '',
      keyDecisions: [],
      openActions: [],
      // 'Auth service down' is still present; 'OAuth credentials not received' was dropped
      blockers: ['Auth service down'],
      openQuestions: [],
      owners: [],
      dataSources: [],
      confidence: 0.8,
    };

    await reconcileObservationStates(prisma, 'unit-1', snapshot);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['obs-1'] } },
      data: { state: 'superseded', supersededAt: expect.any(Date) },
    });
  });

  it('does not call updateMany when all active observations are still in the snapshot', async () => {
    const updateMany = vi.fn();
    const findMany = vi.fn().mockResolvedValue([
      { id: 'obs-1', category: 'blocker', content: 'Auth service down', state: 'active' },
    ]);
    const prisma = { memoryObservation: { findMany, updateMany } } as unknown as PrismaClient;

    await reconcileObservationStates(prisma, 'unit-1', {
      headline: '', currentState: '', keyDecisions: [], openActions: [],
      blockers: ['Auth service down'], openQuestions: [], owners: [], dataSources: [], confidence: 0.9,
    });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not supersede observations in non-tracked categories (e.g. status_update)', async () => {
    const updateMany = vi.fn();
    const findMany = vi.fn().mockResolvedValue([
      { id: 'obs-1', category: 'status_update', content: 'Moved to in progress', state: 'active' },
    ]);
    const prisma = { memoryObservation: { findMany, updateMany } } as unknown as PrismaClient;

    await reconcileObservationStates(prisma, 'unit-1', {
      headline: '', currentState: '', keyDecisions: [], openActions: [],
      blockers: [], openQuestions: [], owners: [], dataSources: [], confidence: 0.8,
    });

    expect(updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/memory-engine/stage2-snapshot.test.ts
```

Expected: FAIL — `reconcileObservationStates` not exported.

- [ ] **Step 3: Implement reconcileObservationStates in stage2-snapshot.ts**

Add the following function and helper to `packages/memory-engine/src/pipeline/stage2-snapshot.ts` (before `runStage2`):

```ts
const RECONCILED_CATEGORIES = new Set(['blocker', 'decision', 'open_question', 'action_item']);

function normalizeContent(s: string): string {
  return s.toLowerCase().replace(/\W+/g, ' ').trim();
}

/**
 * After a new snapshot is produced, mark active observations as 'superseded'
 * if their content no longer appears in the snapshot output.
 *
 * Stage 2 explicitly drops items it considers resolved or no longer relevant.
 * This function writes that decision back to the observations table so that
 * the doc renderer can show them as strikethrough.
 *
 * Note: uses substring matching after normalisation. Reworded-but-equivalent
 * items may not be detected. This is a known V1 limitation; see OUT_OF_SCOPE.md
 * (Confidence Level for Observation Resolution).
 */
export async function reconcileObservationStates(
  prisma: PrismaClient,
  memoryUnitId: string,
  snapshot: SnapshotResult,
): Promise<void> {
  const activeObs = await prisma.memoryObservation.findMany({
    where: { memoryUnitId, state: 'active' },
  });

  const snapshotContents = [
    ...snapshot.blockers,
    ...snapshot.keyDecisions,
    ...snapshot.openQuestions,
    ...snapshot.openActions.map((a) => a.description),
  ].map(normalizeContent);

  const toSupersede = activeObs.filter((obs) => {
    if (!RECONCILED_CATEGORIES.has(obs.category)) return false;
    const normalized = normalizeContent(obs.content);
    return !snapshotContents.some(
      (sc) => sc.includes(normalized) || normalized.includes(sc),
    );
  });

  if (toSupersede.length === 0) return;

  await prisma.memoryObservation.updateMany({
    where: { id: { in: toSupersede.map((o) => o.id) } },
    data: { state: 'superseded', supersededAt: new Date() },
  });
}
```

- [ ] **Step 4: Call reconcileObservationStates at the end of runStage2**

In `runStage2`, after `const snapshot = await createSnapshot(...)`, add:
```ts
// Reconcile: mark observations dropped by this snapshot as superseded
await reconcileObservationStates(prisma, memoryUnitId, result).catch((err) => {
  console.warn(`[stage2] reconcileObservationStates failed for ${memoryUnitId}:`, err);
  // Non-fatal — snapshot was created; reconciliation will retry on next run
});
```

- [ ] **Step 5: Add PrismaClient import**

`runStage2` already receives `prisma: PrismaClient` — ensure `PrismaClient` is imported at the top of the file:
```ts
import type { PrismaClient } from '@prisma/client';
```

- [ ] **Step 6: Run tests and confirm they pass**

```bash
pnpm test tests/memory-engine/stage2-snapshot.test.ts
```

Expected: all tests PASS (existing + 3 new).

- [ ] **Step 7: Commit**

```bash
git add packages/memory-engine/src/pipeline/stage2-snapshot.ts tests/memory-engine/stage2-snapshot.test.ts
git commit -m "feat: reconcile observation states after stage 2 snapshot"
```

---

## Task 7: Extend IssueDocContext Type + Fix build-context.ts

**Files:**
- Modify: `packages/confluence/src/types.ts`
- Modify: `packages/confluence/src/build-context.ts`
- Create: `tests/confluence/build-context.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/confluence/build-context.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

// We test the behaviour of buildIssueDocContext by mocking prisma directly.
// The key behaviours under test:
//   1. Aggregates observations across ALL memory units for the issue (not just the first).
//   2. Sets superseded: true for observations with state === 'superseded'.
//   3. Sets superseded: false for observations with state === 'active'.

const makeObs = (overrides: object) => ({
  id: 'obs-1',
  category: 'blocker',
  content: 'Some blocker',
  sourceApp: 'slack',
  extractedAt: new Date('2026-04-01'),
  state: 'active',
  supersededAt: null,
  ...overrides,
});

const basePrisma = {
  issue: {
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 'issue-1',
      jiraIssueKey: 'KAN-1',
      title: 'Test issue',
      status: 'Done',
      statusCategory: 'done',
      assigneeDisplayName: 'Alice',
      priority: 'High',
      department: null,
      departmentId: null,
    }),
  },
  issueEvent: { findMany: vi.fn().mockResolvedValue([]) },
  memoryUnit: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'unit-1',
        observations: [makeObs({ id: 'obs-1', category: 'blocker', state: 'active' })],
      },
      {
        id: 'unit-2',
        observations: [makeObs({ id: 'obs-2', category: 'decision', content: 'Use JWT', state: 'superseded', supersededAt: new Date('2026-04-08') })],
      },
    ]),
  },
  issueThreadLink: { findMany: vi.fn().mockResolvedValue([]) },
  issueEmailLink: { findMany: vi.fn().mockResolvedValue([]) },
};

// buildIssueDocContext accepts prisma as its first argument, so we pass
// basePrisma directly — no vi.mock needed.
describe('buildIssueDocContext', () => {
  it('aggregates observations from all memory units', async () => {
    const { buildIssueDocContext } = await import('../../packages/confluence/src/build-context.js');
    const ctx = await buildIssueDocContext(basePrisma as any, 'issue-1', 'handoff');
    expect(ctx.blockers).toHaveLength(1);
    expect(ctx.keyDecisions).toHaveLength(1);
  });

  it('marks superseded observations correctly', async () => {
    const { buildIssueDocContext } = await import('../../packages/confluence/src/build-context.js');
    const ctx = await buildIssueDocContext(basePrisma as any, 'issue-1', 'handoff');
    expect(ctx.blockers[0]?.superseded).toBe(false);
    expect(ctx.keyDecisions[0]?.superseded).toBe(true);
    expect(ctx.keyDecisions[0]?.supersededAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/confluence/build-context.test.ts
```

Expected: FAIL — `superseded` property does not exist on the type.

- [ ] **Step 3: Update IssueDocContext type**

In `packages/confluence/src/types.ts`, update `keyDecisions`, `blockers`, and `openQuestions` to add the superseded fields:
```ts
keyDecisions: Array<{
  content: string;
  source: string;
  citedAt: Date;
  superseded: boolean;
  supersededAt?: Date;
}>;
blockers: Array<{
  content: string;
  source: string;
  citedAt: Date;
  superseded: boolean;
  supersededAt?: Date;
}>;
openQuestions: Array<{
  content: string;
  source: string;
  citedAt: Date;
  superseded: boolean;
  supersededAt?: Date;
}>;
```

- [ ] **Step 4: Update build-context.ts**

Replace the `memoryUnit` block (lines 56–79 of `packages/confluence/src/build-context.ts`) with the multi-unit version:

```ts
// ── Key decisions, blockers, open questions ───────────────────────────────
// Aggregate observations from ALL memory units linked to this issue.
const memoryUnits = await prisma.memoryUnit.findMany({
  where: { issueId },
  include: {
    observations: { orderBy: { extractedAt: 'desc' } },
  },
});

const allObservations = memoryUnits.flatMap((u) => u.observations);

const toObsItem = (o: (typeof allObservations)[number]) => ({
  content: o.content,
  source: o.sourceApp ?? 'slack',
  citedAt: o.extractedAt,
  superseded: o.state === 'superseded',
  supersededAt: o.supersededAt ?? undefined,
});

const keyDecisions = allObservations
  .filter((o) => o.category === 'decision')
  .map(toObsItem);

const blockers = allObservations
  .filter((o) => o.category === 'blocker')
  .map(toObsItem);

const openQuestions = allObservations
  .filter((o) => o.category === 'open_question')
  .map(toObsItem);
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
pnpm test tests/confluence/build-context.test.ts
```

Expected: both tests PASS.

- [ ] **Step 6: Run existing page-writer tests to confirm no regressions**

```bash
pnpm test tests/confluence/page-writer.test.ts
```

Expected: all existing tests PASS (the type change is additive — `baseContext` in existing tests will need `superseded: false` added to each observation).

If there are type errors in `page-writer.test.ts`, update the `baseContext` fixture to add `superseded: false` to each item in `keyDecisions`, `blockers`, and `openQuestions`.

- [ ] **Step 7: Commit**

```bash
git add packages/confluence/src/types.ts packages/confluence/src/build-context.ts tests/confluence/build-context.test.ts tests/confluence/page-writer.test.ts
git commit -m "feat: extend IssueDocContext with superseded fields; aggregate all memory units"
```

---

## Task 8: Page Renderer — Strikethrough for Superseded Items

**Files:**
- Modify: `packages/confluence/src/page-writer.ts`
- Modify: `tests/confluence/page-writer.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/confluence/page-writer.test.ts`:
```ts
describe('renderConfluencePage — superseded items', () => {
  it('renders active blockers normally', () => {
    const ctx: IssueDocContext = {
      ...baseContext,
      blockers: [{ content: 'Active blocker', source: 'slack', citedAt: new Date('2026-04-01'), superseded: false }],
    };
    const { body } = renderConfluencePage(ctx);
    expect(body).toContain('Active blocker');
    expect(body).not.toContain('<s>');
  });

  it('renders superseded blockers with strikethrough', () => {
    const ctx: IssueDocContext = {
      ...baseContext,
      blockers: [{ content: 'Fixed blocker', source: 'slack', citedAt: new Date('2026-04-01'), superseded: true, supersededAt: new Date('2026-04-08') }],
    };
    const { body } = renderConfluencePage(ctx);
    expect(body).toContain('<s>');
    expect(body).toContain('Fixed blocker');
  });

  it('renders active items before superseded items within a section', () => {
    const ctx: IssueDocContext = {
      ...baseContext,
      blockers: [
        { content: 'Still blocked', source: 'slack', citedAt: new Date('2026-04-02'), superseded: false },
        { content: 'Was blocked', source: 'slack', citedAt: new Date('2026-04-01'), superseded: true, supersededAt: new Date('2026-04-08') },
      ],
    };
    const { body } = renderConfluencePage(ctx);
    const activePos = body.indexOf('Still blocked');
    const supersededPos = body.indexOf('Was blocked');
    expect(activePos).toBeLessThan(supersededPos);
  });

  it('still shows the Blockers section if all items are superseded', () => {
    const ctx: IssueDocContext = {
      ...baseContext,
      blockers: [{ content: 'Old blocker', source: 'slack', citedAt: new Date('2026-04-01'), superseded: true, supersededAt: new Date('2026-04-08') }],
    };
    const { body } = renderConfluencePage(ctx);
    expect(body).toContain('Blockers');
  });
});
```

Also update the `baseContext` fixture in the file to include `superseded: false` on all existing observation items:
```ts
keyDecisions: [
  { content: 'We will use JWT refresh tokens with 15-minute expiry', source: 'slack', citedAt: new Date('2026-04-02T09:00:00Z'), superseded: false },
],
blockers: [
  { content: 'Waiting on security team review of token rotation approach', source: 'slack', citedAt: new Date('2026-04-03T11:00:00Z'), superseded: false },
],
```

- [ ] **Step 2: Run to confirm failures**

```bash
pnpm test tests/confluence/page-writer.test.ts
```

Expected: new strikethrough tests FAIL; existing tests PASS (since we fixed the baseContext).

- [ ] **Step 3: Update renderConfluencePage in page-writer.ts**

In `packages/confluence/src/page-writer.ts`, replace the three section renderers that handle `keyDecisions`, `blockers`, and `openQuestions`.

Change the `renderObsList` helper — add it as a new local function:
```ts
function renderObsList(
  items: Array<{ content: string; source: string; citedAt: Date; superseded: boolean; supersededAt?: Date }>,
): string {
  const active = items.filter((i) => !i.superseded);
  const superseded = items.filter((i) => i.superseded);
  const ordered = [...active, ...superseded];
  return list(
    ordered.map((item) => {
      const text = `${esc(item.content)} <em>(via ${esc(item.source)}, ${fmt(item.citedAt)})</em>`;
      return item.superseded ? `<s>${text}</s>` : text;
    }),
  );
}
```

Then update the three section render calls:

Replace the Key Decisions section:
```ts
if (ctx.keyDecisions.length > 0) {
  sections.push(section('Key Decisions', renderObsList(ctx.keyDecisions)));
}
```

Replace the Blockers section:
```ts
if (ctx.blockers.length > 0) {
  sections.push(section('Blockers', renderObsList(ctx.blockers)));
}
```

Replace the Open Questions section:
```ts
if (ctx.openQuestions.length > 0) {
  sections.push(section('Open Questions', renderObsList(ctx.openQuestions)));
}
```

- [ ] **Step 4: Run all confluence tests**

```bash
pnpm test tests/confluence/
```

Expected: all tests PASS including the 4 new strikethrough tests.

- [ ] **Step 5: Commit**

```bash
git add packages/confluence/src/page-writer.ts tests/confluence/page-writer.test.ts
git commit -m "feat: render superseded observations as strikethrough in confluence pages"
```

---

## Task 9: Doc Generate Worker — Token Refresh + Create-or-Update

**Files:**
- Modify: `apps/worker/src/handlers/doc-generate-jobs.ts`

- [ ] **Step 1: Replace the handler with the full updated version**

Rewrite `apps/worker/src/handlers/doc-generate-jobs.ts` entirely:
```ts
import type { DocGenerateJobMessage } from '@remi/shared';
import { prisma, findConfluencePage, updateConfluenceInstallToken } from '@remi/db';
import {
  buildIssueDocContext,
  renderConfluencePage,
  createConfluencePage,
  updateConfluencePage,
  refreshConfluenceToken,
} from '@remi/confluence';
import { WebClient } from '@slack/web-api';
import { config } from '../config.js';

export async function handleDocGenerateJob(message: DocGenerateJobMessage): Promise<void> {
  const { workspaceId, payload } = message;
  const { issueId, issueKey, docType, replyChannelId, replyThreadTs, triggerChannelId, autoTriggered } = payload;

  // 1. Fetch Confluence install
  const confluenceInstall = await prisma.confluenceWorkspaceInstall.findUnique({
    where: { workspaceId },
  });
  if (!confluenceInstall) {
    console.warn(`[doc-generate] No Confluence install for workspace ${workspaceId}, skipping`);
    return;
  }

  // 2. Refresh token if expired (or if expiry is unknown, refresh proactively)
  let accessToken = confluenceInstall.accessToken;
  const isExpired =
    !confluenceInstall.tokenExpiresAt ||
    confluenceInstall.tokenExpiresAt.getTime() < Date.now() + 60_000; // refresh 60s early

  if (isExpired && config.CONFLUENCE_CLIENT_ID && config.CONFLUENCE_CLIENT_SECRET) {
    const refreshed = await refreshConfluenceToken({
      refreshToken: confluenceInstall.refreshToken,
      clientId: config.CONFLUENCE_CLIENT_ID,
      clientSecret: config.CONFLUENCE_CLIENT_SECRET,
    });
    accessToken = refreshed.accessToken;
    await updateConfluenceInstallToken(prisma, workspaceId, accessToken, refreshed.expiresAt);
    console.log(`[doc-generate] Refreshed Confluence token for workspace ${workspaceId}`);
  }

  // 3. Fetch Slack install for posting result
  const slackInstall = await prisma.slackWorkspaceInstall.findFirst({
    where: { workspaceId },
  });
  if (!slackInstall?.botToken) {
    console.warn(`[doc-generate] No Slack bot token for workspace ${workspaceId}, skipping`);
    return;
  }

  // 4. Build context and render
  const ctx = await buildIssueDocContext(prisma, issueId, docType);
  const { title, body } = renderConfluencePage(ctx);

  // 5. Determine space key
  const spaceKey = confluenceInstall.defaultSpaceKey ?? issueKey.split('-')[0] ?? 'REMI';

  // 6. Create or update the canonical Confluence page for this issue+docType
  let pageUrl: string;
  const existing = await findConfluencePage(prisma, issueId, docType);

  if (existing) {
    const updatedPage = await updateConfluencePage({
      cloudId: confluenceInstall.cloudId,
      accessToken,
      pageId: existing.confluencePageId,
      title,
      body,
      currentVersion: existing.confluenceVersion,
    });
    await prisma.confluencePage.update({
      where: { id: existing.id },
      data: {
        title,
        pageUrl: `${confluenceInstall.siteUrl}/wiki${updatedPage._links.webui}`,
        confluenceVersion: existing.confluenceVersion + 1,
      },
    });
    pageUrl = `${confluenceInstall.siteUrl}/wiki${updatedPage._links.webui}`;
    console.log(`[doc-generate] Updated Confluence page for ${issueKey}: ${pageUrl}`);
  } else {
    const newPage = await createConfluencePage({
      cloudId: confluenceInstall.cloudId,
      accessToken,
      spaceKey,
      title,
      body,
    });
    pageUrl = `${confluenceInstall.siteUrl}/wiki${newPage._links.webui}`;
    await prisma.confluencePage.create({
      data: {
        workspaceId,
        installId: confluenceInstall.id,
        issueId,
        departmentId: (await prisma.issue.findUnique({ where: { id: issueId } }))?.departmentId ?? null,
        confluencePageId: newPage.id,
        spaceKey,
        title,
        pageUrl,
        docType,
        confluenceVersion: 1,
      },
    });
    console.log(`[doc-generate] Created Confluence page for ${issueKey}: ${pageUrl}`);
  }

  // 7. Post result to Slack
  const slackClient = new WebClient(slackInstall.botToken);
  const docLabel = docType.charAt(0).toUpperCase() + docType.slice(1);

  if (autoTriggered && triggerChannelId) {
    // Auto-triggered: post to the most recently active linked channel
    await slackClient.chat.postMessage({
      channel: triggerChannelId,
      text: `:white_check_mark: *${issueKey}* moved to Done — ${docLabel.toLowerCase()} doc updated: ${pageUrl}`,
    });
  } else if (replyChannelId) {
    // Manual /doc command: reply in the originating channel/thread
    await slackClient.chat.postMessage({
      channel: replyChannelId,
      ...(replyThreadTs ? { thread_ts: replyThreadTs } : {}),
      text: `:white_check_mark: *${docLabel} doc* for *${issueKey}* is ready: ${pageUrl}`,
    });
  }
}
```

- [ ] **Step 2: Run the full test suite to check for regressions**

```bash
pnpm test
```

Expected: all tests PASS. (doc-generate-jobs.ts has no dedicated unit tests yet — the integration test comes in Task 11.)

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/handlers/doc-generate-jobs.ts
git commit -m "feat: token refresh, create-or-update, and auto-trigger wording in doc worker"
```

---

## Task 10: Jira Events Handler — Proactive Done Trigger

**Files:**
- Modify: `apps/worker/src/handlers/jira-events.ts`
- Create: `tests/worker/jira-events-doc-trigger.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/worker/jira-events-doc-trigger.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueNames } from '@remi/shared';

// We test the doc trigger logic in isolation using a minimal mock of the dependencies
// that handleJiraEvent uses. The full handler is complex; we test only the doc-trigger path.

const makeWorkspace = () => ({
  id: 'ws-1',
  jiraInstalls: [{ jiraSiteUrl: 'https://test.atlassian.net', sharedSecret: 'secret' }],
});

const makeIssue = (statusCategory: string) => ({
  id: 'issue-1',
  jiraIssueKey: 'KAN-1',
  statusCategory,
});

describe('jira-events done trigger', () => {
  let queue: { send: ReturnType<typeof vi.fn> };
  let prisma: Record<string, unknown>;

  beforeEach(() => {
    queue = { send: vi.fn().mockResolvedValue(undefined) };
    prisma = {
      issueEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      jiraWorkspaceInstall: {
        findUnique: vi.fn().mockResolvedValue({ workspaceId: 'ws-1', jiraClientKey: 'ck-1', jiraSiteUrl: 'https://test.atlassian.net', sharedSecret: 'secret' }),
      },
      workspace: {
        findFirst: vi.fn().mockResolvedValue({ ...makeWorkspace(), jiraInstalls: [{ jiraSiteUrl: 'https://test.atlassian.net', sharedSecret: 'secret' }] }),
      },
      confluenceWorkspaceInstall: {
        findUnique: vi.fn().mockResolvedValue({ id: 'ci-1' }),
      },
      issueThreadLink: {
        findMany: vi.fn().mockResolvedValue([
          {
            thread: {
              channelId: 'C123',
              messages: [{ sentAt: new Date('2026-04-08T10:00:00Z') }],
            },
          },
        ]),
      },
      workspaceMemoryConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    vi.mock('@remi/db', () => ({ prisma, findWorkspaceByJiraClientKey: vi.fn().mockResolvedValue(makeWorkspace()), createIssueEvent: vi.fn().mockResolvedValue({ id: 'evt-1', processedAt: null }), upsertIssue: vi.fn().mockResolvedValue(makeIssue('done')), findLinksByIssueId: vi.fn().mockResolvedValue([]), getMemoryConfig: vi.fn().mockResolvedValue(null) }));
  });

  it('enqueues a doc_generate_job when status category is done and confluence is configured', async () => {
    const { handleJiraEvent } = await import('../../apps/worker/src/handlers/jira-events.js');
    await handleJiraEvent(
      {
        id: 'msg-1',
        idempotencyKey: 'key-1',
        workspaceId: 'ws-1',
        timestamp: new Date().toISOString(),
        type: 'jira_event',
        payload: {
          kind: 'issue_updated',
          jiraSiteId: 'ck-1',
          issueId: 'jira-issue-1',
          issueKey: 'KAN-1',
          webhookEventType: 'jira:issue_updated',
          rawEvent: {
            changelog: { items: [{ field: 'status', fromString: 'In Progress', toString: 'Done' }] },
            issue: { fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } },
          },
        },
      },
      queue as any,
    );

    const docCall = (queue.send.mock.calls as Array<[string, unknown]>).find(
      ([name]) => name === QueueNames.DOC_GENERATE_JOBS,
    );
    expect(docCall).toBeDefined();
    const msg = docCall![1] as { payload: { docType: string; autoTriggered: boolean; triggerChannelId: string } };
    expect(msg.payload.docType).toBe('handoff');
    expect(msg.payload.autoTriggered).toBe(true);
    expect(msg.payload.triggerChannelId).toBe('C123');
  });

  it('does not enqueue a doc job when confluence is not configured', async () => {
    (prisma.confluenceWorkspaceInstall as { findUnique: ReturnType<typeof vi.fn> }).findUnique
      .mockResolvedValue(null);
    const { handleJiraEvent } = await import('../../apps/worker/src/handlers/jira-events.js');
    await handleJiraEvent(
      {
        id: 'msg-2',
        idempotencyKey: 'key-2',
        workspaceId: 'ws-1',
        timestamp: new Date().toISOString(),
        type: 'jira_event',
        payload: {
          kind: 'issue_updated',
          jiraSiteId: 'ck-1',
          issueId: 'jira-issue-1',
          issueKey: 'KAN-1',
          webhookEventType: 'jira:issue_updated',
          rawEvent: {
            changelog: { items: [{ field: 'status', fromString: 'In Progress', toString: 'Done' }] },
            issue: { fields: { status: { name: 'Done', statusCategory: { key: 'done' } } } },
          },
        },
      },
      queue as any,
    );

    const docCalls = (queue.send.mock.calls as Array<[string, unknown]>).filter(
      ([name]) => name === QueueNames.DOC_GENERATE_JOBS,
    );
    expect(docCalls).toHaveLength(0);
  });

  it('does not enqueue a doc job when status category is not done', async () => {
    vi.mock('@remi/db', () => ({ prisma, findWorkspaceByJiraClientKey: vi.fn().mockResolvedValue(makeWorkspace()), createIssueEvent: vi.fn().mockResolvedValue({ id: 'evt-1', processedAt: null }), upsertIssue: vi.fn().mockResolvedValue(makeIssue('indeterminate')), findLinksByIssueId: vi.fn().mockResolvedValue([]), getMemoryConfig: vi.fn().mockResolvedValue(null) }));

    const { handleJiraEvent } = await import('../../apps/worker/src/handlers/jira-events.js');
    await handleJiraEvent(
      {
        id: 'msg-3',
        idempotencyKey: 'key-3',
        workspaceId: 'ws-1',
        timestamp: new Date().toISOString(),
        type: 'jira_event',
        payload: {
          kind: 'issue_updated',
          jiraSiteId: 'ck-1',
          issueId: 'jira-issue-1',
          issueKey: 'KAN-1',
          webhookEventType: 'jira:issue_updated',
          rawEvent: {
            changelog: { items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }] },
            issue: { fields: { status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } } },
          },
        },
      },
      queue as any,
    );

    const docCalls = (queue.send.mock.calls as Array<[string, unknown]>).filter(
      ([name]) => name === QueueNames.DOC_GENERATE_JOBS,
    );
    expect(docCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test tests/worker/jira-events-doc-trigger.test.ts
```

Expected: FAIL — doc trigger logic doesn't exist yet.

- [ ] **Step 3: Add done trigger to jira-events.ts**

In `apps/worker/src/handlers/jira-events.ts`, after the existing memory ingestion block (after the `// ── Memory ingestion trigger ──` section, before step 8), add:

```ts
  // ── Proactive doc trigger: auto-generate handoff doc when issue moves to Done ──
  if (
    derivedEventType === 'status_changed' &&
    issue.statusCategory === JiraStatusCategory.DONE
  ) {
    const confluenceInstall = await prisma.confluenceWorkspaceInstall.findUnique({
      where: { workspaceId: workspace.id },
    });

    if (confluenceInstall) {
      // Find the Slack channel with the most recently active linked thread
      const activeLinks = await prisma.issueThreadLink.findMany({
        where: { issueId: issue.id, unlinkedAt: null },
        include: {
          thread: {
            include: { messages: { orderBy: { sentAt: 'desc' }, take: 1 } },
          },
        },
      });

      const latestLink =
        activeLinks
          .filter((l) => l.thread.messages.length > 0)
          .sort(
            (a, b) =>
              b.thread.messages[0]!.sentAt.getTime() -
              a.thread.messages[0]!.sentAt.getTime(),
          )[0] ?? activeLinks[0] ?? null;

      const triggerChannelId = latestLink?.thread.channelId ?? null;

      await queue.send(QueueNames.DOC_GENERATE_JOBS, {
        id: uuidv4(),
        idempotencyKey: `doc:auto:${issue.id}:${issueEvent.id}`,
        workspaceId: workspace.id,
        timestamp: new Date().toISOString(),
        type: 'doc_generate_job',
        payload: {
          issueId: issue.id,
          issueKey: payload.issueKey,
          docType: 'handoff',
          triggerChannelId,
          autoTriggered: true,
        },
      });
      console.log(`[jira-events] Enqueued auto handoff doc for Done issue ${issue.id}, channel: ${triggerChannelId}`);
    }
  }
```

Also ensure `JiraStatusCategory` is imported at the top of the file — it's already exported from `@remi/shared`, so add it to the existing import:
```ts
import { QueueNames, TriggerReason, JiraStatusCategory } from '@remi/shared';
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/worker/jira-events-doc-trigger.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: all tests PASS with no regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/handlers/jira-events.ts tests/worker/jira-events-doc-trigger.test.ts
git commit -m "feat: auto-trigger handoff doc when jira issue moves to Done"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Full typecheck**

```bash
pnpm typecheck
```

Expected: zero errors across all packages.

- [ ] **Step 2: Full test suite**

```bash
pnpm test
```

Expected: all tests pass. Note the total count — it should be higher than before this feature.

- [ ] **Step 3: Build check**

```bash
pnpm build
```

Expected: all packages build successfully.

- [ ] **Step 4: Final commit if needed**

If any minor fixes were made during verification:
```bash
git add -p
git commit -m "fix: address final typecheck and build issues"
```
