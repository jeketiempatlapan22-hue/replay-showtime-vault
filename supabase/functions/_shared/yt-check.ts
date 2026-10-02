// Cek ketersediaan video YouTube.
// 1) oEmbed: 404 = dihapus/ban, 401/403 = private/embed diblokir.
// 2) Halaman watch: baca playabilityStatus (ERROR / UNPLAYABLE / LOGIN_REQUIRED) — mendeteksi
//    video yang kena ban/klaim/hak cipta tapi oEmbed-nya masih 200.
// Error jaringan -> anggap masih OK (jangan matikan replay karena masalah jaringan).
async function fetchT(url: string, ms = 9000, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

export function extractYouTubeId(v: string): string {
  const s = String(v || "").trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
}

export async function isYouTubeVideoPlayable(id: string): Promise<{ ok: boolean; reason: string }> {
  const videoId = extractYouTubeId(id);
  if (!videoId) return { ok: false, reason: "ID YouTube kosong / tidak valid" };

  try {
    const res = await fetchT(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`);
    if (res.status === 404 || res.status === 400) return { ok: false, reason: "Video YouTube dihapus / tidak ditemukan" };
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "Video YouTube private / embed diblokir / kena klaim hak cipta" };
  } catch { /* lanjut ke cek halaman */ }

  try {
    const res = await fetchT(`https://www.youtube.com/watch?v=${videoId}&hl=id&bpctr=9999999999&has_verified=1`, 10000, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "id-ID,id;q=0.9", Cookie: "CONSENT=YES+1" },
    });
    if (!res.ok) return { ok: true, reason: "" };
    const html = await res.text();
    const m = html.match(/"playabilityStatus":\{"status":"([A-Z_]+)"(?:,"reason":"([^"]*)")?/);
    if (m) {
      const st = m[1];
      if (st === "ERROR" || st === "UNPLAYABLE") return { ok: false, reason: `Video YouTube tidak bisa diputar${m[2] ? `: ${m[2]}` : " (banned/dihapus)"}` };
      if (st === "LOGIN_REQUIRED" && /private|pribadi/i.test(m[2] || "")) return { ok: false, reason: `Video YouTube private / butuh login${m[2] ? `: ${m[2]}` : ""}` };
    }
    if (/"playableInEmbed":false/.test(html)) return { ok: false, reason: "Video YouTube tidak boleh di-embed" };
  } catch { /* jaringan */ }
  return { ok: true, reason: "" };
}

// Cek URL m3u8/stream: 404/410/403/401 = sumber hilang. Error jaringan/timeout = anggap OK.
export async function isStreamUrlAlive(url: string): Promise<{ ok: boolean; reason: string }> {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return { ok: false, reason: "URL sumber kosong / tidak valid" };
  try {
    const res = await fetchT(u, 9000, { headers: { Range: "bytes=0-2047" } });
    try { await res.body?.cancel(); } catch { /* ignore */ }
    if ([401, 403, 404, 410].includes(res.status)) return { ok: false, reason: `Sumber m3u8 tidak tersedia (${res.status})` };
  } catch { /* jaringan */ }
  return { ok: true, reason: "" };
}
