import { BLOCKER_KEYWORDS } from '@remi/shared';
import type { ThreadData } from '../types.js';

const MS_PER_DAY = 86_400_000;

export function detectBlockers(
  threads: ThreadData[],
  now: Date = new Date(),
): Array<{ text: string; slackUserId: string; sentAt: Date; matchedKeyword: string }> {
  const cutoff = new Date(now.getTime() - 14 * MS_PER_DAY);

  const matches: Array<{
    text: string;
    slackUserId: string;
    sentAt: Date;
    matchedKeyword: string;
  }> = [];

  for (const thread of threads) {
    for (const msg of thread.messages) {
      if (msg.sentAt < cutoff) continue;

      const lower = msg.text.toLowerCase();
      for (const keyword of BLOCKER_KEYWORDS) {
        if (lower.includes(keyword)) {
          matches.push({
            text: msg.text,
            slackUserId: msg.slackUserId,
            sentAt: msg.sentAt,
            matchedKeyword: keyword,
          });
          break; // one match per message is enough
        }
      }
    }
  }

  // Sort by recency descending, return top 5
  matches.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  return matches.slice(0, 5);
}
