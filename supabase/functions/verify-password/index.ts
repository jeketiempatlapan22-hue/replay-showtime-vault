import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bundlePasswordValidForReplay } from "../_shared/bundle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function bindMembershipDevice(supabase: any, tokenRow: any, browser_id: string) {
  const max = Math.max(1, Number(tokenRow.max_devices) || 1);
  const { data: existing } = await supabase
    .from("membership_token_devices").select("id").eq("token_id", tokenRow.id).eq("browser_id", browser_id).maybeSingle();
  if (existing) {
    await supabase.from("membership_token_devices").update({ last_seen: new Date().toISOString() }).eq("id", existing.id);
    return { ok: true };
  }
  const { count } = await supabase
    .from("membership_token_devices").select("id", { count: "exact", head: true }).eq("token_id", tokenRow.id);
  if ((count || 0) >= max) return { ok: false, reason: "device_limit" };
  const { error } = await supabase.from("membership_token_devices").insert({ token_id: tokenRow.id, browser_id });
  if (error) {
    const { data: re } = await supabase
      .from("membership_token_devices").select("id").eq("token_id", tokenRow.id).eq("browser_id", browser_id).maybeSingle();
    if (!re) return { ok: false, reason: "device_limit" };
  }
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

    // Brute-force lockout (per replay+device)
    const lockId = `replaypw:${replay_id}:${browser_id || 'anon'}`;
    if (password) {
      const { data: lock } = await supabase.rpc('check_login_lock', { _identifier: lockId });
      const row = Array.isArray(lock) ? lock[0] : lock;
      if (row?.locked) return json({ valid: false, reason: 'rate_limited', seconds_remaining: row.seconds_remaining }, 429);
    }

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
      const bind = await bindMembershipDevice(supabase, t, browser_id);
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

    if (replay.password === password) {
      await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: true });
      return json({ valid: true });
    }

    // Sandi bundel show (sandi lama maupun yang berlaku sekarang).
    if (await bundlePasswordValidForReplay(supabase, replay_id, password)) {
      await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: true });
      return json({ valid: true, via: 'bundle' });
    }

    const d = new Date(replay.date);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const { data: masters } = await supabase
      .from("master_passwords").select("password, paused").eq("month", monthKey);

    const valid = (masters || []).some((m: any) => m.paused !== true && m.password === password);
    await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: valid });
    return json({ valid });
  } catch {
    return json({ valid: false }, 500);
  }
});
