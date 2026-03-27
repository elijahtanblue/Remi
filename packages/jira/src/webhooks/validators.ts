import { z } from 'zod';
import { ValidationError } from '@remi/shared';
import type { JiraWebhookPayload } from '../types.js';

const JiraWebhookSchema = z
  .object({
    webhookEvent: z.string(),
    timestamp: z.number(),
    issue: z.object({
      id: z.string(),
      key: z.string(),
      fields: z.record(z.unknown()).default({}),
    }),
    user: z
      .object({
        accountId: z.string(),
        displayName: z.string(),
      })
      .optional(),
    changelog: z
      .object({
        id: z.string(),
        items: z.array(
          z.object({
            field: z.string(),
            fieldtype: z.string(),
            from: z.string().nullable(),
            fromString: z.string().nullable(),
            to: z.string().nullable(),
            toString: z.string().nullable(),
          }),
        ),
      })
      .optional(),
    comment: z
      .object({
        id: z.string(),
        author: z.object({
          accountId: z.string(),
          displayName: z.string(),
        }),
        body: z.string(),
        created: z.string(),
        updated: z.string(),
      })
      .optional(),
  })
  .passthrough();

export function validateJiraWebhookPayload(body: unknown): JiraWebhookPayload {
  const result = JiraWebhookSchema.safeParse(body);

  if (!result.success) {
    throw new ValidationError('Invalid Jira webhook payload', {
      issues: result.error.issues,
    });
  }

  return result.data as JiraWebhookPayload;
}
