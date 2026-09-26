// Sandi membership: sandi awal di membership_tokens.password, plus sandi harian
// (rotasi 24 jam) di membership_token_passwords. Semua sandi tetap berlaku.
export async function membershipPasswordOk(supabase: any, t: any, pw: string): Promise<boolean> {
  if (!t?.password) return true;
  const p = String(pw || "").trim();
  if (!p) return false;
  if (t.password === p) return true;
  if (!t.password_rotating) return false;
  const { data } = await supabase.from("membership_token_passwords")
    .select("id").eq("token_id", t.id).eq("password", p.toUpperCase()).limit(1).maybeSingle();
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
