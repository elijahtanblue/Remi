CREATE TABLE "scheduled_job_runs" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enqueuedAt" TIMESTAMP(3),

    CONSTRAINT "scheduled_job_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scheduled_job_runs_jobName_periodKey_key" ON "scheduled_job_runs"("jobName", "periodKey");
CREATE INDEX "scheduled_job_runs_jobName_createdAt_idx" ON "scheduled_job_runs"("jobName", "createdAt");
