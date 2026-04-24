import { z } from "zod";

// ─── Slack Message Event ───

export const SlackMessageEventSchema = z.object({
  type: z.literal("message"),
  subtype: z.string().optional(),
  channel: z.string(),
  user: z.string().optional(),
  text: z.string().optional(),
  ts: z.string(),
  thread_ts: z.string().optional(),
  team: z.string().optional(),
  edited: z
    .object({
      user: z.string(),
      ts: z.string(),
    })
    .optional(),
  bot_id: z.string().optional(),
});

export type SlackMessageEvent = z.infer<typeof SlackMessageEventSchema>;

// ─── Slack Event Callback Envelope ───

export const SlackEventCallbackSchema = z.object({
  token: z.string(),
  team_id: z.string(),
  api_app_id: z.string(),
  event: z.record(z.unknown()),
  type: z.literal("event_callback"),
  event_id: z.string(),
  event_time: z.number(),
});

export type SlackEventCallback = z.infer<typeof SlackEventCallbackSchema>;

// ─── Slack URL Verification ───

export const SlackUrlVerificationSchema = z.object({
  type: z.literal("url_verification"),
  token: z.string(),
  challenge: z.string(),
});

export type SlackUrlVerification = z.infer<typeof SlackUrlVerificationSchema>;

// ─── Slack Home Tab Opened ───

export const SlackAppHomeOpenedSchema = z.object({
  type: z.literal("app_home_opened"),
  user: z.string(),
  channel: z.string(),
  tab: z.string().optional(),
  event_ts: z.string(),
});

export type SlackAppHomeOpened = z.infer<typeof SlackAppHomeOpenedSchema>;

// ─── Slack Slash Command Payload ───

export const SlackCommandPayloadSchema = z.object({
  token: z.string(),
  team_id: z.string(),
  team_domain: z.string(),
  channel_id: z.string(),
  channel_name: z.string(),
  user_id: z.string(),
  user_name: z.string(),
  command: z.string(),
  text: z.string(),
  response_url: z.string(),
  trigger_id: z.string(),
  api_app_id: z.string().optional(),
  thread_ts: z.string().optional(),
});

export type SlackCommandPayload = z.infer<typeof SlackCommandPayloadSchema>;
