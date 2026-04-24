# Schema + Shared Types + Repos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 new Prisma models, shared API contract types, a new queue name + message type, and 5 repository modules — forming the data foundation everything else depends on.

**Architecture:** Schema changes are purely additive (no existing model is removed or renamed). New models: `UserSession`, `Scope`, `WorkflowScopeConfig`, `CurrentWorkRecord`, `MeaningfulEvent`. `Issue` gains an optional `scopeId`. All repo functions follow the existing pattern of taking `prisma: PrismaClient` as the first argument so they are testable with a mock.

**Tech Stack:** Prisma 5, PostgreSQL, Vitest (mock-based unit tests), TypeScript ESM

**Dependency:** All other plans (2–5) depend on this plan's migration completing before they can run. Plan 5 (frontend) can start as soon as Task 3 (create `api.ts`) is done.

---

### Task 1: Add new models to `packages/db/prisma/schema.prisma`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Open schema.prisma and locate the end of the file**

The file is at `packages/db/prisma/schema.prisma`. Append the five new models below after all existing models. Do not modify any existing model except where explicitly stated.

- [ ] **Step 2: Add `UserSession` model**

```prisma
model UserSession {
  id          String    @id @default(cuid())
  userId      String
  workspaceId String
  tokenHash   String    @unique
  expiresAt   DateTime
  revokedAt   DateTime?
  lastSeenAt  DateTime?
  createdAt   DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id])
  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([userId])
  @@index([expiresAt])
  @@map("user_sessions")
}
```

- [ ] **Step 3: Add `Scope` model**

```prisma
model Scope {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  type        String   // 'team' | 'workflow' | 'project' | 'pilot'
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace       Workspace             @relation(fields: [workspaceId], references: [id])
  workflowConfigs WorkflowScopeConfig[]
  issues          Issue[]

  @@index([workspaceId])
  @@map("scopes")
}
```

- [ ] **Step 4: Add `WorkflowScopeConfig` model**

```prisma
model WorkflowScopeConfig {
  id                   String   @id @default(cuid())
  workspaceId          String
  scopeId              String
  workflowKey          String
  name                 String
  includedChannelIds   String[]
  includedJiraProjects String[]
  includedMailboxes    String[]
  writebackEnabled     Boolean  @default(false)
  approvalRequired     Boolean  @default(true)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  scope     Scope     @relation(fields: [scopeId], references: [id])

  @@unique([scopeId, workflowKey])
  @@index([workspaceId])
  @@map("workflow_scope_configs")
}
```

- [ ] **Step 5: Add `CurrentWorkRecord` model**

```prisma
model CurrentWorkRecord {
  id                          String    @id @default(cuid())
  issueId                     String    @unique
  workspaceId                 String

  currentState                String
  ownerDisplayName            String?
  ownerExternalId             String?
  ownerSource                 String?
  blockerSummary              String?
  blockerDetectedAt           DateTime?
  waitingOnType               String?
  waitingOnDescription        String?
  openQuestions               Json
  nextStep                    String?

  riskScore                   Float     @default(0)
  urgencyReason               String?
  isStale                     Boolean   @default(false)
  staleSince                  DateTime?

  ownerConfirmedAt            DateTime?
  blockerClearedAt            DateTime?

  lastJiraStatus              String?
  lastJiraAssigneeId          String?

  sourceMemoryUnitIds         String[]
  sourceSnapshotIds           String[]
  snapshotSetHash             String

  dataSources                 String[]
  sourceFreshnessAt           DateTime
  lastMeaningfulChangeAt      DateTime?
  lastMeaningfulChangeSummary String?

  confidence                  Float
  modelId                     String
  promptVersion               String
  generatedAt                 DateTime  @default(now())
  updatedAt                   DateTime  @updatedAt

  issue     Issue     @relation(fields: [issueId], references: [id])
  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([workspaceId, isStale])
  @@index([workspaceId, riskScore])
  @@index([workspaceId, lastMeaningfulChangeAt])
  @@index([workspaceId, sourceFreshnessAt])
  @@map("current_work_records")
}
```

- [ ] **Step 6: Add `MeaningfulEvent` model**

