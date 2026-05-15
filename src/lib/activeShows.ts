import { supabase } from '@/integrations/supabase/client';

export interface ActiveShow {
  id: string;
  title: string;
  show_date: string;
  show_time: string;
  lineup: string[];
  category: string;
  description: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  price_show: number;
  price_replay: number;
  pakasir_amount: number;
  replay_id: string | null;
  replay_enabled: boolean;
  admin_alias?: string | null;
  // LIVE controls
  is_live?: boolean;
  live_auto_schedule?: boolean;
  live_url?: string;
  live_type?: 'm3u8' | 'youtube';
  live_sources?: { label: string; type: 'm3u8' | 'youtube' | 'cloudflare'; url: string }[];
  live_password?: string;
  live_require_password?: boolean;
  // Replay-mode (inline)
  replay_mode?: boolean;
  replay_m3u8_url?: string;
  replay_youtube_url?: string;
  created_at?: string;
  updated_at?: string;
}

export async function getActiveShows(adminMode = false): Promise<ActiveShow[]> {
  let query = supabase.from('active_shows').select('*');
  if (!adminMode) query = query.eq('is_active', true);
  const { data, error } = await query
    .order('show_date', { ascending: true })
    .order('show_time', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) { console.error(error); return []; }
  return (data || []) as unknown as ActiveShow[];
}

export async function upsertActiveShow(show: Partial<ActiveShow> & { id?: string }) {
  if (show.id) {
    const { id, created_at, updated_at, ...rest } = show;
    const { error } = await supabase.from('active_shows').update(rest).eq('id', id);
    if (error) throw error;
  } else {
    const { id, created_at, updated_at, ...rest } = show;
    const { error } = await supabase.from('active_shows').insert(rest as any);
    if (error) throw error;
  }
}

export async function deleteActiveShow(id: string) {
  const { error } = await supabase.from('active_shows').delete().eq('id', id);
  if (error) throw error;
}

export function getShowDateTime(s: ActiveShow): Date {
  return new Date(`${s.show_date}T${s.show_time}`);
}
