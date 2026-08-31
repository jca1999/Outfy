import { ReplitConnectors } from "@replit/connectors-sdk";

export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown> | null;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: SupabaseUser;
}

interface SupabaseRequestOptions {
  method?: string;
  body?: unknown;
  authorization?: string;
}

export async function supabaseRequest<T>(
  path: string,
  options: SupabaseRequestOptions = {},
): Promise<{ response: Response; data: T | null }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.authorization) {
    headers.Authorization = options.authorization;
  }

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("supabase", path, {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  if (!text) {
    return { response, data: null };
  }

  try {
    return { response, data: JSON.parse(text) as T };
  } catch {
    return { response, data: null };
  }
}

export function getSupabaseError(
  data: unknown,
  fallback: string,
): string {
  if (!data || typeof data !== "object") return fallback;

  const value = data as Record<string, unknown>;
  const message = value.message ?? value.error_description ?? value.error;
  return typeof message === "string" && message.length > 0
    ? message
    : fallback;
}