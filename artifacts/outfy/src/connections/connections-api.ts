export type Relationship = {
  id: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing";
};

export type ConnectionProfile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  city: string | null;
};

export type ConnectionEntry = {
  relationship: Relationship;
  profile: ConnectionProfile;
};

export type ConnectionOverview = {
  incoming: ConnectionEntry[];
  outgoing: ConnectionEntry[];
  accepted: ConnectionEntry[];
};

export class ConnectionApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "ConnectionApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/connections${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ConnectionApiError(
      data?.error ?? "Connections request failed.",
      response.status,
      data?.code ?? "connections_unavailable",
    );
  }
  return data as T;
}

export function getConnections() {
  return request<ConnectionOverview>("");
}

export function getConnectionSuggestions() {
  return request<{ profiles: ConnectionProfile[] }>("/suggestions");
}

export function getRelationship(userId: string) {
  return request<{ relationship: Relationship | null }>(
    `/with/${encodeURIComponent(userId)}`,
  );
}

export function sendConnectionRequest(targetUserId: string) {
  return request<{ relationship: Relationship }>("/requests", {
    method: "POST",
    body: JSON.stringify({ targetUserId }),
  });
}

export function acceptConnection(id: string) {
  return request<{ relationship: Relationship }>(
    `/${encodeURIComponent(id)}/accept`,
    { method: "POST" },
  );
}

export function deleteConnection(
  id: string,
  action: "cancel" | "reject" | "remove",
) {
  return request<{ removed: true }>(
    `/${encodeURIComponent(id)}?action=${action}`,
    { method: "DELETE" },
  );
}
