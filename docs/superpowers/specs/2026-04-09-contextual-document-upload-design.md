# Contextual Document Upload — Design Spec

**Date:** 2026-04-09
**Status:** Approved

---

## Context

Remi assembles operational context from Slack, Jira, and email. A gap exists for authoritative reference material — PRDs, project briefs, stakeholder requirements — that PMs produce outside those systems. Without a way to attach these documents to an issue, the Confluence handoff doc is missing the upstream intent that explains *why* decisions were made.

This feature lets a PM upload one document per issue. The file is run through a structured extraction pipeline, stored in S3, and included as a cited section in any Confluence doc generated for that issue.

---

## Scope

- One document per issue (replace on re-upload)
- File types: PDF (text-based), Markdown, plain text
- File size cap: 1MB
- Upload surface: admin dashboard (temporary — see Migration note)
- Out of scope: multiple docs per issue, global workspace library, scanned/image PDFs, pipeline rollout to email/Jira sources, product platform UI

---

## Architecture

### New package: `packages/extractor`

Owns all document parsing logic. Defines the `RichContentDocument` interface — the contract future rich-content sources will also produce.

```
packages/extractor/src/
  types.ts        RichContentDocument interface
  pdf.ts          unpdf extraction + bounding box structure detection
  markdown.ts     Markdown/TXT passthrough
  llm-repair.ts   Gemini Flash table repair (garbled sections only)
  pipeline.ts     orchestrates stages 1–3
  index.ts        exports
```

```typescript
export interface RichContentDocument {
  type: 'pdf' | 'markdown' | 'text'
  structuredMarkdown: string
  extractionQuality: 'clean' | 'repaired' | 'partial'
  charCount: number
}
```

### Extraction pipeline (three stages)

**Stage 1 — Structured extraction (`pdf.ts`)**

Uses `unpdf` (server-side pdfjs-dist wrapper). `getTextContent()` returns text items with `x`, `y`, font size, and font name. Pipeline:
- Group items by `y` coordinate (±2px tolerance) → rows
- Rows with ≥3 distinct `x` clusters → table row candidates → reconstruct as Markdown pipe tables
- Items with font size significantly above body average → `## Header`
- Items with consistent hanging indent → `- bullet`
- Everything else → paragraph text

Output: full-document Markdown. `extractionQuality: 'clean'` if all tables resolved cleanly, `'partial'` if any were uncertain.

**Stage 2 — LLM table repair (`llm-repair.ts`)**

Only runs when `extractionQuality === 'partial'`. Identifies garbled table sections (not the full document) and sends them to **Gemini Flash** via `GEMINI_API_KEY` with a bounded prompt:

> "The following text was extracted from a PDF. Find any content that looks like a table but is garbled or misaligned. Reformat those sections as Markdown pipe tables. Return the complete text unchanged except for those table sections."

LLM is a structure formatter — words preserved verbatim. Fallback: if output char count drifts >20% from input, discard LLM output and use Stage 1 result. Set `extractionQuality: 'partial'` in either fallback case.

**Stage 3 — Storage**

- Original file → `context-docs/{workspaceId}/{issueId}/original.{ext}`
- Extracted Markdown → `context-docs/{workspaceId}/{issueId}/extracted.md`

Both written via the existing `IStorageAdapter` from `packages/storage`.

---

## Data Model

```prisma
model IssueContextDocument {
  id                String   @id @default(cuid())
  issueId           String   @unique
  workspaceId       String
  filename          String
  fileType          String                  // 'pdf' | 'markdown' | 'text'
  s3KeyOriginal     String
  s3KeyExtracted    String
  fileSize          Int                     // bytes
  description       String                  // user-provided, becomes excerpt in Confluence
  extractionQuality String                  // 'clean' | 'repaired' | 'partial'
  uploadedAt        DateTime @default(now())
  updatedAt         DateTime @updatedAt

  issue     Issue     @relation(fields: [issueId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([workspaceId])
  @@map("issue_context_documents")
}
```

---

## API

Three routes added to `apps/api/src/routes/admin/index.ts`, protected by the existing `X-Admin-Key` hook.

```
POST   /admin/issues/:issueId/context-documents
GET    /admin/issues/:issueId/context-documents
DELETE /admin/issues/:issueId/context-documents
```

