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
          .select("id, replay_id, max_devices, revoked")
          .eq("token", access_token)
          .maybeSingle();
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
      }
    } else if (password) {
      valid = replay.password === password;
      if (!valid) {
        const d = new Date(replay.date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const { data: master } = await supabase
          .from("master_passwords")
          .select("password, paused")
          .eq("month", monthKey)
          .maybeSingle();
        valid = !!master && master.paused !== true && master.password === password;
      }
    }

    if (!valid) return json({ valid: false }, 403);

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
