import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseSecretKey = process.env["SUPABASE_SECRET_KEY"];

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured.");
  }

  if (!supabaseSecretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not configured.");
  }

  adminClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}

export function getSupabaseAuth(): SupabaseClient {
  if (authClient) {
    return authClient;
  }

  const supabaseUrl = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured.");
  }

  if (!publishableKey) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured.");
  }

  authClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return authClient;
}

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
  const supabaseUrl = process.env["SUPABASE_URL"]?.trim();
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"]?.trim();

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured.");
  }

  if (!publishableKey) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured.");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    apikey: publishableKey,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.authorization) {
    headers.Authorization = options.authorization;
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`,
    {
    method: options.method ?? "GET",
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
    },
  );

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
  const message =
    value.message ?? value.msg ?? value.error_description ?? value.error;
  return typeof message === "string" && message.length > 0
    ? message
    : fallback;
}

export function getSupabaseErrorCode(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const value = data as Record<string, unknown>;
  const code = value.code ?? value.error_code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}