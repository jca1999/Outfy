import type { FollowMutationResult, FollowProfileList, FollowRelationship } from "@workspace/api-client-react";

export type { FollowMutationResult, FollowProfile, FollowProfileList, FollowRelationship } from "@workspace/api-client-react";
export const FOLLOWS_CHANGED_EVENT = "outfy:follows-changed";

export class FollowsApiError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
    this.name = "FollowsApiError";
  }
}

async function request<T>(path: string, method = "GET"): Promise<T> {
  const response = await fetch(`/api/follows${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new FollowsApiError(
      data?.error ?? "Follows request failed.",
      response.status,
      data?.code ?? "follows_unavailable",
    );
  }
  return data as T;
}

function changed(result: FollowMutationResult) {
  window.dispatchEvent(new Event(FOLLOWS_CHANGED_EVENT));
  return result;
}

export function getFollowRelationship(userId: string) {
  return request<FollowRelationship>(`/with/${encodeURIComponent(userId)}`);
}

export function followUser(userId: string) {
  return request<FollowMutationResult>(`/${encodeURIComponent(userId)}`, "POST").then(changed);
}

export function unfollowUser(userId: string) {
  return request<FollowMutationResult>(`/${encodeURIComponent(userId)}`, "DELETE").then(changed);
}

export function getFollowers(userId: string) {
  return request<FollowProfileList>(`/${encodeURIComponent(userId)}/followers`);
}

export function getFollowing(userId: string) {
  return request<FollowProfileList>(`/${encodeURIComponent(userId)}/following`);
}
