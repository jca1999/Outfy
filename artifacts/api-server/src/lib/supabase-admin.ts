import { createClient } from "@supabase/supabase-js";

function requiredServerEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for privileged Supabase operations`);
  }
  return value;
}

// This client is server-only. It must never be imported by frontend code.
export const supabaseAdmin = createClient(
  requiredServerEnv("SUPABASE_URL"),
  requiredServerEnv("SUPABASE_SECRET_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);