import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function bindMembershipDevice(supabase: any, tokenRow: any, browser_id: string) {
  if (!browser_id || browser_id.length < 6) return { ok: false, reason: "no_device" };
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

function membershipInfo(t: any) {
  const max = t.manual_resets_max || 3;
  const used = t.manual_resets_used || 0;
  return { expires_at: t.expires_at, resets_used: used, resets_max: max, remaining: Math.max(0, max - used), includes_replays: !!t.includes_replays };
}

async function verifyMembership(supabase: any, mtoken: string, mpassword: string, browser_id: string) {
  const { data: t } = await supabase
    .from("membership_tokens").select("*").eq("token", mtoken).maybeSingle();
  if (!t || t.revoked) return { ok: false, reason: "revoked" };
  if (t.password && t.password !== mpassword) return { ok: false, reason: "bad_membership_password" };
  const now = Date.now();
  if (t.expires_at && new Date(t.expires_at).getTime() < now) return { ok: false, reason: "expired" };
  if (t.starts_at && new Date(t.starts_at).getTime() > now) return { ok: false, reason: "not_started" };
  const bind = await bindMembershipDevice(supabase, t, browser_id);
  if (!bind.ok) return bind;
  return { ok: true, token: t };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token, password, browser_id, show_id, mtoken, mpassword, silent } = await req.json().catch(() => ({} as any));
    const isSilent = silent === true;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (browser_id) {
      const { data: blk } = await supabase
        .from("blocked_browsers").select("id,unblocked").eq("browser_id", browser_id).eq("unblocked", false).maybeSingle();
      if (blk) return json({ valid: false, reason: "blocked" });
    }

    // ===== Branch A: per-show live (active_shows) =====
    if (show_id) {
      const { data: show } = await supabase
        .from("active_shows")
        .select("id,title,is_live,live_auto_schedule,live_url,live_type,live_sources,live_password,live_require_password,show_date,show_time,is_active")
        .eq("id", show_id).maybeSingle();
      if (!show || !show.is_active) return json({ valid: false, reason: "off" });

      const enabled = !!show.is_live;
      const okPayload = {
        valid: true, enabled, title: show.title, type: show.live_type || "m3u8",
        url: show.live_url || "",
        sources: Array.isArray(show.live_sources) ? show.live_sources : [],
        show_date: show.show_date, show_time: show.show_time,
        watermark: `RT-${String(show.id).slice(0, 4).toUpperCase()}`,
      };

      // Membership bypass
      if (mtoken) {
        const r = await verifyMembership(supabase, mtoken, mpassword || "", browser_id || "");
        if (!r.ok) return json({ valid: false, reason: r.reason });
        return json({ ...okPayload, watermark: `MB-${String(mtoken).slice(-4).toUpperCase()}`, membership: membershipInfo(r.token) });
      }

      if (token) {
        const { data: t } = await supabase
          .from("active_show_tokens").select("*").eq("token", token).eq("show_id", show_id).maybeSingle();
        if (!t || t.revoked) return json({ valid: false, reason: "revoked" });
        if (!browser_id) return json({ valid: false, reason: "no_device" });
        const { data: existing } = await supabase
          .from("active_show_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
        if (!existing) {
          const { count } = await supabase
            .from("active_show_token_devices").select("id", { count: "exact", head: true }).eq("token_id", t.id);
          const isMulti = (t.max_devices || 1) > 1;
          if ((count || 0) >= t.max_devices) {
            // Multi-device/public token: don't kick already-connected user during silent revalidation.
            if (isMulti && isSilent) {
              return json({ ...okPayload, watermark: `RT-${String(token).slice(-4).toUpperCase()}`, token_kind: t.kind || 'personal', max_devices: t.max_devices || 1, soft: true });
            }
            return json({ valid: false, reason: "device_limit" });
          }
          await supabase.from("active_show_token_devices").insert({ token_id: t.id, browser_id });
        }
        return json({ ...okPayload, watermark: `RT-${String(token).slice(-4).toUpperCase()}`, token_kind: t.kind || 'personal', max_devices: t.max_devices || 1 });
      }

      if (show.live_require_password) {
        if (!password) return json({ valid: false, reason: "password_or_token_required" });
        const lockId = `livepw:${show_id}:${browser_id || 'anon'}`;
        const { data: lock } = await supabase.rpc('check_login_lock', { _identifier: lockId });
        const lockRow = Array.isArray(lock) ? lock[0] : lock;
        if (lockRow?.locked) return json({ valid: false, reason: 'rate_limited', seconds_remaining: lockRow.seconds_remaining });
        let valid = !!show.live_password && show.live_password === password;
        if (!valid && show.show_date) {
          const d = new Date(show.show_date);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const { data: master } = await supabase
            .from("master_passwords").select("password,paused").eq("month", monthKey).maybeSingle();
          valid = !!master && master.paused !== true && master.password === password;
        }
        await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: valid });
        if (!valid) return json({ valid: false, reason: "bad_password" });
      }
      return json(okPayload);
    }

    // ===== Branch B: legacy live_config_private =====
    const { data: cfg } = await supabase.from("live_config_private").select("*").limit(1).maybeSingle();
    if (!cfg) return json({ valid: false, reason: "off" });
    const enabled = !!cfg.enabled;

    if (mtoken) {
      const r = await verifyMembership(supabase, mtoken, mpassword || "", browser_id || "");
      if (!r.ok) return json({ valid: false, reason: r.reason });
      return json({
        valid: true, enabled, title: cfg.title, type: cfg.type, url: cfg.url,
        sources: Array.isArray(cfg.sources) ? cfg.sources : [],
        watermark: `MB-${String(mtoken).slice(-4).toUpperCase()}`,
        membership: membershipInfo(r.token),
      });
    }

    if (!token && !password) return json({ valid: false, reason: "password_or_token_required" });

    if (token) {
      const { data: t } = await supabase.from("live_tokens").select("*").eq("token", token).maybeSingle();
      if (!t || t.revoked) return json({ valid: false, reason: "revoked" });
      if (!browser_id) return json({ valid: false, reason: "no_device" });
      const { data: existing } = await supabase
        .from("live_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
      const isMulti = (t.max_devices || 1) > 1;
      const okBody = {
        valid: true, enabled, title: cfg.title, type: cfg.type, url: cfg.url,
        sources: Array.isArray(cfg.sources) ? cfg.sources : [],
        watermark: `RT-${String(token).slice(-4).toUpperCase()}`,
        token_kind: isMulti ? 'public' : 'personal',
        max_devices: t.max_devices || 1,
      };
      if (!existing) {
        const { count } = await supabase
          .from("live_token_devices").select("id", { count: "exact", head: true }).eq("token_id", t.id);
        if ((count || 0) >= t.max_devices) {
          if (isMulti && isSilent) return json({ ...okBody, soft: true });
          return json({ valid: false, reason: "device_limit" });
        }
        const { error: insErr } = await supabase.from("live_token_devices").insert({ token_id: t.id, browser_id });
        if (insErr) {
          const { data: re } = await supabase
            .from("live_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
          if (!re) {
            if (isMulti && isSilent) return json({ ...okBody, soft: true });
            return json({ valid: false, reason: "device_limit" });
          }
        }
      }
      return json(okBody);
    }

    if (password) {
      let valid = !!cfg.password && cfg.password === password;
      if (!valid) {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const { data: master } = await supabase
          .from("master_passwords").select("password,paused").eq("month", monthKey).maybeSingle();
        valid = !!master && master.paused !== true && master.password === password;
      }
      if (!valid) return json({ valid: false, reason: "bad_password" });
      return json({
        valid: true, enabled, title: cfg.title, type: cfg.type, url: cfg.url,
        sources: Array.isArray(cfg.sources) ? cfg.sources : [],
        watermark: "RT-PWD",
      });
    }

    return json({ valid: false });
  } catch {
    return json({ valid: false }, 500);
  }
});
