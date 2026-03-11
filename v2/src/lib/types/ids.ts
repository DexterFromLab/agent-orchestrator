// Branded types for domain identifiers — prevents accidental swapping of sessionId/projectId
// These are compile-time only; at runtime they are plain strings.

/** Unique identifier for an agent session */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** Unique identifier for a project */
export type ProjectId = string & { readonly __brand: 'ProjectId' };

/** Create a SessionId from a raw string */
export function SessionId(value: string): SessionId {
  return value as SessionId;
}

/** Create a ProjectId from a raw string */
export function ProjectId(value: string): ProjectId {
  return value as ProjectId;
}
