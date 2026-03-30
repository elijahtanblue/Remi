# Autonomous Memory V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an async AI pipeline that turns linked Slack thread activity into cited, structured memory records with approval-gated Jira comment writeback.

**Architecture:** Worker-driven 3-stage pipeline — Gemini Flash-Lite extracts observations per new message, GPT-5.4 nano synthesises bounded rolling snapshots and powers /brief, GPT-5.4 generates Jira comment proposals. Raw source events are always stored first. Derived artifacts store model ID, prompt version, and citation IDs for replayability. Per-workspace feature flag via `WorkspaceMemoryConfig` table.

**Tech Stack:** TypeScript ESM, Prisma + PostgreSQL, SQS/MemoryQueue, `@google/generative-ai`, `openai`, vitest

**Natural milestone:** Tasks 1–12 (data + AI pipeline + worker) form a complete back-end you can test end-to-end before touching any UI. Tasks 13–18 add surfaces.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/db/prisma/schema.prisma` | 5 new models + Workspace/Issue relations |
| Create | `packages/db/src/repositories/memory.repo.ts` | CRUD for all 5 memory models |
| Modify | `packages/db/src/repositories/index.ts` | Export memory repo |
| Modify | `packages/shared/src/types/events.ts` | 4 new queue message types |
| Modify | `packages/shared/src/constants.ts` | 4 new queue names |
| Create | `packages/memory-engine/package.json` | Package manifest + SDK deps |
| Create | `packages/memory-engine/tsconfig.json` | TypeScript config |
| Create | `packages/memory-engine/src/models.ts` | Model ID + prompt version constants |
| Create | `packages/memory-engine/src/clients/interface.ts` | MemoryModelClient interface |
| Create | `packages/memory-engine/src/clients/gemini.ts` | Gemini Flash-Lite client |
| Create | `packages/memory-engine/src/clients/openai.ts` | OpenAI nano + frontier client |
| Create | `packages/memory-engine/src/pipeline/stage1-extract.ts` | Per-message extraction (Gemini) |
| Create | `packages/memory-engine/src/pipeline/stage2-snapshot.ts` | Bounded snapshot synthesis (nano) |
| Create | `packages/memory-engine/src/pipeline/stage3-propose.ts` | Jira comment proposal (GPT-5.4) |
| Create | `packages/memory-engine/src/pipeline/run.ts` | Pipeline orchestrator |
| Create | `packages/memory-engine/src/index.ts` | Package public exports |
| Create | `apps/worker/src/handlers/memory-jobs.ts` | 4 memory job handlers |
| Modify | `apps/worker/src/config.ts` | API keys + 4 new SQS URL env vars |
| Modify | `apps/worker/src/index.ts` | Register 4 new queue consumers |
| Modify | `apps/worker/src/handlers/slack-events.ts` | Enqueue memory.extract on new messages |
| Modify | `apps/worker/src/handlers/jira-events.ts` | Enqueue memory.extract on Jira events |
| Create | `apps/api/src/routes/admin/memory.ts` | Memory unit + proposal admin routes |
| Modify | `apps/api/src/routes/admin/index.ts` | Mount memory routes |
| Modify | `packages/slack/src/commands/brief.ts` | Read MemorySnapshot when flag enabled |
| Modify | `packages/slack/src/views/app-home.ts` | Show memory units + pending approvals |
| Create | `apps/admin/src/app/memory/page.tsx` | Memory unit list page |
| Create | `apps/admin/src/app/memory/[unitId]/page.tsx` | Unit detail + proposals page |
| Create | `tests/memory-engine/stage1-extract.test.ts` | Stage 1 unit tests |
| Create | `tests/memory-engine/stage2-snapshot.test.ts` | Stage 2 unit tests |
| Create | `tests/memory-engine/stage3-propose.test.ts` | Stage 3 unit tests |

---

## Task 1: Prisma Schema — 5 New Models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add memory relations to existing Workspace and Issue models**

In `schema.prisma`, add to the `Workspace` model (after `productEvents ProductEvent[]`):

```prisma
  memoryConfig  WorkspaceMemoryConfig?
  memoryUnits   MemoryUnit[]
```

Add to the `Issue` model (after `summaries Summary[]`):

```prisma
  memoryUnits MemoryUnit[]
```

- [ ] **Step 2: Append the 5 new models at the end of schema.prisma**

```prisma
// ─── Autonomous Memory ────────────────────────────────────────────────────────

model WorkspaceMemoryConfig {
  id                 String   @id @default(cuid())
  workspaceId        String   @unique
  enabled            Boolean  @default(false)
  excludedChannelIds String[]
  excludedUserIds    String[]
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@map("workspace_memory_configs")
}

model MemoryUnit {
  id          String   @id @default(cuid())
  workspaceId String
  scopeType   String   // 'issue_thread' | 'app_dm'
  scopeRef    String   // threadId for issue_thread, slackUserId for app_dm
  issueId     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace    Workspace                @relation(fields: [workspaceId], references: [id])
  issue        Issue?                   @relation(fields: [issueId], references: [id])
  observations MemoryObservation[]
  snapshots    MemorySnapshot[]
  proposals    MemoryWritebackProposal[]

  @@unique([workspaceId, scopeType, scopeRef])
  @@index([workspaceId])
  @@index([issueId])
  @@map("memory_units")
}

model MemoryObservation {
  id            String   @id @default(cuid())
  memoryUnitId  String
  category      String   // 'decision'|'action_item'|'blocker'|'open_question'|'status_update'|'owner_update'|'risk'
  content       String
  confidence    Float
  citationIds   String[]
  modelId       String
  promptVersion String
  extractedAt   DateTime @default(now())

  memoryUnit MemoryUnit @relation(fields: [memoryUnitId], references: [id])

  @@index([memoryUnitId, extractedAt])
  @@map("memory_observations")
}

model MemorySnapshot {
  id            String   @id @default(cuid())
  memoryUnitId  String
  version       Int
  headline      String
  currentState  String
  keyDecisions  Json
  openActions   Json
  blockers      Json
  openQuestions Json
  owners        String[]
  confidence    Float
  freshness     DateTime
  modelId       String
  promptVersion String
  sourceObsIds  String[]
  createdAt     DateTime @default(now())

  memoryUnit MemoryUnit               @relation(fields: [memoryUnitId], references: [id])
  proposals  MemoryWritebackProposal[]

  @@index([memoryUnitId, version])
  @@map("memory_snapshots")
}

model MemoryWritebackProposal {
  id            String    @id @default(cuid())
  memoryUnitId  String
  snapshotId    String
  target        String    // 'jira_comment'
  status        String    @default("draft") // 'draft'|'pending_approval'|'approved'|'applied'|'rejected'|'failed'
  payload       Json      // { jiraIssueKey: string; commentBody: string }
  citationIds   String[]
  confidence    Float
  modelId       String
  promptVersion String
  approvedBy    String?
  approvedAt    DateTime?
  appliedAt     DateTime?
  rejectedAt    DateTime?
  failureReason String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  memoryUnit MemoryUnit     @relation(fields: [memoryUnitId], references: [id])
  snapshot   MemorySnapshot @relation(fields: [snapshotId], references: [id])

  @@index([memoryUnitId])
  @@index([status])
  @@map("memory_writeback_proposals")
}
```

- [ ] **Step 3: Run migration**

```bash
cd "d:/Vibe Coded Projects/MemoryAI"
pnpm --filter @remi/db exec prisma migrate dev --name autonomous_memory_v1
```

Expected: Migration created and applied, Prisma client regenerated.

- [ ] **Step 4: Verify build passes**

```bash
pnpm build
```

Expected: All 12 build tasks pass.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add autonomous memory schema — 5 new models"
```

---

## Task 2: Memory Repository

