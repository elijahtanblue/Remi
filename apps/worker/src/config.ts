import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  QUEUE_ADAPTER: z.enum(['memory', 'sqs']).default('memory'),
  SQS_REGION: z.string().default('us-east-1'),
  SQS_SLACK_EVENTS_URL: z.string().optional(),
  SQS_JIRA_EVENTS_URL: z.string().optional(),
  SQS_SUMMARY_JOBS_URL: z.string().optional(),
  SQS_BACKFILL_JOBS_URL: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  MAX_RETRY_COUNT: z.coerce.number().default(3),
});

export const config = schema.parse(process.env);
