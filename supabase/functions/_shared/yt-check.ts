// Cek ketersediaan video YouTube via oEmbed.
// 200            -> video ada & bisa di-embed
// 401 / 403      -> embed diblokir / video private / kena klaim
// 404            -> video dihapus / kena ban / ID salah
// error jaringan -> anggap masih OK (jangan matikan replay karena masalah jaringan)
export async function isYouTubeVideoPlayable(id: string): Promise<{ ok: boolean; reason: string }> {
  const videoId = String(id || "").trim();
  if (!videoId) return { ok: false, reason: "ID YouTube kosong" };

  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);

    if (res.ok) return { ok: true, reason: "" };
    if (res.status === 404) return { ok: false, reason: "Video YouTube dihapus / tidak ditemukan (404)" };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "Video YouTube private / embed diblokir / kena klaim hak cipta" };
    }
    return { ok: true, reason: "" };
  } catch {
    return { ok: true, reason: "" };
  }
}
