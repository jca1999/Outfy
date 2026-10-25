import type { FollowRelationship } from "./follows-api";
import type { QueryClient } from "@tanstack/react-query";

export type FollowListKind = "followers" | "following";

export function followsScope(viewerId: string | undefined) {
  return ["follows", viewerId] as const;
}

export function followRelationshipKey(viewerId: string | undefined, targetId: string | undefined) {
  return [...followsScope(viewerId), "relationship", targetId] as const;
}

export function followListKey(viewerId: string | undefined, targetId: string | undefined, kind: FollowListKind) {
  return [...followsScope(viewerId), "list", targetId, kind] as const;
}

export async function refreshFollows(
  client: QueryClient,
  viewerId: string,
  listsOnly = false,
) {
  const queryKey = followsScope(viewerId);
  const lists = {
    queryKey,
    predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[2] === "list",
  };
  await client.cancelQueries(listsOnly ? lists : { queryKey });
  // A list may contain friends-only data: clear its old representation before
  // asking the server for current permissions. Only open lists are refetched.
  await Promise.all([
    client.resetQueries(lists),
    ...(!listsOnly ? [client.invalidateQueries({
      queryKey, predicate: (q) => q.queryKey[2] === "relationship",
    })] : []),
  ]);
}

// Apply only a confirmed server mutation, not a speculative click.
// A refetch that already included the mutation must not increment twice.
export function confirmedFollowChange(
  previous: FollowRelationship | undefined,
  following: boolean,
): FollowRelationship | undefined {
  if (!previous || previous.isFollowing === following) return previous;
  return {
    ...previous,
    isFollowing: following,
    followersCount: Math.max(0, previous.followersCount + (following ? 1 : -1)),
  };
}
