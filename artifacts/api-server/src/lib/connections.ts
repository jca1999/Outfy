import { getSupabaseAdmin } from "./supabase";

export type ConnectionRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
};

export const CONNECTION_FIELDS = "id,requester_id,addressee_id,status";

export function relationshipFor(row: ConnectionRow, viewerId: string) {
  return {
    id: row.id,
    status: row.status,
    direction: row.requester_id === viewerId ? "outgoing" : "incoming",
  };
}

export function isConnectionsMigrationMissing(error: { code?: string }) {
  return error.code === "42P01" || error.code === "PGRST205";
}

export async function findConnection(viewerId: string, targetId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("connections")
    .select(CONNECTION_FIELDS)
    .or(
      `and(requester_id.eq.${viewerId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${viewerId})`,
    )
    .maybeSingle();
  if (error) throw error;
  return data as ConnectionRow | null;
}

export function visibleConnectionProfile(
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    display_name_visibility: string | null;
    is_profile_private: boolean | null;
    home_city: string | null;
  },
  accepted: boolean,
) {
  const nameAllowed =
    profile.display_name_visibility === "everyone" ||
    (profile.display_name_visibility === "friends" && accepted);
  return {
    id: profile.id,
    username: profile.username,
    displayName: nameAllowed ? profile.display_name?.trim() || null : null,
    city:
      !profile.is_profile_private || accepted
        ? profile.home_city?.trim() || null
        : null,
  };
}
