// Cek apakah permintaan berasal dari user yang diblokir admin (per akun atau nomor HP).
// User yang diblokir ditolak dengan alasan "maintenance" (Website dalam perbaikan).
import { findMembershipByPassword } from "./membership-password.ts";

export function normPhone(p: unknown): string {
  let d = String(p ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

export async function isRequestBlocked(
  supabase: any,
  req: Request,
  opts: { tokens?: unknown[]; password?: unknown },
): Promise<boolean> {
  try {
    const userIds = new Set<string>();
    const phones = new Set<string>();
    const addPhone = (p: unknown) => { const n = normPhone(p); if (n.length >= 8) phones.add(n); };

    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (jwt && jwt.split(".").length === 3) {
      const { data } = await supabase.auth.getUser(jwt).catch(() => ({ data: null }));
      const uid = data?.user?.id;
      if (uid) userIds.add(uid);
    }

    const toks = (opts.tokens || []).map((t) => String(t || "").trim()).filter((t) => t.length >= 6 && t.length <= 128);
    if (toks.length) {
      const [mt, od, bt] = await Promise.all([
        supabase.from("membership_tokens").select("phone").in("token", toks),
        supabase.from("orders").select("user_id,user_phone").in("access_token", toks),
        supabase.from("show_bundle_tokens").select("user_id,phone").in("token", toks),
      ]);
      (mt.data || []).forEach((r: any) => addPhone(r.phone));
      (od.data || []).forEach((r: any) => { addPhone(r.user_phone); if (r.user_id) userIds.add(r.user_id); });
      (bt.data || []).forEach((r: any) => { addPhone(r.phone); if (r.user_id) userIds.add(r.user_id); });
    }

    if (opts.password) {
      const m = await findMembershipByPassword(supabase, String(opts.password)).catch(() => null);
      if (m?.phone) addPhone(m.phone);
    }

    if (userIds.size) {
      const { data: profs } = await supabase.from("profiles").select("phone").in("user_id", [...userIds]);
      (profs || []).forEach((r: any) => addPhone(r.phone));
    }

    if (!userIds.size && !phones.size) return false;
    const ors: string[] = [];
    if (userIds.size) ors.push(`user_id.in.(${[...userIds].join(",")})`);
    if (phones.size) ors.push(`phone.in.(${[...phones].join(",")})`);
    const { data: hit } = await supabase.from("blocked_users").select("id").eq("active", true).or(ors.join(",")).limit(1);
    return !!(hit && hit.length);
  } catch (e) {
    console.error("isRequestBlocked", e);
    return false;
  }
}