```prisma
model MeaningfulEvent {
  id             String   @id @default(cuid())
  issueId        String
  workspaceId    String
  idempotencyKey String   @unique
  eventType      String
  summary        String
  source         String
  sourceRef      String?
  sourceUrl      String?
  actorName      String?
  metadata       Json?
  occurredAt     DateTime
  createdAt      DateTime @default(now())

  issue     Issue     @relation(fields: [issueId], references: [id])
  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([issueId, occurredAt])
  @@index([workspaceId, occurredAt])
  @@map("meaningful_events")
}
```

- [ ] **Step 7: Add `scopeId` and relations to existing `Issue` model**

Find the `Issue` model and add these fields. Add `scopeId` after the last existing field before the `@@` directives. Add the relation and index:

```prisma
  // add after existing Issue fields, before @@map
  scopeId           String?
  scope             Scope?             @relation(fields: [scopeId], references: [id])
  currentWorkRecord CurrentWorkRecord?
  meaningfulEvents  MeaningfulEvent[]
```

Also add this index alongside the existing workspaceId index on Issue:
```prisma
  @@index([workspaceId, scopeId])
```

- [ ] **Step 8: Add relations to `Workspace` model**

Find the `Workspace` model and add these relation fields (append before the closing `}`):

```prisma
  userSessions       UserSession[]
  scopes             Scope[]
  workflowConfigs    WorkflowScopeConfig[]
  currentWorkRecords CurrentWorkRecord[]
  meaningfulEvents   MeaningfulEvent[]
```

- [ ] **Step 9: Add relation to `User` model**

Find the `User` model and add:
```prisma
  sessions UserSession[]
```

- [ ] **Step 10: Verify schema is valid**

Run:
```bash
cd packages/db && npx prisma validate
```
Expected: no errors. Fix any relation naming conflicts before proceeding.

---

### Task 2: Run the migration

**Files:**
- Auto-generated: `packages/db/prisma/migrations/*/migration.sql`

- [ ] **Step 1: Generate and apply migration**

```bash
pnpm db:migrate
```

(This runs `npx prisma migrate dev` via the root script. When prompted for a migration name, enter `add_coordination_platform`.)

Expected output ends with: `Your database is now in sync with your schema.`

- [ ] **Step 2: Regenerate Prisma client**

```bash
pnpm db:generate
```

Expected: `✔ Generated Prisma Client` — no TypeScript errors.

- [ ] **Step 3: Commit schema + migration**

```bash
git add packages/db/prisma/
git commit -m "$(cat <<'EOF'
feat(db): add coordination platform schema — UserSession, Scope, WorkflowScopeConfig, CurrentWorkRecord, MeaningfulEvent

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create `packages/shared/src/types/api.ts`

**Files:**
- Create: `packages/shared/src/types/api.ts`
- Modify: `packages/shared/src/index.ts` (add export)

- [ ] **Step 1: Create the file with all shared API contract types**

```typescript
// packages/shared/src/types/api.ts

export type DataSource = 'slack' | 'jira' | 'email'

export type WaitingOnType =
  | 'internal_person'
  | 'internal_team'
  | 'external_vendor'
  | 'external_customer'
  | 'approval'

export type MeaningfulEventType =
  | 'blocker_created'
  | 'blocker_removed'
  | 'owner_changed'
  | 'waiting_on_changed'
  | 'next_step_changed'
  | 'external_reply_received'
  | 'status_changed'
  | 'stale_detected'
  | 'stale_resolved'

export type QueueSection = 'needs_action' | 'recently_changed' | 'awaiting_approval'

export interface OpenQuestion {
  id?: string
  content: string
  source: DataSource
  sourceRef?: string
  sourceUrl?: string
  askedAt?: string
  ownerName?: string
  status: 'open' | 'answered' | 'superseded'
}

export interface CWRSummary {
  currentState: string
  ownerDisplayName: string | null
  ownerExternalId: string | null
  blockerSummary: string | null
  waitingOnType: WaitingOnType | null
  waitingOnDescription: string | null
  nextStep: string | null
  riskScore: number
  urgencyReason: string | null
  isStale: boolean
  staleSince: string | null
  sourceFreshnessAt: string
  lastMeaningfulChangeAt: string | null
  lastMeaningfulChangeSummary: string | null
  dataSources: DataSource[]
  confidence: number
}

