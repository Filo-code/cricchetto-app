import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.Cricchetto_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.Cricchetto_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Cricchetto_SUPABASE_URL is required");
}

if (!supabaseServiceRoleKey) {
  throw new Error("Cricchetto_SUPABASE_SERVICE_ROLE_KEY is required");
}

export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
