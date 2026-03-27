import { z } from "zod";

// ─── /link-ticket command ───

export const LinkTicketArgsSchema = z.object({
  issueKey: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Invalid Jira issue key format (e.g. PROJ-123)"),
  channelId: z.string().min(1, "Channel ID is required"),
  threadTs: z.string().min(1, "Thread timestamp is required"),
  slackTeamId: z.string().min(1, "Slack team ID is required"),
});

export type LinkTicketArgs = z.infer<typeof LinkTicketArgsSchema>;

/**
 * Parse the text portion of a /link-ticket slash command.
 * Expected format: "PROJ-123" (issue key only, thread context comes from the command metadata).
 */
export const LinkTicketCommandTextSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z][A-Z0-9_]+-\d+$/,
    "Please provide a valid Jira issue key, e.g. /link-ticket PROJ-123"
  );

export type LinkTicketCommandText = z.infer<typeof LinkTicketCommandTextSchema>;

// ─── /brief command ───

export const BriefArgsSchema = z.object({
  issueKey: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/, "Invalid Jira issue key format (e.g. PROJ-123)"),
});

export type BriefArgs = z.infer<typeof BriefArgsSchema>;

/**
 * Parse the text portion of a /brief slash command.
 * Expected format: "PROJ-123"
 */
export const BriefCommandTextSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z][A-Z0-9_]+-\d+$/,
    "Please provide a valid Jira issue key, e.g. /brief PROJ-123"
  );

export type BriefCommandText = z.infer<typeof BriefCommandTextSchema>;