export interface CWRDetail extends CWRSummary {
  ownerSource: DataSource | null
  blockerDetectedAt: string | null
  openQuestions: OpenQuestion[]
  generatedAt: string
  updatedAt: string
}

export interface IssueQueueItem {
  id: string
  jiraIssueKey: string
  jiraIssueUrl: string
  title: string
  status: string | null
  priority: string | null
  scopeId: string | null
  scopeName: string | null
  cwr: CWRSummary | null
  queueSection: QueueSection
  pendingProposalCount: number
}

export interface IssueDetail {
  id: string
  jiraIssueKey: string
  jiraIssueUrl: string
  title: string
  status: string | null
  statusCategory: string | null
  priority: string | null
  issueType: string | null
  scopeId: string | null
  scopeName: string | null
  cwr: CWRDetail | null
}

export interface MeaningfulEventItem {
  id: string
  eventType: MeaningfulEventType
  summary: string
  source: DataSource
  sourceRef: string | null
  sourceUrl: string | null
  actorName: string | null
  occurredAt: string
  metadata: Record<string, unknown> | null
}

export interface EvidenceItem {
  id: string
  category:
    | 'decision'
    | 'action_item'
    | 'blocker'
    | 'open_question'
    | 'status_update'
    | 'owner_update'
    | 'risk'
  content: string
  confidence: number
  sourceApp: DataSource | null
  state: 'active' | 'superseded'
  extractedAt: string
  citationUrls: string[]
}

export interface ProposalItem {
  id: string
  issueId: string
  issueKey: string
  issueTitle: string
  target: 'jira_comment'
  status: 'pending_approval' | 'approved' | 'applied' | 'rejected' | 'failed'
  payload: { jiraIssueKey: string; commentBody: string }
  confidence: number
  createdAt: string
  updatedAt: string
}

export interface ProposalEditRequest {
  commentBody: string
}

export interface TriggerActionRequest {
  type:
    | 'chase_owner'
    | 'draft_update'
    | 'prepare_escalation'
    | 'mark_owner_confirmed'
    | 'mark_blocker_cleared'
  input?: Record<string, unknown>
}

export interface TriggerActionResponse {
  proposalId: string | null
  message: string
}

export interface ScopeItem {
  id: string
  name: string
  type: string
}

export interface WorkflowConfigItem {
  id: string
  scopeId: string
  workflowKey: string
  name: string
  includedChannelIds: string[]
  includedJiraProjects: string[]
  includedMailboxes: string[]
  writebackEnabled: boolean
  approvalRequired: boolean
}

export type WorkflowConfigCreateRequest = Omit<WorkflowConfigItem, 'id'>
```

- [ ] **Step 2: Export from packages/shared/src/index.ts**

Add to the end of `packages/shared/src/index.ts`:
```typescript
export * from './types/api.js';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @remi/shared typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/api.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): add API contract types for coordination platform

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add `CWR_GENERATE` queue name and `CWRGenerateMessage` type

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/types/events.ts`

- [ ] **Step 1: Add `CWR_GENERATE` to `QueueNames` in `constants.ts`**

In `packages/shared/src/constants.ts`, add to the `QueueNames` object (after `DOC_GENERATE_JOBS`):
```typescript
  CWR_GENERATE: 'cwr-generate',
```

- [ ] **Step 2: Add `CWRGenerateMessage` to `events.ts`**

In `packages/shared/src/types/events.ts`, add before the union type at the bottom:

```typescript
export type CWRTriggerSource =
  | 'stage2_complete'
  | 'jira_change'
  | 'link_change'
  | 'stale_sweep'

