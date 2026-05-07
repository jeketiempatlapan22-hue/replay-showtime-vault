import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    if (cErr || !claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", claims.claims.sub).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "get_config") {
      const { data } = await admin.from("live_config_private").select("*").limit(1).maybeSingle();
      return new Response(JSON.stringify({ config: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "set_config") {
      const { enabled, title, type, url, password, require_password, sources } = body;
      const cleanSources = Array.isArray(sources)
        ? sources.filter((s: any) => s && s.url).map((s: any) => ({
            label: String(s.label || '').slice(0, 80),
            type: ['m3u8', 'youtube', 'cloudflare'].includes(s.type) ? s.type : 'm3u8',
            url: String(s.url || ''),
          }))
        : [];
      const { data: existing } = await admin.from("live_config_private").select("id").limit(1).maybeSingle();
      const payload: any = { enabled: !!enabled, title: title ?? "Live", type: type ?? "m3u8", url: url ?? "", password: password ?? "", require_password: require_password !== false, sources: cleanSources, updated_at: new Date().toISOString() };
      if (existing) await admin.from("live_config_private").update(payload).eq("id", existing.id);
      else await admin.from("live_config_private").insert(payload);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "list_tokens") {
      const { data: tokens } = await admin.from("live_tokens").select("*").order("created_at", { ascending: false });
      const { data: devs } = await admin.from("live_token_devices").select("token_id");
      const counts: Record<string, number> = {};
      (devs || []).forEach((d: any) => { counts[d.token_id] = (counts[d.token_id] || 0) + 1; });
      return new Response(JSON.stringify({ tokens: (tokens || []).map((t: any) => ({ ...t, devices_used: counts[t.id] || 0 })) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "create_token") {
      const label = (body.label || "").toString().slice(0, 60);
      const max_devices = Math.max(1, Math.min(50, Number(body.max_devices) || 1));
      const token = crypto.randomUUID().replace(/-/g, "");
      const { error } = await admin.from("live_tokens").insert({ token, label, max_devices });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ token }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "delete_token") {
      await admin.from("live_token_devices").delete().eq("token_id", body.id);
      await admin.from("live_tokens").delete().eq("id", body.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "revoke_token") {
      await admin.from("live_tokens").update({ revoked: !!body.revoked }).eq("id", body.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "reset_devices") {
      await admin.from("live_token_devices").delete().eq("token_id", body.id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
