import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import { getConnections } from "./connections-api";

export function connectionOverviewKey(userId: string | undefined) {
  return ["connections", "overview", userId] as const;
}

// Shell and profile share one session-scoped query, including in-flight reads.
export function useConnectionOverview() {
  const { user } = useAuth();
  return useQuery({
    queryKey: connectionOverviewKey(user?.id),
    queryFn: getConnections,
    enabled: !!user,
    staleTime: 30_000,
    gcTime: 0,
    retry: false,
    // The persistent shell explicitly handles focus, visibility and mutations.
    refetchOnWindowFocus: false,
  });
}
