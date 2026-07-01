import { describe, it, expect } from 'vitest';
import { groupByObject, getLogNumber, resolveActionText } from '$lib/utils/collabLog';
import type { Comment3D, CollabUser } from '$lib/stores/collaboration';

function makeComment(overrides: Partial<Comment3D>): Comment3D {
  return {
    id: 'c1', objectId: 'obj-1', authorId: 'u1', authorName: 'Axel',
    text: 'test comment', timestamp: new Date('2026-07-01T10:00:00Z'),
    sessionId: 's1', status: 'comment', clientVisible: true,
    objectName: 'Sofa', objectType: 'Furniture',
    ...overrides,
  };
}

describe('groupByObject', () => {
  it('groups comments by objectId, sorted by timestamp ascending', () => {
    const c1 = makeComment({ id: 'c1', timestamp: new Date('2026-07-01T08:00:00Z') });
    const c2 = makeComment({ id: 'c2', timestamp: new Date('2026-07-01T10:00:00Z') });
    const c3 = makeComment({ id: 'c3', objectId: 'obj-2', objectName: 'Door' });
    const groups = groupByObject([c2, c1, c3]);
    expect(groups).toHaveLength(2);
    expect(groups[0].objectId).toBe('obj-1');
    expect(groups[0].comments[0].id).toBe('c1'); // sorted ascending
    expect(groups[1].objectId).toBe('obj-2');
  });

  it('treats each null-objectId comment as its own group', () => {
    const c1 = makeComment({ id: 'c1', objectId: null });
    const c2 = makeComment({ id: 'c2', objectId: null });
    const groups = groupByObject([c1, c2]);
    expect(groups).toHaveLength(2);
  });
});

describe('getLogNumber', () => {
  it('single comment in group — no letter, # prefix', () => {
    expect(getLogNumber(0, 0, 1)).toBe('#1');
    expect(getLogNumber(2, 0, 1)).toBe('#3');
  });

  it('two comments — history is "3", current is "#3A"', () => {
    expect(getLogNumber(2, 0, 2)).toBe('3');    // history
    expect(getLogNumber(2, 1, 2)).toBe('#3A');  // current
  });

  it('three comments — history "3", "3A"; current "#3B"', () => {
    expect(getLogNumber(2, 0, 3)).toBe('3');
    expect(getLogNumber(2, 1, 3)).toBe('3A');
    expect(getLogNumber(2, 2, 3)).toBe('#3B');
  });
});

describe('resolveActionText', () => {
  const approver: CollabUser = {
    id: 'u2', name: 'Joe', email: 'joe@co.com', role: 'Lead',
    projectRole: 'Project Approver', permissionLevel: 'full', avatarColor: '#000',
  };

  it('comment status → Propose Change · authorName', () => {
    const c = makeComment({ status: 'comment', authorName: 'Axel' });
    expect(resolveActionText(c, [], 'internal')).toBe('Propose Change · Axel');
  });

  it('approval_pending → Approval · approver name', () => {
    const c = makeComment({ status: 'approval_pending' });
    expect(resolveActionText(c, [approver], 'internal')).toBe('Approval · Joe');
  });

  it('approval_pending with no approver → Approval · Team', () => {
    const c = makeComment({ status: 'approval_pending' });
    expect(resolveActionText(c, [], 'internal')).toBe('Approval · Team');
  });

  it('changes_requested → Propose Change · commitAuthorName', () => {
    const c = makeComment({ status: 'changes_requested', commitAuthorName: 'Axel' });
    expect(resolveActionText(c, [], 'internal')).toBe('Propose Change · Axel');
  });

  it('approved → empty string', () => {
    const c = makeComment({ status: 'approved' });
    expect(resolveActionText(c, [], 'internal')).toBe('');
  });

  it('cancelled → Cancelled · cancelledBy', () => {
    const c = makeComment({ status: 'cancelled', cancelledBy: 'Maddie' });
    expect(resolveActionText(c, [], 'internal')).toBe('Cancelled · Maddie');
  });
});
