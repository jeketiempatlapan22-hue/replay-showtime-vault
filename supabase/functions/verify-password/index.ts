import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function bindMembershipDevice(supabase: any, tokenId: string, browser_id: string) {
  const { data: existing } = await supabase
    .from("membership_token_devices").select("id,browser_id").eq("token_id", tokenId).maybeSingle();
  if (existing) {
    if (existing.browser_id !== browser_id) return { ok: false, reason: "device_limit" };
    await supabase.from("membership_token_devices").update({ last_seen: new Date().toISOString() }).eq("id", existing.id);
    return { ok: true };
  }
  const { error } = await supabase.from("membership_token_devices").insert({ token_id: tokenId, browser_id });
  if (error) return { ok: false, reason: "device_limit" };
  return { ok: true };
}

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

    if (mtoken) {
      if (!browser_id || browser_id.length < 6) return json({ valid: false, reason: "no_device" });
      const { data: t } = await supabase
        .from("membership_tokens").select("*").eq("token", mtoken).maybeSingle();
      if (!t || t.revoked) return json({ valid: false, reason: "revoked" });
      if (t.password && t.password !== (mpassword || "")) return json({ valid: false, reason: "bad_membership_password" });
      if (!t.includes_replays) return json({ valid: false, reason: "scope" });
      const now = Date.now();
      if (t.expires_at && new Date(t.expires_at).getTime() < now) return json({ valid: false, reason: "expired" });
      if (t.starts_at && new Date(t.starts_at).getTime() > now) return json({ valid: false, reason: "not_started" });
      const bind = await bindMembershipDevice(supabase, t.id, browser_id);
      if (!bind.ok) return json({ valid: false, reason: bind.reason });
      return json({
        valid: true, via: "membership",
        membership: {
          expires_at: t.expires_at,
          resets_used: t.manual_resets_used || 0,
          resets_max: t.manual_resets_max || 3,
          remaining: Math.max(0, (t.manual_resets_max || 3) - (t.manual_resets_used || 0)),
        },
      });
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
