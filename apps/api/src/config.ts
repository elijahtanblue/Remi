import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  // Slack
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string(),
  SLACK_APP_TOKEN: z.string().optional(), // for socket mode
  SLACK_SOCKET_MODE: z.coerce.boolean().default(false),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  // Queue
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
  // Storage
  STORAGE_ADAPTER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('ap-southeast-2'),
  // Admin
  ADMIN_API_KEY: z.string().default('dev-admin-key'),
  INTERNAL_TOKEN: z.string().default('dev-internal-token'),
  // App base URL (for Jira Connect descriptor)
  BASE_URL: z.string().default('http://localhost:3000'),
  // Confluence OAuth
  CONFLUENCE_CLIENT_ID: z.string().optional(),
  CONFLUENCE_CLIENT_SECRET: z.string().optional(),
});

export const config = schema.parse(process.env);
