export interface CollabMeshUserData {
  furnitureId?: string;
  wallId?: string;
  doorId?: string;
  windowId?: string;
  isFloor?: boolean;
  isOtherFloor?: boolean;
}

/** Resolves the collab-comment object id for a mesh: prefers domain ids, falls back to the mesh uuid. */
export function resolveCollabObjectId(userData: CollabMeshUserData | undefined, fallbackUuid: string): string {
  return userData?.furnitureId ?? userData?.wallId ?? userData?.doorId ?? userData?.windowId ?? fallbackUuid;
}

/**
 * Decides whether a mesh should get the ghost/clay treatment in collab focus mode.
 * Excluded: the focused object itself, the floor plane, and meshes belonging to
 * non-active floors in the multi-floor exploded view.
 */
export function shouldGhostMesh(
  userData: CollabMeshUserData | undefined,
  meshUuid: string,
  targetUUIDs: Set<string>,
): boolean {
  if (targetUUIDs.has(meshUuid)) return false;
  if (userData?.isFloor) return false;
  if (userData?.isOtherFloor) return false;
  return true;
}
