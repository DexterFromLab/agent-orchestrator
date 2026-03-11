// Branded types for domain identifiers — prevents accidental swapping of IDs across domains.
// These are compile-time only; at runtime they are plain strings.

/** Unique identifier for an agent session */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** Unique identifier for a project */
export type ProjectId = string & { readonly __brand: 'ProjectId' };

/** Unique identifier for a project group */
export type GroupId = string & { readonly __brand: 'GroupId' };

/** Unique identifier for an agent in the btmsg/bttask system */
export type AgentId = string & { readonly __brand: 'AgentId' };

/** Create a SessionId from a raw string */
export function SessionId(value: string): SessionId {
  return value as SessionId;
}

/** Create a ProjectId from a raw string */
export function ProjectId(value: string): ProjectId {
  return value as ProjectId;
}

/** Create a GroupId from a raw string */
export function GroupId(value: string): GroupId {
  return value as GroupId;
}

/** Create an AgentId from a raw string */
export function AgentId(value: string): AgentId {
  return value as AgentId;
}
