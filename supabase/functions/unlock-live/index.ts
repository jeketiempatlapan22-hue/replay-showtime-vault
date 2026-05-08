import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token, password, browser_id, show_id } = await req.json().catch(() => ({} as any));
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ===== Global block check by browser_id =====
    if (browser_id) {
      const { data: blk } = await supabase
        .from("blocked_browsers")
        .select("id,unblocked")
        .eq("browser_id", browser_id)
        .eq("unblocked", false)
        .maybeSingle();
      if (blk) return json({ valid: false, reason: "blocked" });
    }

    // ===== Branch A: per-show live (active_shows) =====
    if (show_id) {
      const { data: show } = await supabase
        .from("active_shows")
        .select("id,title,is_live,live_auto_schedule,live_url,live_type,live_sources,live_password,live_require_password,show_date,show_time,is_active")
        .eq("id", show_id)
        .maybeSingle();
      if (!show || !show.is_active) return json({ valid: false, reason: "off" });

      const enabled = !!show.is_live;

      const okPayload = {
        valid: true,
        enabled,
        title: show.title,
        type: show.live_type || "m3u8",
        url: show.live_url || "",
        sources: Array.isArray(show.live_sources) ? show.live_sources : [],
        show_date: show.show_date,
        show_time: show.show_time,
        watermark: `RT-${String(show.id).slice(0, 4).toUpperCase()}`,
      };

      // Token-based unlock for this show
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
          if ((count || 0) >= t.max_devices) return json({ valid: false, reason: "device_limit" });
          await supabase.from("active_show_token_devices").insert({ token_id: t.id, browser_id });
        }
        return json({ ...okPayload, watermark: `RT-${String(token).slice(-4).toUpperCase()}` });
      }

      if (show.live_require_password) {
        if (!password) return json({ valid: false, reason: "password_or_token_required" });
        let valid = !!show.live_password && show.live_password === password;
        if (!valid && show.show_date) {
          // Check master monthly password (based on show_date month)
          const d = new Date(show.show_date);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const { data: master } = await supabase
            .from("master_passwords")
            .select("password,paused")
            .eq("month", monthKey)
            .maybeSingle();
          valid = !!master && master.paused !== true && master.password === password;
        }
        if (!valid) return json({ valid: false, reason: "bad_password" });
      }
      return json(okPayload);
    }

    // ===== Branch B: legacy live_config_private =====
    const { data: cfg } = await supabase.from("live_config_private").select("*").limit(1).maybeSingle();
    if (!cfg) return json({ valid: false, reason: "off" });

    if (!token && !password) return json({ valid: false, reason: "password_or_token_required" });

    const enabled = !!cfg.enabled;

    if (token) {
      const { data: t } = await supabase.from("live_tokens").select("*").eq("token", token).maybeSingle();
      if (!t || t.revoked) return json({ valid: false, reason: "revoked" });
      if (!browser_id) return json({ valid: false, reason: "no_device" });

      const { data: existing } = await supabase
        .from("live_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
      if (!existing) {
        const { count } = await supabase
          .from("live_token_devices").select("id", { count: "exact", head: true }).eq("token_id", t.id);
        if ((count || 0) >= t.max_devices) return json({ valid: false, reason: "device_limit" });
        const { error: insErr } = await supabase
          .from("live_token_devices").insert({ token_id: t.id, browser_id });
        if (insErr) {
          const { data: re } = await supabase
            .from("live_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
          if (!re) return json({ valid: false, reason: "device_limit" });
        }
      }
      const last4 = String(token).slice(-4).toUpperCase();
      return json({
        valid: true, enabled, title: cfg.title, type: cfg.type, url: cfg.url,
        sources: Array.isArray(cfg.sources) ? cfg.sources : [],
        watermark: `RT-${last4}`,
      });
    }

    if (password) {
      if (!cfg.password || cfg.password !== password) return json({ valid: false, reason: "bad_password" });
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