`@fastify/multipart` registered in `apps/api/src/server.ts`.

**POST** accepts multipart form with `file` (binary) and `description` (string). If a record already exists for the issue, both old S3 keys are deleted and the DB record is upserted. Returns `{ id, filename, description, extractionQuality, uploadedAt }`.

**GET** returns the same metadata shape. Does not return S3 content — that's internal.

**DELETE** deletes both S3 keys and the DB record. Returns 204.

### Validation

| Check | Response |
|---|---|
| File type not .pdf / .md / .txt | 400: "Only PDF, Markdown, and .txt files are supported" |
| File size > 1MB | 400: "File exceeds 1MB limit" |
| Description missing or empty | 400: "Description is required" |
| Description > 280 chars | 400: "Description must be 280 characters or fewer" |
| Extraction yields < 100 chars | 400: "This PDF appears to be image-based. Upload a text-based PDF, Markdown, or .txt file." |
| LLM repair fails / char drift > 20% | Silent fallback to Stage 1; `extractionQuality: 'partial'` |
| S3 write fails | 500; DB record not written |

---

## Context Integration

### `IssueDocContext` type update (`packages/confluence/src/types.ts`)

```typescript
uploadedContext?: {
  filename: string
  uploadedAt: Date
  excerpt: string   // user-provided description
  stale: boolean    // true if uploadedAt is 30+ days before latest linked Slack message
}
```

### `buildIssueDocContext` signature update (`packages/confluence/src/build-context.ts`)

```typescript
export async function buildIssueDocContext(
  prisma: PrismaClient,
  storage: IStorageAdapter,  // added
  issueId: string,
  docType: IssueDocContext['docType'],
): Promise<IssueDocContext>
```

The function queries `IssueContextDocument` by `issueId`. If found, fetches structured Markdown from `s3KeyExtracted` via the storage adapter and populates `uploadedContext`. Stale detection: compare `uploadedAt` against the maximum `createdAt` across all Slack messages in linked threads. If delta > 30 days → `stale: true`.

The one call site (`apps/worker/src/handlers/doc-generate-jobs.ts`) is updated to pass the storage adapter.

The Confluence page renderer adds a "Project Brief" section when `uploadedContext` is present, with a stale warning banner when `stale: true`.

---

## Admin UI (temporary)

**File:** `apps/admin/src/app/issues/[issueId]/context/page.tsx`

- File picker (`accept=".pdf,.md,.txt"`)
- Description textarea (required, maxLength 280, character counter)
- Upload progress indicator
- If doc exists: show filename, upload date, `extractionQuality` badge; offer Replace and Delete
- `extractionQuality: 'partial'` shows inline warning: "Some tables in this PDF couldn't be fully parsed — consider uploading as Markdown for better results"

**Migration note:** This page is the only component to remove when the product platform replaces admin as the PM surface. The API routes (`/admin/issues/:issueId/context-documents`), `packages/extractor`, and S3 layout are all platform-agnostic and reused unchanged. The routes will move to workspace-member auth at that point.

---

## Error Handling

- Scanned PDFs fail fast at the API layer (< 100 chars extracted) with a clear user message
- LLM failures are silent — the pipeline degrades gracefully to Stage 1 output
- S3 write failures return 500 without touching the DB, preventing orphaned records
- Replace-on-upload: old S3 keys are deleted before new ones are written; if the new S3 write fails, the old DB record is left intact (no data loss)

---

## Testing

```
tests/extractor/
  pdf.test.ts           fixture PDFs: clean layout, tables-only, mixed, near-empty
  llm-repair.test.ts    prompt construction + response parsing, char drift fallback
  pipeline.test.ts      mock Gemini; verify quality flags; fallback on char drift >20%

tests/context-documents/
  upload.test.ts        valid upload, replace existing, all rejection cases
  delete.test.ts        both S3 keys deleted + DB record removed
  build-context.test.ts uploadedContext populated; stale flag at 30-day boundary
```

Gemini is mocked in all tests except `llm-repair.test.ts`.

---

## Out of Scope

- Multiple documents per issue
- Global workspace document library
- Scanned / image PDF extraction (requires OCR)
- Extraction pipeline rollout to email and Jira description sources
- Product platform / PM-facing UI (admin is temporary)
- Re-extraction on demand (possible future feature given original file is stored)
