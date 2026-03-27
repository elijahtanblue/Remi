import { AuthenticationError } from "../errors.js";

/**
 * Assert that a workspaceId is present and return it.
 * Throws AuthenticationError if missing.
 */
export function assertWorkspaceId(
  workspaceId: string | undefined | null
): string {
  if (!workspaceId) {
    throw new AuthenticationError(
      "Workspace ID is required but was not provided"
    );
  }
  return workspaceId;
}

/**
 * Scope a database query filter to a specific workspace.
 * Returns a new object with workspaceId merged in.
 */
export function scopeToWorkspace<T extends Record<string, unknown>>(
  workspaceId: string,
  filter: T
): T & { workspaceId: string } {
  return { ...filter, workspaceId };
}

/**
 * Verify that an entity belongs to the expected workspace.
 * Throws AuthenticationError on mismatch.
 */
export function assertBelongsToWorkspace(
  entity: { workspaceId: string },
  expectedWorkspaceId: string,
  entityName = "Entity"
): void {
  if (entity.workspaceId !== expectedWorkspaceId) {
    throw new AuthenticationError(
      `${entityName} does not belong to the current workspace`
    );
  }
}
