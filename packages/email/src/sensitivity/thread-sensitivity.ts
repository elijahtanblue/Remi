import type { ActorProfile, ThreadSensitivity } from '@remi/shared';
import { SENSITIVITY_RANK } from '@remi/shared';

/**
 * Derives thread sensitivity using the "highest wins" rule:
 * the thread inherits the sensitivity level of its most sensitive participant.
 *
 * Mixed vendor/client/colleague threads follow the strictest participant rule.
 * Falls back to the mailboxGroupDefault when no participants are resolved.
 */
export function deriveThreadSensitivity(
  participants: ActorProfile[],
  mailboxGroupDefault: ThreadSensitivity,
): ThreadSensitivity {
  if (participants.length === 0) {
    return mailboxGroupDefault;
  }

  let highest: ThreadSensitivity = 'public';

  for (const p of participants) {
    if (SENSITIVITY_RANK[p.sensitivityLevel] > SENSITIVITY_RANK[highest]) {
      highest = p.sensitivityLevel;
    }
  }

  // If highest is still 'public' fall back to the group default
  // (group default acts as a floor, not a ceiling)
  return SENSITIVITY_RANK[highest] >= SENSITIVITY_RANK[mailboxGroupDefault]
    ? highest
    : mailboxGroupDefault;
}

/**
 * Returns true if a viewer at the given role level is permitted to see
 * content at the given thread sensitivity, based on a simple role-rank map.
 */
const ROLE_RANK: Record<string, number> = {
  Contractor: 0,
  Associate: 1,
  Manager: 2,
  Director: 3,
  VP: 4,
  CEO: 5,
};

const SENSITIVITY_ROLE_FLOOR: Record<ThreadSensitivity, number> = {
  public: 0,
  internal: 1, // Associate+
  confidential: 2, // Manager+
  restricted: 3, // Director+
};

export function canViewSensitivity(
  viewerRoleLevel: string,
  sensitivity: ThreadSensitivity,
): boolean {
  const viewerRank = ROLE_RANK[viewerRoleLevel] ?? 0;
  const requiredRank = SENSITIVITY_ROLE_FLOOR[sensitivity];
  return viewerRank >= requiredRank;
}