**Files:**
- Create: `packages/db/src/repositories/memory.repo.ts`
- Modify: `packages/db/src/repositories/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/memory/memory.repo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findOrCreateMemoryUnit,
  getMemoryConfig,
  getLatestSnapshot,
  createObservations,
  listObservationsSince,
  createSnapshot,
  createProposal,
  updateProposalStatus,
} from '../../packages/db/src/repositories/memory.repo.js';

const mockPrisma = {
  workspaceMemoryConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  memoryUnit: { findUnique: vi.fn(), create: vi.fn() },
  memoryObservation: { createMany: vi.fn(), findMany: vi.fn() },
  memorySnapshot: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
  memoryWritebackProposal: { create: vi.fn(), update: vi.fn() },
} as any;

beforeEach(() => { vi.clearAllMocks(); });

describe('getMemoryConfig', () => {
  it('returns null when no config exists', async () => {
    mockPrisma.workspaceMemoryConfig.findUnique.mockResolvedValue(null);
    const result = await getMemoryConfig(mockPrisma, 'ws1');
    expect(result).toBeNull();
    expect(mockPrisma.workspaceMemoryConfig.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1' },
    });
  });
});

describe('findOrCreateMemoryUnit', () => {
  it('returns existing unit with created=false', async () => {
    const unit = { id: 'u1', workspaceId: 'ws1', scopeType: 'issue_thread', scopeRef: 't1' };
    mockPrisma.memoryUnit.findUnique.mockResolvedValue(unit);
    const result = await findOrCreateMemoryUnit(mockPrisma, 'ws1', 'issue_thread', 't1');
    expect(result).toEqual({ unit, created: false });
    expect(mockPrisma.memoryUnit.create).not.toHaveBeenCalled();
  });

  it('creates new unit with created=true when not found', async () => {
    const unit = { id: 'u2', workspaceId: 'ws1', scopeType: 'issue_thread', scopeRef: 't2' };
    mockPrisma.memoryUnit.findUnique.mockResolvedValue(null);
    mockPrisma.memoryUnit.create.mockResolvedValue(unit);
    const result = await findOrCreateMemoryUnit(mockPrisma, 'ws1', 'issue_thread', 't2');
    expect(result).toEqual({ unit, created: true });
  });
});

describe('createObservations', () => {
  it('calls createMany with correct shape', async () => {
    mockPrisma.memoryObservation.createMany.mockResolvedValue({ count: 2 });
    const obs = [
      { category: 'decision', content: 'We chose React', confidence: 0.9, citationIds: ['msg1'], modelId: 'gemini-2.5-flash-lite', promptVersion: 'v1' },
      { category: 'blocker', content: 'Auth is broken', confidence: 0.8, citationIds: ['msg2'], modelId: 'gemini-2.5-flash-lite', promptVersion: 'v1' },
    ];
    await createObservations(mockPrisma, 'u1', obs);
    expect(mockPrisma.memoryObservation.createMany).toHaveBeenCalledWith({
      data: obs.map(o => ({ ...o, memoryUnitId: 'u1' })),
    });
  });
});

describe('listObservationsSince', () => {
  it('queries with extractedAt filter', async () => {
    const since = new Date('2026-01-01');
    mockPrisma.memoryObservation.findMany.mockResolvedValue([]);
    await listObservationsSince(mockPrisma, 'u1', since);
    expect(mockPrisma.memoryObservation.findMany).toHaveBeenCalledWith({
      where: { memoryUnitId: 'u1', extractedAt: { gt: since } },
      orderBy: { extractedAt: 'asc' },
    });
  });
});

describe('getLatestSnapshot', () => {
  it('fetches snapshot ordered by version desc', async () => {
    mockPrisma.memorySnapshot.findFirst.mockResolvedValue(null);
    await getLatestSnapshot(mockPrisma, 'u1');
    expect(mockPrisma.memorySnapshot.findFirst).toHaveBeenCalledWith({
      where: { memoryUnitId: 'u1' },
      orderBy: { version: 'desc' },
    });
  });
});

describe('updateProposalStatus', () => {
  it('sets approvedAt when transitioning to approved', async () => {
    mockPrisma.memoryWritebackProposal.update.mockResolvedValue({});
    await updateProposalStatus(mockPrisma, 'p1', 'approved', { approvedBy: 'user1' });
    const call = mockPrisma.memoryWritebackProposal.update.mock.calls[0][0];
    expect(call.data.status).toBe('approved');
    expect(call.data.approvedBy).toBe('user1');
    expect(call.data.approvedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test tests/memory/memory.repo.test.ts
```

Expected: FAIL — cannot find module `memory.repo.js`

- [ ] **Step 3: Create the repository**

Create `packages/db/src/repositories/memory.repo.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';

// ─── WorkspaceMemoryConfig ────────────────────────────────────────────────────

export async function getMemoryConfig(prisma: PrismaClient, workspaceId: string) {
  return prisma.workspaceMemoryConfig.findUnique({ where: { workspaceId } });
}

export async function upsertMemoryConfig(
  prisma: PrismaClient,
  workspaceId: string,
  data: { enabled?: boolean; excludedChannelIds?: string[]; excludedUserIds?: string[] },
) {
  return prisma.workspaceMemoryConfig.upsert({
    where: { workspaceId },
    create: { workspaceId, enabled: data.enabled ?? false, excludedChannelIds: data.excludedChannelIds ?? [], excludedUserIds: data.excludedUserIds ?? [] },
    update: data,
  });
}

// ─── MemoryUnit ───────────────────────────────────────────────────────────────

export async function findOrCreateMemoryUnit(
  prisma: PrismaClient,
  workspaceId: string,
  scopeType: 'issue_thread' | 'app_dm',
  scopeRef: string,
  issueId?: string,
): Promise<{ unit: Awaited<ReturnType<typeof prisma.memoryUnit.findUnique>> & object; created: boolean }> {
  const existing = await prisma.memoryUnit.findUnique({
    where: { workspaceId_scopeType_scopeRef: { workspaceId, scopeType, scopeRef } },
  });
  if (existing) return { unit: existing, created: false };
  const unit = await prisma.memoryUnit.create({
    data: { workspaceId, scopeType, scopeRef, issueId },
  });
  return { unit, created: true };
}

export async function getMemoryUnit(prisma: PrismaClient, id: string) {
  return prisma.memoryUnit.findUnique({
    where: { id },
    include: { issue: { select: { jiraIssueKey: true, jiraSiteUrl: true } } },
  });
}

export async function listMemoryUnits(
  prisma: PrismaClient,
  workspaceId: string,
  opts?: { limit?: number; offset?: number },
) {
  return prisma.memoryUnit.findMany({
    where: { workspaceId },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
    orderBy: { updatedAt: 'desc' },
    include: { issue: { select: { jiraIssueKey: true } } },
  });
}

// ─── MemoryObservation ────────────────────────────────────────────────────────

export async function createObservations(
  prisma: PrismaClient,
  memoryUnitId: string,
  observations: Array<{
    category: string;
    content: string;
    confidence: number;
    citationIds: string[];
    modelId: string;
    promptVersion: string;
  }>,
) {
  return prisma.memoryObservation.createMany({
    data: observations.map(o => ({ ...o, memoryUnitId })),
  });
}

export async function listObservationsSince(
  prisma: PrismaClient,
  memoryUnitId: string,
  since: Date,
) {
  return prisma.memoryObservation.findMany({
    where: { memoryUnitId, extractedAt: { gt: since } },
    orderBy: { extractedAt: 'asc' },
  });
}

// ─── MemorySnapshot ───────────────────────────────────────────────────────────

export async function getLatestSnapshot(prisma: PrismaClient, memoryUnitId: string) {
  return prisma.memorySnapshot.findFirst({
    where: { memoryUnitId },
    orderBy: { version: 'desc' },
  });
}

export async function listSnapshots(prisma: PrismaClient, memoryUnitId: string) {
  return prisma.memorySnapshot.findMany({
    where: { memoryUnitId },
    orderBy: { version: 'desc' },
    take: 20,
  });
}

export async function createSnapshot(
  prisma: PrismaClient,
  data: {
    memoryUnitId: string;
    headline: string;
    currentState: string;
    keyDecisions: string[];
    openActions: Array<{ description: string; assignee?: string; dueDate?: string }>;
    blockers: string[];
    openQuestions: string[];
    owners: string[];
    confidence: number;
    freshness: Date;
    modelId: string;
    promptVersion: string;
    sourceObsIds: string[];
  },
) {
  const count = await prisma.memorySnapshot.count({ where: { memoryUnitId: data.memoryUnitId } });
  return prisma.memorySnapshot.create({
    data: {
      ...data,
      version: count + 1,
      keyDecisions: data.keyDecisions,
      openActions: data.openActions,
      blockers: data.blockers,
      openQuestions: data.openQuestions,
    },
  });
}

// ─── MemoryWritebackProposal ──────────────────────────────────────────────────

export async function createProposal(
  prisma: PrismaClient,
  data: {
    memoryUnitId: string;
    snapshotId: string;
    payload: { jiraIssueKey: string; commentBody: string };
    citationIds: string[];
    confidence: number;
    modelId: string;
    promptVersion: string;
  },
) {
  return prisma.memoryWritebackProposal.create({
    data: { ...data, target: 'jira_comment', status: 'pending_approval' },
  });
}

export async function getProposal(prisma: PrismaClient, id: string) {
  return prisma.memoryWritebackProposal.findUnique({ where: { id } });
}

export async function listPendingProposals(prisma: PrismaClient, workspaceId: string) {
  return prisma.memoryWritebackProposal.findMany({
    where: { status: 'pending_approval', memoryUnit: { workspaceId } },
    orderBy: { createdAt: 'desc' },
    include: { memoryUnit: { select: { scopeRef: true, issueId: true } } },
  });
}

export async function updateProposalStatus(
  prisma: PrismaClient,
  id: string,
  status: 'approved' | 'applied' | 'rejected' | 'failed',
  meta?: { approvedBy?: string; failureReason?: string },
) {
  const now = new Date();
  return prisma.memoryWritebackProposal.update({
    where: { id },
    data: {
      status,
      ...(status === 'approved' && { approvedAt: now, approvedBy: meta?.approvedBy }),
      ...(status === 'applied' && { appliedAt: now }),
      ...(status === 'rejected' && { rejectedAt: now }),
      ...(status === 'failed' && { failureReason: meta?.failureReason }),
    },
  });
}
```

- [ ] **Step 4: Export from index**

Add to `packages/db/src/repositories/index.ts`:

```typescript
export * from './memory.repo.js';
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm test tests/memory/memory.repo.test.ts
```

Expected: All 6 tests pass.

- [ ] **Step 6: Build**

```bash
pnpm build
```

Expected: All tasks pass.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/repositories/memory.repo.ts packages/db/src/repositories/index.ts tests/memory/memory.repo.test.ts
git commit -m "feat(db): memory repository — CRUD for all 5 memory models"
```

---

## Task 3: Shared Queue Types + Constants

**Files:**
- Modify: `packages/shared/src/types/events.ts`
- Modify: `packages/shared/src/constants.ts`

- [ ] **Step 1: Add 4 new queue message types to events.ts**

Add before the `// ─── Union ───` comment:

