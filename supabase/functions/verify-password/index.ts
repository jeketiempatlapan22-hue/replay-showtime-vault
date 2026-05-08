import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { replay_id, password, mtoken, mpassword, browser_id } = await req.json();
    if (!replay_id) return json({ valid: false });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: replay } = await supabase
      .from("replays").select("password, date").eq("id", replay_id).single();
    if (!replay) return json({ valid: false });

    // Membership token bypass (covers replays when includes_replays = true)
    if (mtoken) {
      const { data: t } = await supabase
        .from("membership_tokens").select("*").eq("token", mtoken).maybeSingle();
      if (!t || t.revoked) return json({ valid: false, reason: "revoked" });
      if (t.password && t.password !== (mpassword || "")) return json({ valid: false, reason: "bad_membership_password" });
      if (!t.includes_replays) return json({ valid: false, reason: "scope" });
      const now = Date.now();
      if (t.expires_at && new Date(t.expires_at).getTime() < now) return json({ valid: false, reason: "expired" });
      if (browser_id) {
        const { data: existing } = await supabase
          .from("membership_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
        if (existing) {
          await supabase.from("membership_token_devices").update({ last_seen: new Date().toISOString() }).eq("id", existing.id);
        } else {
          const { count } = await supabase
            .from("membership_token_devices").select("id", { count: "exact", head: true }).eq("token_id", t.id);
          if ((count || 0) >= 1) return json({ valid: false, reason: "device_limit" });
          await supabase.from("membership_token_devices").insert({ token_id: t.id, browser_id });
        }
      }
      return json({ valid: true, via: "membership" });
    }

    if (!password) return json({ valid: false });

    if (replay.password === password) return json({ valid: true });

    const d = new Date(replay.date);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const { data: master } = await supabase
      .from("master_passwords").select("password, paused").eq("month", monthKey).maybeSingle();

    const valid = !!master && master.paused !== true && master.password === password;
    return json({ valid });
  } catch {
    return json({ valid: false }, 500);
  }
});
