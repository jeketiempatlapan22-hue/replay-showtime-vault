// Sandi membership: sandi awal di membership_tokens.password, plus sandi harian
// (rotasi 24 jam) di membership_token_passwords. Semua sandi tetap berlaku.
// Pencocokan tidak membedakan huruf besar/kecil (keyboard HP sering otomatis huruf kecil).
const norm = (v: unknown) => String(v || "").trim().toUpperCase();

export async function membershipPasswordOk(supabase: any, t: any, pw: string): Promise<boolean> {
  if (!t?.password) return true;
  const p = norm(pw);
  if (!p) return false;
  if (norm(t.password) === p) return true;
  const { data } = await supabase.from("membership_token_passwords")
    .select("id").eq("token_id", t.id).ilike("password", p).limit(1).maybeSingle();
  if (data) return true;
  const { data: rp } = await supabase.from("membership_replay_passwords")
    .select("id").eq("token", t.token).ilike("password", p).limit(1).maybeSingle();
  return !!rp;
}

/**
 * Cari token membership dari sandinya saja (user hanya mengetik sandi tanpa link).
 * Mengembalikan baris membership_tokens yang masih aktif, atau null.
 */
export async function findMembershipByPassword(supabase: any, pw: string): Promise<any | null> {
  const p = norm(pw);
  if (p.length < 4 || p.length > 32 || !/^[A-Z0-9]+$/.test(p)) return null;
  const nowIso = new Date().toISOString();
  const pick = (rows: any[] | null) =>
    (rows || []).filter((t) => t && !t.revoked && (!t.expires_at || t.expires_at > nowIso))
      .sort((a, b) => String(b.expires_at || "").localeCompare(String(a.expires_at || "")))[0] || null;

  const { data: direct } = await supabase.from("membership_tokens").select("*").ilike("password", p).limit(10);
  let t = pick(direct);
  if (t) return t;

  const { data: rot } = await supabase.from("membership_token_passwords").select("token_id").ilike("password", p).limit(10);
  const ids = (rot || []).map((r: any) => r.token_id);
  if (ids.length) {
    const { data } = await supabase.from("membership_tokens").select("*").in("id", ids);
    t = pick(data);
    if (t) return t;
  }

  const { data: rp } = await supabase.from("membership_replay_passwords").select("token").ilike("password", p).limit(10);
  const toks = (rp || []).map((r: any) => r.token).filter(Boolean);
  if (toks.length) {
    const { data } = await supabase.from("membership_tokens").select("*").in("token", toks);
    t = pick(data);
    if (t) return t;
  }
  return null;
}

/** Sandi membership per user masih berlaku untuk replay tanggal tsb (walau link sudah terhapus). */
export async function membershipReplayPasswordOk(supabase: any, pw: string, replayDate: string | null | undefined): Promise<boolean> {
  const p = norm(pw);
  if (!p || !replayDate || !/^[A-Z0-9]+$/.test(p)) return false;
  const rd = new Date(`${replayDate}T12:00:00+07:00`);
  if (isNaN(rd.getTime())) return false;
  const { data } = await supabase.from("membership_replay_passwords")
    .select("id").ilike("password", p)
    .gt("valid_until", new Date().toISOString())
    .lte("starts_at", new Date(rd.getTime() + 86400000).toISOString())
    .gte("membership_expires_at", new Date(rd.getTime() - 86400000).toISOString()).limit(1).maybeSingle();
  return !!data;
}

export async function currentMembershipPassword(supabase: any, t: any): Promise<string> {
  if (!t?.password_rotating) return String(t?.password || "");
  const { data } = await supabase.from("membership_token_passwords")
    .select("password").eq("token_id", t.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return String(data?.password || t.password || "");
}

export function genShortPassword(): string {
  const al = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => al[b % al.length]).join("");
}
