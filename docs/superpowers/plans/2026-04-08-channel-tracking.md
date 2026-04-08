# Channel Mention Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture any top-level Slack message that mentions a known ticket key (e.g. "KAN-2") in an opted-in channel, and route it through the existing memory pipeline without requiring `/link-ticket`.

**Architecture:** One virtual `SlackThread` per tracked channel (sentinel `threadTs = '__channel__'`, `isChannelLevel = true`) is created on first mention. `registerMessageEvents` detects ticket keys in top-level messages from tracked channels, upserts `IssueThreadLink`s for each found issue, then queues one `SLACK_EVENTS` message. The worker pipeline is untouched — the message flows through identically to a manually linked thread reply.

**Tech Stack:** TypeScript, Prisma (PostgreSQL), Slack Bolt, Vitest

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `packages/db/prisma/schema.prisma` | Add `trackedChannelIds String[]` to `WorkspaceMemoryConfig` |
| Modify | `packages/db/src/repositories/memory.repo.ts` | Update `upsertMemoryConfig` to accept `trackedChannelIds` |
| Modify | `packages/db/src/repositories/link.repo.ts` | Add `upsertIssueThreadLink` helper |
| Modify | `packages/slack/src/events/message.ts` | Channel tracking logic for top-level messages |
| Modify | `apps/api/src/routes/admin/memory.ts` | Add `trackedChannelIds` to PUT Body type + GET fallback |
| Create | `tests/slack/message-events.test.ts` | Unit tests for channel tracking path |
| Modify | `tests/memory/memory.repo.test.ts` | Tests for `upsertMemoryConfig` with `trackedChannelIds` |

**Known V1 limitation:** If a channel thread accumulates links to N issues over time, every new message in that channel triggers memory extraction jobs for all N issues — not just the ones mentioned in that specific message. The extraction LLM filters irrelevance, so results are correct but compute is wasted. Acceptable for V1.

---

## Task 1: Schema change + DB migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add `trackedChannelIds` field to `WorkspaceMemoryConfig`**

In `packages/db/prisma/schema.prisma`, find the `WorkspaceMemoryConfig` model and add the new field:

```prisma
model WorkspaceMemoryConfig {
  id                 String   @id @default(cuid())
  workspaceId        String   @unique
  enabled            Boolean  @default(false)
  excludedChannelIds String[]
  excludedUserIds    String[]
  trackedChannelIds  String[]
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@map("workspace_memory_configs")
}
```

- [ ] **Step 2: Push schema to database and regenerate Prisma client**

```bash
cd "d:/Vibe Coded Projects/MemoryAI"
pnpm --filter @remi/db db:push
pnpm --filter @remi/db db:generate
```

Expected: `Your database is now in sync with your Prisma schema.` followed by `Generated Prisma Client`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat: add trackedChannelIds to WorkspaceMemoryConfig schema"
```

---

## Task 2: DB repo updates

**Files:**
- Modify: `packages/db/src/repositories/memory.repo.ts`
- Modify: `packages/db/src/repositories/link.repo.ts`

- [ ] **Step 1: Update `upsertMemoryConfig` to accept `trackedChannelIds`**

In `packages/db/src/repositories/memory.repo.ts`, replace the `upsertMemoryConfig` function:

```ts
export async function upsertMemoryConfig(
  prisma: PrismaClient,
  workspaceId: string,
  data: {
    enabled?: boolean;
    excludedChannelIds?: string[];
    excludedUserIds?: string[];
    trackedChannelIds?: string[];
  },
) {
  return prisma.workspaceMemoryConfig.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      enabled: data.enabled ?? false,
      excludedChannelIds: data.excludedChannelIds ?? [],
      excludedUserIds: data.excludedUserIds ?? [],
      trackedChannelIds: data.trackedChannelIds ?? [],
    },
    update: data,
  });
}
```

- [ ] **Step 2: Add `upsertIssueThreadLink` to `link.repo.ts`**

In `packages/db/src/repositories/link.repo.ts`, add this function after `createIssueThreadLink`:

```ts
export async function upsertIssueThreadLink(
  prisma: PrismaClient,
  data: { issueId: string; threadId: string },
) {
  return prisma.issueThreadLink.upsert({
    where: { issueId_threadId: { issueId: data.issueId, threadId: data.threadId } },
    create: { issueId: data.issueId, threadId: data.threadId },
    update: { unlinkedAt: null }, // Reactivate if previously unlinked
  });
}
```

- [ ] **Step 3: Export `upsertIssueThreadLink` from `packages/db/src/repositories/index.ts`**

The existing `export * from './link.repo.js';` already covers this — no change needed. Verify the function is accessible by checking the export.

- [ ] **Step 4: Rebuild `@remi/db`**

```bash
pnpm --filter @remi/db build
```

Expected: Exits with code 0, `dist/` updated.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/memory.repo.ts packages/db/src/repositories/link.repo.ts
git commit -m "feat: add trackedChannelIds to upsertMemoryConfig and add upsertIssueThreadLink"
```

