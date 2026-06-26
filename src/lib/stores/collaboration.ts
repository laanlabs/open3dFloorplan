import { writable, derived, get } from 'svelte/store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PermissionLevel = 'full' | 'viewer' | 'none';

export interface CollabUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissionLevel: PermissionLevel;
  avatarColor: string;
}

export interface Comment3D {
  id: string;
  /** The 3D object this comment is anchored to (furnitureId / wallId / null for general) */
  objectId: string | null;
  authorId: string;
  authorName: string;
  text: string;
  timestamp: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Initial Seed Data ────────────────────────────────────────────────────────

const INITIAL_USERS: CollabUser[] = [
  {
    id: 'user-axel',
    name: 'Axel',
    email: 'axel.louis@mac.com',
    role: 'Lead Designer',
    permissionLevel: 'full',
    avatarColor: '#3b82f6',
  },
  {
    id: 'user-joe',
    name: 'Joe',
    email: 'joe.louis@mac.com',
    role: 'Designer',
    permissionLevel: 'none',
    avatarColor: '#8b5cf6',
  },
  {
    id: 'user-maddie',
    name: 'Maddie',
    email: 'maddiex@gmail.com',
    role: 'Client',
    permissionLevel: 'viewer',
    avatarColor: '#ec4899',
  },
];

// ─── Stores ───────────────────────────────────────────────────────────────────

export const collabUsers = writable<CollabUser[]>(INITIAL_USERS);

/** ID of the currently logged-in / active user. */
export const activeUserId = writable<string>('user-axel');

export const activeUser = derived(
  [collabUsers, activeUserId],
  ([$users, $id]) => $users.find(u => u.id === $id) ?? $users[0],
);

export const comments3D = writable<Comment3D[]>([]);

/**
 * When a comment in CollabPanel is clicked, this store is set to the
 * associated objectId so ThreeViewer can highlight the right mesh.
 */
export const highlightedCommentObjectId = writable<string | null>(null);

// ─── Actions ──────────────────────────────────────────────────────────────────

export function addComment(objectId: string | null, text: string): Comment3D {
  const user = get(activeUser);
  const comment: Comment3D = {
    id: uid(),
    objectId,
    authorId: user.id,
    authorName: user.name,
    text: text.trim(),
    timestamp: new Date(),
  };
  comments3D.update(cs => [...cs, comment]);
  return comment;
}

export function deleteComment(id: string) {
  comments3D.update(cs => cs.filter(c => c.id !== id));
}

export function updateUserPermission(userId: string, level: PermissionLevel) {
  collabUsers.update(users =>
    users.map(u => u.id === userId ? { ...u, permissionLevel: level } : u),
  );
}

export function setActiveUserId(id: string) {
  activeUserId.set(id);
}
