# Contextual Document Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-issue document upload (PDF/Markdown/TXT) with a three-stage extraction pipeline that produces structured Markdown stored in S3, integrated as pinned reference context in Confluence handoff doc generation.

**Architecture:** Multipart upload to `POST /admin/issues/:issueId/context-documents` runs a new `packages/extractor` pipeline (unpdf bounding-box extraction → Gemini Flash table repair on garbled sections only → S3 storage). `buildIssueDocContext` is extended to fetch and include the extracted content; the page-writer renders it as a "Project Brief" section with a stale warning when the upload predates recent Slack activity.

**Tech Stack:** unpdf (server-side pdfjs-dist), @google/generative-ai (Gemini 2.0 Flash), @fastify/multipart, Prisma, @remi/storage (S3Adapter), vitest

---

## Strategy Note: Upload Trust and Scope

This plan should be read through the ticket-reconstruction pivot. Context documents are pinned reference inputs, not higher truth over live Jira, Slack, or Gmail evidence. The future isolation primitive is `Scope` / `scopeId`; current workspace/department compatibility can remain where needed, but new retrieval and schema work should be scope-aware.

---

## File Map

**New files:**
- `packages/extractor/package.json`
- `packages/extractor/tsconfig.json`
- `packages/extractor/src/types.ts`
- `packages/extractor/src/markdown.ts`
- `packages/extractor/src/pdf.ts`
- `packages/extractor/src/llm-repair.ts`
- `packages/extractor/src/pipeline.ts`
- `packages/extractor/src/index.ts`
- `packages/db/src/repositories/context-document.repo.ts`
- `apps/api/src/storage.ts`
- `apps/worker/src/storage.ts`
- `apps/admin/src/app/issues/[issueId]/context/page.tsx`
- `tests/extractor/pdf.test.ts`
- `tests/extractor/llm-repair.test.ts`
- `tests/extractor/pipeline.test.ts`
- `tests/context-documents/repo.test.ts`
- `tests/context-documents/upload.test.ts`
- `tests/context-documents/build-context.test.ts`

**Modified files:**
- `packages/db/prisma/schema.prisma` — add `IssueContextDocument` model
- `packages/db/src/repositories/index.ts` — export new repo
- `packages/confluence/package.json` — add `@remi/storage` dependency
- `packages/confluence/src/types.ts` — add `stale: boolean` to `uploadedContext`
- `packages/confluence/src/build-context.ts` — new signature + upload context query
- `packages/confluence/src/index.ts` — re-export (no change needed if build-context already exported)
- `apps/api/src/config.ts` — add `GEMINI_API_KEY`
- `apps/api/src/server.ts` — register `@fastify/multipart`
- `apps/api/src/routes/admin/index.ts` — add 3 context-document routes
- `apps/worker/src/config.ts` — add `STORAGE_ADAPTER`, `S3_BUCKET`, `S3_REGION`
- `apps/worker/src/handlers/doc-generate-jobs.ts` — pass storage to `buildIssueDocContext`
- `docs/design/OUT_OF_SCOPE_COORDINATION_MVP.md` — append new items

---

## Task 1: Schema — Add IssueContextDocument

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the model to schema.prisma**

Open `packages/db/prisma/schema.prisma`. Add this model after the `ConfluencePage` model:

```prisma
model IssueContextDocument {
  id                String   @id @default(cuid())
  issueId           String   @unique
  workspaceId       String
  scopeId           String?
  filename          String
  fileType          String
  s3KeyOriginal     String
  s3KeyExtracted    String
  fileSize          Int
  description       String
  extractionQuality String
  uploadedAt        DateTime @default(now())
  updatedAt         DateTime @updatedAt

  issue     Issue     @relation(fields: [issueId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([workspaceId])
  @@index([scopeId])
  @@map("issue_context_documents")
}
```

Also add the back-relation to the `Issue` model. Find the `Issue` model and add inside its relations block:

```prisma
  contextDocument IssueContextDocument?
```

- [ ] **Step 2: Run the migration**

```bash
cd "d:/Vibe Coded Projects/MemoryAI"
pnpm db:migrate
```

Expected: migration file created and applied, Prisma client regenerated.

- [ ] **Step 3: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat: add IssueContextDocument schema"
```

---

## Task 2: Repo — context-document.repo.ts

**Files:**
- Create: `packages/db/src/repositories/context-document.repo.ts`
- Create: `tests/context-documents/repo.test.ts`
- Modify: `packages/db/src/repositories/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/context-documents/repo.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  upsertContextDocument,
  findContextDocument,
  deleteContextDocument,
} from '../../packages/db/src/repositories/context-document.repo.js';

