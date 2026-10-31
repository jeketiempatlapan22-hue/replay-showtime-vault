// Domain Replay Rahasia: baris "Link Replay" di semua pesan memakai domain ini
// (site_settings.replay_origin). Kosong = tetap pakai domain utama.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PRIMARY_RE = /(https?:\/\/)?(www\.)?realtimestream\.my\.id/g;
let cache: { host: string; at: number } | null = null;

export function normalizeHost(v: unknown): string {
  return String(v || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
}

export async function primeReplayHost(): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.host;
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await sb.from('site_settings').select('value').eq('key', 'replay_origin').maybeSingle();
    cache = { host: normalizeHost(data?.value), at: Date.now() };
  } catch {
    cache = { host: cache?.host || '', at: Date.now() };
  }
  return cache.host;
}

/** Ganti domain utama hanya di dalam blok "Link Replay" (sampai baris kosong berikutnya). */
export function rewriteReplay(text: string, hostArg?: string): string {
  const host = hostArg ?? cache?.host ?? '';
  if (!host || !text || !/Link Replay/i.test(text)) return text;
  return text.replace(/Link Replay[\s\S]*?(?=\n\s*\n|$)/gi, (seg) =>
    seg.replace(PRIMARY_RE, (_m, scheme) => (scheme ? `https://${host}` : host)),
  );
}
