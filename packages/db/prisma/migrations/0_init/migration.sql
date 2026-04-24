-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jiraProjectPrefixes" TEXT[],
    "slackChannelPatterns" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_workspace_installs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "slackTeamName" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botUserId" TEXT NOT NULL,
    "installedByUserId" TEXT,
    "scopes" TEXT[],
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),

    CONSTRAINT "slack_workspace_installs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jira_workspace_installs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jiraClientKey" TEXT NOT NULL,
    "jiraSiteUrl" TEXT NOT NULL,
    "sharedSecret" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),

    CONSTRAINT "jira_workspace_installs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_users" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "slackUsername" TEXT,
    "slackRealName" TEXT,

    CONSTRAINT "slack_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jira_users" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jiraAccountId" TEXT NOT NULL,
    "jiraSiteUrl" TEXT NOT NULL,
    "jiraDisplayName" TEXT,

    CONSTRAINT "jira_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_crosswalks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "user_crosswalks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jiraIssueId" TEXT NOT NULL,
    "jiraIssueKey" TEXT NOT NULL,
    "jiraSiteUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT,
    "statusCategory" TEXT,
    "assigneeJiraAccountId" TEXT,
    "assigneeDisplayName" TEXT,
    "priority" TEXT,
    "issueType" TEXT,
    "rawPayload" JSONB,
    "s3PayloadKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "departmentId" TEXT,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_events" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorExternalId" TEXT,
    "changedFields" JSONB,
    "rawPayload" JSONB NOT NULL,
    "s3PayloadKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "issue_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_threads" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "threadTs" TEXT NOT NULL,
    "isChannelLevel" BOOLEAN NOT NULL DEFAULT false,
    "channelName" TEXT,
    "permalink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "slackMessageTs" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "s3PayloadKey" TEXT,
    "source" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "slack_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_thread_links" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),

    CONSTRAINT "issue_thread_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summaries" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'current',
    "content" JSONB NOT NULL,
    "triggerReason" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summaryRunId" TEXT,

    CONSTRAINT "summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "summary_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorId" TEXT,
    "properties" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_dead_letters" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "queue" TEXT NOT NULL,
    "messageId" TEXT,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retriedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "queue_dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confluence_workspace_installs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cloudId" TEXT NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scopes" TEXT[],
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "tokenExpiresAt" TIMESTAMP(3),
    "defaultSpaceKey" TEXT,

    CONSTRAINT "confluence_workspace_installs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confluence_pages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "issueId" TEXT,
    "departmentId" TEXT,
    "confluencePageId" TEXT NOT NULL,
    "spaceKey" TEXT,
    "title" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "confluenceVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "confluence_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmail_workspace_installs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serviceAccountJson" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "monitoredEmails" TEXT[],
    "mailboxHistoryIds" JSONB,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),

    CONSTRAINT "gmail_workspace_installs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_threads" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "gmailInstallId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "subject" TEXT,
    "participants" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmails" TEXT[],
    "subject" TEXT,
    "bodySnippet" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_email_links" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),

    CONSTRAINT "issue_email_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_memory_configs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "excludedChannelIds" TEXT[],
    "excludedUserIds" TEXT[],
    "trackedChannelIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_memory_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_units" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeRef" TEXT NOT NULL,
    "issueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "departmentId" TEXT,

    CONSTRAINT "memory_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_observations" (
    "id" TEXT NOT NULL,
    "memoryUnitId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "citationIds" TEXT[],
    "sourceApp" TEXT,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" TEXT NOT NULL DEFAULT 'active',
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "memory_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_snapshots" (
    "id" TEXT NOT NULL,
    "memoryUnitId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "currentState" TEXT NOT NULL,
    "keyDecisions" JSONB NOT NULL,
    "openActions" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "openQuestions" JSONB NOT NULL,
    "owners" TEXT[],
    "dataSources" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "freshness" TIMESTAMP(3) NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "sourceObsIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_writeback_proposals" (
    "id" TEXT NOT NULL,
    "memoryUnitId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "citationIds" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_writeback_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "departments_workspaceId_idx" ON "departments"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "slack_workspace_installs_slackTeamId_key" ON "slack_workspace_installs"("slackTeamId");

-- CreateIndex
CREATE INDEX "slack_workspace_installs_slackTeamId_idx" ON "slack_workspace_installs"("slackTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "jira_workspace_installs_jiraClientKey_key" ON "jira_workspace_installs"("jiraClientKey");

-- CreateIndex
CREATE INDEX "jira_workspace_installs_jiraClientKey_idx" ON "jira_workspace_installs"("jiraClientKey");

-- CreateIndex
CREATE INDEX "users_workspaceId_idx" ON "users"("workspaceId");

-- CreateIndex
CREATE INDEX "slack_users_slackUserId_idx" ON "slack_users"("slackUserId");

-- CreateIndex
CREATE UNIQUE INDEX "slack_users_slackUserId_slackTeamId_key" ON "slack_users"("slackUserId", "slackTeamId");

-- CreateIndex
CREATE INDEX "jira_users_jiraAccountId_idx" ON "jira_users"("jiraAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "jira_users_jiraAccountId_jiraSiteUrl_key" ON "jira_users"("jiraAccountId", "jiraSiteUrl");

-- CreateIndex
CREATE UNIQUE INDEX "user_crosswalks_source_externalId_key" ON "user_crosswalks"("source", "externalId");

-- CreateIndex
CREATE INDEX "issues_workspaceId_idx" ON "issues"("workspaceId");

-- CreateIndex
CREATE INDEX "issues_jiraIssueKey_idx" ON "issues"("jiraIssueKey");

-- CreateIndex
CREATE UNIQUE INDEX "issues_jiraIssueId_jiraSiteUrl_key" ON "issues"("jiraIssueId", "jiraSiteUrl");

-- CreateIndex
CREATE UNIQUE INDEX "issue_events_idempotencyKey_key" ON "issue_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "issue_events_issueId_occurredAt_idx" ON "issue_events"("issueId", "occurredAt");

-- CreateIndex
CREATE INDEX "issue_events_idempotencyKey_idx" ON "issue_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "slack_threads_workspaceId_idx" ON "slack_threads"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "slack_threads_slackTeamId_channelId_threadTs_key" ON "slack_threads"("slackTeamId", "channelId", "threadTs");

-- CreateIndex
CREATE UNIQUE INDEX "slack_messages_idempotencyKey_key" ON "slack_messages"("idempotencyKey");

-- CreateIndex
CREATE INDEX "slack_messages_threadId_sentAt_idx" ON "slack_messages"("threadId", "sentAt");

-- CreateIndex
CREATE INDEX "slack_messages_idempotencyKey_idx" ON "slack_messages"("idempotencyKey");

-- CreateIndex
CREATE INDEX "issue_thread_links_issueId_idx" ON "issue_thread_links"("issueId");

-- CreateIndex
CREATE INDEX "issue_thread_links_threadId_idx" ON "issue_thread_links"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_thread_links_issueId_threadId_key" ON "issue_thread_links"("issueId", "threadId");

-- CreateIndex
CREATE INDEX "summaries_issueId_version_idx" ON "summaries"("issueId", "version");

-- CreateIndex
CREATE INDEX "summaries_issueId_status_idx" ON "summaries"("issueId", "status");

-- CreateIndex
CREATE INDEX "summary_runs_workspaceId_idx" ON "summary_runs"("workspaceId");

-- CreateIndex
CREATE INDEX "product_events_workspaceId_event_occurredAt_idx" ON "product_events"("workspaceId", "event", "occurredAt");

-- CreateIndex
CREATE INDEX "product_events_event_occurredAt_idx" ON "product_events"("event", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "audit_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "queue_dead_letters_queue_failedAt_idx" ON "queue_dead_letters"("queue", "failedAt");

-- CreateIndex
CREATE UNIQUE INDEX "confluence_workspace_installs_workspaceId_key" ON "confluence_workspace_installs"("workspaceId");

-- CreateIndex
CREATE INDEX "confluence_pages_workspaceId_idx" ON "confluence_pages"("workspaceId");

-- CreateIndex
CREATE INDEX "confluence_pages_issueId_idx" ON "confluence_pages"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "gmail_workspace_installs_workspaceId_key" ON "gmail_workspace_installs"("workspaceId");

-- CreateIndex
CREATE INDEX "email_threads_workspaceId_idx" ON "email_threads"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_gmailInstallId_gmailThreadId_key" ON "email_threads"("gmailInstallId", "gmailThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_gmailMessageId_key" ON "email_messages"("gmailMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_idempotencyKey_key" ON "email_messages"("idempotencyKey");

-- CreateIndex
CREATE INDEX "email_messages_threadId_receivedAt_idx" ON "email_messages"("threadId", "receivedAt");

-- CreateIndex
CREATE INDEX "issue_email_links_issueId_idx" ON "issue_email_links"("issueId");

-- CreateIndex
CREATE INDEX "issue_email_links_threadId_idx" ON "issue_email_links"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_email_links_issueId_threadId_key" ON "issue_email_links"("issueId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_memory_configs_workspaceId_key" ON "workspace_memory_configs"("workspaceId");

-- CreateIndex
CREATE INDEX "memory_units_workspaceId_idx" ON "memory_units"("workspaceId");

-- CreateIndex
CREATE INDEX "memory_units_issueId_idx" ON "memory_units"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "memory_units_workspaceId_scopeType_scopeRef_key" ON "memory_units"("workspaceId", "scopeType", "scopeRef");

-- CreateIndex
CREATE INDEX "memory_observations_memoryUnitId_extractedAt_idx" ON "memory_observations"("memoryUnitId", "extractedAt");

-- CreateIndex
CREATE INDEX "memory_snapshots_memoryUnitId_version_idx" ON "memory_snapshots"("memoryUnitId", "version");

-- CreateIndex
CREATE INDEX "memory_writeback_proposals_memoryUnitId_idx" ON "memory_writeback_proposals"("memoryUnitId");

-- CreateIndex
CREATE INDEX "memory_writeback_proposals_status_idx" ON "memory_writeback_proposals"("status");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_workspace_installs" ADD CONSTRAINT "slack_workspace_installs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_workspace_installs" ADD CONSTRAINT "jira_workspace_installs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_users" ADD CONSTRAINT "slack_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_users" ADD CONSTRAINT "jira_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_crosswalks" ADD CONSTRAINT "user_crosswalks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_threads" ADD CONSTRAINT "slack_threads_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_messages" ADD CONSTRAINT "slack_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "slack_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_thread_links" ADD CONSTRAINT "issue_thread_links_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_thread_links" ADD CONSTRAINT "issue_thread_links_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "slack_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_thread_links" ADD CONSTRAINT "issue_thread_links_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_summaryRunId_fkey" FOREIGN KEY ("summaryRunId") REFERENCES "summary_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summary_runs" ADD CONSTRAINT "summary_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_dead_letters" ADD CONSTRAINT "queue_dead_letters_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confluence_workspace_installs" ADD CONSTRAINT "confluence_workspace_installs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confluence_pages" ADD CONSTRAINT "confluence_pages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confluence_pages" ADD CONSTRAINT "confluence_pages_installId_fkey" FOREIGN KEY ("installId") REFERENCES "confluence_workspace_installs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmail_workspace_installs" ADD CONSTRAINT "gmail_workspace_installs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_gmailInstallId_fkey" FOREIGN KEY ("gmailInstallId") REFERENCES "gmail_workspace_installs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "email_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_email_links" ADD CONSTRAINT "issue_email_links_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_email_links" ADD CONSTRAINT "issue_email_links_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "email_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memory_configs" ADD CONSTRAINT "workspace_memory_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_units" ADD CONSTRAINT "memory_units_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_units" ADD CONSTRAINT "memory_units_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_units" ADD CONSTRAINT "memory_units_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_observations" ADD CONSTRAINT "memory_observations_memoryUnitId_fkey" FOREIGN KEY ("memoryUnitId") REFERENCES "memory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_snapshots" ADD CONSTRAINT "memory_snapshots_memoryUnitId_fkey" FOREIGN KEY ("memoryUnitId") REFERENCES "memory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_writeback_proposals" ADD CONSTRAINT "memory_writeback_proposals_memoryUnitId_fkey" FOREIGN KEY ("memoryUnitId") REFERENCES "memory_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_writeback_proposals" ADD CONSTRAINT "memory_writeback_proposals_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "memory_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
