import { z } from "zod";

// ─── Common Jira Entities ───

const JiraUserSchema = z.object({
  accountId: z.string(),
  displayName: z.string().optional(),
  emailAddress: z.string().optional(),
  active: z.boolean().optional(),
});

const JiraIssueFieldsSchema = z.object({
  summary: z.string().optional(),
  status: z
    .object({
      name: z.string(),
      statusCategory: z
        .object({
          key: z.string(),
          name: z.string(),
        })
        .optional(),
    })
    .optional(),
  issuetype: z
    .object({
      name: z.string(),
      subtask: z.boolean().optional(),
    })
    .optional(),
  priority: z
    .object({
      name: z.string(),
    })
    .optional(),
  assignee: JiraUserSchema.nullable().optional(),
  reporter: JiraUserSchema.nullable().optional(),
  project: z
    .object({
      key: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  labels: z.array(z.string()).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});

const JiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  self: z.string().optional(),
  fields: JiraIssueFieldsSchema,
});

// ─── Changelog ───

const JiraChangelogItemSchema = z.object({
  field: z.string(),
  fieldtype: z.string().optional(),
  from: z.string().nullable().optional(),
  fromString: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  toString: z.string().nullable().optional(),
});

const JiraChangelogSchema = z.object({
  id: z.string().optional(),
  items: z.array(JiraChangelogItemSchema),
});

// ─── Comment ───

const JiraCommentSchema = z.object({
  id: z.string(),
  author: JiraUserSchema.optional(),
  body: z.union([z.string(), z.record(z.unknown())]).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});

// ─── Webhook Payloads ───

export const JiraIssueUpdatedSchema = z.object({
  webhookEvent: z.literal("jira:issue_updated"),
  timestamp: z.number(),
  user: JiraUserSchema.optional(),
  issue: JiraIssueSchema,
  changelog: JiraChangelogSchema.optional(),
});

export type JiraIssueUpdated = z.infer<typeof JiraIssueUpdatedSchema>;

export const JiraIssueCreatedSchema = z.object({
  webhookEvent: z.literal("jira:issue_created"),
  timestamp: z.number(),
  user: JiraUserSchema.optional(),
  issue: JiraIssueSchema,
});

export type JiraIssueCreated = z.infer<typeof JiraIssueCreatedSchema>;

export const JiraCommentCreatedSchema = z.object({
  webhookEvent: z.literal("comment_created"),
  timestamp: z.number(),
  user: JiraUserSchema.optional(),
  issue: JiraIssueSchema,
  comment: JiraCommentSchema,
});

export type JiraCommentCreated = z.infer<typeof JiraCommentCreatedSchema>;

export const JiraCommentUpdatedSchema = z.object({
  webhookEvent: z.literal("comment_updated"),
  timestamp: z.number(),
  user: JiraUserSchema.optional(),
  issue: JiraIssueSchema,
  comment: JiraCommentSchema,
});

export type JiraCommentUpdated = z.infer<typeof JiraCommentUpdatedSchema>;

// ─── Union ───

export const JiraWebhookPayloadSchema = z.discriminatedUnion("webhookEvent", [
  JiraIssueUpdatedSchema,
  JiraIssueCreatedSchema,
  JiraCommentCreatedSchema,
  JiraCommentUpdatedSchema,
]);

export type JiraWebhookPayload = z.infer<typeof JiraWebhookPayloadSchema>;