```typescript
// ─── Memory Jobs ───

export interface MemoryExtractMessage extends BaseQueueMessage {
  type: 'memory_extract';
  payload: {
    memoryUnitId: string;
    sourceType: 'slack_message' | 'jira_event';
    sourceId: string;
  };
}

export interface MemorySnapshotMessage extends BaseQueueMessage {
  type: 'memory_snapshot';
  payload: {
    memoryUnitId: string;
  };
}

export interface MemoryWritebackProposeMessage extends BaseQueueMessage {
  type: 'memory_writeback_propose';
  payload: {
    memoryUnitId: string;
    snapshotId: string;
  };
}

export interface MemoryWritebackApplyMessage extends BaseQueueMessage {
  type: 'memory_writeback_apply';
  payload: {
    proposalId: string;
  };
}
```

Update the union type:

```typescript
export type QueueMessage =
  | SlackEventMessage
  | JiraEventMessage
  | SummaryJobMessage
  | BackfillJobMessage
  | MemoryExtractMessage
  | MemorySnapshotMessage
  | MemoryWritebackProposeMessage
  | MemoryWritebackApplyMessage;
```

- [ ] **Step 2: Add 4 new queue names to constants.ts**

Add inside `QueueNames`:

```typescript
export const QueueNames = {
  SLACK_EVENTS: 'slack-events',
  JIRA_EVENTS: 'jira-events',
  SUMMARY_JOBS: 'summary-jobs',
  BACKFILL_JOBS: 'backfill-jobs',
  DEAD_LETTER: 'dead-letter',
  MEMORY_EXTRACT: 'memory-extract',
  MEMORY_SNAPSHOT: 'memory-snapshot',
  MEMORY_WRITEBACK_PROPOSE: 'memory-writeback-propose',
  MEMORY_WRITEBACK_APPLY: 'memory-writeback-apply',
} as const;
```

- [ ] **Step 3: Build and verify**

```bash
pnpm build
```

Expected: All tasks pass.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/events.ts packages/shared/src/constants.ts
git commit -m "feat(shared): add memory queue message types and queue names"
```

---

## Task 4: Memory Engine Package Scaffold

**Files:**
- Create: `packages/memory-engine/package.json`
- Create: `packages/memory-engine/tsconfig.json`
- Create: `packages/memory-engine/src/models.ts`
- Create: `packages/memory-engine/src/index.ts`

- [ ] **Step 1: Create package.json**

Create `packages/memory-engine/package.json`:

```json
{
  "name": "@remi/memory-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.0",
    "openai": "^4.96.0",
    "@remi/db": "workspace:*",
    "@remi/shared": "workspace:*",
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/memory-engine/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Install SDK dependencies**

```bash
pnpm add --filter @remi/memory-engine @google/generative-ai openai
```

Expected: Both packages installed in `packages/memory-engine/node_modules`.

- [ ] **Step 4: Create models.ts — model ID and prompt version constants**

Create `packages/memory-engine/src/models.ts`:

```typescript
// Model IDs — update here to swap models across the pipeline
export const MODELS = {
  STAGE1_EXTRACT: 'gemini-2.5-flash-lite',   // Gemini: high-volume per-message extraction
  STAGE2_SNAPSHOT: 'gpt-5.4-nano',           // OpenAI: snapshot synthesis + /brief
  STAGE3_PROPOSE: 'gpt-5.4',                 // OpenAI: writeback proposal generation (escalation)
} as const;

// Bump when system prompts change so artifacts remain replayable
export const PROMPT_VERSIONS = {
  STAGE1_EXTRACT: 'v1',
  STAGE2_SNAPSHOT: 'v1',
  STAGE3_PROPOSE: 'v1',
} as const;

// Minimum confidence required for a proposal to be surfaced for approval
export const MIN_PROPOSAL_CONFIDENCE = 0.65;

// Minimum confidence required for an observation to be included in snapshots
export const MIN_OBSERVATION_CONFIDENCE = 0.50;
```

- [ ] **Step 5: Create placeholder index.ts**

Create `packages/memory-engine/src/index.ts`:

```typescript
// Populated as pipeline stages are implemented
export * from './models.js';
```

- [ ] **Step 6: Register in workspace**

Check `pnpm-workspace.yaml` includes `packages/*`. If it doesn't list `packages/memory-engine` explicitly, no change needed (glob covers it).

- [ ] **Step 7: Build**

```bash
pnpm build
```

Expected: `@remi/memory-engine` builds. All other tasks pass.

- [ ] **Step 8: Commit**

```bash
git add packages/memory-engine/
git commit -m "feat(memory-engine): package scaffold, model constants"
```

---

## Task 5: Model Client Interface + Gemini Client

**Files:**
- Create: `packages/memory-engine/src/clients/interface.ts`
- Create: `packages/memory-engine/src/clients/gemini.ts`

- [ ] **Step 1: Write failing test**

Create `tests/memory-engine/clients.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createGeminiClient } from '../../packages/memory-engine/src/clients/gemini.js';
import { createOpenAiClient } from '../../packages/memory-engine/src/clients/openai.js';

describe('createGeminiClient', () => {
  it('returns an object with a complete method', () => {
    const client = createGeminiClient('fake-key');
    expect(typeof client.complete).toBe('function');
  });
});

describe('createOpenAiClient', () => {
  it('returns an object with a complete method', () => {
    const client = createOpenAiClient('fake-key');
    expect(typeof client.complete).toBe('function');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm test tests/memory-engine/clients.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Create interface.ts**

Create `packages/memory-engine/src/clients/interface.ts`:

```typescript
export interface MemoryModelClient {
  /**
   * Send a completion request. Returns the raw text response from the model.
   * Throws on non-retryable errors. Callers are responsible for JSON parsing.
   */
  complete(systemPrompt: string, userContent: string): Promise<string>;
}
```

- [ ] **Step 4: Create gemini.ts**

Create `packages/memory-engine/src/clients/gemini.ts`:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { MemoryModelClient } from './interface.js';
import { MODELS } from '../models.js';

export function createGeminiClient(apiKey: string): MemoryModelClient {
  const genai = new GoogleGenerativeAI(apiKey);

  return {
    async complete(systemPrompt: string, userContent: string): Promise<string> {
      const model = genai.getGenerativeModel({
        model: MODELS.STAGE1_EXTRACT,
        systemInstruction: systemPrompt,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const result = await model.generateContent(userContent);
      const text = result.response.text();

      if (!text) throw new Error('[gemini] Empty response from model');
      return text;
    },
  };
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
pnpm test tests/memory-engine/clients.test.ts
```

Expected: 2 tests pass (once openai.ts exists from Task 6 — run after Task 6 if needed).

- [ ] **Step 6: Commit (after Task 6 completes)**

Hold commit until openai.ts is created. See Task 6 step 5.

---

## Task 6: OpenAI Client

**Files:**
- Create: `packages/memory-engine/src/clients/openai.ts`

- [ ] **Step 1: Create openai.ts**

Create `packages/memory-engine/src/clients/openai.ts`:

```typescript
import OpenAI from 'openai';
import type { MemoryModelClient } from './interface.js';

export function createOpenAiClient(apiKey: string, model?: string): MemoryModelClient {
  const client = new OpenAI({ apiKey });

  return {
    async complete(systemPrompt: string, userContent: string): Promise<string> {
      const response = await client.chat.completions.create({
        model: model ?? 'gpt-5.4-nano',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error('[openai] Empty response from model');
      return text;
    },
  };
}
```

- [ ] **Step 2: Export both clients from index.ts**

Update `packages/memory-engine/src/index.ts`:

```typescript
export * from './models.js';
export * from './clients/interface.js';
export * from './clients/gemini.js';
export * from './clients/openai.js';
```

- [ ] **Step 3: Run tests — verify both pass**

```bash
pnpm test tests/memory-engine/clients.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: All tasks pass.

- [ ] **Step 5: Commit**

```bash
git add packages/memory-engine/src/clients/ tests/memory-engine/clients.test.ts packages/memory-engine/src/index.ts
git commit -m "feat(memory-engine): model client interface, Gemini and OpenAI implementations"
```

---

## Task 7: Stage 1 — Per-Message Extraction

**Files:**
- Create: `packages/memory-engine/src/pipeline/stage1-extract.ts`
- Create: `tests/memory-engine/stage1-extract.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/memory-engine/stage1-extract.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildExtractionPrompt, parseExtractionResponse } from '../../packages/memory-engine/src/pipeline/stage1-extract.js';

describe('buildExtractionPrompt', () => {
  it('returns a non-empty system prompt string', () => {
    const prompt = buildExtractionPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain('decision');
    expect(prompt).toContain('action_item');
    expect(prompt).toContain('blocker');
  });
});

describe('parseExtractionResponse', () => {
  it('parses valid extraction response', () => {
    const raw = JSON.stringify({
      observations: [
        { category: 'decision', content: 'We chose Postgres', confidence: 0.92, citationIds: ['msg1'] },
      ],
    });
    const result = parseExtractionResponse(raw);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].category).toBe('decision');
    expect(result.observations[0].confidence).toBe(0.92);
  });

  it('returns empty observations array on empty model response', () => {
    const raw = JSON.stringify({ observations: [] });
    const result = parseExtractionResponse(raw);
    expect(result.observations).toHaveLength(0);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseExtractionResponse('not json')).toThrow();
  });

  it('filters out observations below minimum confidence', () => {
    const raw = JSON.stringify({
      observations: [
        { category: 'decision', content: 'Maybe we will use React', confidence: 0.3, citationIds: [] },
        { category: 'blocker', content: 'Auth is blocked', confidence: 0.85, citationIds: ['msg2'] },
      ],
    });
    const result = parseExtractionResponse(raw);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].category).toBe('blocker');
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm test tests/memory-engine/stage1-extract.test.ts
```

Expected: FAIL — cannot find module

- [ ] **Step 3: Implement stage1-extract.ts**

Create `packages/memory-engine/src/pipeline/stage1-extract.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { createObservations } from '@remi/db';
import type { MemoryModelClient } from '../clients/interface.js';
import { MODELS, PROMPT_VERSIONS, MIN_OBSERVATION_CONFIDENCE } from '../models.js';