export interface CWRGenerateMessage extends BaseQueueMessage {
  type: 'cwr_generate';
  payload: {
    issueId: string;
    triggerSource: CWRTriggerSource;
  };
}
```

Then add `CWRGenerateMessage` to the `QueueMessage` union:
```typescript
export type QueueMessage =
  | SlackEventMessage
  | JiraEventMessage
  | SummaryJobMessage
  | BackfillJobMessage
  | MemoryExtractMessage
  | MemorySnapshotMessage
  | MemoryWritebackProposeMessage
  | MemoryWritebackApplyMessage
  | DocGenerateJobMessage
  | CWRGenerateMessage;
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @remi/shared typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/types/events.ts
git commit -m "$(cat <<'EOF'
feat(shared): add CWR_GENERATE queue name and CWRGenerateMessage type

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `user-session.repo.ts`

**Files:**
- Create: `packages/db/src/repositories/user-session.repo.ts`
- Create: `tests/db/user-session.repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/user-session.repo.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createUserSession,
  findSessionByToken,
  revokeSession,
  touchSession,
} from '../../packages/db/src/repositories/user-session.repo.js';
import { createHash } from 'node:crypto';

function sha256(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

const mockPrisma = {
  userSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('createUserSession', () => {
  it('stores SHA-256 hash of token, not the raw token', async () => {
    const rawToken = 'abc123rawtoken';
    mockPrisma.userSession.create.mockResolvedValue({ id: 's1' });

    await createUserSession(mockPrisma, {
      userId: 'u1',
      workspaceId: 'ws1',
      rawToken,
    });

    const call = mockPrisma.userSession.create.mock.calls[0][0];
    expect(call.data.tokenHash).toBe(sha256(rawToken));
    expect(JSON.stringify(call)).not.toContain(rawToken);
  });

  it('sets expiresAt 30 days from now', async () => {
    mockPrisma.userSession.create.mockResolvedValue({ id: 's1' });
    const before = Date.now();

    await createUserSession(mockPrisma, {
      userId: 'u1',
      workspaceId: 'ws1',
      rawToken: 'tok',
    });

    const call = mockPrisma.userSession.create.mock.calls[0][0];
    const expiresAt: Date = call.data.expiresAt;
    const diffDays = (expiresAt.getTime() - before) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });
});

describe('findSessionByToken', () => {
  it('looks up by SHA-256 hash of token', async () => {
    const rawToken = 'mytoken';
    mockPrisma.userSession.findUnique.mockResolvedValue(null);

    await findSessionByToken(mockPrisma, rawToken);

    expect(mockPrisma.userSession.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256(rawToken) },
    });
  });

  it('returns null when session is revoked', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue({
      id: 's1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000000),
    });

    const result = await findSessionByToken(mockPrisma, 'tok');
    expect(result).toBeNull();
  });

  it('returns null when session is expired', async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue({
      id: 's1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await findSessionByToken(mockPrisma, 'tok');
    expect(result).toBeNull();
  });

  it('returns session when valid', async () => {
    const session = {
      id: 's1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000000),
      userId: 'u1',
      workspaceId: 'ws1',
    };
    mockPrisma.userSession.findUnique.mockResolvedValue(session);

    const result = await findSessionByToken(mockPrisma, 'tok');
    expect(result).toEqual(session);
  });
});

describe('revokeSession', () => {
  it('sets revokedAt on the session matching the token hash', async () => {
    const rawToken = 'mytoken';
    mockPrisma.userSession.update.mockResolvedValue({});

    await revokeSession(mockPrisma, rawToken);

    const call = mockPrisma.userSession.update.mock.calls[0][0];
    expect(call.where.tokenHash).toBe(sha256(rawToken));
    expect(call.data.revokedAt).toBeInstanceOf(Date);
  });
});

describe('touchSession', () => {
  it('updates lastSeenAt for the matching session', async () => {
    mockPrisma.userSession.update.mockResolvedValue({});

    await touchSession(mockPrisma, 'tok');

    const call = mockPrisma.userSession.update.mock.calls[0][0];
    expect(call.data.lastSeenAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- tests/db/user-session.repo.test.ts
```
Expected: FAIL — `createUserSession` not found.

- [ ] **Step 3: Implement `user-session.repo.ts`**

Create `packages/db/src/repositories/user-session.repo.ts`:

