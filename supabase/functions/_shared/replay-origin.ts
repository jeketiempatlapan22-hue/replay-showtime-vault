// Path Replay Rahasia: baris "Link Replay" di semua pesan diarahkan ke
// realtimestream.my.id/<path> (site_settings.replay_path, default "rply").
// Halaman utama tetap di domain yang sama; hanya link replay yang memakai path ini.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PRIMARY_RE = /(https?:\/\/)?(www\.)?realtimestream\.my\.id/g;
let cache: { path: string; at: number } | null = null;

export function normalizePath(v: unknown): string {
  return String(v || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^[a-z0-9.-]+\//i, '') // buang host bila admin menulis URL penuh
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9-]/gi, '')
    .toLowerCase();
}

export async function primeReplayHost(): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.path;
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await sb.from('site_settings').select('value').eq('key', 'replay_path').maybeSingle();
    cache = { path: normalizePath(data?.value) || 'rply', at: Date.now() };
  } catch {
    cache = { path: cache?.path || 'rply', at: Date.now() };
  }
  return cache.path;
}

/** Arahkan "Link Replay" ke realtimestream.my.id/<path> (hanya blok Link Replay). */
export function rewriteReplay(text: string, pathArg?: string): string {
  const path = pathArg ?? cache?.path ?? '';
  if (!path || !text || !/Link Replay/i.test(text)) return text;
  return text.replace(/Link Replay[\s\S]*?(?=\n\s*\n|$)/gi, (seg) => {
    if (seg.includes(`realtimestream.my.id/${path}`)) return seg; // sudah diarahkan
    return seg.replace(PRIMARY_RE, (_m, scheme) => `${scheme ? 'https://' : ''}realtimestream.my.id/${path}`);
  });
}
