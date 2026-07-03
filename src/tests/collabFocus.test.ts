import { describe, it, expect } from 'vitest';
import { resolveCollabObjectId, shouldGhostMesh } from '$lib/utils/collabFocus';

describe('resolveCollabObjectId', () => {
  it('prefers furnitureId over other ids and the fallback uuid', () => {
    expect(resolveCollabObjectId({ furnitureId: 'f1', wallId: 'w1' }, 'uuid-1')).toBe('f1');
  });

  it('falls back through wallId, doorId, windowId in order', () => {
    expect(resolveCollabObjectId({ wallId: 'w1', doorId: 'd1' }, 'uuid-1')).toBe('w1');
    expect(resolveCollabObjectId({ doorId: 'd1', windowId: 'win1' }, 'uuid-1')).toBe('d1');
    expect(resolveCollabObjectId({ windowId: 'win1' }, 'uuid-1')).toBe('win1');
  });

  it('falls back to the mesh uuid when no domain id is tagged', () => {
    expect(resolveCollabObjectId(undefined, 'uuid-1')).toBe('uuid-1');
    expect(resolveCollabObjectId({}, 'uuid-1')).toBe('uuid-1');
  });
});

describe('shouldGhostMesh', () => {
  it('excludes the focused target mesh', () => {
    const targetUUIDs = new Set(['uuid-1']);
    expect(shouldGhostMesh({}, 'uuid-1', targetUUIDs)).toBe(false);
  });

  it('excludes the floor plane', () => {
    const targetUUIDs = new Set<string>();
    expect(shouldGhostMesh({ isFloor: true }, 'uuid-2', targetUUIDs)).toBe(false);
  });

  it('excludes meshes belonging to non-active floors in exploded view', () => {
    const targetUUIDs = new Set<string>();
    expect(shouldGhostMesh({ isOtherFloor: true }, 'uuid-3', targetUUIDs)).toBe(false);
  });

  it('includes ordinary walls/furniture that are not the target', () => {
    const targetUUIDs = new Set(['uuid-1']);
    expect(shouldGhostMesh({ wallId: 'w1' }, 'uuid-4', targetUUIDs)).toBe(true);
  });
});
