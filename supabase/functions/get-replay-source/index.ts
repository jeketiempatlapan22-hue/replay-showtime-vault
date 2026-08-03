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
    const body = await req.json().catch(() => ({}));
    const { replay_id, password, access_token, browser_id } = body || {};
    if (!replay_id || (!password && !access_token)) {
      return json({ valid: false }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Brute-force lockout for password attempts (per replay+device)
    const lockId = `replaysrc:${replay_id}:${browser_id || 'anon'}`;
    if (password && !access_token) {
      const { data: lock } = await supabase.rpc('check_login_lock', { _identifier: lockId });
      const row = Array.isArray(lock) ? lock[0] : lock;
      if (row?.locked) return json({ valid: false, reason: 'rate_limited', seconds_remaining: row.seconds_remaining }, 429);
    }

    const { data: replay } = await supabase
      .from("replays")
      .select("password, date, youtube_id, m3u8_url, source_type, sources, access_token")
      .eq("id", replay_id)
      .single();

    if (!replay) return json({ valid: false }, 404);

    let valid = false;

    if (access_token) {
      // 1) master public token on replay
      if (replay.access_token && replay.access_token === access_token) {
        valid = true;
      } else {
        // 2) personal device-locked token
        const { data: pt } = await supabase
          .from("replay_personal_tokens")
          .select("id, replay_id, max_devices, revoked, expires_at")
          .eq("token", access_token)
          .maybeSingle();
        if (pt && pt.expires_at && new Date(pt.expires_at).getTime() < Date.now()) {
          return json({ valid: false, reason: "expired" }, 403);
        }
        if (pt && !pt.revoked && pt.replay_id === replay_id) {
          if (!browser_id) return json({ valid: false, reason: "no_device" }, 403);
          const { data: existing } = await supabase
            .from("replay_token_devices")
            .select("id").eq("token_id", pt.id).eq("browser_id", browser_id).maybeSingle();
          if (existing) {
            valid = true;
          } else {
            const { count } = await supabase
              .from("replay_token_devices").select("id", { count: "exact", head: true }).eq("token_id", pt.id);
            if ((count ?? 0) >= pt.max_devices) return json({ valid: false, reason: "device_limit" }, 403);
            const { error: insErr } = await supabase
              .from("replay_token_devices").insert({ token_id: pt.id, browser_id });
            if (insErr) {
              const { data: re } = await supabase.from("replay_token_devices")
                .select("id").eq("token_id", pt.id).eq("browser_id", browser_id).maybeSingle();
              if (!re) return json({ valid: false, reason: "device_limit" }, 403);
            }
            valid = true;
          }
        }

        // 3) membership token — berlaku untuk replay yang tanggalnya berada
        // dalam periode membership (starts_at .. expires_at) dan paket
        // membership memang mencakup replay.
        if (!valid) {
          const { data: mt } = await supabase
            .from("membership_tokens")
            .select("id, revoked, starts_at, expires_at, includes_replays, max_devices")
            .eq("token", access_token)
            .maybeSingle();
          if (mt && !mt.revoked) {
            const now = Date.now();
            const startsAt = mt.starts_at ? new Date(mt.starts_at).getTime() : 0;
            const expiresAt = mt.expires_at ? new Date(mt.expires_at).getTime() : Number.POSITIVE_INFINITY;
            if (now > expiresAt) return json({ valid: false, reason: "expired" }, 403);
            if (!mt.includes_replays) return json({ valid: false, reason: "membership_no_replays" }, 403);

            const replayTime = new Date(`${replay.date}T12:00:00Z`).getTime();
            const inPeriod = Number.isFinite(replayTime)
              && replayTime >= (startsAt ? startsAt - 24 * 3600 * 1000 : 0)
              && replayTime <= (Number.isFinite(expiresAt) ? expiresAt : replayTime);
            if (!inPeriod) return json({ valid: false, reason: "outside_membership_period" }, 403);

            if (!browser_id) return json({ valid: false, reason: "no_device" }, 403);
            const maxDevices = Math.max(1, Number(mt.max_devices || 1));
            const { data: existingDev } = await supabase
              .from("membership_token_devices")
              .select("id").eq("token_id", mt.id).eq("browser_id", browser_id).maybeSingle();
            if (existingDev) {
              await supabase.from("membership_token_devices")
                .update({ last_seen: new Date().toISOString() }).eq("id", existingDev.id);
              valid = true;
            } else {
              const { count } = await supabase
                .from("membership_token_devices").select("id", { count: "exact", head: true }).eq("token_id", mt.id);
              if ((count ?? 0) >= maxDevices) return json({ valid: false, reason: "device_limit" }, 403);
              const { error: insErr } = await supabase
                .from("membership_token_devices").insert({ token_id: mt.id, browser_id });
              if (insErr) {
                const { data: re } = await supabase.from("membership_token_devices")
                  .select("id").eq("token_id", mt.id).eq("browser_id", browser_id).maybeSingle();
                if (!re) return json({ valid: false, reason: "device_limit" }, 403);
              }
              valid = true;
            }
          }
        }
      }

    } else if (password) {
      valid = replay.password === password;
      if (!valid) {
        const d = new Date(replay.date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const { data: masters } = await supabase
          .from("master_passwords")
          .select("password, paused")
          .eq("month", monthKey);
        valid = (masters || []).some((m: any) => m.paused !== true && m.password === password);
      }
    }

    if (!valid) {
      if (password && !access_token) {
        await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: false });
      }
      return json({ valid: false }, 403);
    }
    if (password && !access_token) {
      await supabase.rpc('record_login_attempt', { _identifier: lockId, _success: true });
    }

    // Auto-flag replay tanpa sumber video → masuk menu "Replay Off" di admin panel.
    const hasSources = Array.isArray(replay.sources) && replay.sources.length > 0;
    const hasYt = String(replay.youtube_id || "").trim() !== "";
    const hasUrl = String(replay.m3u8_url || "").trim() !== "";
    if (!hasSources && !hasYt && !hasUrl) {
      await supabase.from("replays").update({
        is_offline: true,
        offline_reason: "Sumber video kosong / tidak tersedia",
        offline_at: new Date().toISOString(),
      }).eq("id", replay_id);
      return json({ valid: false, reason: "source_unavailable" }, 404);
    }

    return json({
      valid: true,
      youtube_id: replay.youtube_id || "",
      m3u8_url: replay.m3u8_url || "",
      source_type: replay.source_type || "youtube",
      sources: Array.isArray(replay.sources) ? replay.sources : [],
    });

  } catch {
    return json({ valid: false }, 500);
  }
});