export interface ExtractionObservation {
  category: 'decision' | 'action_item' | 'blocker' | 'open_question' | 'status_update' | 'owner_update' | 'risk';
  content: string;
  confidence: number;
  citationIds: string[];
}

export interface ExtractionResult {
  observations: ExtractionObservation[];
}

export function buildExtractionPrompt(): string {
  return `You are an information extraction engine for a workplace operations tool called Remi.

Given a Slack message, extract structured observations. Return a JSON object with an "observations" array.

Each observation has:
- category: one of "decision" | "action_item" | "blocker" | "open_question" | "status_update" | "owner_update" | "risk"
- content: a clear, concise statement (1-2 sentences, no filler words)
- confidence: a float from 0.0 to 1.0 representing how certain the observation is
- citationIds: array of source message IDs provided in the input

Rules:
- Only extract what is clearly stated. Do not infer or speculate.
- If the message contains no extractable observations, return { "observations": [] }
- action_item: implies an assignee or explicit next step
- decision: something agreed or resolved
- blocker: something preventing progress right now
- open_question: an unresolved question that affects the work
- status_update: progress reporting with no clear decision or action
- owner_update: a change in who is responsible for the work
- risk: a potential future problem not yet materialised

Return only valid JSON. No markdown, no explanation outside the JSON object.`;
}

export function parseExtractionResponse(raw: string): ExtractionResult {
  const parsed = JSON.parse(raw) as { observations?: unknown[] };
  if (!Array.isArray(parsed.observations)) {
    return { observations: [] };
  }
  const observations = (parsed.observations as ExtractionObservation[]).filter(
    (o) => typeof o.confidence === 'number' && o.confidence >= MIN_OBSERVATION_CONFIDENCE,
  );
  return { observations };
}

export async function runStage1(
  prisma: PrismaClient,
  memoryUnitId: string,
  sourceId: string,
  sourceType: 'slack_message' | 'jira_event',
  messageText: string,
  client: MemoryModelClient,
): Promise<ExtractionResult> {
  const systemPrompt = buildExtractionPrompt();
  const userContent = JSON.stringify({ sourceId, sourceType, message: messageText });

  const raw = await client.complete(systemPrompt, userContent);
  const result = parseExtractionResponse(raw);

  if (result.observations.length > 0) {
    await createObservations(prisma, memoryUnitId, result.observations.map((o) => ({
      ...o,
      modelId: MODELS.STAGE1_EXTRACT,
      promptVersion: PROMPT_VERSIONS.STAGE1_EXTRACT,
    })));
  }

  return result;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test tests/memory-engine/stage1-extract.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Build**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add packages/memory-engine/src/pipeline/stage1-extract.ts tests/memory-engine/stage1-extract.test.ts
git commit -m "feat(memory-engine): stage 1 extraction — Gemini Flash-Lite per-message observations"
```

---

## Task 8: Stage 2 — Snapshot Synthesis

**Files:**
- Create: `packages/memory-engine/src/pipeline/stage2-snapshot.ts`
- Create: `tests/memory-engine/stage2-snapshot.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/memory-engine/stage2-snapshot.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSnapshotPrompt, parseSnapshotResponse } from '../../packages/memory-engine/src/pipeline/stage2-snapshot.js';

describe('buildSnapshotPrompt', () => {
  it('returns a string containing key schema fields', () => {
    const prompt = buildSnapshotPrompt();
    expect(prompt).toContain('headline');
    expect(prompt).toContain('keyDecisions');
    expect(prompt).toContain('openActions');
    expect(prompt).toContain('blockers');
    expect(prompt).toContain('openQuestions');
    expect(prompt).toContain('confidence');
  });
});

