import { createHash } from "node:crypto";

/**
 * Generate a deterministic idempotency key from a source identifier,
 * an external ID, and a timestamp. The same inputs always produce
 * the same key, enabling safe message deduplication.
 */
export function generateIdempotencyKey(
  source: string,
  externalId: string,
  timestamp: string | number
): string {
  const raw = `${source}:${externalId}:${timestamp}`;
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generate an idempotency key with an optional namespace prefix
 * for easier log filtering.
 */
export function generatePrefixedIdempotencyKey(
  prefix: string,
  source: string,
  externalId: string,
  timestamp: string | number
): string {
  const hash = generateIdempotencyKey(source, externalId, timestamp);
  return `${prefix}_${hash}`;
}