```typescript
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const SESSION_TTL_DAYS = 30;

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function createUserSession(
  prisma: PrismaClient,
  params: { userId: string; workspaceId: string; rawToken: string },
) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  return prisma.userSession.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      tokenHash: hashToken(params.rawToken),
      expiresAt,
    },
  });
}

export async function findSessionByToken(prisma: PrismaClient, rawToken: string) {
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  return session;
}

export async function revokeSession(prisma: PrismaClient, rawToken: string) {
  await prisma.userSession.update({
    where: { tokenHash: hashToken(rawToken) },
    data: { revokedAt: new Date() },
  });
}

export async function touchSession(prisma: PrismaClient, rawToken: string) {
  await prisma.userSession.update({
    where: { tokenHash: hashToken(rawToken) },
    data: { lastSeenAt: new Date() },
  });
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test -- tests/db/user-session.repo.test.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/user-session.repo.ts tests/db/user-session.repo.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add user-session repository with token hashing

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `scope.repo.ts`

**Files:**
- Create: `packages/db/src/repositories/scope.repo.ts`
- Create: `tests/db/scope.repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/scope.repo.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findScopesByWorkspace,
  findScopeById,
} from '../../packages/db/src/repositories/scope.repo.js';

const mockPrisma = {
  scope: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('findScopesByWorkspace', () => {
  it('queries by workspaceId ordered by name', async () => {
    mockPrisma.scope.findMany.mockResolvedValue([]);

    await findScopesByWorkspace(mockPrisma, 'ws1');

    expect(mockPrisma.scope.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1' },
      orderBy: { name: 'asc' },
    });
  });
});