---

## Task 3: Tests for DB repo changes

**Files:**
- Modify: `tests/memory/memory.repo.test.ts`

- [ ] **Step 1: Add tests for `upsertMemoryConfig` with `trackedChannelIds`**

Open `tests/memory/memory.repo.test.ts`. Add the following `describe` block at the end of the file (after the existing tests):

```ts
describe('upsertMemoryConfig', () => {
  it('creates config with trackedChannelIds when none exists', async () => {
    const config = {
      id: 'cfg1',
      workspaceId: 'ws1',
      enabled: false,
      excludedChannelIds: [],
      excludedUserIds: [],
      trackedChannelIds: ['C123'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPrisma.workspaceMemoryConfig.upsert.mockResolvedValue(config);
    const result = await upsertMemoryConfig(mockPrisma, 'ws1', { trackedChannelIds: ['C123'] });
    expect(result.trackedChannelIds).toEqual(['C123']);
    expect(mockPrisma.workspaceMemoryConfig.upsert).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1' },
      create: expect.objectContaining({ trackedChannelIds: ['C123'], workspaceId: 'ws1' }),
      update: { trackedChannelIds: ['C123'] },
    });
  });

  it('defaults trackedChannelIds to [] when not provided', async () => {
    const config = {
      id: 'cfg2', workspaceId: 'ws1', enabled: true,
      excludedChannelIds: [], excludedUserIds: [], trackedChannelIds: [],
      createdAt: new Date(), updatedAt: new Date(),
    };
    mockPrisma.workspaceMemoryConfig.upsert.mockResolvedValue(config);
    await upsertMemoryConfig(mockPrisma, 'ws1', { enabled: true });
    expect(mockPrisma.workspaceMemoryConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ trackedChannelIds: [] }),
      }),
    );
  });
});
```

You also need to add `upsertMemoryConfig` to the import at the top of the file:

```ts
import {
  findOrCreateMemoryUnit,
  getMemoryConfig,
  upsertMemoryConfig,
  getLatestSnapshot,
  createObservations,
  listObservationsSince,
  createSnapshot,
  createProposal,
  updateProposalStatus,
} from '../../packages/db/src/repositories/memory.repo.js';
```

- [ ] **Step 2: Run the memory repo tests to verify they pass**

```bash
cd "d:/Vibe Coded Projects/MemoryAI"
pnpm vitest run tests/memory/memory.repo.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/memory/memory.repo.test.ts
git commit -m "test: add upsertMemoryConfig trackedChannelIds tests"
```

---

## Task 4: Channel tracking in `registerMessageEvents`

**Files:**
- Modify: `packages/slack/src/events/message.ts`

- [ ] **Step 1: Replace the full contents of `message.ts` with the new version**

