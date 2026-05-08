// Centralized YouTube URL/ID parsing.
// Supports:
//   - https://youtube.com/live/ID(?...)
//   - https://www.youtube.com/watch?v=ID
//   - https://youtu.be/ID
//   - https://www.youtube.com/embed/ID
//   - https://www.youtube.com/shorts/ID
//   - https://www.youtube.com/v/ID
//   - bare 11-character ID

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeId(value: string): boolean {
  return ID_RE.test(value);
}

export function parseYouTubeId(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Bare 11-char ID
  if (ID_RE.test(trimmed)) return trimmed;

  // Try as URL first (handles encoded query strings cleanly)
  let urlObj: URL | null = null;
  try {
    urlObj = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    urlObj = null;
  }

  if (urlObj) {
    const host = urlObj.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = urlObj.pathname.split('/').filter(Boolean)[0] || '';
      return ID_RE.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      const v = urlObj.searchParams.get('v');
      if (v && ID_RE.test(v)) return v;
      const parts = urlObj.pathname.split('/').filter(Boolean);
      // /live/ID, /embed/ID, /shorts/ID, /v/ID
      if (parts.length >= 2 && ['live', 'embed', 'shorts', 'v'].includes(parts[0])) {
        const id = parts[1];
        if (ID_RE.test(id)) return id;
      }
    }
  }

  // Last resort regex
  const m = trimmed.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
