import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "./notifications-api";

const POLL_MS = 60_000;

export function notificationsRootKey(userId: string | undefined) {
  return ["notifications", userId] as const;
}
export function notificationListKey(userId: string | undefined) {
  return ["notifications", userId, "list"] as const;
}
export function notificationCountKey(userId: string | undefined) {
  return ["notifications", userId, "count"] as const;
}

function isAtOrBefore(createdAt: string, cutoff: string) {
  const a = Date.parse(createdAt);
  const b = Date.parse(cutoff);
  return !Number.isNaN(a) && !Number.isNaN(b) && a <= b;
}

type ListData = { notifications: Notification[] };
type CountData = { count: number };

// Keys include the viewer id and gcTime is 0, so a different viewer never
// sees cached data from a previous session.
const shared = {
  staleTime: 15_000,
  gcTime: 0,
  retry: 1,
  refetchOnWindowFocus: true,
  refetchInterval: POLL_MS,
  refetchIntervalInBackground: false,
} as const;

export function useUnreadNotificationCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: notificationCountKey(user?.id),
    queryFn: ({ signal }) => getUnreadCount(signal),
    enabled: !!user,
    ...shared,
  });
}

export function useNotificationList(enabled = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  useEffect(() => {
    // Reopening must recheck private activity access, not reuse a recent title.
    if (!enabled) {
      void queryClient.resetQueries({ queryKey: notificationListKey(userId), exact: true });
    }
  }, [enabled, userId, queryClient]);
  return useQuery({
    queryKey: notificationListKey(user?.id),
    queryFn: ({ signal }) => getNotifications(signal),
    enabled: !!user && enabled,
    ...shared,
    staleTime: 0,
  });
}

export function useMarkNotificationRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationsRootKey(userId) });
      return { countVersion: queryClient.getQueryState(notificationCountKey(userId))?.dataUpdatedAt };
    },
    onSuccess: async ({ readAt }, id, context) => {
      const listKey = notificationListKey(userId);
      const countKey = notificationCountKey(userId);
      await queryClient.cancelQueries({ queryKey: notificationsRootKey(userId) });
      const list = queryClient.getQueryData<ListData>(listKey);
      const wasUnread = !!list?.notifications.some(
        (n) => n.id === id && n.readAt === null,
      );
      if (list) {
        queryClient.setQueryData<ListData>(listKey, {
          notifications: list.notifications.map((n) =>
            n.id === id && n.readAt === null ? { ...n, readAt } : n,
          ),
        });
      }
      if (wasUnread && context?.countVersion === queryClient.getQueryState(countKey)?.dataUpdatedAt) {
        queryClient.setQueryData<CountData>(countKey, (old) =>
          old ? { count: Math.max(0, old.count - 1) } : old,
        );
      }
      void queryClient.invalidateQueries({ queryKey: notificationsRootKey(userId) });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async ({ readAt }) => {
      await queryClient.cancelQueries({ queryKey: notificationsRootKey(userId) });
      queryClient.setQueryData<ListData>(notificationListKey(userId), (old) =>
        old
          ? {
              notifications: old.notifications.map((n) =>
                n.readAt || !isAtOrBefore(n.createdAt, readAt) ? n : { ...n, readAt },
              ),
            }
          : old,
      );
      queryClient.setQueryData<CountData>(notificationCountKey(userId), (old) =>
        old ? {
          count: queryClient.getQueryData<ListData>(notificationListKey(userId))
            ?.notifications.filter(n => !n.readAt).length ?? 0,
        } : old,
      );
      void queryClient.invalidateQueries({ queryKey: notificationsRootKey(userId) });
    },
  });
}

// The focus manager only listens to visibilitychange; also refetch active
// notification queries for this viewer on real window focus.
export function useNotificationFocusRefresh() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      void queryClient.cancelQueries({ queryKey: notificationsRootKey(userId) }).then(() => {
        void queryClient.resetQueries({ queryKey: notificationListKey(userId), exact: true, type: "active" });
        void queryClient.invalidateQueries({ queryKey: notificationCountKey(userId), exact: true });
      });
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [userId, queryClient]);
}