```ts
import type { App } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import {
  prisma,
  findSlackThreadByTs,
  findLinksByThreadId,
  getMemoryConfig,
  findIssueByKey,
  upsertSlackThread,
  upsertIssueThreadLink,
} from '@remi/db';

// Matches Jira-style ticket keys anywhere in text, e.g. KAN-2, PROJ-123
const TICKET_KEY_RE = /\b([A-Z]+-\d+)\b/g;

// Sentinel threadTs used for the one virtual SlackThread per tracked channel
const CHANNEL_THREAD_SENTINEL = '__channel__';

export function registerMessageEvents(app: App, queue: IQueueProducer): void {
  app.event('message', async ({ event, context, logger }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = event as any;

    // Ignore bot messages and message_changed/message_deleted subtypes
    if (msg.subtype && msg.subtype !== 'thread_broadcast') {
      return;
    }

    const teamId: string = (context as Record<string, unknown>).teamId as string;
    const workspaceId: string = (context as Record<string, unknown>).workspaceId as string;
    const channelId: string = msg.channel;

    try {
      if (!msg.thread_ts) {
        // Top-level message — check channel tracking
        await handleChannelMessage({ msg, event, teamId, channelId, workspaceId, queue });
        return;
      }

      // Thread reply — existing logic
      const threadTs: string = msg.thread_ts;
      const thread = await findSlackThreadByTs(prisma, teamId, channelId, threadTs);
      if (!thread) return;

      const links = await findLinksByThreadId(prisma, thread.id);
      const activeLinks = links.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (l: any) => l.unlinkedAt == null,
      );
      if (activeLinks.length === 0) return;

      const idempotencyKey = `slack:${teamId}:${channelId}:${msg.ts as string}`;
      await queue.send(QueueNames.SLACK_EVENTS, {
        id: uuidv4(),
        idempotencyKey,
        workspaceId,
        timestamp: new Date().toISOString(),
        type: 'slack_event',
        payload: {
          kind: 'message',
          teamId,
          channelId,
          userId: msg.user ?? '',
          threadTs,
          messageTs: msg.ts as string,
          text: msg.text ?? '',
          rawEvent: event as unknown as Record<string, unknown>,
        },
      });
    } catch (err) {
      logger.error(err);
    }
  });
}

async function handleChannelMessage({
  msg,
  event,
  teamId,
  channelId,
  workspaceId,
  queue,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msg: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any;
  teamId: string;
  channelId: string;
  workspaceId: string;
  queue: IQueueProducer;
}): Promise<void> {
  // 1. Check that memory is enabled and this channel is tracked
  const memConfig = await getMemoryConfig(prisma, workspaceId);
  if (!memConfig?.enabled || !memConfig.trackedChannelIds.includes(channelId)) return;

  // 2. Extract all ticket keys from the message text
  const text: string = msg.text ?? '';
  const keys = [...new Set(Array.from(text.matchAll(TICKET_KEY_RE), (m) => m[1]))];
  if (keys.length === 0) return;

  // 3. Upsert the one virtual SlackThread for this channel
  const thread = await upsertSlackThread(prisma, {
    workspaceId,
    slackTeamId: teamId,
    channelId,
    threadTs: CHANNEL_THREAD_SENTINEL,
    isChannelLevel: true,
  });

  // 4. Upsert an IssueThreadLink for each found issue
  let linkedCount = 0;
  for (const key of keys) {
    const issue = await findIssueByKey(prisma, workspaceId, key);
    if (!issue) continue;
    await upsertIssueThreadLink(prisma, { issueId: issue.id, threadId: thread.id });
    linkedCount++;
  }

  // 5. Only queue if at least one valid issue was found
  if (linkedCount === 0) return;

  await queue.send(QueueNames.SLACK_EVENTS, {
    id: uuidv4(),
    idempotencyKey: `slack:${teamId}:${channelId}:${msg.ts as string}`,
    workspaceId,
    timestamp: new Date().toISOString(),
    type: 'slack_event',
    payload: {
      kind: 'message',
      teamId,
      channelId,
      userId: msg.user ?? '',
      threadTs: CHANNEL_THREAD_SENTINEL,
      messageTs: msg.ts as string,
      text: msg.text ?? '',
      rawEvent: event as unknown as Record<string, unknown>,
    },
  });
}
```

- [ ] **Step 2: Rebuild `@remi/slack` to confirm no TypeScript errors**

```bash
pnpm --filter @remi/slack build
```

Expected: Exits with code 0, no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/slack/src/events/message.ts
git commit -m "feat: capture top-level Slack messages mentioning ticket keys in tracked channels"
```

---

## Task 5: Tests for channel tracking

**Files:**
- Create: `tests/slack/message-events.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerMessageEvents } from '../../packages/slack/src/events/message.js';
import type { IQueueProducer } from '../../packages/queue/src/index.js';

