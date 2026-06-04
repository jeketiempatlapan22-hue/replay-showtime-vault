import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type ReplayRow = Tables<'replays'>;
export type MasterPasswordRow = Tables<'master_passwords'>;
export type SiteSettingRow = Tables<'site_settings'>;

export async function getReplays(): Promise<ReplayRow[]> {
  // SECURITY: never expose youtube_id, m3u8_url, password to public client.
  // Source video is fetched on-demand via the `get-replay-source` edge function
  // after the user enters the correct password.
  const { data, error } = await supabase
    .from('replays')
    .select('id, title, show_name, date, criteria, featured_member, lineup, image_url, view_count, show_time, created_at, updated_at, source_type')
    .order('date', { ascending: false })
    .order('show_time', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as ReplayRow[];
}

// Admin-only: returns all columns including secrets via SECURITY DEFINER RPC.
// Sensitive columns are revoked from anon/authenticated, so a direct table
// SELECT would not return them. The RPC enforces admin role server-side.
export async function getReplaysAdmin(): Promise<ReplayRow[]> {
  const { data, error } = await (supabase as any).rpc('admin_get_replays');
  if (error) throw error;
  return (data || []) as unknown as ReplayRow[];
}

export type PlaylistSourceType = 'youtube' | 'm3u8' | 'cloudflare';

export interface PlaylistSource {
  id: string;
  label: string;
  type: PlaylistSourceType;
  url: string;
  is_default?: boolean;
}

export interface ReplaySource {
  youtube_id: string;
  m3u8_url: string;
  source_type: string;
  sources: PlaylistSource[];
}

export async function getReplaySource(
  replayId: string,
  opts: { password?: string; accessToken?: string },
): Promise<{ data: ReplaySource | null; reason?: string }> {
  try {
    const body: Record<string, string> = { replay_id: replayId };
    if (opts.password) body.password = opts.password;
    if (opts.accessToken) {
      body.access_token = opts.accessToken;
      try {
        const { getBrowserId } = await import('@/lib/browserId');
        body.browser_id = getBrowserId();
      } catch { /* ignore */ }
    }
    const { data, error } = await supabase.functions.invoke('get-replay-source', { body });
    if (error || !data?.valid) return { data: null, reason: data?.reason };
    return {
      data: {
        youtube_id: data.youtube_id || '',
        m3u8_url: data.m3u8_url || '',
        source_type: data.source_type || 'youtube',
        sources: Array.isArray(data.sources) ? data.sources : [],
      },
    };
  } catch {
    return { data: null };
  }
}

export async function setReplayAccessToken(id: string, token: string | null) {
  const { error } = await supabase.from('replays').update({ access_token: token } as any).eq('id', id);
  if (error) throw error;
}

export async function getReplaysByMonth(): Promise<Record<string, ReplayRow[]>> {
  const replays = await getReplays();
  const grouped: Record<string, ReplayRow[]> = {};
  for (const r of replays) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  return grouped;
}

export async function addReplay(replay: {
  title: string; show_name: string; date: string; criteria: string;
  featured_member: string; lineup: string[];
  password: string; youtube_id: string; image_url: string;
  source_type?: string; m3u8_url?: string; show_time?: string;
  admin_alias?: string; sources?: any; price_coins?: number;
}) {
  const { error } = await supabase.from('replays').insert(replay);
  if (error) throw error;
}

export async function updateReplay(id: string, updated: Partial<ReplayRow>) {
  const { error } = await supabase.from('replays').update(updated).eq('id', id);
  if (error) throw error;
}

export async function deleteReplay(id: string) {
  const { error } = await supabase.from('replays').delete().eq('id', id);
  if (error) throw error;
}

export async function getAllMasterPasswords(): Promise<MasterPasswordRow[]> {
  const { data, error } = await supabase.from('master_passwords').select('*');
  if (error) throw error;
  return data || [];
}

export async function setMasterPassword(month: string, password: string) {
  // Beberapa sandi master per bulan diizinkan — selalu tambah baris baru.
  const { error } = await supabase.from('master_passwords').insert({ month, password });
  if (error) throw error;
}

export async function setMasterPasswordPaused(id: string, paused: boolean) {
  const { error } = await supabase.from('master_passwords').update({ paused }).eq('id', id);
  if (error) throw error;
}

export async function deleteMasterPassword(id: string) {
  const { error } = await supabase.from('master_passwords').delete().eq('id', id);
  if (error) throw error;
}

export async function verifyPassword(replayId: string, password: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-password', {
      body: { replay_id: replayId, password },
    });
    if (error) return false;
    return data?.valid === true;
  } catch {
    return false;
  }
}

export async function getSetting(key: string): Promise<string> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
  return data?.value || '';
}

export async function getSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('site_settings').select('*');
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;
  return map;
}

export async function setSetting(key: string, value: string) {
  const { data: existing } = await supabase.from('site_settings').select('id').eq('key', key).maybeSingle();
  if (existing) {
    await supabase.from('site_settings').update({ value }).eq('id', existing.id);
  } else {
    await supabase.from('site_settings').insert({ key, value });
  }
}

export async function uploadImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('card-images').upload(fileName, file);
  if (error) throw error;
  const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
  return data.publicUrl;
}

export async function getGalleryImages(): Promise<string[]> {
  const { data, error } = await supabase.storage.from('card-images').list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data || [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => supabase.storage.from('card-images').getPublicUrl(f.name).data.publicUrl);
}
