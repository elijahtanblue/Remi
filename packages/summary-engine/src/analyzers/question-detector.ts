import type { ThreadData, SlackMessageRecord } from '../types.js';

const MS_PER_DAY = 86_400_000;
const MIN_LENGTH = 15;

// Trivial endings — if the trimmed message matches these patterns it's not substantive
const TRIVIAL_PATTERNS = [/^right\?$/i, /^ok\?$/i, /^okay\?$/i, /^thanks\?$/i, /^sure\?$/i];

function isTrivial(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_LENGTH) return true;
  for (const pattern of TRIVIAL_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

/**
 * Returns true if a question message was "answered": at least 2 subsequent messages
 * from different users appear in the same thread after it.
 */
function isAnswered(
  msg: SlackMessageRecord,
  allMessages: SlackMessageRecord[],
): boolean {
  const after = allMessages.filter((m) => m.sentAt > msg.sentAt && m.slackUserId !== msg.slackUserId);
  const uniqueRepliers = new Set(after.map((m) => m.slackUserId));
  return uniqueRepliers.size >= 2;
}

export function detectOpenQuestions(
  threads: ThreadData[],
  now: Date = new Date(),
): Array<{ text: string; slackUserId: string; sentAt: Date }> {
  const cutoff = new Date(now.getTime() - 14 * MS_PER_DAY);

  const openQuestions: Array<{ text: string; slackUserId: string; sentAt: Date }> = [];

  for (const thread of threads) {
    for (const msg of thread.messages) {
      if (msg.sentAt < cutoff) continue;
      if (!msg.text.includes('?')) continue;
      if (isTrivial(msg.text)) continue;

      if (!isAnswered(msg, thread.messages)) {
        openQuestions.push({
          text: msg.text,
          slackUserId: msg.slackUserId,
          sentAt: msg.sentAt,
        });
      }
    }
  }

  // Sort by recency descending, return max 5
  openQuestions.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  return openQuestions.slice(0, 5);
}