describe('parseSnapshotResponse', () => {
  const validSnapshot = {
    headline: 'Auth service is blocked on OAuth provider.',
    currentState: 'Team is waiting for vendor credentials.',
    keyDecisions: ['Use OAuth2 for auth'],
    openActions: [{ description: 'Chase vendor for credentials', assignee: 'alice' }],
    blockers: ['OAuth credentials not received'],
    openQuestions: ['Which OAuth provider to use?'],
    owners: ['alice', 'bob'],
    confidence: 0.82,
  };

  it('parses a valid snapshot', () => {
    const result = parseSnapshotResponse(JSON.stringify(validSnapshot));
    expect(result.headline).toBe(validSnapshot.headline);
    expect(result.keyDecisions).toHaveLength(1);
    expect(result.openActions[0].assignee).toBe('alice');
    expect(result.confidence).toBe(0.82);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseSnapshotResponse('bad json')).toThrow();
  });

  it('defaults missing array fields to empty arrays', () => {
    const minimal = { headline: 'Test', currentState: 'Running', confidence: 0.7 };
    const result = parseSnapshotResponse(JSON.stringify(minimal));
    expect(result.keyDecisions).toEqual([]);
    expect(result.openActions).toEqual([]);
    expect(result.blockers).toEqual([]);
    expect(result.openQuestions).toEqual([]);
    expect(result.owners).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm test tests/memory-engine/stage2-snapshot.test.ts
```

- [ ] **Step 3: Implement stage2-snapshot.ts**

Create `packages/memory-engine/src/pipeline/stage2-snapshot.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { getLatestSnapshot, listObservationsSince, createSnapshot } from '@remi/db';
import type { MemoryModelClient } from '../clients/interface.js';
import { MODELS, PROMPT_VERSIONS } from '../models.js';

export interface SnapshotResult {
  headline: string;
  currentState: string;
  keyDecisions: string[];
  openActions: Array<{ description: string; assignee?: string; dueDate?: string }>;
  blockers: string[];
  openQuestions: string[];
  owners: string[];
  confidence: number;
}

export function buildSnapshotPrompt(): string {
  return `You are a memory synthesis engine for a workplace operations tool called Remi.

Given a prior memory snapshot (may be null for first run) and a list of new observations, produce an updated structured memory snapshot.

Return JSON with exactly these fields:
- headline: one sentence capturing the current state (max 15 words)
- currentState: 2-3 sentences describing what is happening right now
- keyDecisions: string array of decided items (include prior decisions unless superseded)
- openActions: array of { description: string, assignee?: string, dueDate?: string }
- blockers: string array of current blockers
- openQuestions: string array of unresolved questions
- owners: string array of responsible people (names or Slack user IDs)
- confidence: float 0.0–1.0, your overall confidence in this snapshot

Rules:
- Do not duplicate items already in the prior snapshot unless updated
- If a prior blocker is resolved by new observations, remove it
- If a prior open action appears complete, remove it from openActions
- If new observations contradict the prior snapshot, prefer the newer information
- If no meaningful state exists, set confidence below 0.5
- Return only valid JSON. No markdown, no explanation.`;
}

export function parseSnapshotResponse(raw: string): SnapshotResult {
  const parsed = JSON.parse(raw) as Partial<SnapshotResult>;
  return {
    headline: parsed.headline ?? '',
    currentState: parsed.currentState ?? '',
    keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
    openActions: Array.isArray(parsed.openActions) ? parsed.openActions : [],
    blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
    openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
    owners: Array.isArray(parsed.owners) ? parsed.owners : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
  };
}

export async function runStage2(
  prisma: PrismaClient,
  memoryUnitId: string,
  client: MemoryModelClient,
): Promise<{ snapshot: Awaited<ReturnType<typeof createSnapshot>>; isNew: boolean }> {
  const prior = await getLatestSnapshot(prisma, memoryUnitId);
  const since = prior ? prior.createdAt : new Date(0);
  const newObservations = await listObservationsSince(prisma, memoryUnitId, since);

  if (newObservations.length === 0) {
    if (!prior) throw new Error(`[stage2] No observations and no prior snapshot for unit ${memoryUnitId}`);
    return { snapshot: prior as any, isNew: false };
  }

  const systemPrompt = buildSnapshotPrompt();
  const userContent = JSON.stringify({
    priorSnapshot: prior
      ? { headline: prior.headline, currentState: prior.currentState, keyDecisions: prior.keyDecisions, openActions: prior.openActions, blockers: prior.blockers, openQuestions: prior.openQuestions, owners: prior.owners }
      : null,
    newObservations: newObservations.map((o) => ({ category: o.category, content: o.content, confidence: o.confidence })),
  });

  const raw = await client.complete(systemPrompt, userContent);
  const result = parseSnapshotResponse(raw);

  const snapshot = await createSnapshot(prisma, {
    memoryUnitId,
    ...result,
    freshness: new Date(),
    modelId: MODELS.STAGE2_SNAPSHOT,
    promptVersion: PROMPT_VERSIONS.STAGE2_SNAPSHOT,
    sourceObsIds: newObservations.map((o) => o.id),
  });

  return { snapshot, isNew: true };
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
pnpm test tests/memory-engine/stage2-snapshot.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Build + Commit**

```bash
pnpm build
git add packages/memory-engine/src/pipeline/stage2-snapshot.ts tests/memory-engine/stage2-snapshot.test.ts
git commit -m "feat(memory-engine): stage 2 snapshot synthesis — GPT-5.4 nano bounded rolling memory"
```

---

## Task 9: Stage 3 — Writeback Proposal

**Files:**
- Create: `packages/memory-engine/src/pipeline/stage3-propose.ts`
- Create: `tests/memory-engine/stage3-propose.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/memory-engine/stage3-propose.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildProposalPrompt, parseProposalResponse } from '../../packages/memory-engine/src/pipeline/stage3-propose.js';

describe('buildProposalPrompt', () => {
  it('instructs model to return commentBody and confidence', () => {
    const prompt = buildProposalPrompt();
    expect(prompt).toContain('commentBody');
    expect(prompt).toContain('confidence');
    expect(prompt).toContain('Remi Memory Update');
  });
});

describe('parseProposalResponse', () => {
  it('parses valid proposal response', () => {
    const raw = JSON.stringify({ commentBody: '📋 *Remi Memory Update*\nStatus: on track', confidence: 0.88 });
    const result = parseProposalResponse(raw);
    expect(result.commentBody).toContain('Remi Memory Update');
    expect(result.confidence).toBe(0.88);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseProposalResponse('bad')).toThrow();
  });
});
```

- [ ] **Step 2: Run — verify fails**

```bash
pnpm test tests/memory-engine/stage3-propose.test.ts
```

- [ ] **Step 3: Implement stage3-propose.ts**

Create `packages/memory-engine/src/pipeline/stage3-propose.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import { getLatestSnapshot, createProposal, getMemoryUnit } from '@remi/db';
import type { MemoryModelClient } from '../clients/interface.js';
import { MODELS, PROMPT_VERSIONS, MIN_PROPOSAL_CONFIDENCE } from '../models.js';

export interface ProposalResult {
  commentBody: string;
  confidence: number;
}

export function buildProposalPrompt(): string {
  return `You are a documentation assistant for a workplace operations tool called Remi.

Given a memory snapshot for a Jira issue, generate a Jira comment summarising the current state. This comment will be proposed to a human for approval before posting.

Return JSON with:
- commentBody: the full Jira comment in Jira wiki markup (* for bold, # for headers, - for bullets)
- confidence: float 0.0–1.0

The comment must:
- Start with "📋 *Remi Memory Update*" as the heading
- Include current state, key decisions (if any), open actions (if any), blockers (if any)
- Be concise (max 300 words)
- Use past tense for decisions, present tense for current state
- Not claim certainty about low-confidence items
- End with: "_(Generated by Remi on {date})_"

Return only valid JSON. No markdown wrapping around the JSON.`;
}

export function parseProposalResponse(raw: string): ProposalResult {
  const parsed = JSON.parse(raw) as Partial<ProposalResult>;
  return {
    commentBody: parsed.commentBody ?? '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
  };
}

export async function runStage3(
  prisma: PrismaClient,
  memoryUnitId: string,
  snapshotId: string,
  client: MemoryModelClient,
): Promise<{ proposed: boolean; proposalId?: string }> {
  const snapshot = await getLatestSnapshot(prisma, memoryUnitId);
  if (!snapshot || snapshot.id !== snapshotId) return { proposed: false };

  const unit = await getMemoryUnit(prisma, memoryUnitId);
  if (!unit?.issue?.jiraIssueKey) return { proposed: false };

  const systemPrompt = buildProposalPrompt();
  const userContent = JSON.stringify({
    jiraIssueKey: unit.issue.jiraIssueKey,
    snapshot: {
      headline: snapshot.headline,
      currentState: snapshot.currentState,
      keyDecisions: snapshot.keyDecisions,
      openActions: snapshot.openActions,
      blockers: snapshot.blockers,
      openQuestions: snapshot.openQuestions,
    },
    generatedAt: new Date().toISOString(),
  });

  const raw = await client.complete(systemPrompt, userContent);
  const result = parseProposalResponse(raw);

  if (result.confidence < MIN_PROPOSAL_CONFIDENCE) return { proposed: false };

  const proposal = await createProposal(prisma, {
    memoryUnitId,
    snapshotId,
    payload: { jiraIssueKey: unit.issue.jiraIssueKey, commentBody: result.commentBody },
    citationIds: snapshot.sourceObsIds,
    confidence: result.confidence,
    modelId: MODELS.STAGE3_PROPOSE,
    promptVersion: PROMPT_VERSIONS.STAGE3_PROPOSE,
  });

  return { proposed: true, proposalId: proposal.id };
}
```

- [ ] **Step 4: Run tests + build + commit**

```bash
pnpm test tests/memory-engine/stage3-propose.test.ts
pnpm build
git add packages/memory-engine/src/pipeline/stage3-propose.ts tests/memory-engine/stage3-propose.test.ts
git commit -m "feat(memory-engine): stage 3 Jira comment proposal — GPT-5.4, confidence-gated"
```

---

## Task 10: Pipeline Orchestrator + Package Exports

**Files:**
- Create: `packages/memory-engine/src/pipeline/run.ts`
- Modify: `packages/memory-engine/src/index.ts`

- [ ] **Step 1: Create run.ts**

Create `packages/memory-engine/src/pipeline/run.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import type { MemoryModelClient } from '../clients/interface.js';
import { runStage1 } from './stage1-extract.js';
import { runStage2 } from './stage2-snapshot.js';
import { runStage3 } from './stage3-propose.js';

export interface PipelineClients {
  stage1: MemoryModelClient; // Gemini Flash-Lite
  stage2: MemoryModelClient; // GPT-5.4 nano
  stage3: MemoryModelClient; // GPT-5.4
}

/**
 * Run Stage 1 extraction for a single new source event.
 * Enqueue memory.snapshot separately after this completes.
 */
export async function runExtraction(
  prisma: PrismaClient,
  opts: {
    memoryUnitId: string;
    sourceId: string;
    sourceType: 'slack_message' | 'jira_event';
    messageText: string;
  },
  clients: PipelineClients,
) {
  return runStage1(prisma, opts.memoryUnitId, opts.sourceId, opts.sourceType, opts.messageText, clients.stage1);
}

/**
 * Run Stage 2 snapshot synthesis. Reads all observations since last snapshot.
 * Optionally run Stage 3 if the unit is linked to a Jira issue.
 */
export async function runSnapshot(
  prisma: PrismaClient,
  opts: { memoryUnitId: string; proposeWriteback: boolean },
  clients: PipelineClients,
) {
  const { snapshot, isNew } = await runStage2(prisma, opts.memoryUnitId, clients.stage2);

  if (isNew && opts.proposeWriteback) {
    await runStage3(prisma, opts.memoryUnitId, snapshot.id, clients.stage3);
  }

  return { snapshot, isNew };
}

/**
 * Apply an approved writeback proposal to Jira.
 * Called by the memory.writeback.apply job handler — Jira client injected by caller.
 */
export async function applyWriteback(
  opts: {
    proposalId: string;
    commentBody: string;
    jiraIssueKey: string;
    jiraSiteUrl: string;
  },
  postComment: (siteUrl: string, issueKey: string, body: string) => Promise<void>,
) {
  await postComment(opts.jiraSiteUrl, opts.jiraIssueKey, opts.commentBody);
}
```

- [ ] **Step 2: Update index.ts with full exports**

Replace `packages/memory-engine/src/index.ts`:

```typescript
export * from './models.js';
export * from './clients/interface.js';
export * from './clients/gemini.js';
export * from './clients/openai.js';
export * from './pipeline/stage1-extract.js';
export * from './pipeline/stage2-snapshot.js';
export * from './pipeline/stage3-propose.js';
export * from './pipeline/run.js';
```

- [ ] **Step 3: Build + commit**

```bash
pnpm build
git add packages/memory-engine/src/pipeline/run.ts packages/memory-engine/src/index.ts
git commit -m "feat(memory-engine): pipeline orchestrator, full package exports"
```

---

## Task 11: Worker Config + Registration

**Files:**
- Modify: `apps/worker/src/config.ts`
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Add API keys and memory queue URLs to config.ts**

```typescript
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  QUEUE_ADAPTER: z.enum(['memory', 'sqs']).default('memory'),
  SQS_REGION: z.string().default('ap-southeast-2'),
  SQS_SLACK_EVENTS_URL: z.string().optional(),
  SQS_JIRA_EVENTS_URL: z.string().optional(),
  SQS_SUMMARY_JOBS_URL: z.string().optional(),
  SQS_BACKFILL_JOBS_URL: z.string().optional(),
  SQS_MEMORY_EXTRACT_URL: z.string().optional(),
  SQS_MEMORY_SNAPSHOT_URL: z.string().optional(),
  SQS_MEMORY_WRITEBACK_PROPOSE_URL: z.string().optional(),
  SQS_MEMORY_WRITEBACK_APPLY_URL: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  MAX_RETRY_COUNT: z.coerce.number().default(3),
  GMAIL_SYNC_ENABLED: z.coerce.boolean().default(true),
  SLACK_BACKFILL_LIMIT: z.coerce.number().default(500),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export const config = schema.parse(process.env);
```

- [ ] **Step 2: Register memory consumers in index.ts**

Add to the `queueUrls` object in the SqsQueueAdapter constructor:

```typescript
[QueueNames.MEMORY_EXTRACT]: config.SQS_MEMORY_EXTRACT_URL ?? '',
[QueueNames.MEMORY_SNAPSHOT]: config.SQS_MEMORY_SNAPSHOT_URL ?? '',
[QueueNames.MEMORY_WRITEBACK_PROPOSE]: config.SQS_MEMORY_WRITEBACK_PROPOSE_URL ?? '',
[QueueNames.MEMORY_WRITEBACK_APPLY]: config.SQS_MEMORY_WRITEBACK_APPLY_URL ?? '',
```

Add four new consumers after the existing `startConsumer` calls (import types at top):

```typescript
import type { MemoryExtractMessage, MemorySnapshotMessage, MemoryWritebackProposeMessage, MemoryWritebackApplyMessage } from '@remi/shared';
import { handleMemoryExtract, handleMemorySnapshot, handleMemoryWritebackPropose, handleMemoryWritebackApply } from './handlers/memory-jobs.js';

startConsumer(queue, QueueNames.MEMORY_EXTRACT, (msg) =>
  handleMemoryExtract(msg as MemoryExtractMessage),
);
startConsumer(queue, QueueNames.MEMORY_SNAPSHOT, (msg) =>
  handleMemorySnapshot(msg as MemorySnapshotMessage, queue),
);
startConsumer(queue, QueueNames.MEMORY_WRITEBACK_PROPOSE, (msg) =>
  handleMemoryWritebackPropose(msg as MemoryWritebackProposeMessage, queue),
);
startConsumer(queue, QueueNames.MEMORY_WRITEBACK_APPLY, (msg) =>
  handleMemoryWritebackApply(msg as MemoryWritebackApplyMessage),
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/config.ts apps/worker/src/index.ts
git commit -m "feat(worker): register 4 memory queue consumers, add API key config"
```

---

## Task 12: Memory Job Handlers

**Files:**
- Create: `apps/worker/src/handlers/memory-jobs.ts`

- [ ] **Step 1: Create memory-jobs.ts**

Create `apps/worker/src/handlers/memory-jobs.ts`:

```typescript
import { prisma, findOrCreateMemoryUnit, getMemoryConfig, getProposal, updateProposalStatus, getMemoryUnit, createAuditLog } from '@remi/db';
import { QueueNames } from '@remi/shared';
import type { MemoryExtractMessage, MemorySnapshotMessage, MemoryWritebackProposeMessage, MemoryWritebackApplyMessage } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { createGeminiClient, createOpenAiClient, runExtraction, runSnapshot, applyWriteback } from '@remi/memory-engine';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

function getClients() {
  if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  return {
    stage1: createGeminiClient(config.GEMINI_API_KEY),
    stage2: createOpenAiClient(config.OPENAI_API_KEY, 'gpt-5.4-nano'),
    stage3: createOpenAiClient(config.OPENAI_API_KEY, 'gpt-5.4'),
  };
}

export async function handleMemoryExtract(message: MemoryExtractMessage): Promise<void> {
  const { memoryUnitId, sourceId, sourceType } = message.payload;

  // Fetch the source text from the appropriate table
  let messageText = '';
  if (sourceType === 'slack_message') {
    const msg = await prisma.slackMessage.findUnique({ where: { id: sourceId } });
    if (!msg) { console.warn(`[memory-extract] SlackMessage ${sourceId} not found`); return; }
    messageText = msg.text;
  } else {
    const event = await prisma.issueEvent.findUnique({ where: { id: sourceId } });
    if (!event) { console.warn(`[memory-extract] IssueEvent ${sourceId} not found`); return; }
    messageText = JSON.stringify(event.changedFields ?? {});
  }

  if (!messageText.trim()) { console.log(`[memory-extract] Empty message text for ${sourceId}, skipping`); return; }

  const clients = getClients();
  await runExtraction(prisma, { memoryUnitId, sourceId, sourceType, messageText }, clients);

  console.log(`[memory-extract] Extracted observations for unit ${memoryUnitId} from ${sourceType} ${sourceId}`);
}

export async function handleMemorySnapshot(
  message: MemorySnapshotMessage,
  queue: IQueueProducer,
): Promise<void> {
  const { memoryUnitId } = message.payload;

  const unit = await getMemoryUnit(prisma, memoryUnitId);
  const proposeWriteback = !!unit?.issueId;

  const clients = getClients();
  const { snapshot, isNew } = await runSnapshot(prisma, { memoryUnitId, proposeWriteback }, clients);

  if (isNew) {
    console.log(`[memory-snapshot] Snapshot v${snapshot.version} created for unit ${memoryUnitId}`);
  }
}

export async function handleMemoryWritebackPropose(
  message: MemoryWritebackProposeMessage,
  _queue: IQueueProducer,
): Promise<void> {
  // Stage 3 is already called inside runSnapshot when proposeWriteback=true.
  // This handler exists for explicit re-proposal requests from the admin API.
  const { memoryUnitId, snapshotId } = message.payload;
  const clients = getClients();
  const { proposed, proposalId } = await import('@remi/memory-engine').then(m =>
    m.runStage3 ? (m as any).runStage3(prisma, memoryUnitId, snapshotId, clients.stage3) : { proposed: false }
  );
  if (proposed) console.log(`[memory-writeback-propose] Proposal ${proposalId} created for unit ${memoryUnitId}`);
}

export async function handleMemoryWritebackApply(message: MemoryWritebackApplyMessage): Promise<void> {
  const { proposalId } = message.payload;
  const proposal = await getProposal(prisma, proposalId);

  if (!proposal) { console.warn(`[memory-writeback-apply] Proposal ${proposalId} not found`); return; }
  if (proposal.status !== 'approved') { console.warn(`[memory-writeback-apply] Proposal ${proposalId} is not approved (status: ${proposal.status})`); return; }

  const payload = proposal.payload as { jiraIssueKey: string; commentBody: string };
  const unit = await getMemoryUnit(prisma, proposal.memoryUnitId);
  if (!unit?.issue?.jiraSiteUrl) { await updateProposalStatus(prisma, proposalId, 'failed', { failureReason: 'No jiraSiteUrl on linked issue' }); return; }

  try {
    const { JiraClient } = await import('@remi/jira');
    const jiraInstall = await prisma.jiraWorkspaceInstall.findFirst({ where: { workspaceId: message.workspaceId } });
    if (!jiraInstall) throw new Error('No Jira install found for workspace');

    const jiraClient = new JiraClient(jiraInstall.jiraSiteUrl, jiraInstall.sharedSecret, jiraInstall.jiraClientKey);
    await applyWriteback(
      { proposalId, commentBody: payload.commentBody, jiraIssueKey: payload.jiraIssueKey, jiraSiteUrl: unit.issue.jiraSiteUrl },
      (siteUrl, issueKey, body) => jiraClient.addComment(issueKey, body),
    );

    await updateProposalStatus(prisma, proposalId, 'applied');
    await createAuditLog(prisma, {
      workspaceId: message.workspaceId,
      action: 'memory.writeback.applied',
      actorType: 'system',
      targetType: 'memory_writeback_proposal',
      targetId: proposalId,
      metadata: { jiraIssueKey: payload.jiraIssueKey },
    });
    console.log(`[memory-writeback-apply] Proposal ${proposalId} applied to Jira ${payload.jiraIssueKey}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await updateProposalStatus(prisma, proposalId, 'failed', { failureReason: reason });
    console.error(`[memory-writeback-apply] Failed to apply proposal ${proposalId}:`, reason);
  }
}
```

> **Note:** The `JiraClient.addComment` method may not exist yet. Check `packages/jira/` — if `addComment` is not implemented, add it as a thin wrapper around the Jira REST API before running this handler. The handler will compile but will throw at runtime if the method is missing.

- [ ] **Step 2: Build + commit**

```bash
pnpm build
git add apps/worker/src/handlers/memory-jobs.ts
git commit -m "feat(worker): memory job handlers — extract, snapshot, propose, apply"
```

---

## Task 13: Ingestion Triggers

**Files:**
- Modify: `apps/worker/src/handlers/slack-events.ts`
- Modify: `apps/worker/src/handlers/jira-events.ts`

- [ ] **Step 1: Read the current slack-events handler**

Before editing, read the file to understand the current flow and find where SlackMessages are saved.

```bash
cat apps/worker/src/handlers/slack-events.ts
```

- [ ] **Step 2: Add memory trigger to slack-events.ts**

After a `SlackMessage` is saved (find the `prisma.slackMessage.create` or `upsert` call), add the following block. Import required functions at the top of the file:

```typescript
import { getMemoryConfig, findOrCreateMemoryUnit } from '@remi/db';
import { QueueNames } from '@remi/shared';
import { v4 as uuidv4 } from 'uuid';
```

After the message is saved (inside the handler, after the message upsert), add:

```typescript
// ── Memory ingestion trigger ──────────────────────────────────────────────
const memoryConfig = await getMemoryConfig(prisma, workspaceId);
if (memoryConfig?.enabled) {
  // Only process messages in threads linked to issues (issue_thread scope)
  const threadLinks = await prisma.issueThreadLink.findMany({
    where: { threadId: savedThread.id, unlinkedAt: null },
    include: { issue: true },
  });

  for (const link of threadLinks) {
    const { unit } = await findOrCreateMemoryUnit(
      prisma, workspaceId, 'issue_thread', savedThread.id, link.issueId,
    );
    const extractKey = uuidv4();
    await queue.send(QueueNames.MEMORY_EXTRACT, {
      id: extractKey,
      idempotencyKey: `memory-extract-${savedMessage.id}`,
      workspaceId,
      timestamp: new Date().toISOString(),
      type: 'memory_extract',
      payload: { memoryUnitId: unit.id, sourceType: 'slack_message', sourceId: savedMessage.id },
    });
  }
}
```

- [ ] **Step 3: Add memory trigger to jira-events.ts**

After a `IssueEvent` is saved, add a similar block:

```typescript
const memoryConfig = await getMemoryConfig(prisma, workspaceId);
if (memoryConfig?.enabled) {
  // Find all MemoryUnits linked to this issue
  const units = await prisma.memoryUnit.findMany({
    where: { issueId: savedIssue.id, workspaceId },
  });
  for (const unit of units) {
    const extractKey = uuidv4();
    await queue.send(QueueNames.MEMORY_EXTRACT, {
      id: extractKey,
      idempotencyKey: `memory-extract-${savedEvent.id}`,
      workspaceId,
      timestamp: new Date().toISOString(),
      type: 'memory_extract',
      payload: { memoryUnitId: unit.id, sourceType: 'jira_event', sourceId: savedEvent.id },
    });
  }
}
```

> The variable names `savedThread`, `savedMessage`, `savedEvent`, `savedIssue`, and `queue` must match the actual variable names in those handlers. Read each handler carefully before inserting.

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add apps/worker/src/handlers/slack-events.ts apps/worker/src/handlers/jira-events.ts
git commit -m "feat(worker): trigger memory extraction after Slack messages and Jira events are stored"
```

---

**← Back-end milestone. The pipeline is now complete and testable end-to-end. →**

---

## Task 14: Admin API — Memory Routes

**Files:**
- Create: `apps/api/src/routes/admin/memory.ts`
- Modify: `apps/api/src/routes/admin/index.ts`

- [ ] **Step 1: Create memory.ts route file**

Create `apps/api/src/routes/admin/memory.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { prisma, listMemoryUnits, getMemoryUnit, listSnapshots, listPendingProposals, getProposal, updateProposalStatus, upsertMemoryConfig, getMemoryConfig, createAuditLog } from '@remi/db';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { v4 as uuidv4 } from 'uuid';

export async function memoryRoutes(app: FastifyInstance, { queue }: { queue: IQueueProducer }) {

  // GET /admin/memory/config/:workspaceId
  app.get<{ Params: { workspaceId: string } }>('/config/:workspaceId', async (req, reply) => {
    const config = await getMemoryConfig(prisma, req.params.workspaceId);
    return reply.send(config ?? { enabled: false, excludedChannelIds: [], excludedUserIds: [] });
  });

  // PUT /admin/memory/config/:workspaceId
  app.put<{ Params: { workspaceId: string }; Body: { enabled?: boolean; excludedChannelIds?: string[]; excludedUserIds?: string[] } }>(
    '/config/:workspaceId', async (req, reply) => {
      const config = await upsertMemoryConfig(prisma, req.params.workspaceId, req.body);
      return reply.send(config);
    }
  );

  // GET /admin/memory/units/:workspaceId
  app.get<{ Params: { workspaceId: string }; Querystring: { limit?: number; offset?: number } }>(
    '/units/:workspaceId', async (req, reply) => {
      const units = await listMemoryUnits(prisma, req.params.workspaceId, {
        limit: req.query.limit ?? 50,
        offset: req.query.offset ?? 0,
      });
      return reply.send(units);
    }
  );

  // GET /admin/memory/units/:workspaceId/:unitId
  app.get<{ Params: { workspaceId: string; unitId: string } }>(
    '/units/:workspaceId/:unitId', async (req, reply) => {
      const unit = await getMemoryUnit(prisma, req.params.unitId);
      if (!unit || unit.workspaceId !== req.params.workspaceId) return reply.status(404).send({ error: 'Not found' });
      const snapshots = await listSnapshots(prisma, req.params.unitId);
      return reply.send({ unit, snapshots });
    }
  );

  // GET /admin/memory/proposals/:workspaceId
  app.get<{ Params: { workspaceId: string } }>(
    '/proposals/:workspaceId', async (req, reply) => {
      const proposals = await listPendingProposals(prisma, req.params.workspaceId);
      return reply.send(proposals);
    }
  );

  // POST /admin/memory/proposals/:proposalId/approve
  app.post<{ Params: { proposalId: string }; Body: { approvedBy: string } }>(
    '/proposals/:proposalId/approve', async (req, reply) => {
      const proposal = await getProposal(prisma, req.params.proposalId);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });
      if (proposal.status !== 'pending_approval') return reply.status(400).send({ error: `Cannot approve proposal with status: ${proposal.status}` });

      await updateProposalStatus(prisma, proposal.id, 'approved', { approvedBy: req.body.approvedBy });
      await createAuditLog(prisma, {
        workspaceId: proposal.memoryUnit?.workspaceId ?? '',
        action: 'memory.proposal.approved',
        actorType: 'user',
        actorId: req.body.approvedBy,
        targetType: 'memory_writeback_proposal',
        targetId: proposal.id,
      });

      const applyKey = uuidv4();
      await queue.send(QueueNames.MEMORY_WRITEBACK_APPLY, {
        id: applyKey,
        idempotencyKey: applyKey,
        workspaceId: (proposal as any).memoryUnit?.workspaceId ?? '',
        timestamp: new Date().toISOString(),
        type: 'memory_writeback_apply',
        payload: { proposalId: proposal.id },
      });

      return reply.send({ ok: true });
    }
  );

  // POST /admin/memory/proposals/:proposalId/reject
  app.post<{ Params: { proposalId: string } }>(
    '/proposals/:proposalId/reject', async (req, reply) => {
      const proposal = await getProposal(prisma, req.params.proposalId);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });
      await updateProposalStatus(prisma, proposal.id, 'rejected');
      return reply.send({ ok: true });
    }
  );

  // POST /admin/memory/units/:workspaceId/:unitId/rerun
  app.post<{ Params: { workspaceId: string; unitId: string } }>(
    '/units/:workspaceId/:unitId/rerun', async (req, reply) => {
      const unit = await getMemoryUnit(prisma, req.params.unitId);
      if (!unit || unit.workspaceId !== req.params.workspaceId) return reply.status(404).send({ error: 'Not found' });
      const key = uuidv4();
      await queue.send(QueueNames.MEMORY_SNAPSHOT, {
        id: key, idempotencyKey: key, workspaceId: req.params.workspaceId,
        timestamp: new Date().toISOString(), type: 'memory_snapshot',
        payload: { memoryUnitId: req.params.unitId },
      });
      return reply.send({ ok: true });
    }
  );
}
```

- [ ] **Step 2: Mount routes in admin/index.ts**

Read `apps/api/src/routes/admin/index.ts` first, then add:

```typescript
import { memoryRoutes } from './memory.js';
// Inside the registration function, alongside other route registrations:
await fastify.register(memoryRoutes, { prefix: '/memory', queue });
```

- [ ] **Step 3: Build + commit**

```bash
pnpm build
git add apps/api/src/routes/admin/memory.ts apps/api/src/routes/admin/index.ts
git commit -m "feat(api): admin memory routes — units, snapshots, proposal approve/reject/rerun"
```

---

## Task 15: /brief — Memory-Aware Response

**Files:**
- Modify: `packages/slack/src/commands/brief.ts`

- [ ] **Step 1: Update brief.ts to read MemorySnapshot when feature flag is on**

Add imports at the top of `packages/slack/src/commands/brief.ts`:

```typescript
import { getMemoryConfig, listMemoryUnits, getLatestSnapshot } from '@remi/db';
```

After the existing `const summary = await findCurrentSummary(prisma, issue.id);` line and before the `isStale` check, add a block that checks the feature flag and reads the MemorySnapshot:

```typescript
// Check if Autonomous Memory is enabled for this workspace
const memConfig = await getMemoryConfig(prisma, workspaceId);
if (memConfig?.enabled) {
  // Find the MemoryUnit for this issue's linked threads
  const units = await prisma.memoryUnit.findMany({
    where: { workspaceId, issueId: issue.id },
    take: 1,
    orderBy: { updatedAt: 'desc' },
  });
  const unit = units[0];
  if (unit) {
    const snapshot = await getLatestSnapshot(prisma, unit.id);
    if (snapshot) {
      const freshness = new Date(snapshot.freshness).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const keyDecisions = (snapshot.keyDecisions as string[]);
      const openActions = (snapshot.openActions as Array<{ description: string; assignee?: string }>);
      const blockers = (snapshot.blockers as string[]);
      const openQuestions = (snapshot.openQuestions as string[]);

      const blocks: unknown[] = [
        { type: 'header', text: { type: 'plain_text', text: `${issueKey} — Memory Brief`, emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: `*${snapshot.headline}*\n${snapshot.currentState}` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Confidence: ${Math.round(snapshot.confidence * 100)}% · Updated ${freshness}` }] },
      ];

      if (keyDecisions.length > 0) {
        blocks.push({ type: 'divider' });
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Key Decisions*\n${keyDecisions.map(d => `• ${d}`).join('\n')}` } });
      }
      if (openActions.length > 0) {
        blocks.push({ type: 'divider' });
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Open Actions*\n${openActions.map(a => `• ${a.description}${a.assignee ? ` _(${a.assignee})_` : ''}`).join('\n')}` } });
      }
      if (blockers.length > 0) {
        blocks.push({ type: 'divider' });
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Blockers*\n${blockers.map(b => `🔴 ${b}`).join('\n')}` } });
      }
      if (openQuestions.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Open Questions*\n${openQuestions.map(q => `❓ ${q}`).join('\n')}` } });
      }

      void createProductEvent(prisma, { workspaceId, event: 'memory_brief_viewed', actorId: command.user_id, properties: { issueKey } });
      await respond({ response_type: 'in_channel', blocks, text: `Memory brief for *${issueKey}*` });
      return;
    }
  }
}
// Falls through to existing deterministic summary path if memory is disabled or no snapshot exists
```

- [ ] **Step 2: Build + commit**

```bash
pnpm build
git add packages/slack/src/commands/brief.ts
git commit -m "feat(slack): /brief reads MemorySnapshot when autonomous memory is enabled"
```

---

## Task 16: App Home — Memory Units Section

**Files:**
- Modify: `packages/slack/src/views/app-home.ts`

- [ ] **Step 1: Add memory units section to App Home**

Add import at the top:

```typescript
import { getMemoryConfig, listMemoryUnits, listPendingProposals } from '@remi/db';
```

Inside the `try` block, after the existing `recentLinks` and `recentSummaries` queries, add:

```typescript
const memConfig = await getMemoryConfig(prisma, workspaceId);
const memoryUnits = memConfig?.enabled
  ? await listMemoryUnits(prisma, workspaceId, { limit: 5 })
  : [];
