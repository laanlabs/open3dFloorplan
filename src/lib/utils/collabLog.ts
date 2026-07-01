import type { Comment3D, CollabUser } from '$lib/stores/collaboration';

export type ObjectGroup = {
  objectId: string | null;
  objectName: string | undefined;
  objectType: string | undefined;
  comments: Comment3D[];
};

export function groupByObject(comments: Comment3D[]): ObjectGroup[] {
  const groups: ObjectGroup[] = [];
  const indexMap = new Map<string, number>();

  for (const c of comments) {
    // null objectId = each comment is its own group (general comments)
    const key = c.objectId === null ? `__null__${c.id}` : c.objectId;
    if (!indexMap.has(key)) {
      indexMap.set(key, groups.length);
      groups.push({
        objectId: c.objectId,
        objectName: c.objectName,
        objectType: c.objectType,
        comments: [],
      });
    }
    groups[indexMap.get(key)!].comments.push(c);
  }

  // Sort each group's comments by timestamp ascending
  for (const g of groups) {
    g.comments.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  return groups;
}

export function getLogNumber(groupIndex: number, positionInGroup: number, groupSize: number): string {
  const rowNum = groupIndex + 1;
  const isLatest = positionInGroup === groupSize - 1;

  // letter: position 0 = no letter, position 1 = A, position 2 = B, ...
  const letter = positionInGroup === 0 ? '' : String.fromCharCode(64 + positionInGroup);
  const label = `${rowNum}${letter}`;

  return isLatest ? `#${label}` : label;
}

export function resolveActionText(
  comment: Comment3D,
  users: CollabUser[],
  sessionVisibility: 'internal' | 'client-facing',
): string {
  switch (comment.status) {
    case 'comment':
      return `Propose Change · ${comment.authorName}`;
    case 'approval_pending': {
      const approver = users.find(u => u.projectRole === 'Project Approver');
      return `Approval · ${approver?.name ?? 'Team'}`;
    }
    case 'changes_requested':
      return `Propose Change · ${comment.commitAuthorName ?? comment.authorName}`;
    case 'approved':
      return '';
    case 'cancelled':
      return `Cancelled · ${comment.cancelledBy ?? ''}`;
    default:
      return '';
  }
}
