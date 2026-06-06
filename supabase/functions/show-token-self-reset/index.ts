import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ipGuard } from "../_shared/ip-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token, browser_id, peek } = await req.json().catch(() => ({} as any));
    if (!token) return json({ ok: false, reason: "missing" });
    if (!browser_id || String(browser_id).length < 6) return json({ ok: false, reason: "no_device" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: t } = await supabase
      .from("active_show_tokens").select("*").eq("token", token).maybeSingle();
    if (!t) return json({ ok: false, reason: "token_not_found" });
    if (t.revoked) return json({ ok: false, reason: "revoked" });
    if ((t.max_devices || 1) > 1) return json({ ok: false, reason: "multi_device_no_reset" });
    if (t.single_use) return json({ ok: false, reason: "single_use_no_reset" });
    if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) return json({ ok: false, reason: "expired" });

    const used = t.manual_resets_used || 0;
    const max = t.manual_resets_max || 3;
    const remaining = Math.max(0, max - used);

    if (peek) return json({ ok: true, peek: true, used, max, remaining, eligible: true });

    if (used >= max) return json({ ok: false, reason: "quota_exhausted", used, max, remaining: 0 });

    // Wipe all bound devices, then bind the requesting browser as the new sole device.
    await supabase.from("active_show_token_devices").delete().eq("token_id", t.id);
    await supabase.from("active_show_token_devices").insert({ token_id: t.id, browser_id });
    await supabase.from("active_show_tokens")
      .update({ manual_resets_used: used + 1 }).eq("id", t.id);

    return json({ ok: true, used: used + 1, max, remaining: max - (used + 1) });
  } catch {
    return json({ ok: false }, 500);
  }
});
