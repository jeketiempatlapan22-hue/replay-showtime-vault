import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ipGuard } from "../_shared/ip-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Resolved = {
  table: "active_show_tokens" | "replay_personal_tokens" | "live_tokens" | "orders";
  deviceTable: "active_show_token_devices" | "replay_token_devices" | "live_token_devices" | "order_token_devices";
  fk: "token_id" | "order_id";
  row: any;
};

/** Cari token di semua sumber token yang dipakai website (show, replay, live lama, order). */
async function resolveToken(supabase: any, token: string): Promise<Resolved | null> {
  const { data: st } = await supabase.from("active_show_tokens").select("*").eq("token", token).maybeSingle();
  if (st) return { table: "active_show_tokens", deviceTable: "active_show_token_devices", fk: "token_id", row: st };

  const { data: rp } = await supabase.from("replay_personal_tokens").select("*").eq("token", token).maybeSingle();
  if (rp) return { table: "replay_personal_tokens", deviceTable: "replay_token_devices", fk: "token_id", row: rp };

  const { data: lt } = await supabase.from("live_tokens").select("*").eq("token", token).maybeSingle();
  if (lt) return { table: "live_tokens", deviceTable: "live_token_devices", fk: "token_id", row: lt };

  const { data: ord } = await supabase
    .from("orders").select("*").eq("access_token", token).eq("status", "paid")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (ord) return { table: "orders", deviceTable: "order_token_devices", fk: "order_id", row: ord };

  return null;
}

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

    const guard = await ipGuard(supabase, req, "show-token-self-reset", 10);
    if (guard.blocked) return json(guard.body, guard.status);

    const found = await resolveToken(supabase, String(token));
    if (!found) return json({ ok: false, reason: "token_not_found" });

    const { table, deviceTable, fk, row: t } = found;
    const used = Number(t.manual_resets_used || 0);
    const max = Number(t.manual_resets_max || 3);
    const remaining = Math.max(0, max - used);
    const maxDevices = Math.max(1, Number(t.max_devices ?? 1));
    const revoked = !!t.revoked;
    const expired = !!(t.expires_at && new Date(t.expires_at).getTime() < Date.now());

    if (peek) {
      if (revoked) return json({ ok: true, peek: true, eligible: false, reason: "revoked", used, max, remaining: 0 });
      if (expired) return json({ ok: true, peek: true, eligible: false, reason: "expired", used, max, remaining: 0 });
      if (maxDevices > 1) return json({ ok: true, peek: true, eligible: false, reason: "multi_device", used, max, remaining });
      return json({ ok: true, peek: true, eligible: remaining > 0, used, max, remaining });
    }

    if (revoked) return json({ ok: false, reason: "revoked" });
    if (expired) return json({ ok: false, reason: "expired" });
    if (maxDevices > 1) return json({ ok: false, reason: "multi_device_no_reset" });
    if (used >= max) return json({ ok: false, reason: "quota_exhausted", used, max, remaining: 0 });

    // Lepas SEMUA perangkat lama, lalu ikat token ke perangkat yang menekan reset.
    await supabase.from(deviceTable).delete().eq(fk, t.id);
    await supabase.from(deviceTable).insert({ [fk]: t.id, browser_id });

    const patch: Record<string, unknown> = { manual_resets_used: used + 1 };
    // Token sekali pakai: pindahkan kepemilikan ke perangkat baru agar tidak terkunci.
    if (table === "active_show_tokens" && t.single_use) {
      patch.used_at = new Date().toISOString();
      patch.used_by_browser_id = browser_id;
    }
    await supabase.from(table).update(patch).eq("id", t.id);

    return json({ ok: true, used: used + 1, max, remaining: max - (used + 1), kind: table });
  } catch {
    return json({ ok: false }, 500);
  }
});