const pendingProposals = memConfig?.enabled
  ? await listPendingProposals(prisma, workspaceId)
  : [];
```

Build memory units block:

```typescript
const memoryBlocks: unknown[] = memConfig?.enabled
  ? [
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: '*Autonomous Memory*' } },
      ...(memoryUnits.length > 0
        ? memoryUnits.map((u) => ({
            type: 'section',
            text: { type: 'mrkdwn', text: `${u.scopeType === 'issue_thread' ? '🧵' : '💬'} ${u.issue?.jiraIssueKey ?? u.scopeRef} · Updated ${new Date(u.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` },
          }))
        : [{ type: 'section', text: { type: 'mrkdwn', text: '_No memory units yet. Link a thread to a Jira issue to get started._' } }]),
      ...(pendingProposals.length > 0
        ? [{ type: 'section', text: { type: 'mrkdwn', text: `⏳ *${pendingProposals.length} pending Jira writeback ${pendingProposals.length === 1 ? 'proposal' : 'proposals'} awaiting approval*` } }]
        : []),
    ]
  : [];
```

Add `...memoryBlocks` to the `blocks` array in `client.views.publish`, before the footer.

- [ ] **Step 2: Build + commit**

```bash
pnpm build
git add packages/slack/src/views/app-home.ts
git commit -m "feat(slack): App Home shows memory units and pending proposals"
```

---

## Task 17: Admin UI — Memory Pages

**Files:**
- Create: `apps/admin/src/app/memory/page.tsx`
- Create: `apps/admin/src/app/memory/[unitId]/page.tsx`

- [ ] **Step 1: Check existing admin API client pattern**

Read `apps/admin/src/lib/api.ts` to understand the fetch pattern used by existing admin pages. Mirror that pattern exactly for the new pages.

- [ ] **Step 2: Create memory list page**

Create `apps/admin/src/app/memory/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

