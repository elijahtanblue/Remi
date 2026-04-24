-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "scopeId" TEXT;

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scopes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_scope_configs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "includedChannelIds" TEXT[],
    "includedJiraProjects" TEXT[],
    "includedMailboxes" TEXT[],
    "writebackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_scope_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_work_records" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "currentState" TEXT NOT NULL,
    "ownerDisplayName" TEXT,
    "ownerExternalId" TEXT,
    "ownerSource" TEXT,
    "blockerSummary" TEXT,
    "blockerDetectedAt" TIMESTAMP(3),
    "waitingOnType" TEXT,
    "waitingOnDescription" TEXT,
    "openQuestions" JSONB NOT NULL,
    "nextStep" TEXT,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "urgencyReason" TEXT,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "staleSince" TIMESTAMP(3),
    "ownerConfirmedAt" TIMESTAMP(3),
    "blockerClearedAt" TIMESTAMP(3),
    "lastJiraStatus" TEXT,
    "lastJiraAssigneeId" TEXT,
    "sourceMemoryUnitIds" TEXT[],
    "sourceSnapshotIds" TEXT[],
    "snapshotSetHash" TEXT NOT NULL,
    "dataSources" TEXT[],
    "sourceFreshnessAt" TIMESTAMP(3) NOT NULL,
    "lastMeaningfulChangeAt" TIMESTAMP(3),
    "lastMeaningfulChangeSummary" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "current_work_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meaningful_events" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "actorName" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meaningful_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "scopes_workspaceId_idx" ON "scopes"("workspaceId");

-- CreateIndex
CREATE INDEX "workflow_scope_configs_workspaceId_idx" ON "workflow_scope_configs"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_scope_configs_scopeId_workflowKey_key" ON "workflow_scope_configs"("scopeId", "workflowKey");

-- CreateIndex
CREATE UNIQUE INDEX "current_work_records_issueId_key" ON "current_work_records"("issueId");

-- CreateIndex
CREATE INDEX "current_work_records_workspaceId_isStale_idx" ON "current_work_records"("workspaceId", "isStale");

-- CreateIndex
CREATE INDEX "current_work_records_workspaceId_riskScore_idx" ON "current_work_records"("workspaceId", "riskScore");

-- CreateIndex
CREATE INDEX "current_work_records_workspaceId_lastMeaningfulChangeAt_idx" ON "current_work_records"("workspaceId", "lastMeaningfulChangeAt");

-- CreateIndex
CREATE INDEX "current_work_records_workspaceId_sourceFreshnessAt_idx" ON "current_work_records"("workspaceId", "sourceFreshnessAt");

-- CreateIndex
CREATE UNIQUE INDEX "meaningful_events_idempotencyKey_key" ON "meaningful_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "meaningful_events_issueId_occurredAt_idx" ON "meaningful_events"("issueId", "occurredAt");

-- CreateIndex
CREATE INDEX "meaningful_events_workspaceId_occurredAt_idx" ON "meaningful_events"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "issues_workspaceId_scopeId_idx" ON "issues"("workspaceId", "scopeId");

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scope_configs" ADD CONSTRAINT "workflow_scope_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_scope_configs" ADD CONSTRAINT "workflow_scope_configs_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "scopes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_work_records" ADD CONSTRAINT "current_work_records_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_work_records" ADD CONSTRAINT "current_work_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meaningful_events" ADD CONSTRAINT "meaningful_events_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meaningful_events" ADD CONSTRAINT "meaningful_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
