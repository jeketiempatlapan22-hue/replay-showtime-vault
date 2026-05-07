import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { password, token, browser_id } = await req.json().catch(() => ({}));
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: cfg } = await supabase.from("live_config_private").select("*").limit(1).maybeSingle();
    if (!cfg || !cfg.enabled) {
      return new Response(JSON.stringify({ valid: false, reason: "off" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let valid = false;
    if (token) {
      const { data: t } = await supabase.from("live_tokens").select("*").eq("token", token).maybeSingle();
      if (t && !t.revoked) {
        if (!browser_id) {
          return new Response(JSON.stringify({ valid: false, reason: "no_device" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { data: existing } = await supabase.from("live_token_devices").select("id").eq("token_id", t.id).eq("browser_id", browser_id).maybeSingle();
        if (existing) {
          valid = true;
        } else {
          const { count } = await supabase.from("live_token_devices").select("id", { count: "exact", head: true }).eq("token_id", t.id);
          if ((count || 0) < t.max_devices) {
            await supabase.from("live_token_devices").insert({ token_id: t.id, browser_id });
            valid = true;
          } else {
            return new Response(JSON.stringify({ valid: false, reason: "device_limit" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }
    } else if (password) {
      valid = !!cfg.password && cfg.password === password;
    }
    if (!valid) {
      return new Response(JSON.stringify({ valid: false }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ valid: true, title: cfg.title, type: cfg.type, url: cfg.url, sources: Array.isArray(cfg.sources) ? cfg.sources : [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ valid: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
