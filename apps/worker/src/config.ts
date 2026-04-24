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
  SQS_DOC_GENERATE_JOBS_URL: z.string().optional(),
  SQS_CWR_GENERATE_URL: z.string().optional(),
  CWR_STALE_SWEEP_INTERVAL_MS: z.coerce.number().default(3_600_000),
  SLACK_BOT_TOKEN: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MAX_RETRY_COUNT: z.coerce.number().default(3),
  GMAIL_SYNC_ENABLED: z.coerce.boolean().default(true),
  SLACK_BACKFILL_LIMIT: z.coerce.number().default(500),
  CONFLUENCE_CLIENT_ID: z.string().optional(),
  CONFLUENCE_CLIENT_SECRET: z.string().optional(),
});

export const config = schema.parse(process.env);
