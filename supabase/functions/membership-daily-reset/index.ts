import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Daily-reset cron target: clears bound devices on every membership token.
// Schedule via pg_cron at 17:00 UTC (= 00:00 WIB).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Auth: must be called with the service-role bearer (used by pg_cron).
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!bearer || !SERVICE_ROLE || bearer !== SERVICE_ROLE) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await supabase.from("membership_token_devices").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