interface MemoryUnit {
  id: string;
  scopeType: string;
  scopeRef: string;
  updatedAt: string;
  issue?: { jiraIssueKey: string } | null;
}

interface Proposal {
  id: string;
  status: string;
  confidence: number;
  createdAt: string;
  memoryUnit: { scopeRef: string; issueId: string | null };
}

export default function MemoryPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [units, setUnits] = useState<MemoryUnit[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load(wsId: string) {
    setLoading(true);
    const [configRes, unitsRes, proposalsRes] = await Promise.all([
      fetch(`/api/admin/memory/config/${wsId}`),
      fetch(`/api/admin/memory/units/${wsId}`),
      fetch(`/api/admin/memory/proposals/${wsId}`),
    ]);
    const config = await configRes.json();
    setEnabled(config.enabled ?? false);
    setUnits(await unitsRes.json());
    setProposals(await proposalsRes.json());
    setLoading(false);
  }

  async function toggleEnabled() {
    await fetch(`/api/admin/memory/config/${workspaceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setEnabled(!enabled);
  }

  async function approve(proposalId: string) {
    await fetch(`/api/admin/memory/proposals/${proposalId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedBy: 'admin' }),
    });
    setProposals((prev) => prev.filter((p) => p.id !== proposalId));
  }

  async function reject(proposalId: string) {
    await fetch(`/api/admin/memory/proposals/${proposalId}/reject`, { method: 'POST' });
    setProposals((prev) => prev.filter((p) => p.id !== proposalId));
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Autonomous Memory</h1>

      <div className="mb-4 flex gap-2">
        <input
          className="border rounded px-2 py-1 flex-1"
          placeholder="Workspace ID"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={() => load(workspaceId)}>
          Load
        </button>
      </div>

      {workspaceId && !loading && (
        <>
          <div className="mb-6 flex items-center gap-3">
            <span className="font-medium">Autonomous Memory:</span>
            <button onClick={toggleEnabled} className={`px-3 py-1 rounded text-white ${enabled ? 'bg-green-600' : 'bg-gray-400'}`}>
              {enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {proposals.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-2">Pending Writeback Proposals</h2>
              <div className="space-y-3">
                {proposals.map((p) => (
                  <div key={p.id} className="border rounded p-3 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm">{p.id.slice(0, 8)}</span>
                      <span className="ml-2 text-sm text-gray-500">Confidence: {Math.round(p.confidence * 100)}%</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approve(p.id)} className="bg-green-600 text-white px-2 py-1 rounded text-sm">Approve</button>
                      <button onClick={() => reject(p.id)} className="bg-red-500 text-white px-2 py-1 rounded text-sm">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold mb-2">Memory Units ({units.length})</h2>
            <div className="space-y-2">
              {units.map((u) => (
                <a key={u.id} href={`/memory/${u.id}`} className="block border rounded p-3 hover:bg-gray-50">
                  <span className="font-mono text-sm">{u.issue?.jiraIssueKey ?? u.scopeRef}</span>
                  <span className="ml-2 text-sm text-gray-500">{u.scopeType} · {new Date(u.updatedAt).toLocaleDateString()}</span>
                </a>
              ))}
              {units.length === 0 && <p className="text-gray-500 text-sm">No memory units yet.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create unit detail page**

Create `apps/admin/src/app/memory/[unitId]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Snapshot {
  id: string;
  version: number;
  headline: string;
  currentState: string;
  keyDecisions: string[];
  openActions: Array<{ description: string; assignee?: string }>;
  blockers: string[];
  openQuestions: string[];
  confidence: number;
  freshness: string;
  createdAt: string;
}

export default function MemoryUnitPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const [data, setData] = useState<{ unit: { scopeType: string; scopeRef: string; issueId: string | null }; snapshots: Snapshot[] } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/memory/units/_/${unitId}`)
      .then((r) => r.json())
      .then(setData);
  }, [unitId]);

  if (!data) return <div className="p-6">Loading...</div>;

  const latest = data.snapshots[0];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Memory Unit</h1>
      <p className="text-sm text-gray-500 mb-6">{data.unit.scopeType} · {data.unit.scopeRef}</p>

      {latest && (
        <section className="mb-8 border rounded p-4">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-lg font-semibold">{latest.headline}</h2>
            <span className="text-sm text-gray-400">v{latest.version} · {Math.round(latest.confidence * 100)}% confidence</span>
          </div>
          <p className="text-sm mb-3">{latest.currentState}</p>

          {latest.keyDecisions.length > 0 && (
            <div className="mb-2"><strong>Decisions:</strong>
              <ul className="list-disc pl-5 text-sm">{latest.keyDecisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}
          {latest.openActions.length > 0 && (
            <div className="mb-2"><strong>Open Actions:</strong>
              <ul className="list-disc pl-5 text-sm">{latest.openActions.map((a, i) => <li key={i}>{a.description}{a.assignee ? ` (${a.assignee})` : ''}</li>)}</ul>
            </div>
          )}
          {latest.blockers.length > 0 && (
            <div className="mb-2"><strong>Blockers:</strong>
              <ul className="list-disc pl-5 text-sm text-red-600">{latest.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      <h2 className="text-lg font-semibold mb-2">Snapshot History ({data.snapshots.length})</h2>
      <div className="space-y-2">
        {data.snapshots.map((s) => (
          <div key={s.id} className="border rounded p-3 text-sm">
            <span className="font-medium">v{s.version}</span>
            <span className="mx-2 text-gray-400">·</span>
            <span>{s.headline}</span>
            <span className="ml-2 text-gray-400">{new Date(s.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

> **Note:** The unit detail API route uses `workspaceId` in the path, but the admin UI navigates by `unitId` only. Update the admin route handler in `memory.ts` to also accept `/units/_/:unitId` (using `_` as a workspaceId wildcard) OR look up the workspaceId from the unit record. The simplest fix: add a new route `GET /units/by-id/:unitId` that skips the workspaceId check.

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add apps/admin/src/app/memory/
git commit -m "feat(admin): memory unit list, pending proposals, and unit detail pages"
```

---

## Task 18: Add `addComment` to Jira Client (if missing)

**Files:**
- Check + potentially modify: `packages/jira/src/` (read the package first)

- [ ] **Step 1: Check if addComment exists**

```bash
grep -r "addComment" packages/jira/src/
```

- [ ] **Step 2: If missing, add to the Jira REST client**

Find the Jira client class/file and add:

```typescript
async addComment(issueKey: string, body: string): Promise<void> {
  await this.request(`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] } }),
  });
}
```

The exact implementation depends on how the existing `request` helper works in that package. Read the file before implementing.

- [ ] **Step 3: Build + commit (only if changed)**

```bash
pnpm build
git add packages/jira/src/
git commit -m "feat(jira): addComment method for memory writeback apply"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
pnpm test
```

Expected: 223 existing tests + new memory-engine tests all pass.

- [ ] **Run full build**

```bash
pnpm build
```

Expected: All 12+ build tasks pass.

- [ ] **Smoke test checklist (manual)**

1. Enable Autonomous Memory for a test workspace via `PUT /api/admin/memory/config/:workspaceId` with `{ "enabled": true }`
2. Send a Slack message in a thread linked to a Jira issue
3. Verify a `memory_extract` job appears in the queue
4. Verify a `MemoryObservation` record is created in the DB
5. Verify a `MemorySnapshot` record is created after the snapshot job runs
6. Run `/brief ISSUE-123` in Slack — verify the memory-backed response appears
7. Navigate to `/memory` in the admin UI — verify the unit appears
8. Navigate to the unit detail page — verify the snapshot is shown
9. If a proposal was created, approve it in the admin UI and verify the Jira comment is applied

- [ ] **Final commit**

```bash
git add .
git commit -m "feat: autonomous memory v1 complete — extraction, snapshots, Jira proposals, Slack /brief, admin UI"
```
