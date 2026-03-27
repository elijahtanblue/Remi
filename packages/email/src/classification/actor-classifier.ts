import type {
  ActorClassificationConfig,
  ActorProfile,
} from '@remi/shared';

/**
 * Resolves the ActorProfile for a given email address using the
 * admin-managed classification config.
 *
 * Precedence (highest → lowest):
 *   1. contact mapping  – exact emailAddress match
 *   2. domain mapping   – @domain suffix match
 *   3. default rule     – workspace-level fallback
 */
export function classifyActor(
  emailAddress: string,
  config: ActorClassificationConfig,
): ActorProfile {
  const normalised = emailAddress.toLowerCase().trim();

  // 1. Contact mapping (exact match)
  const contactMatch = config.contactMappings.find(
    (m) => m.emailAddress.toLowerCase() === normalised,
  );
  if (contactMatch) {
    return { ...contactMatch.profile, mappingSource: 'contact' };
  }

  // 2. Domain mapping
  const atIndex = normalised.indexOf('@');
  if (atIndex !== -1) {
    const domain = normalised.slice(atIndex + 1);
    const domainMatch = config.domainMappings.find(
      (m) => m.domain.toLowerCase() === domain,
    );
    if (domainMatch) {
      return { ...domainMatch.profile, mappingSource: 'domain' };
    }
  }

  // 3. Default rule fallback
  const { defaultRule } = config;
  return {
    actorType: defaultRule.actorType,
    segmentNamespace: defaultRule.segmentNamespace,
    segmentValue: defaultRule.segmentValue,
    sensitivityLevel: defaultRule.sensitivityLevel,
    mappingSource: 'default',
  };
}

/**
 * Classifies every participant in a thread.
 * Returns a map from emailAddress → ActorProfile.
 */
export function classifyThreadParticipants(
  emailAddresses: string[],
  config: ActorClassificationConfig,
): Map<string, ActorProfile> {
  const result = new Map<string, ActorProfile>();
  for (const address of emailAddresses) {
    result.set(address, classifyActor(address, config));
  }
  return result;
}