describe('findScopeById', () => {
  it('queries by id', async () => {
    mockPrisma.scope.findUnique.mockResolvedValue(null);

    await findScopeById(mockPrisma, 'scope1');

    expect(mockPrisma.scope.findUnique).toHaveBeenCalledWith({
      where: { id: 'scope1' },
    });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- tests/db/scope.repo.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/db/src/repositories/scope.repo.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';

export async function findScopesByWorkspace(prisma: PrismaClient, workspaceId: string) {
  return prisma.scope.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
  });
}

export async function findScopeById(prisma: PrismaClient, id: string) {
  return prisma.scope.findUnique({ where: { id } });
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test -- tests/db/scope.repo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/scope.repo.ts tests/db/scope.repo.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add scope repository

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `cwr.repo.ts`

**Files:**
- Create: `packages/db/src/repositories/cwr.repo.ts`
- Create: `tests/db/cwr.repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/cwr.repo.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  upsertCwr,
  findCwrByIssueId,
  computeQueueSection,
} from '../../packages/db/src/repositories/cwr.repo.js';

const mockPrisma = {
  currentWorkRecord: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('upsertCwr', () => {
  it('upserts by issueId', async () => {
    mockPrisma.currentWorkRecord.upsert.mockResolvedValue({ id: 'cwr1' });

    await upsertCwr(mockPrisma, 'issue1', {
      workspaceId: 'ws1',
      currentState: 'In progress',
      openQuestions: [],
      riskScore: 0.3,
      isStale: false,
      sourceMemoryUnitIds: [],
      sourceSnapshotIds: [],
      snapshotSetHash: 'abc',
      dataSources: ['slack'],
      sourceFreshnessAt: new Date('2026-04-24'),
      confidence: 0.9,
      modelId: 'gpt-5.4-nano',
      promptVersion: 'v1',
    });

    const call = mockPrisma.currentWorkRecord.upsert.mock.calls[0][0];
    expect(call.where.issueId).toBe('issue1');
    expect(call.create.issueId).toBe('issue1');
    expect(call.update.currentState).toBe('In progress');
  });
});

describe('findCwrByIssueId', () => {
  it('queries by issueId', async () => {
    mockPrisma.currentWorkRecord.findUnique.mockResolvedValue(null);

    await findCwrByIssueId(mockPrisma, 'issue1');

    expect(mockPrisma.currentWorkRecord.findUnique).toHaveBeenCalledWith({
      where: { issueId: 'issue1' },
    });
  });
});

describe('computeQueueSection', () => {
  it('returns needs_action when isStale', () => {
    const cwr = { isStale: true, riskScore: 0, lastMeaningfulChangeAt: null } as any;
    expect(computeQueueSection(cwr, 0)).toBe('needs_action');
  });

  it('returns needs_action when riskScore >= 0.6', () => {
    const cwr = { isStale: false, riskScore: 0.6, lastMeaningfulChangeAt: null } as any;
    expect(computeQueueSection(cwr, 0)).toBe('needs_action');
  });

  it('returns awaiting_approval when proposals pending and not stale', () => {
    const cwr = { isStale: false, riskScore: 0.1, lastMeaningfulChangeAt: null } as any;
    expect(computeQueueSection(cwr, 2)).toBe('awaiting_approval');
  });

  it('returns recently_changed when changed in last 24h and no higher priority', () => {
    const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const cwr = { isStale: false, riskScore: 0.1, lastMeaningfulChangeAt: recentDate } as any;
    expect(computeQueueSection(cwr, 0)).toBe('recently_changed');
  });

  it('needs_action beats awaiting_approval — stale issue with proposals stays needs_action', () => {
    const cwr = { isStale: true, riskScore: 0, lastMeaningfulChangeAt: null } as any;
    expect(computeQueueSection(cwr, 3)).toBe('needs_action');
  });

  it('returns recently_changed when no CWR exists yet', () => {
    expect(computeQueueSection(null, 0)).toBe('recently_changed');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- tests/db/cwr.repo.test.ts
```

- [ ] **Step 3: Implement**

Create `packages/db/src/repositories/cwr.repo.ts`:

```typescript
import type { PrismaClient, CurrentWorkRecord } from '@prisma/client';
import type { QueueSection } from '@remi/shared';

const RISK_SCORE_THRESHOLD = 0.6;
const RECENT_CHANGE_HOURS = 24;

export type CwrUpsertData = {
  workspaceId: string;
  currentState: string;
  ownerDisplayName?: string | null;
  ownerExternalId?: string | null;
  ownerSource?: string | null;
  blockerSummary?: string | null;
  blockerDetectedAt?: Date | null;
  waitingOnType?: string | null;
  waitingOnDescription?: string | null;
  openQuestions: unknown[];
  nextStep?: string | null;
  riskScore: number;
  urgencyReason?: string | null;
  isStale: boolean;
  staleSince?: Date | null;
  ownerConfirmedAt?: Date | null;
  blockerClearedAt?: Date | null;
  lastJiraStatus?: string | null;
  lastJiraAssigneeId?: string | null;
  sourceMemoryUnitIds: string[];
  sourceSnapshotIds: string[];
  snapshotSetHash: string;
  dataSources: string[];
  sourceFreshnessAt: Date;
  lastMeaningfulChangeAt?: Date | null;
  lastMeaningfulChangeSummary?: string | null;
  confidence: number;
  modelId: string;
  promptVersion: string;
};

export async function upsertCwr(prisma: PrismaClient, issueId: string, data: CwrUpsertData) {
  return prisma.currentWorkRecord.upsert({
    where: { issueId },
    create: { issueId, ...data },
    update: data,
  });
}

export async function findCwrByIssueId(prisma: PrismaClient, issueId: string) {
  return prisma.currentWorkRecord.findUnique({ where: { issueId } });
}

export function computeQueueSection(
  cwr: Pick<CurrentWorkRecord, 'isStale' | 'riskScore' | 'lastMeaningfulChangeAt'> | null,
  pendingProposalCount: number,
): QueueSection {
  if (!cwr) return 'recently_changed';

  if (cwr.isStale || cwr.riskScore >= RISK_SCORE_THRESHOLD) return 'needs_action';

  if (pendingProposalCount > 0) return 'awaiting_approval';

  const cutoff = new Date(Date.now() - RECENT_CHANGE_HOURS * 60 * 60 * 1000);
  if (cwr.lastMeaningfulChangeAt && cwr.lastMeaningfulChangeAt >= cutoff) {
    return 'recently_changed';
  }

  return 'recently_changed';
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test -- tests/db/cwr.repo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/cwr.repo.ts tests/db/cwr.repo.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add CWR repository with queue section logic

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `workflow-config.repo.ts`

**Files:**
- Create: `packages/db/src/repositories/workflow-config.repo.ts`
- Create: `tests/db/workflow-config.repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/workflow-config.repo.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findWorkflowConfigs,
  createWorkflowConfig,
  updateWorkflowConfig,
} from '../../packages/db/src/repositories/workflow-config.repo.js';

const mockPrisma = {
  workflowScopeConfig: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('findWorkflowConfigs', () => {
  it('filters by workspaceId and optional scopeId', async () => {
    mockPrisma.workflowScopeConfig.findMany.mockResolvedValue([]);

    await findWorkflowConfigs(mockPrisma, 'ws1', 'scope1');

    expect(mockPrisma.workflowScopeConfig.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1', scopeId: 'scope1' },
      orderBy: { name: 'asc' },
    });
  });

  it('omits scopeId filter when not provided', async () => {
    mockPrisma.workflowScopeConfig.findMany.mockResolvedValue([]);

    await findWorkflowConfigs(mockPrisma, 'ws1');

    expect(mockPrisma.workflowScopeConfig.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1' },
      orderBy: { name: 'asc' },
    });
  });
});

describe('createWorkflowConfig', () => {
  it('creates with all provided fields', async () => {
    mockPrisma.workflowScopeConfig.create.mockResolvedValue({ id: 'wc1' });

    await createWorkflowConfig(mockPrisma, {
      workspaceId: 'ws1',
      scopeId: 'scope1',
      workflowKey: 'vendor-escalation',
      name: 'Vendor Escalation',
      includedChannelIds: ['C1'],
      includedJiraProjects: ['PROJ'],
      includedMailboxes: ['support@example.com'],
      writebackEnabled: false,
      approvalRequired: true,
    });

    const call = mockPrisma.workflowScopeConfig.create.mock.calls[0][0];
    expect(call.data.workflowKey).toBe('vendor-escalation');
    expect(call.data.writebackEnabled).toBe(false);
  });
});

describe('updateWorkflowConfig', () => {
  it('updates by id', async () => {
    mockPrisma.workflowScopeConfig.update.mockResolvedValue({ id: 'wc1' });

    await updateWorkflowConfig(mockPrisma, 'wc1', { name: 'Updated' } as any);

    const call = mockPrisma.workflowScopeConfig.update.mock.calls[0][0];
    expect(call.where.id).toBe('wc1');
    expect(call.data.name).toBe('Updated');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- tests/db/workflow-config.repo.test.ts
```

- [ ] **Step 3: Implement**

Create `packages/db/src/repositories/workflow-config.repo.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import type { WorkflowConfigCreateRequest } from '@remi/shared';

export async function findWorkflowConfigs(
  prisma: PrismaClient,
  workspaceId: string,
  scopeId?: string,
) {
  return prisma.workflowScopeConfig.findMany({
    where: { workspaceId, ...(scopeId ? { scopeId } : {}) },
    orderBy: { name: 'asc' },
  });
}

export async function createWorkflowConfig(
  prisma: PrismaClient,
  data: WorkflowConfigCreateRequest & { workspaceId: string },
) {
  return prisma.workflowScopeConfig.create({ data });
}

export async function updateWorkflowConfig(
  prisma: PrismaClient,
  id: string,
  data: Partial<WorkflowConfigCreateRequest>,
) {
  return prisma.workflowScopeConfig.update({ where: { id }, data });
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test -- tests/db/workflow-config.repo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/workflow-config.repo.ts tests/db/workflow-config.repo.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add workflow-config repository

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `meaningful-event.repo.ts`

**Files:**
- Create: `packages/db/src/repositories/meaningful-event.repo.ts`
- Create: `tests/db/meaningful-event.repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/meaningful-event.repo.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  upsertMeaningfulEvents,
  findMeaningfulEventsByIssue,
} from '../../packages/db/src/repositories/meaningful-event.repo.js';

const mockPrisma = {
  meaningfulEvent: {
    createMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('upsertMeaningfulEvents', () => {
  it('uses skipDuplicates to honour idempotency keys', async () => {
    mockPrisma.meaningfulEvent.createMany.mockResolvedValue({ count: 1 });

    await upsertMeaningfulEvents(mockPrisma, [
      {
        issueId: 'i1',
        workspaceId: 'ws1',
        idempotencyKey: 'cwr:c1:owner_changed:abc',
        eventType: 'owner_changed',
        summary: 'Owner changed from Alice to Bob',
        source: 'slack',
        occurredAt: new Date('2026-04-24'),
      },
    ]);

    expect(mockPrisma.meaningfulEvent.createMany).toHaveBeenCalledWith({
      data: expect.any(Array),
      skipDuplicates: true,
    });
  });

  it('does nothing when given an empty array', async () => {
    await upsertMeaningfulEvents(mockPrisma, []);
    expect(mockPrisma.meaningfulEvent.createMany).not.toHaveBeenCalled();
  });
});

describe('findMeaningfulEventsByIssue', () => {
  it('queries by issueId ordered desc with cursor pagination', async () => {
    mockPrisma.meaningfulEvent.findMany.mockResolvedValue([]);

    await findMeaningfulEventsByIssue(mockPrisma, 'i1', { limit: 20 });

    expect(mockPrisma.meaningfulEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { issueId: 'i1' },
        orderBy: { occurredAt: 'desc' },
        take: 21,
      }),
    );
  });

  it('applies cursor when provided', async () => {
    mockPrisma.meaningfulEvent.findMany.mockResolvedValue([]);

    await findMeaningfulEventsByIssue(mockPrisma, 'i1', { limit: 20, before: 'event99' });

    const call = mockPrisma.meaningfulEvent.findMany.mock.calls[0][0];
    expect(call.cursor).toEqual({ id: 'event99' });
    expect(call.skip).toBe(1);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test -- tests/db/meaningful-event.repo.test.ts
```

- [ ] **Step 3: Implement**

Create `packages/db/src/repositories/meaningful-event.repo.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';

export type MeaningfulEventInsert = {
  issueId: string;
  workspaceId: string;
  idempotencyKey: string;
  eventType: string;
  summary: string;
  source: string;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  actorName?: string | null;
  metadata?: unknown;
  occurredAt: Date;
};

export async function upsertMeaningfulEvents(
  prisma: PrismaClient,
  events: MeaningfulEventInsert[],
) {
  if (events.length === 0) return;
  await prisma.meaningfulEvent.createMany({ data: events as any, skipDuplicates: true });
}

export async function findMeaningfulEventsByIssue(
  prisma: PrismaClient,
  issueId: string,
  opts: { limit: number; before?: string },
) {
  const { limit, before } = opts;

  const rows = await prisma.meaningfulEvent.findMany({
    where: { issueId },
    orderBy: { occurredAt: 'desc' },
    take: limit + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? events[events.length - 1].id : null;

  return { events, nextCursor };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test -- tests/db/meaningful-event.repo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/meaningful-event.repo.ts tests/db/meaningful-event.repo.test.ts
git commit -m "$(cat <<'EOF'
feat(db): add meaningful-event repository with idempotent upsert and cursor pagination

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Export all new repos from index files

**Files:**
- Modify: `packages/db/src/repositories/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Add exports to `packages/db/src/repositories/index.ts`**

Append to end of `packages/db/src/repositories/index.ts`:

```typescript
export * from './user-session.repo.js';
export * from './scope.repo.js';
export * from './cwr.repo.js';
export * from './workflow-config.repo.js';
export * from './meaningful-event.repo.js';
```

- [ ] **Step 2: Verify `packages/db/src/index.ts` re-exports from repositories**

Check that `packages/db/src/index.ts` contains:
```typescript
export * from './repositories/index.js';
```
If not, add it.

- [ ] **Step 3: Verify the full package builds**

```bash
pnpm --filter @remi/db typecheck
```
Expected: no errors.

- [ ] **Step 4: Run all db tests**

```bash
pnpm test -- tests/db/
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/index.ts packages/db/src/index.ts
git commit -m "$(cat <<'EOF'
feat(db): export all coordination platform repositories

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
