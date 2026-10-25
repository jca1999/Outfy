import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import { CONNECTIONS_CHANGED_EVENT } from "@/connections/connections-api";
import {
  FOLLOWS_CHANGED_EVENT, followUser, unfollowUser,
  getFollowRelationship, getFollowers, getFollowing, type FollowRelationship,
} from "./follows-api";
import {
  confirmedFollowChange, refreshFollows, followRelationshipKey, followListKey,
  type FollowListKind,
} from "./follows-state";

// One listener per signed-in app, not one per counter or open dialog.
export function FollowsSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user) return;
    const onChange = () => { void refreshFollows(queryClient, user.id); };
    const onConnectionsChanged = () => {
      // This reads the existing event only; it never changes Connections.
      void refreshFollows(queryClient, user.id, true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onChange();
    };
    window.addEventListener(FOLLOWS_CHANGED_EVENT, onChange);
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, onConnectionsChanged);
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(FOLLOWS_CHANGED_EVENT, onChange);
      window.removeEventListener(CONNECTIONS_CHANGED_EVENT, onConnectionsChanged);
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, queryClient]);
  return null;
}

export function useFollowRelationship(targetId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: followRelationshipKey(user?.id, targetId),
    queryFn: () => getFollowRelationship(targetId!),
    enabled: !!user && !!targetId,
    staleTime: 30_000, gcTime: 0, retry: false, refetchOnWindowFocus: false,
  });
}

export function useFollowList(targetId: string, kind: FollowListKind, open: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: followListKey(user?.id, targetId, kind),
    queryFn: () => kind === "followers" ? getFollowers(targetId) : getFollowing(targetId),
    enabled: !!user && open,
    staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false,
  });
}

export function useFollowMutation(targetId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (following: boolean) => following ? followUser(targetId) : unfollowUser(targetId),
    onSuccess: (result) => {
      queryClient.setQueryData<FollowRelationship>(
        followRelationshipKey(user?.id, targetId),
        (previous) => confirmedFollowChange(previous, result.following),
      );
    },
  });
}