const mockPrisma = {
  issueContextDocument: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

const sampleData = {
  issueId: 'issue_1',
  workspaceId: 'ws_1',
  filename: 'prd.pdf',
  fileType: 'pdf',
  s3KeyOriginal: 'context-docs/ws_1/issue_1/original.pdf',
  s3KeyExtracted: 'context-docs/ws_1/issue_1/extracted.md',
  fileSize: 102400,
  description: 'Q2 checkout revamp PRD',
  extractionQuality: 'clean',
};

describe('upsertContextDocument', () => {
  it('creates a new record when none exists', async () => {
    const record = { id: 'doc_1', ...sampleData };
    mockPrisma.issueContextDocument.upsert.mockResolvedValue(record);

    const result = await upsertContextDocument(mockPrisma, sampleData);

    expect(mockPrisma.issueContextDocument.upsert).toHaveBeenCalledWith({
      where: { issueId: 'issue_1' },
      create: sampleData,
      update: {
        filename: sampleData.filename,
        fileType: sampleData.fileType,
        s3KeyOriginal: sampleData.s3KeyOriginal,
        s3KeyExtracted: sampleData.s3KeyExtracted,
        fileSize: sampleData.fileSize,
        description: sampleData.description,
        extractionQuality: sampleData.extractionQuality,
        uploadedAt: expect.any(Date),
      },
    });
    expect(result).toEqual(record);
  });
});

describe('findContextDocument', () => {
  it('queries by issueId', async () => {
    const record = { id: 'doc_1', issueId: 'issue_1' };
    mockPrisma.issueContextDocument.findUnique.mockResolvedValue(record);

    const result = await findContextDocument(mockPrisma, 'issue_1');

    expect(mockPrisma.issueContextDocument.findUnique).toHaveBeenCalledWith({
      where: { issueId: 'issue_1' },
    });
    expect(result).toEqual(record);
  });

  it('returns null when no document exists', async () => {
    mockPrisma.issueContextDocument.findUnique.mockResolvedValue(null);

    const result = await findContextDocument(mockPrisma, 'issue_missing');

    expect(result).toBeNull();
  });
});

describe('deleteContextDocument', () => {
  it('deletes by issueId and returns the deleted record', async () => {
    const record = { id: 'doc_1', issueId: 'issue_1' };
    mockPrisma.issueContextDocument.delete.mockResolvedValue(record);

    const result = await deleteContextDocument(mockPrisma, 'issue_1');

    expect(mockPrisma.issueContextDocument.delete).toHaveBeenCalledWith({
      where: { issueId: 'issue_1' },
    });
    expect(result).toEqual(record);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "d:/Vibe Coded Projects/MemoryAI"
pnpm test tests/context-documents/repo.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repo**

Create `packages/db/src/repositories/context-document.repo.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';

export interface ContextDocumentInput {
  issueId: string;
  workspaceId: string;
  filename: string;
  fileType: string;
  s3KeyOriginal: string;
  s3KeyExtracted: string;
  fileSize: number;
  description: string;
  extractionQuality: string;
}

export async function upsertContextDocument(
  prisma: PrismaClient,
  data: ContextDocumentInput,
) {
  return prisma.issueContextDocument.upsert({
    where: { issueId: data.issueId },
    create: data,
    update: {
      filename: data.filename,
      fileType: data.fileType,
      s3KeyOriginal: data.s3KeyOriginal,
      s3KeyExtracted: data.s3KeyExtracted,
      fileSize: data.fileSize,
      description: data.description,
      extractionQuality: data.extractionQuality,
      uploadedAt: new Date(),
    },
  });
}

export async function findContextDocument(prisma: PrismaClient, issueId: string) {
  return prisma.issueContextDocument.findUnique({ where: { issueId } });
}

export async function deleteContextDocument(prisma: PrismaClient, issueId: string) {
  return prisma.issueContextDocument.delete({ where: { issueId } });
}
```

- [ ] **Step 4: Export from repositories index**

Add to `packages/db/src/repositories/index.ts`:

```typescript
export * from './context-document.repo.js';
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm test tests/context-documents/repo.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repositories/context-document.repo.ts packages/db/src/repositories/index.ts tests/context-documents/repo.test.ts
git commit -m "feat: add context-document repo"
```

---

## Task 3: Package Setup — packages/extractor

**Files:**
- Create: `packages/extractor/package.json`
- Create: `packages/extractor/tsconfig.json`
- Create: `packages/extractor/src/types.ts`
- Create: `packages/extractor/src/index.ts`

- [ ] **Step 1: Create package.json**

Create `packages/extractor/package.json`:

```json
{
  "name": "@remi/extractor",
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
    "unpdf": "^0.11.0",
    "@google/generative-ai": "^0.21.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/extractor/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create src/types.ts**

Create `packages/extractor/src/types.ts`:

```typescript
export interface RichContentDocument {
  type: 'pdf' | 'markdown' | 'text';
  structuredMarkdown: string;
  extractionQuality: 'clean' | 'repaired' | 'partial';
  charCount: number;
}

/** Wraps a garbled table section awaiting LLM repair. */
export const GARBLED_START = '%%GARBLED_TABLE%%';
export const GARBLED_END = '%%END_GARBLED_TABLE%%';
```

- [ ] **Step 4: Create placeholder src/index.ts**

Create `packages/extractor/src/index.ts`:

```typescript
export type { RichContentDocument } from './types.js';
export { GARBLED_START, GARBLED_END } from './types.js';
export { runExtractionPipeline } from './pipeline.js';
```

- [ ] **Step 5: Install dependencies**

```bash
cd "d:/Vibe Coded Projects/MemoryAI"
pnpm --filter @remi/extractor add unpdf @google/generative-ai
```

Expected: packages installed, pnpm-lock.yaml updated.

- [ ] **Step 6: Commit**

```bash
git add packages/extractor/
git commit -m "feat: scaffold packages/extractor with types and package setup"
```

---

## Task 4: Extractor — markdown.ts

**Files:**
- Create: `packages/extractor/src/markdown.ts`
- Create: `tests/extractor/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/extractor/markdown.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { processMarkdown, processText } from '../../packages/extractor/src/markdown.js';

describe('processMarkdown', () => {
  it('returns content verbatim as structuredMarkdown', () => {
    const content = '# Hello\n\nThis is a **PRD**.\n\n- Item 1\n- Item 2';
    const result = processMarkdown(content);

    expect(result.type).toBe('markdown');
    expect(result.structuredMarkdown).toBe(content);
    expect(result.extractionQuality).toBe('clean');
    expect(result.charCount).toBe(content.length);
  });

  it('handles empty content', () => {
    const result = processMarkdown('');
    expect(result.structuredMarkdown).toBe('');
    expect(result.charCount).toBe(0);
  });
});

describe('processText', () => {
  it('returns content verbatim with type text', () => {
    const content = 'Plain text document.\nSecond line.';
    const result = processText(content);

    expect(result.type).toBe('text');
    expect(result.structuredMarkdown).toBe(content);
    expect(result.extractionQuality).toBe('clean');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm test tests/extractor/markdown.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement markdown.ts**

Create `packages/extractor/src/markdown.ts`:

```typescript
import type { RichContentDocument } from './types.js';

export function processMarkdown(content: string): RichContentDocument {
  return {
    type: 'markdown',
    structuredMarkdown: content,
    extractionQuality: 'clean',
    charCount: content.length,
  };
}

export function processText(content: string): RichContentDocument {
  return {
    type: 'text',
    structuredMarkdown: content,
    extractionQuality: 'clean',
    charCount: content.length,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test tests/extractor/markdown.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/extractor/src/markdown.ts tests/extractor/markdown.test.ts
git commit -m "feat: extractor markdown and text passthrough"
```

---

## Task 5: Extractor — pdf.ts (Stage 1)

**Files:**
- Create: `packages/extractor/src/pdf.ts`
- Create: `tests/extractor/pdf.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/extractor/pdf.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { extractFromPdf, groupByY, detectXClusters, medianFontSize } from '../../packages/extractor/src/pdf.js';
import { GARBLED_START } from '../../packages/extractor/src/types.js';

// Helper to build a fake TextItem
function item(str: string, x: number, y: number, fontSize: number = 12): any {
  return { str, transform: [1, 0, 0, fontSize, x, y], width: str.length * 7, height: fontSize, fontName: 'sans' };
}

describe('groupByY', () => {
  it('groups items within 2px of the same y into one row', () => {
    const items = [item('A', 50, 100), item('B', 200, 101.5), item('C', 50, 200)];
    const rows = groupByY(items);

    expect(rows.size).toBe(2);
    const row100 = [...rows.values()][0];
    expect(row100).toHaveLength(2);
  });

  it('sorts items within a row by x ascending', () => {
    const items = [item('B', 200, 100), item('A', 50, 100)];
    const rows = groupByY(items);
    const rowItems = [...rows.values()][0];

    expect(rowItems[0].str).toBe('A');
    expect(rowItems[1].str).toBe('B');
  });
});

describe('detectXClusters', () => {
  it('returns a single cluster when items are close together', () => {
    const items = [item('A', 50, 100), item('B', 70, 100), item('C', 90, 100)];
    expect(detectXClusters(items)).toHaveLength(1);
  });

  it('returns multiple clusters when items are >50px apart', () => {
    const items = [item('A', 50, 100), item('B', 200, 100), item('C', 350, 100)];
    expect(detectXClusters(items)).toHaveLength(3);
  });
});

describe('medianFontSize', () => {
  it('returns the median font size', () => {
    const items = [item('A', 0, 0, 10), item('B', 0, 10, 12), item('C', 0, 20, 14)];
    expect(medianFontSize(items)).toBe(12);
  });
});

describe('extractFromPdf', () => {
  it('returns partial quality and empty markdown when no text items are found', async () => {
    // Mock getDocumentProxy to return empty pages
    vi.mock('unpdf', () => ({
      getDocumentProxy: vi.fn().mockResolvedValue({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({ items: [] }),
        }),
      }),
    }));

    const { extractFromPdf: freshExtract } = await import('../../packages/extractor/src/pdf.js?bust=empty');
    const result = await freshExtract(Buffer.from(''));

    expect(result.extractionQuality).toBe('partial');
    expect(result.charCount).toBe(0);
  });

  it('detects and marks garbled table regions with GARBLED_START', async () => {
    vi.mock('unpdf', () => ({
      getDocumentProxy: vi.fn().mockResolvedValue({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({
            items: [
              // Header
              item('Project Requirements', 50, 700, 18),
              // Table-like row (3 x-clusters)
              item('Requirement', 50, 600, 12),
              item('Priority', 220, 600, 12),
              item('Owner', 380, 600, 12),
              // Second table row
              item('Mobile checkout', 50, 580, 12),
              item('High', 220, 580, 12),
              item('Alex', 380, 580, 12),
              // Body text
              item('See appendix for details.', 50, 400, 12),
            ],
          }),
        }),
      }),
    }));

    const { extractFromPdf: freshExtract } = await import('../../packages/extractor/src/pdf.js?bust=table');
    const result = await freshExtract(Buffer.from(''));

    expect(result.structuredMarkdown).toContain('## Project Requirements');
    expect(result.structuredMarkdown).toContain('See appendix for details.');
    // Table should appear either as clean Markdown or marked as garbled
    const hasTable = result.structuredMarkdown.includes('| Requirement |') ||
                     result.structuredMarkdown.includes(GARBLED_START);
    expect(hasTable).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/extractor/pdf.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pdf.ts**

Create `packages/extractor/src/pdf.ts`:

```typescript
import { getDocumentProxy } from 'unpdf';
import type { RichContentDocument } from './types.js';
import { GARBLED_START, GARBLED_END } from './types.js';

interface TextItem {
  str: string;
  transform: number[]; // [a, b, c, d, x, y]
  width: number;
  height: number;
  fontName: string;
}

function isTextItem(item: unknown): item is TextItem {
  return typeof item === 'object' && item !== null && 'str' in item;
}

function getX(item: TextItem): number { return item.transform[4]; }
function getY(item: TextItem): number { return item.transform[5]; }
function getFontSize(item: TextItem): number { return Math.abs(item.transform[3]); }

export function groupByY(items: TextItem[]): Map<number, TextItem[]> {
  const rows = new Map<number, TextItem[]>();
  for (const item of items) {
    const y = getY(item);
    let matched = false;
    for (const [rowY] of rows) {
      if (Math.abs(rowY - y) <= 2) {
        rows.get(rowY)!.push(item);
        matched = true;
        break;
      }
    }
    if (!matched) rows.set(y, [item]);
  }
  for (const rowItems of rows.values()) {
    rowItems.sort((a, b) => getX(a) - getX(b));
  }
  return rows;
}

export function detectXClusters(items: TextItem[]): number[] {
  const xs = items.map(getX).sort((a, b) => a - b);
  if (xs.length === 0) return [];
  const clusters: number[] = [xs[0]];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] > 50) clusters.push(xs[i]);
  }
  return clusters;
}

export function medianFontSize(items: TextItem[]): number {
  const sizes = items.map(getFontSize).filter((s) => s > 0).sort((a, b) => a - b);
  if (sizes.length === 0) return 12;
  return sizes[Math.floor(sizes.length / 2)];
}

function buildMarkdownTable(rows: TextItem[][], columnXs: number[]): { lines: string[]; uncertain: boolean } {
  const cells: string[][] = rows.map((rowItems) => {
    const cols = Array(columnXs.length).fill('');
    for (const item of rowItems) {
      const nearest = columnXs.reduce((best, cx, i) =>
        Math.abs(cx - getX(item)) < Math.abs(columnXs[best] - getX(item)) ? i : best, 0);
      cols[nearest] = (cols[nearest] + ' ' + item.str).trim();
    }
    return cols;
  });

  const allSameLength = cells.every((r) => r.length === columnXs.length);
  const separator = `| ${columnXs.map(() => '---').join(' | ')} |`;
  const lines = cells.map((r) => `| ${r.join(' | ')} |`);
  lines.splice(1, 0, separator);

  return { lines, uncertain: !allSameLength };
}

export async function extractFromPdf(buffer: Buffer): Promise<RichContentDocument> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const allItems: TextItem[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    allItems.push(...content.items.filter(isTextItem));
  }

  if (allItems.length === 0) {
    return { type: 'pdf', structuredMarkdown: '', extractionQuality: 'partial', charCount: 0 };
  }

  const bodySize = medianFontSize(allItems);
  const rows = groupByY(allItems);
  // Sort y descending (PDF origin is bottom-left, so higher y = higher on page)
  const sortedYs = [...rows.keys()].sort((a, b) => b - a);

  // Identify table regions: consecutive y-rows each having ≥ 2 x-clusters
  const tableYs = new Set<number>();
  const rowIsTable: Map<number, boolean> = new Map();
  for (const y of sortedYs) {
    const clusters = detectXClusters(rows.get(y)!);
    rowIsTable.set(y, clusters.length >= 2);
  }

  // Group consecutive table rows into regions
  const tableRegions: number[][] = [];
  let current: number[] = [];
  for (const y of sortedYs) {
    if (rowIsTable.get(y)) {
      current.push(y);
      tableYs.add(y);
    } else {
      if (current.length >= 2) tableRegions.push(current);
      current = [];
    }
  }
  if (current.length >= 2) tableRegions.push(current);

  const lines: string[] = [];
  let hasUncertain = false;
  const renderedTableYs = new Set<number>();

  // Render table regions first so we can reference them by y
  const tableOutput = new Map<number, string[]>(); // first-y → rendered lines
  for (const region of tableRegions) {
    const regionItems = region.map((y) => rows.get(y)!);
    const allXs = regionItems.flat().map(getX);
    const colXs = detectXClusters(regionItems.flat());
    const { lines: tableLines, uncertain } = buildMarkdownTable(regionItems, colXs);

    if (uncertain) {
      hasUncertain = true;
      tableOutput.set(region[0], [GARBLED_START, ...tableLines, GARBLED_END]);
    } else {
      tableOutput.set(region[0], tableLines);
    }
    for (const y of region) renderedTableYs.add(y);
  }

  // Render document in y order
  for (const y of sortedYs) {
    if (renderedTableYs.has(y)) {
      // Emit table output only for the first row of each region
      if (tableOutput.has(y)) {
        lines.push(...tableOutput.get(y)!);
      }
      continue;
    }

    const rowItems = rows.get(y)!;
    const text = rowItems.map((i) => i.str).join(' ').trim();
    if (!text) continue;

    const fontSize = getFontSize(rowItems[0]);
    if (fontSize > bodySize * 1.3 && rowItems.length === 1) {
      lines.push(`## ${text}`);
    } else {
      lines.push(text);
    }
  }

  const structuredMarkdown = lines.join('\n');
  return {
    type: 'pdf',
    structuredMarkdown,
    extractionQuality: hasUncertain ? 'partial' : 'clean',
    charCount: structuredMarkdown.length,
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test tests/extractor/pdf.test.ts
```

Expected: PASS. (The mock-based tests may need minor adjustments if the vi.mock hoisting conflicts — fix imports accordingly.)

- [ ] **Step 5: Commit**

```bash
git add packages/extractor/src/pdf.ts tests/extractor/pdf.test.ts
git commit -m "feat: extractor PDF Stage 1 — bounding box structure detection"
```

---

## Task 6: Extractor — llm-repair.ts (Stage 2)

**Files:**
- Create: `packages/extractor/src/llm-repair.ts`
- Create: `tests/extractor/llm-repair.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/extractor/llm-repair.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repairGarbledSections } from '../../packages/extractor/src/llm-repair.js';
import { GARBLED_START, GARBLED_END } from '../../packages/extractor/src/types.js';

const mockGenerateContent = vi.fn();

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

beforeEach(() => vi.clearAllMocks());

const input = `## Requirements

${GARBLED_START}
RequirementPriorityOwner
Mobile checkoutHighAlex
Fraud detectionHighPriya
${GARBLED_END}

See appendix.`;

describe('repairGarbledSections', () => {
  it('replaces garbled section with LLM-repaired Markdown table', async () => {
    const repairedTable = '| Requirement | Priority | Owner |\n| --- | --- | --- |\n| Mobile checkout | High | Alex |\n| Fraud detection | High | Priya |';
    mockGenerateContent.mockResolvedValue({
      response: { text: () => repairedTable },
    });

    const result = await repairGarbledSections(input, 'test-key');

    expect(result.text).not.toContain(GARBLED_START);
    expect(result.text).toContain('| Requirement | Priority | Owner |');
    expect(result.repaired).toBe(true);
  });

  it('falls back to original section when LLM output char count drifts >20%', async () => {
    // LLM returns something much shorter — clearly wrong
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'x' },
    });

    const result = await repairGarbledSections(input, 'test-key');

    expect(result.text).toContain(GARBLED_START);
    expect(result.repaired).toBe(false);
  });

  it('returns original text unchanged when no garbled sections are present', async () => {
    const clean = '## Title\n\nNo tables here.';
    const result = await repairGarbledSections(clean, 'test-key');

    expect(result.text).toBe(clean);
    expect(result.repaired).toBe(false);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('throws when API key is missing', async () => {
    await expect(repairGarbledSections(input, '')).rejects.toThrow('GEMINI_API_KEY is required');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/extractor/llm-repair.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement llm-repair.ts**

Create `packages/extractor/src/llm-repair.ts`:

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GARBLED_START, GARBLED_END } from './types.js';

const TABLE_REPAIR_PROMPT = `The following text was extracted from a PDF. Reformat it as a Markdown pipe table. Preserve all original words and values exactly — do not summarise or omit anything. Return ONLY the table, no other text.`;

export async function repairGarbledSections(
  text: string,
  apiKey: string,
): Promise<{ text: string; repaired: boolean }> {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required for LLM table repair');

  const pattern = new RegExp(
    `${escapeRegex(GARBLED_START)}([\\s\\S]*?)${escapeRegex(GARBLED_END)}`,
    'g',
  );

  const garbledSections = [...text.matchAll(pattern)];
  if (garbledSections.length === 0) return { text, repaired: false };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  let result = text;
  let anyRepaired = false;

  for (const match of garbledSections) {
    const garbledContent = match[1].trim();
    const fullMatch = match[0];
    const inputLen = garbledContent.length;

    try {
      const response = await model.generateContent(`${TABLE_REPAIR_PROMPT}\n\n${garbledContent}`);
      const repairedTable = response.response.text().trim();

      const drift = Math.abs(repairedTable.length - inputLen) / Math.max(inputLen, 1);
      if (drift > 0.2) {
        // LLM output diverged too much — keep the garbled section as-is
        continue;
      }

      result = result.replace(fullMatch, repairedTable);
      anyRepaired = true;
    } catch {
      // LLM call failed — leave the section unchanged
    }
  }

  return { text: result, repaired: anyRepaired };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test tests/extractor/llm-repair.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/extractor/src/llm-repair.ts tests/extractor/llm-repair.test.ts
git commit -m "feat: extractor Stage 2 — Gemini Flash garbled table repair"
```

---

## Task 7: Extractor — pipeline.ts

**Files:**
- Create: `packages/extractor/src/pipeline.ts`
- Create: `tests/extractor/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/extractor/pipeline.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runExtractionPipeline } from '../../packages/extractor/src/pipeline.js';

vi.mock('../../packages/extractor/src/pdf.js', () => ({
  extractFromPdf: vi.fn(),
}));
vi.mock('../../packages/extractor/src/llm-repair.js', () => ({
  repairGarbledSections: vi.fn(),
}));
vi.mock('../../packages/extractor/src/markdown.js', () => ({
  processMarkdown: vi.fn(),
  processText: vi.fn(),
}));

import { extractFromPdf } from '../../packages/extractor/src/pdf.js';
import { repairGarbledSections } from '../../packages/extractor/src/llm-repair.js';
import { processMarkdown, processText } from '../../packages/extractor/src/markdown.js';

const mockExtractFromPdf = vi.mocked(extractFromPdf);
const mockRepair = vi.mocked(repairGarbledSections);
const mockProcessMarkdown = vi.mocked(processMarkdown);
const mockProcessText = vi.mocked(processText);

beforeEach(() => vi.clearAllMocks());

describe('runExtractionPipeline', () => {
  it('uses processMarkdown for .md files and skips LLM repair', async () => {
    mockProcessMarkdown.mockReturnValue({
      type: 'markdown', structuredMarkdown: '# Title', extractionQuality: 'clean', charCount: 7,
    });

    const result = await runExtractionPipeline(Buffer.from('# Title'), 'prd.md', 'gemini-key');

    expect(mockProcessMarkdown).toHaveBeenCalledWith('# Title');
    expect(mockRepair).not.toHaveBeenCalled();
    expect(result.extractionQuality).toBe('clean');
  });

  it('uses processText for .txt files', async () => {
    mockProcessText.mockReturnValue({
      type: 'text', structuredMarkdown: 'plain', extractionQuality: 'clean', charCount: 5,
    });

    await runExtractionPipeline(Buffer.from('plain'), 'notes.txt', 'gemini-key');

    expect(mockProcessText).toHaveBeenCalledWith('plain');
  });

  it('runs PDF extraction then LLM repair when quality is partial', async () => {
    mockExtractFromPdf.mockResolvedValue({
      type: 'pdf', structuredMarkdown: '%%GARBLED_TABLE%%junk%%END_GARBLED_TABLE%%',
      extractionQuality: 'partial', charCount: 40,
    });
    mockRepair.mockResolvedValue({ text: '| Col1 | Col2 |', repaired: true });

    const result = await runExtractionPipeline(Buffer.from('%PDF'), 'spec.pdf', 'gemini-key');

    expect(mockRepair).toHaveBeenCalledWith('%%GARBLED_TABLE%%junk%%END_GARBLED_TABLE%%', 'gemini-key');
    expect(result.structuredMarkdown).toBe('| Col1 | Col2 |');
    expect(result.extractionQuality).toBe('repaired');
  });

  it('skips LLM repair when PDF extraction quality is clean', async () => {
    mockExtractFromPdf.mockResolvedValue({
      type: 'pdf', structuredMarkdown: '| A | B |\n| --- | --- |',
      extractionQuality: 'clean', charCount: 22,
    });

    await runExtractionPipeline(Buffer.from('%PDF'), 'spec.pdf', 'gemini-key');

    expect(mockRepair).not.toHaveBeenCalled();
  });

  it('returns partial quality when LLM repair does not repair anything', async () => {
    mockExtractFromPdf.mockResolvedValue({
      type: 'pdf', structuredMarkdown: '%%GARBLED_TABLE%%junk%%END_GARBLED_TABLE%%',
      extractionQuality: 'partial', charCount: 40,
    });
    mockRepair.mockResolvedValue({ text: '%%GARBLED_TABLE%%junk%%END_GARBLED_TABLE%%', repaired: false });

    const result = await runExtractionPipeline(Buffer.from('%PDF'), 'spec.pdf', 'gemini-key');

    expect(result.extractionQuality).toBe('partial');
  });

  it('rejects unsupported file extensions', async () => {
    await expect(
      runExtractionPipeline(Buffer.from('data'), 'image.png', 'gemini-key'),
    ).rejects.toThrow('Unsupported file type');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test tests/extractor/pipeline.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pipeline.ts**

Create `packages/extractor/src/pipeline.ts`:

```typescript
import type { RichContentDocument } from './types.js';
import { extractFromPdf } from './pdf.js';
import { repairGarbledSections } from './llm-repair.js';
import { processMarkdown, processText } from './markdown.js';

export async function runExtractionPipeline(
  buffer: Buffer,
  filename: string,
  geminiApiKey: string,
): Promise<RichContentDocument> {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'md') {
    return processMarkdown(buffer.toString('utf-8'));
  }

  if (ext === 'txt') {
    return processText(buffer.toString('utf-8'));
  }

  if (ext === 'pdf') {
    const stage1 = await extractFromPdf(buffer);

    if (stage1.extractionQuality !== 'partial') {
      return stage1;
    }

    const { text, repaired } = await repairGarbledSections(stage1.structuredMarkdown, geminiApiKey);

    return {
      ...stage1,
      structuredMarkdown: text,
      charCount: text.length,
      extractionQuality: repaired ? 'repaired' : 'partial',
    };
  }

  throw new Error(`Unsupported file type: .${ext}`);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test tests/extractor/pipeline.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/extractor/src/pipeline.ts tests/extractor/pipeline.test.ts
git commit -m "feat: extractor pipeline orchestrator — Stages 1 and 2"
```

---

## Task 8: Config Updates

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/worker/src/config.ts`

- [ ] **Step 1: Add GEMINI_API_KEY to API config**

In `apps/api/src/config.ts`, add after the Confluence block:

```typescript
  // Gemini (used by extractor pipeline for table repair)
  GEMINI_API_KEY: z.string().optional(),
```

- [ ] **Step 2: Add storage config to worker**

In `apps/worker/src/config.ts`, add after `SLACK_BOT_TOKEN`:

```typescript
  // Storage (needed by buildIssueDocContext to fetch extracted docs from S3)
  STORAGE_ADAPTER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('ap-southeast-2'),
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config.ts apps/worker/src/config.ts
git commit -m "feat: add GEMINI_API_KEY to API config, storage config to worker config"
```

---

## Task 9: Storage Modules

**Files:**
- Create: `apps/api/src/storage.ts`
- Create: `apps/worker/src/storage.ts`

- [ ] **Step 1: Create API storage module**

Create `apps/api/src/storage.ts`:

```typescript
import { createStorageAdapter } from '@remi/storage';
import { config } from './config.js';

export const storage = createStorageAdapter({
  type: config.STORAGE_ADAPTER === 's3' ? 'S3' : 'local',
  s3: config.STORAGE_ADAPTER === 's3'
    ? { bucket: config.S3_BUCKET!, region: config.S3_REGION }
    : undefined,
});
```

- [ ] **Step 2: Create worker storage module**

Create `apps/worker/src/storage.ts`:

```typescript
import { createStorageAdapter } from '@remi/storage';
import { config } from './config.js';

export const storage = createStorageAdapter({
  type: config.STORAGE_ADAPTER === 's3' ? 'S3' : 'local',
  s3: config.STORAGE_ADAPTER === 's3'
    ? { bucket: config.S3_BUCKET!, region: config.S3_REGION }
    : undefined,
});
```

- [ ] **Step 3: Add @remi/storage as dependency to API and worker**

```bash
pnpm --filter @remi/api add @remi/storage
pnpm --filter @remi/worker add @remi/storage
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/storage.ts apps/worker/src/storage.ts
git commit -m "feat: storage module for API and worker"
```

---

## Task 10: API — POST Route (Upload)

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/routes/admin/index.ts`
- Create: `tests/context-documents/upload.test.ts`

- [ ] **Step 1: Install @fastify/multipart**

```bash
pnpm --filter @remi/api add @fastify/multipart
```

- [ ] **Step 2: Add @remi/extractor as API dependency**

```bash
pnpm --filter @remi/api add @remi/extractor
```

- [ ] **Step 3: Register multipart plugin in server.ts**

In `apps/api/src/server.ts`, add after the existing imports:

```typescript
import multipart from '@fastify/multipart';
```

Add before the route registrations:

```typescript
  await app.register(multipart, { limits: { fileSize: 1_048_576 } }); // 1MB
```

- [ ] **Step 4: Write the failing upload tests**

Create `tests/context-documents/upload.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildServer } from '../../apps/api/src/server.js';
import FormData from 'form-data';

// Mock dependencies used by the upload route
vi.mock('@remi/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@remi/db')>();
  return {
    ...actual,
    prisma: {
      issue: { findUnique: vi.fn().mockResolvedValue({ id: 'issue_1', workspaceId: 'ws_1' }) },
    },
    findIssueById: vi.fn().mockResolvedValue({ id: 'issue_1', workspaceId: 'ws_1' }),
    upsertContextDocument: vi.fn().mockResolvedValue({ id: 'doc_1' }),
    findContextDocument: vi.fn().mockResolvedValue(null),
    deleteContextDocument: vi.fn().mockResolvedValue({ id: 'doc_1' }),
  };
});

vi.mock('@remi/extractor', () => ({
  runExtractionPipeline: vi.fn().mockResolvedValue({
    structuredMarkdown: '# PRD\nContent here.',
    extractionQuality: 'clean',
    charCount: 18,
  }),
}));

vi.mock('../../apps/api/src/storage.js', () => ({
  storage: { put: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) },
}));

beforeEach(() => vi.clearAllMocks());

async function buildTestApp() {
  const app = await buildServer();
  return app;
}

describe('POST /admin/issues/:issueId/context-documents', () => {
  it('returns 400 when description is missing', async () => {
    const app = await buildTestApp();
    const form = new FormData();
    form.append('file', Buffer.from('# PRD'), { filename: 'prd.md', contentType: 'text/markdown' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/issues/issue_1/context-documents',
      headers: { 'x-admin-key': 'dev-admin-key', ...form.getHeaders() },
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/description/i);
  });

  it('returns 400 for unsupported file type', async () => {
    const app = await buildTestApp();
    const form = new FormData();
    form.append('file', Buffer.from('data'), { filename: 'photo.png', contentType: 'image/png' });
    form.append('description', 'A photo');

    const response = await app.inject({
      method: 'POST',
      url: '/admin/issues/issue_1/context-documents',
      headers: { 'x-admin-key': 'dev-admin-key', ...form.getHeaders() },
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/supported/i);
  });

  it('returns 400 when description exceeds 280 characters', async () => {
    const app = await buildTestApp();
    const form = new FormData();
    form.append('file', Buffer.from('# PRD'), { filename: 'prd.md', contentType: 'text/markdown' });
    form.append('description', 'x'.repeat(281));

    const response = await app.inject({
      method: 'POST',
      url: '/admin/issues/issue_1/context-documents',
      headers: { 'x-admin-key': 'dev-admin-key', ...form.getHeaders() },
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 201 on valid Markdown upload', async () => {
    const app = await buildTestApp();
    const form = new FormData();
    form.append('file', Buffer.from('# Q2 PRD\nDetails here.'), {
      filename: 'prd.md',
      contentType: 'text/markdown',
    });
    form.append('description', 'Q2 checkout revamp PRD');

    const response = await app.inject({
      method: 'POST',
      url: '/admin/issues/issue_1/context-documents',
      headers: { 'x-admin-key': 'dev-admin-key', ...form.getHeaders() },
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.extractionQuality).toBe('clean');
    expect(body.filename).toBe('prd.md');
  });
});
```

- [ ] **Step 5: Run tests to confirm they fail**

```bash
pnpm test tests/context-documents/upload.test.ts
```

Expected: FAIL.

- [ ] **Step 6: Add POST route to admin/index.ts**

In `apps/api/src/routes/admin/index.ts`, add imports at the top:

```typescript
import { runExtractionPipeline } from '@remi/extractor';
import { storage } from '../../storage.js';
import { upsertContextDocument, findContextDocument, deleteContextDocument } from '@remi/db';
import { config } from '../../config.js';
```

Add the route inside `adminRoutes`, after the department routes:

```typescript
  // ── Context Documents ──────────────────────────────────────────────────────

  // POST /admin/issues/:issueId/context-documents
  app.post('/issues/:issueId/context-documents', async (request, reply) => {
    const { issueId } = request.params as { issueId: string };

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const filename = data.filename;
    const ext = filename.split('.').pop()?.toLowerCase();
    const allowed = ['pdf', 'md', 'txt'];
    if (!ext || !allowed.includes(ext)) {
      return reply.code(400).send({ error: 'Only PDF, Markdown, and .txt files are supported' });
    }

    const description = (data.fields as any)?.description?.value as string | undefined;
    if (!description || description.trim().length === 0) {
      return reply.code(400).send({ error: 'Description is required' });
    }
    if (description.length > 280) {
      return reply.code(400).send({ error: 'Description must be 280 characters or fewer' });
    }

    const fileBuffer = await data.toBuffer();
    if (fileBuffer.length > 1_048_576) {
      return reply.code(400).send({ error: 'File exceeds 1MB limit' });
    }

    // Verify issue exists and get workspaceId
    const issue = await prisma.issue.findUnique({ where: { id: issueId } });
    if (!issue) {
      return reply.code(404).send({ error: 'Issue not found' });
    }

    // Run extraction pipeline
    const extracted = await runExtractionPipeline(
      fileBuffer,
      filename,
      config.GEMINI_API_KEY ?? '',
    );

    if (extracted.charCount < 100 && ext === 'pdf') {
      return reply.code(400).send({
        error: 'This PDF appears to be image-based. Upload a text-based PDF, Markdown, or .txt file.',
      });
    }

    // Note: IStorageAdapter has no delete method. On replace, the new PUT overwrites
    // the extracted.md key. If the file extension changes, the old original.{ext} file
    // becomes orphaned in S3 — acceptable for V1 (negligible cost, same-extension uploads reuse the key).

    // Store to S3
    const s3KeyOriginal = `context-docs/${issue.workspaceId}/${issueId}/original.${ext}`;
    const s3KeyExtracted = `context-docs/${issue.workspaceId}/${issueId}/extracted.md`;
    await storage.put(s3KeyOriginal, fileBuffer);
    await storage.put(s3KeyExtracted, extracted.structuredMarkdown, 'text/markdown');

    // Persist to DB
    const doc = await upsertContextDocument(prisma, {
      issueId,
      workspaceId: issue.workspaceId,
      filename,
      fileType: ext,
      s3KeyOriginal,
      s3KeyExtracted,
      fileSize: fileBuffer.length,
      description: description.trim(),
      extractionQuality: extracted.extractionQuality,
    });

    return reply.code(201).send({
      id: doc.id,
      filename: doc.filename,
      description: doc.description,
      extractionQuality: doc.extractionQuality,
      uploadedAt: doc.uploadedAt,
    });
  });
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
pnpm test tests/context-documents/upload.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/routes/admin/index.ts tests/context-documents/upload.test.ts
git commit -m "feat: POST /admin/issues/:issueId/context-documents upload route"
```

---

## Task 11: API — GET and DELETE Routes

**Files:**
- Modify: `apps/api/src/routes/admin/index.ts`
- Create: `tests/context-documents/delete.test.ts`

- [ ] **Step 1: Add GET and DELETE routes to admin/index.ts**

Add after the POST route from Task 10:

```typescript
  // GET /admin/issues/:issueId/context-documents
  app.get('/issues/:issueId/context-documents', async (request, reply) => {
    const { issueId } = request.params as { issueId: string };
    const doc = await findContextDocument(prisma, issueId);
    if (!doc) return reply.code(404).send({ error: 'No document uploaded for this issue' });

    return reply.send({
      id: doc.id,
      filename: doc.filename,
      description: doc.description,
      extractionQuality: doc.extractionQuality,
      uploadedAt: doc.uploadedAt,
    });
  });

  // DELETE /admin/issues/:issueId/context-documents
  app.delete('/issues/:issueId/context-documents', async (request, reply) => {
    const { issueId } = request.params as { issueId: string };
    const doc = await findContextDocument(prisma, issueId);
    if (!doc) return reply.code(404).send({ error: 'No document found' });

    // Remove DB record. S3 files become orphaned — IStorageAdapter has no delete method.
    // V1 accepted limitation: orphaned files have negligible cost and are overwritten on re-upload.
    await deleteContextDocument(prisma, issueId);

    return reply.code(204).send();
  });
```

- [ ] **Step 2: Write and run tests for DELETE**

Create `tests/context-documents/delete.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildServer } from '../../apps/api/src/server.js';

vi.mock('@remi/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@remi/db')>();
  return {
    ...actual,
    findContextDocument: vi.fn().mockResolvedValue({
      id: 'doc_1',
      issueId: 'issue_1',
      s3KeyOriginal: 'context-docs/ws_1/issue_1/original.pdf',
      s3KeyExtracted: 'context-docs/ws_1/issue_1/extracted.md',
    }),
    deleteContextDocument: vi.fn().mockResolvedValue({ id: 'doc_1' }),
    upsertContextDocument: vi.fn(),
  };
});

vi.mock('../../apps/api/src/storage.js', () => ({
  storage: { put: vi.fn().mockResolvedValue(undefined) },
}));

beforeEach(() => vi.clearAllMocks());

describe('DELETE /admin/issues/:issueId/context-documents', () => {
  it('returns 204 and removes the DB record', async () => {
    const app = await buildServer();
    const { deleteContextDocument } = await import('@remi/db');

    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/issues/issue_1/context-documents',
      headers: { 'x-admin-key': 'dev-admin-key' },
    });

    expect(response.statusCode).toBe(204);
    expect(vi.mocked(deleteContextDocument)).toHaveBeenCalledWith(expect.anything(), 'issue_1');
  });

  it('returns 404 when no document exists', async () => {
    const { findContextDocument } = await import('@remi/db');
    vi.mocked(findContextDocument).mockResolvedValueOnce(null);

    const app = await buildServer();
    const response = await app.inject({
      method: 'DELETE',
      url: '/admin/issues/issue_missing/context-documents',
      headers: { 'x-admin-key': 'dev-admin-key' },
    });

    expect(response.statusCode).toBe(404);
  });
});
```

```bash
pnpm test tests/context-documents/delete.test.ts
```

Expected: PASS — 2 tests.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin/index.ts tests/context-documents/delete.test.ts
git commit -m "feat: GET and DELETE /admin/issues/:issueId/context-documents routes"
```

---

## Task 12: IssueDocContext Type + Page-Writer Update

**Files:**
- Modify: `packages/confluence/src/types.ts`
- Modify: `packages/confluence/src/page-writer.ts`

- [ ] **Step 1: Add stale to IssueDocContext type**

In `packages/confluence/src/types.ts`, update `uploadedContext`:

```typescript
  /** Present when an authorized user has uploaded a project brief or context doc for this issue. */
  uploadedContext?: {
    filename: string;
    uploadedAt: Date;
    excerpt: string;
    stale: boolean;
  };
```

- [ ] **Step 2: Update page-writer.ts to use stale flag**

In `packages/confluence/src/page-writer.ts`, find the existing uploaded context section (lines 35–47) and replace it with:

```typescript
  // ── Uploaded context (project brief) ────────────────────────────────────
  if (ctx.uploadedContext) {
    const staleWarning = ctx.uploadedContext.stale
      ? `<p><em>⚠ Uploaded before recent issue activity — verify this document reflects the current state.</em></p>`
      : '';
    sections.push(section(
      'Project Brief',
      `${staleWarning}<p><strong>${esc(ctx.uploadedContext.filename)}</strong> (uploaded ${fmt(ctx.uploadedContext.uploadedAt)})</p>` +
      `<blockquote><p>${esc(ctx.uploadedContext.excerpt)}</p></blockquote>`,
    ));
  }
```

- [ ] **Step 3: Run the existing page-writer tests to confirm no regressions**

```bash
pnpm test tests/confluence/page-writer.test.ts
```

Expected: PASS. If any tests reference the old `age > 30` logic, update them to pass `stale: true` or `stale: false` on `uploadedContext`.

- [ ] **Step 4: Commit**

```bash
git add packages/confluence/src/types.ts packages/confluence/src/page-writer.ts
git commit -m "feat: add stale flag to IssueDocContext uploadedContext; update page-writer"
```

---

## Task 13: buildIssueDocContext — Upload Context Query

**Files:**
- Modify: `packages/confluence/package.json`
- Modify: `packages/confluence/src/build-context.ts`
- Create: `tests/context-documents/build-context.test.ts`

- [ ] **Step 1: Add @remi/storage to confluence package**

In `packages/confluence/package.json`, add to `dependencies`:

```json
"@remi/storage": "workspace:*"
```

- [ ] **Step 2: Write the failing tests**

Create `tests/context-documents/build-context.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildIssueDocContext } from '../../packages/confluence/src/build-context.js';

const baseIssue = {
  id: 'issue_1', jiraIssueKey: 'ENG-1', title: 'Auth rework',
  status: 'In Progress', assigneeDisplayName: null, priority: null, department: null,
};

function makeMockPrisma(overrides: Record<string, any> = {}) {
  return {
    issue: { findUniqueOrThrow: vi.fn().mockResolvedValue(baseIssue) },
    issueEvent: { findMany: vi.fn().mockResolvedValue([]) },
    issueThreadLink: { findMany: vi.fn().mockResolvedValue([]) },
    memoryUnit: { findFirst: vi.fn().mockResolvedValue(null) },
    issueEmailLink: { findMany: vi.fn().mockResolvedValue([]) },
    issueContextDocument: { findUnique: vi.fn().mockResolvedValue(null) },
    slackMessage: { findFirst: vi.fn().mockResolvedValue(null) },
    ...overrides,
  } as any;
}

function makeStorage(markdown = '# PRD\nContent.') {
  return { get: vi.fn().mockResolvedValue(Buffer.from(markdown)) } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('buildIssueDocContext — uploadedContext', () => {
  it('returns undefined uploadedContext when no document exists', async () => {
    const ctx = await buildIssueDocContext(makeMockPrisma(), makeStorage(), 'issue_1', 'handoff');
    expect(ctx.uploadedContext).toBeUndefined();
  });

  it('populates uploadedContext with description as excerpt and fetches markdown', async () => {
    const uploadedAt = new Date('2026-01-01');
    const doc = {
      id: 'doc_1', issueId: 'issue_1', filename: 'prd.pdf',
      s3KeyExtracted: 'context-docs/ws_1/issue_1/extracted.md',
      description: 'Q2 checkout PRD', extractionQuality: 'clean',
      uploadedAt,
    };
    const prisma = makeMockPrisma({
      issueContextDocument: { findUnique: vi.fn().mockResolvedValue(doc) },
    });
    const storage = makeStorage('# Q2 Checkout PRD\nDetails.');

    const ctx = await buildIssueDocContext(prisma, storage, 'issue_1', 'handoff');

    expect(ctx.uploadedContext?.filename).toBe('prd.pdf');
    expect(ctx.uploadedContext?.excerpt).toBe('Q2 checkout PRD');
    expect(ctx.uploadedContext?.stale).toBe(false);
  });

  it('sets stale: true when upload is 31+ days before latest Slack message', async () => {
    const uploadedAt = new Date('2026-01-01');
    const latestMessageAt = new Date('2026-02-05'); // 35 days later

    const doc = {
      id: 'doc_1', issueId: 'issue_1', filename: 'prd.pdf',
      s3KeyExtracted: 'context-docs/ws_1/issue_1/extracted.md',
      description: 'Q2 PRD', extractionQuality: 'clean',
      uploadedAt,
    };

    const prisma = makeMockPrisma({
      issueContextDocument: { findUnique: vi.fn().mockResolvedValue(doc) },
      issueThreadLink: { findMany: vi.fn().mockResolvedValue([
        { thread: { messages: [{ sentAt: latestMessageAt }] } },
      ]) },
    });

    const ctx = await buildIssueDocContext(prisma, makeStorage(), 'issue_1', 'handoff');

    expect(ctx.uploadedContext?.stale).toBe(true);
  });

  it('sets stale: false when upload is only 20 days before latest Slack message', async () => {
    const uploadedAt = new Date('2026-01-01');
    const latestMessageAt = new Date('2026-01-21'); // 20 days later

    const doc = {
      id: 'doc_1', issueId: 'issue_1', filename: 'prd.pdf',
      s3KeyExtracted: 'context-docs/ws_1/issue_1/extracted.md',
      description: 'Q2 PRD', extractionQuality: 'clean',
      uploadedAt,
    };

    const prisma = makeMockPrisma({
      issueContextDocument: { findUnique: vi.fn().mockResolvedValue(doc) },
      issueThreadLink: { findMany: vi.fn().mockResolvedValue([
        { thread: { messages: [{ sentAt: latestMessageAt }] } },
      ]) },
    });

    const ctx = await buildIssueDocContext(prisma, makeStorage(), 'issue_1', 'handoff');

    expect(ctx.uploadedContext?.stale).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
pnpm test tests/context-documents/build-context.test.ts
```

Expected: FAIL — wrong function signature.

- [ ] **Step 4: Update build-context.ts**

In `packages/confluence/src/build-context.ts`, add the import and update the signature and body:

At the top, add:

```typescript
import type { IStorageAdapter } from '@remi/storage';
```

Change the function signature from:

```typescript
export async function buildIssueDocContext(
  prisma: PrismaClient,
  issueId: string,
  docType: IssueDocContext['docType'],
): Promise<IssueDocContext>
```

To:

```typescript
export async function buildIssueDocContext(
  prisma: PrismaClient,
  storage: IStorageAdapter,
  issueId: string,
  docType: IssueDocContext['docType'],
): Promise<IssueDocContext>
```

At the end of the function, before the `return` statement, add the upload context query. Insert after the `relatedEmails` block:

```typescript
  // ── Uploaded context document ─────────────────────────────────────────────
  let uploadedContext: IssueDocContext['uploadedContext'];
  const contextDoc = await prisma.issueContextDocument.findUnique({ where: { issueId } });
  if (contextDoc) {
    const latestMessage = allMessages.reduce<Date | null>((latest, m) => {
      return latest === null || m.sentAt > latest ? m.sentAt : latest;
    }, null);
    const stale =
      latestMessage !== null &&
      latestMessage.getTime() - contextDoc.uploadedAt.getTime() > 30 * 24 * 60 * 60 * 1000;

    uploadedContext = {
      filename: contextDoc.filename,
      uploadedAt: contextDoc.uploadedAt,
      excerpt: contextDoc.description,
      stale,
    };
  }
```

Update the return statement to include `uploadedContext`. The `issue` block is unchanged — only `uploadedContext` is added:

```typescript
  return {
    issue: {
      key: issue.jiraIssueKey,
      title: issue.title,
      status: issue.status ?? 'Unknown',
      assignee: issue.assigneeDisplayName ?? undefined,
      priority: issue.priority ?? undefined,
    },
    timeline,
    keyDecisions,
    blockers,
    openQuestions,
    participants,
    linkedThreads,
    relatedEmails,
    uploadedContext,
    department: issue.department?.name,
    generatedAt: new Date(),
    docType,
  };
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm test tests/context-documents/build-context.test.ts
```

Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/confluence/src/build-context.ts packages/confluence/package.json packages/confluence/src/types.ts tests/context-documents/build-context.test.ts
git commit -m "feat: buildIssueDocContext — upload context query with stale detection"
```

---

## Task 14: Worker Handler Update

**Files:**
- Modify: `apps/worker/src/handlers/doc-generate-jobs.ts`

- [ ] **Step 1: Update the handler to pass storage**

In `apps/worker/src/handlers/doc-generate-jobs.ts`:

Add the storage import at the top:

```typescript
import { storage } from '../storage.js';
```

Change line 29 from:

```typescript
  const ctx = await buildIssueDocContext(prisma, issueId, docType);
```

To:

```typescript
  const ctx = await buildIssueDocContext(prisma, storage, issueId, docType);
```

- [ ] **Step 2: Run full test suite to catch any regressions**

```bash
pnpm test
```

Expected: all tests pass. If any existing test calls `buildIssueDocContext` without the `storage` argument, add a mock storage object `{ get: vi.fn().mockResolvedValue(Buffer.from('')) }` to those calls.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/handlers/doc-generate-jobs.ts
git commit -m "feat: pass storage adapter to buildIssueDocContext in doc-generate handler"
```

---

## Task 15: Admin UI — Upload Page

**Files:**
- Create: `apps/admin/src/app/issues/[issueId]/context/page.tsx`

> **Removal note:** This page is temporary. When the product platform replaces admin as the end-user upload surface, delete this file. The API routes at `/admin/issues/:issueId/context-documents` and the extraction pipeline are reused unchanged.

- [ ] **Step 1: Create the upload page**

Create `apps/admin/src/app/issues/[issueId]/context/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface ContextDoc {
  id: string;
  filename: string;
  description: string;
  extractionQuality: string;
  uploadedAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? 'dev-admin-key';

async function fetchDoc(issueId: string): Promise<ContextDoc | null> {
  const res = await fetch(`${API_URL}/admin/issues/${issueId}/context-documents`, {
    headers: { 'x-admin-key': ADMIN_KEY },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load document: ${res.status}`);
  return res.json();
}

async function deleteDoc(issueId: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/issues/${issueId}/context-documents`, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export default function IssueContextPage({ params }: { params: { issueId: string } }) {
  const { issueId } = params;
  const [doc, setDoc] = useState<ContextDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDoc(issueId)
      .then(setDoc)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [issueId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Select a file'); return; }
    if (!description.trim()) { setError('Description is required'); return; }

    const form = new FormData();
    form.append('file', file);
    form.append('description', description.trim());

    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/issues/${issueId}/context-documents`, {
        method: 'POST',
        headers: { 'x-admin-key': ADMIN_KEY },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Upload failed'); return; }
      setDoc(body);
      setDescription('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError('Upload failed — check your connection');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Remove this document?')) return;
    try {
      await deleteDoc(issueId);
      setDoc(null);
    } catch (err) {
      setError('Delete failed');
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Context Document</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>
        Issue ID: <code>{issueId}</code> — find this ID in the workspace summary view.
      </p>

      {doc && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <strong>{doc.filename}</strong>
          <p style={{ margin: '4px 0', color: '#555' }}>{doc.description}</p>
          <p style={{ fontSize: 12, color: '#888' }}>
            Uploaded {new Date(doc.uploadedAt).toLocaleDateString()} · Quality: {doc.extractionQuality}
          </p>
          {doc.extractionQuality === 'partial' && (
            <p style={{ color: '#b45309', fontSize: 12 }}>
              ⚠ Some tables in this PDF couldn't be fully parsed — consider uploading as Markdown.
            </p>
          )}
          <button onClick={handleDelete} style={{ marginTop: 8, color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>
            Remove document
          </button>
        </div>
      )}

      <form onSubmit={handleUpload}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>{doc ? 'Replace document' : 'Upload document'}</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>
            File <span style={{ color: '#888' }}>(.pdf, .md, .txt · max 1MB)</span>
          </label>
          <input ref={fileRef} type="file" accept=".pdf,.md,.txt" required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>
            Description <span style={{ color: '#888' }}>({description.length}/280)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            rows={3}
            required
            placeholder="e.g. Q2 checkout revamp PRD — covers mobile payment flows and fraud requirements"
            style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 4, border: '1px solid #ccc' }}
          />
        </div>
        {error && <p style={{ color: 'red', fontSize: 13 }}>{error}</p>}
        <button
          type="submit"
          disabled={uploading}
          style={{ padding: '8px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/issues/
git commit -m "feat: admin upload page for issue context documents (temporary surface)"
```

---

## Task 16: OUT_OF_SCOPE_COORDINATION_MVP.md Update

**Files:**
- Modify: `docs/design/OUT_OF_SCOPE_COORDINATION_MVP.md`

- [ ] **Step 1: Append new entries**

Open `docs/design/OUT_OF_SCOPE_COORDINATION_MVP.md` and append:

```markdown
13. **Multiple documents per issue** — one doc per issue in V1. Multiple docs require listing UI, ordering, and selective inclusion logic in context assembly.
14. **Extraction pipeline rollout to email and Jira descriptions** — `RichContentDocument` interface is defined in `packages/extractor/src/types.ts` and ready for adoption, but migrating working email/Jira pipelines is a separate project.
15. **Product platform / end-user upload UI** — the admin dashboard is a temporary upload surface. A dedicated platform with Current Work Record views, scope controls, and workspace-member auth is the long-term replacement. Delete `apps/admin/src/app/issues/` when built.
16. **Uploaded documents as higher truth** — contextual uploads are pinned reference input. They should not automatically override newer live Jira, Slack, or Gmail evidence; conflicts should be surfaced, not silently resolved in favor of the upload.
```

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Final commit**

```bash
git add docs/design/OUT_OF_SCOPE_COORDINATION_MVP.md
git commit -m "docs: update OUT_OF_SCOPE with document upload V2 items"
```

---

## Verification Checklist

Run these manually after all tasks complete:

- [ ] `POST /admin/issues/:issueId/context-documents` with a `.md` file → 201, `extractionQuality: clean`
- [ ] `POST` with a `.pdf` file → structured Markdown in S3, table sections reconstructed
- [ ] `POST` on same issue again → old S3 keys replaced, new record in DB
- [ ] `GET /admin/issues/:issueId/context-documents` → returns metadata
- [ ] `DELETE` → 204, both S3 keys emptied, DB record removed
- [ ] `POST` file > 1MB → 400
- [ ] `POST` unsupported type (`.png`) → 400
- [ ] `POST` empty description → 400
- [ ] `/remi doc ISSUE-KEY handoff` with a doc uploaded → Confluence page includes "Project Brief" section
- [ ] Upload doc 31 days before latest Slack message → stale warning in Confluence page
- [ ] `pnpm test` — all tests pass
