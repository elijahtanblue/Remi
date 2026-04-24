# Auth + Internal Session Routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `X-Internal-Token` authentication to `apps/api` and implement the three internal session management routes (`/internal/sessions/resolve`, `/internal/sessions/validate`, `/internal/sessions/revoke`) that `apps/web` calls during the Slack OAuth login flow.

**Architecture:** A Fastify plugin (`internal-auth.ts`) validates the `X-Internal-Token` header on all `/internal/*` routes. The three session routes call repository functions from `@remi/db`. The raw Slack identity (slackUserId + slackTeamId) is resolved to a `UserSession` inside `apps/api`; `apps/web` never touches the database. Raw session tokens are returned to `apps/web` — only the SHA-256 hash is stored server-side (implemented in Plan 1's `user-session.repo.ts`).

**Tech Stack:** Fastify, `@remi/db` (user-session repo from Plan 1), `node:crypto`, Vitest

**Dependency:** Requires Plan 1 (schema migration + user-session.repo.ts) to be complete before running this plan.

---

### Task 1: Add `INTERNAL_TOKEN` to `apps/api` config

**Files:**
- Modify: `apps/api/src/config.ts`

- [ ] **Step 1: Add the env var to the Zod schema**

In `apps/api/src/config.ts`, add to the `schema` object (after `ADMIN_API_KEY`):

```typescript
INTERNAL_TOKEN: z.string().default('dev-internal-token'),
```

- [ ] **Step 2: Add to local `.env` if it exists**

If `apps/api/.env` or the root `.env` exists, add:
```
INTERNAL_TOKEN=dev-internal-token
```

- [ ] **Step 3: Verify config still parses**

```bash
pnpm --filter @remi/api typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config.ts
git commit -m "$(cat <<'EOF'
feat(api): add INTERNAL_TOKEN config for internal route auth

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create `internal-auth` Fastify plugin

**Files:**
- Create: `apps/api/src/plugins/internal-auth.ts`
- Create: `tests/admin/internal-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/admin/internal-auth.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { internalAuthPlugin } from '../../apps/api/src/plugins/internal-auth.js';

async function buildTestApp(token: string) {
  const app = Fastify();
  await app.register(internalAuthPlugin, { token });
  app.get('/internal/test', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('internalAuthPlugin', () => {
  it('allows requests with the correct X-Internal-Token', async () => {
    const app = await buildTestApp('secret123');
    const res = await app.inject({
      method: 'GET',
      url: '/internal/test',
      headers: { 'x-internal-token': 'secret123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('rejects requests with wrong token', async () => {
    const app = await buildTestApp('secret123');
    const res = await app.inject({
      method: 'GET',
      url: '/internal/test',
      headers: { 'x-internal-token': 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects requests with no token', async () => {
    const app = await buildTestApp('secret123');
    const res = await app.inject({
      method: 'GET',
      url: '/internal/test',
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- tests/admin/internal-auth.test.ts
```
Expected: FAIL — `internalAuthPlugin` not found.

- [ ] **Step 3: Implement the plugin**

Create `apps/api/src/plugins/internal-auth.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export const internalAuthPlugin = fp(async function (
  app: FastifyInstance,
  opts: { token: string },
) {
  app.addHook('onRequest', async (request, reply) => {
    const provided = request.headers['x-internal-token'];
    if (provided !== opts.token) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});
```

Note: `fastify-plugin` ensures the hook applies to the encapsulation scope this plugin is registered in. Install if needed: `pnpm --filter @remi/api add fastify-plugin`.

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test -- tests/admin/internal-auth.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/internal-auth.ts tests/admin/internal-auth.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add internal-auth Fastify plugin for X-Internal-Token validation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create the session routes

**Files:**
- Create: `apps/api/src/routes/internal/sessions.ts`
- Create: `tests/admin/internal-sessions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/admin/internal-sessions.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

// Mock @remi/db before importing the route module
vi.mock('@remi/db', () => ({
  prisma: {},
  findSlackInstallByTeamId: vi.fn(),
  findSlackUserBySlackId: vi.fn(),
  findUserById: vi.fn(),
  createUserSession: vi.fn(),
  findSessionByToken: vi.fn(),
  revokeSession: vi.fn(),
  touchSession: vi.fn(),
}));

import {
  findSlackInstallByTeamId,
  findSlackUserBySlackId,
  findUserById,
  createUserSession,
  findSessionByToken,
  revokeSession,
} from '@remi/db';

import { sessionRoutes } from '../../apps/api/src/routes/internal/sessions.js';

async function buildApp() {
  const app = Fastify();
  await app.register(sessionRoutes);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('POST /internal/sessions/resolve', () => {
  it('returns 403 when Slack workspace is not installed', async () => {
    vi.mocked(findSlackInstallByTeamId).mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/resolve',
      payload: { slackUserId: 'U1', slackTeamId: 'T1' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/not installed/i);
  });

  it('returns 403 when SlackUser row does not exist', async () => {
    vi.mocked(findSlackInstallByTeamId).mockResolvedValue({ workspaceId: 'ws1' } as any);
    vi.mocked(findSlackUserBySlackId).mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/resolve',
      payload: { slackUserId: 'U1', slackTeamId: 'T1' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns a token when identity resolves', async () => {
    vi.mocked(findSlackInstallByTeamId).mockResolvedValue({ workspaceId: 'ws1' } as any);
    vi.mocked(findSlackUserBySlackId).mockResolvedValue({ userId: 'u1' } as any);
    vi.mocked(findUserById).mockResolvedValue({ id: 'u1', workspaceId: 'ws1' } as any);
    vi.mocked(createUserSession).mockResolvedValue({ id: 'sess1' } as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/resolve',
      payload: { slackUserId: 'U1', slackTeamId: 'T1' },
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe('string');
    expect(res.json().token.length).toBeGreaterThan(20);
  });
});

describe('POST /internal/sessions/validate', () => {
  it('returns 401 when session not found', async () => {
    vi.mocked(findSessionByToken).mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/validate',
      payload: { token: 'badtoken' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns userId and workspaceId when valid', async () => {
    vi.mocked(findSessionByToken).mockResolvedValue({
      userId: 'u1',
      workspaceId: 'ws1',
    } as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/validate',
      payload: { token: 'validtoken' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'u1', workspaceId: 'ws1' });
  });
});

describe('POST /internal/sessions/revoke', () => {
  it('calls revokeSession and returns ok', async () => {
    vi.mocked(revokeSession).mockResolvedValue(undefined as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/revoke',
      payload: { token: 'sometoken' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(revokeSession).toHaveBeenCalledWith(expect.anything(), 'sometoken');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- tests/admin/internal-sessions.test.ts
```
Expected: FAIL — `sessionRoutes` not found.

- [ ] **Step 3: Implement `sessions.ts`**

Create `apps/api/src/routes/internal/sessions.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import {
  prisma,
  createUserSession,
  findSessionByToken,
  revokeSession,
  touchSession,
} from '@remi/db';

// These repo functions need to be added to @remi/db if not already exported.
// findSlackInstallByTeamId: looks up SlackWorkspaceInstall by slackTeamId
// findSlackUserBySlackId: looks up SlackUser by slackUserId + slackTeamId
// findUserById: looks up User by id
// All exist in workspace.repo.ts or slack-thread.repo.ts — check @remi/db exports.
// If missing, add them to the appropriate repo file.
import { findSlackInstallByTeamId, findSlackUserBySlackId, findUserById } from '@remi/db';

function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

export async function sessionRoutes(app: FastifyInstance) {
  // POST /resolve — exchange Slack identity for a session token
  app.post<{ Body: { slackUserId: string; slackTeamId: string } }>(
    '/resolve',
    async (request, reply) => {
      const { slackUserId, slackTeamId } = request.body;

      const install = await findSlackInstallByTeamId(prisma, slackTeamId);
      if (!install) {
        return reply.code(403).send({
          error: "Remi isn't installed in your Slack workspace. Ask your admin to install it first.",
        });
      }

      const slackUser = await findSlackUserBySlackId(prisma, slackUserId, slackTeamId);
      if (!slackUser) {
        return reply.code(403).send({
          error: 'Your account is not yet set up in Remi. Try using a Slack command first.',
        });
      }

      const user = await findUserById(prisma, slackUser.userId);
      if (!user) {
        return reply.code(403).send({ error: 'User not found.' });
      }

      const rawToken = generateRawToken();
      await createUserSession(prisma, {
        userId: user.id,
        workspaceId: user.workspaceId,
        rawToken,
      });

      return { token: rawToken };
    },
  );

  // POST /validate — verify a session token and return identity
  app.post<{ Body: { token: string } }>('/validate', async (request, reply) => {
    const { token } = request.body;
    const session = await findSessionByToken(prisma, token);
    if (!session) {
      return reply.code(401).send({ error: 'Invalid or expired session' });
    }
    // Update lastSeenAt without blocking the response
    touchSession(prisma, token).catch(() => {});
    return { userId: session.userId, workspaceId: session.workspaceId };
  });

  // POST /revoke — invalidate a session
  app.post<{ Body: { token: string } }>('/revoke', async (request, reply) => {
    const { token } = request.body;
    await revokeSession(prisma, token);
    return { ok: true };
  });
}
```

- [ ] **Step 4: Add missing repo functions if needed**

Check that `@remi/db` exports `findSlackInstallByTeamId`, `findSlackUserBySlackId`, and `findUserById`. If any are missing:

Add to `packages/db/src/repositories/workspace.repo.ts`:
```typescript
export async function findSlackInstallByTeamId(prisma: PrismaClient, slackTeamId: string) {
  return prisma.slackWorkspaceInstall.findUnique({ where: { slackTeamId } });
}

export async function findSlackUserBySlackId(
  prisma: PrismaClient,
  slackUserId: string,
  slackTeamId: string,
) {
  return prisma.slackUser.findUnique({
    where: { slackUserId_slackTeamId: { slackUserId, slackTeamId } },
  });
}

export async function findUserById(prisma: PrismaClient, id: string) {
  return prisma.user.findUnique({ where: { id } });
}
```

Then export from `packages/db/src/repositories/index.ts` if not already present.

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm test -- tests/admin/internal-sessions.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/internal/sessions.ts tests/admin/internal-sessions.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add internal session routes (resolve, validate, revoke)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Create the internal route group index and register in server

**Files:**
- Create: `apps/api/src/routes/internal/index.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Create `apps/api/src/routes/internal/index.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { internalAuthPlugin } from '../../plugins/internal-auth.js';
import { sessionRoutes } from './sessions.js';
import { config } from '../../config.js';

export async function internalRoutes(app: FastifyInstance) {
  await app.register(internalAuthPlugin, { token: config.INTERNAL_TOKEN });
  await app.register(sessionRoutes, { prefix: '/sessions' });
}
```

- [ ] **Step 2: Register in `apps/api/src/server.ts`**

Add import and registration in `buildServer()`. Add after the existing route registrations:

```typescript
import { internalRoutes } from './routes/internal/index.js';
```

```typescript
// Inside buildServer(), after existing app.register calls:
await app.register(internalRoutes, { prefix: '/internal' });
```

- [ ] **Step 3: Verify the server builds**

```bash
pnpm --filter @remi/api typecheck
```
Expected: no errors.

- [ ] **Step 4: Smoke test the routes**

Start the API server locally (`pnpm --filter @remi/api dev`) and run:

```bash
curl -s -X POST http://localhost:3000/internal/sessions/validate \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: dev-internal-token" \
  -d '{"token":"fake"}' | jq .
```
Expected: `{ "error": "Invalid or expired session" }` with status 401.

```bash
curl -s -X POST http://localhost:3000/internal/sessions/validate \
  -H "Content-Type: application/json" \
  -d '{"token":"fake"}' | jq .
```
Expected: `{ "error": "Unauthorized" }` with status 401.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/internal/index.ts apps/api/src/server.ts
git commit -m "$(cat <<'EOF'
feat(api): register internal route group with session management endpoints

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