// ── Mock @remi/db ────────────────────────────────────────────────────────────
const mockGetMemoryConfig = vi.fn();
const mockFindIssueByKey = vi.fn();
const mockUpsertSlackThread = vi.fn();
const mockUpsertIssueThreadLink = vi.fn();
const mockFindSlackThreadByTs = vi.fn();
const mockFindLinksByThreadId = vi.fn();

vi.mock('@remi/db', () => ({
  prisma: {},
  getMemoryConfig: (...args: unknown[]) => mockGetMemoryConfig(...args),
  findIssueByKey: (...args: unknown[]) => mockFindIssueByKey(...args),
  upsertSlackThread: (...args: unknown[]) => mockUpsertSlackThread(...args),
  upsertIssueThreadLink: (...args: unknown[]) => mockUpsertIssueThreadLink(...args),
  findSlackThreadByTs: (...args: unknown[]) => mockFindSlackThreadByTs(...args),
  findLinksByThreadId: (...args: unknown[]) => mockFindLinksByThreadId(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeQueue(): IQueueProducer & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue(undefined) } as unknown as IQueueProducer & { send: ReturnType<typeof vi.fn> };
}

function makeApp() {
  const handlers: Record<string, (payload: unknown) => Promise<void>> = {};
  return {
    event: (eventName: string, handler: (payload: unknown) => Promise<void>) => {
      handlers[eventName] = handler;
    },
    trigger: async (eventName: string, payload: unknown) => {
      await handlers[eventName]?.(payload);
    },
  };
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return { teamId: 'T1', workspaceId: 'ws1', ...overrides };
}

function makeLogger() {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Top-level message (channel tracking) ────────────────────────────────────

describe('channel tracking — top-level messages', () => {
  it('does nothing when memory config is disabled', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: false, trackedChannelIds: ['C1'] });
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '111.0', text: 'KAN-1 is done', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('does nothing when channel is not tracked', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C999'] });
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '111.0', text: 'KAN-1 is done', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('does nothing when no ticket keys are mentioned', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C1'] });
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '111.0', text: 'no tickets here', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('does nothing when ticket key mentioned but issue not in DB', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C1'] });
    mockUpsertSlackThread.mockResolvedValue({ id: 'thread1' });
    mockFindIssueByKey.mockResolvedValue(null);
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '111.0', text: 'KAN-1 is done', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('upserts thread+link and queues SLACK_EVENTS when tracked channel mentions known ticket', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C1'] });
    mockUpsertSlackThread.mockResolvedValue({ id: 'thread1' });
    mockFindIssueByKey.mockResolvedValue({ id: 'issue1' });
    mockUpsertIssueThreadLink.mockResolvedValue({});
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '222.0', text: 'KAN-2 marketing is ready', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(mockUpsertSlackThread).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: 'ws1',
      slackTeamId: 'T1',
      channelId: 'C1',
      threadTs: '__channel__',
      isChannelLevel: true,
    });
    expect(mockUpsertIssueThreadLink).toHaveBeenCalledWith(expect.anything(), {
      issueId: 'issue1',
      threadId: 'thread1',
    });
    expect(queue.send).toHaveBeenCalledOnce();
    const [queueName, msg] = queue.send.mock.calls[0];
    expect(queueName).toBe('slack-events');
    expect(msg.payload.threadTs).toBe('__channel__');
    expect(msg.payload.messageTs).toBe('222.0');
    expect(msg.idempotencyKey).toBe('slack:T1:C1:222.0');
  });

  it('deduplicates ticket keys and links each found issue once', async () => {
    mockGetMemoryConfig.mockResolvedValue({ enabled: true, trackedChannelIds: ['C1'] });
    mockUpsertSlackThread.mockResolvedValue({ id: 'thread1' });
    mockFindIssueByKey
      .mockResolvedValueOnce({ id: 'issue-kan1' })  // KAN-1
      .mockResolvedValueOnce({ id: 'issue-kan2' });  // KAN-2
    mockUpsertIssueThreadLink.mockResolvedValue({});
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '333.0', text: 'KAN-1 and KAN-2 and KAN-1 again', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    // KAN-1 deduplicated: findIssueByKey called twice (KAN-1 once, KAN-2 once)
    expect(mockFindIssueByKey).toHaveBeenCalledTimes(2);
    expect(mockUpsertIssueThreadLink).toHaveBeenCalledTimes(2);
    expect(queue.send).toHaveBeenCalledOnce();
  });

  it('ignores message_changed subtype', async () => {
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', subtype: 'message_changed', channel: 'C1', ts: '111.0', text: 'KAN-1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(mockGetMemoryConfig).not.toHaveBeenCalled();
    expect(queue.send).not.toHaveBeenCalled();
  });
});

// ── Thread reply (existing behaviour, regression) ────────────────────────────

describe('thread reply — existing behaviour', () => {
  it('queues SLACK_EVENTS for reply in a linked thread', async () => {
    mockFindSlackThreadByTs.mockResolvedValue({ id: 'thread2' });
    mockFindLinksByThreadId.mockResolvedValue([{ id: 'link1', unlinkedAt: null }]);
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '444.0', thread_ts: '100.0', text: 'a reply', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).toHaveBeenCalledOnce();
    const [, msg] = queue.send.mock.calls[0];
    expect(msg.payload.threadTs).toBe('100.0');
    expect(msg.payload.messageTs).toBe('444.0');
  });

  it('does not queue if thread not found in DB', async () => {
    mockFindSlackThreadByTs.mockResolvedValue(null);
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '555.0', thread_ts: '100.0', text: 'a reply', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });

  it('does not queue if thread has no active links', async () => {
    mockFindSlackThreadByTs.mockResolvedValue({ id: 'thread2' });
    mockFindLinksByThreadId.mockResolvedValue([{ id: 'link1', unlinkedAt: new Date() }]);
    const app = makeApp();
    const queue = makeQueue();
    registerMessageEvents(app as any, queue);

    await app.trigger('message', {
      event: { type: 'message', channel: 'C1', ts: '666.0', thread_ts: '100.0', text: 'a reply', user: 'U1' },
      context: makeContext(),
      logger: makeLogger(),
    });

    expect(queue.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the new tests**

```bash
pnpm vitest run tests/slack/message-events.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/slack/message-events.test.ts
git commit -m "test: add channel tracking and thread reply tests for registerMessageEvents"
```

---

## Task 6: Admin API type update

**Files:**
- Modify: `apps/api/src/routes/admin/memory.ts`

- [ ] **Step 1: Add `trackedChannelIds` to the PUT Body type and GET fallback**

In `apps/api/src/routes/admin/memory.ts`, replace the PUT handler's type annotation and the GET fallback:

**GET handler** — update the fallback object (line ~31):
```ts
return reply.send(config ?? { enabled: false, excludedChannelIds: [], excludedUserIds: [], trackedChannelIds: [] });
```

**PUT handler** — update the Body type (line ~34):
```ts
app.put<{
  Params: { workspaceId: string };
  Body: {
    enabled?: boolean;
    excludedChannelIds?: string[];
    excludedUserIds?: string[];
    trackedChannelIds?: string[];
  };
}>(
  '/config/:workspaceId', async (req, reply) => {
    const config = await upsertMemoryConfig(prisma, req.params.workspaceId, req.body);
    return reply.send(config);
  }
);
```

- [ ] **Step 2: Typecheck the API package**

```bash
pnpm --filter @remi/api typecheck
```

Expected: No errors.

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
pnpm vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/admin/memory.ts
git commit -m "feat: expose trackedChannelIds in admin memory config API"
```

---

## Self-Review

**Spec coverage:**
- ✅ Top-level messages in tracked channels captured
- ✅ Ticket key detection (no format requirement — any `PROJ-123` pattern in text)
- ✅ Issue must exist in DB (unknown ticket keys silently skipped)
- ✅ Channel opt-in via admin API (`trackedChannelIds`)
- ✅ Worker pipeline untouched
- ✅ Thread reply path unchanged (regression tests included)
- ✅ `IssueThreadLink` reactivated if previously unlinked

**Placeholder scan:** None found.

**Type consistency:**
- `CHANNEL_THREAD_SENTINEL = '__channel__'` used consistently in `message.ts` and tests
- `upsertIssueThreadLink` signature in `link.repo.ts` matches all call sites
- `trackedChannelIds` field name consistent across schema, repo, admin route, and tests
