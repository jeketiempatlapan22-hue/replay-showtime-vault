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
  created_at?: string;
  updated_at?: string;
}

export async function getActiveShows(adminMode = false): Promise<ActiveShow[]> {
  let query = supabase.from('active_shows').select('*');
  if (!adminMode) query = query.eq('is_active', true);
  const { data, error } = await query.order('sort_order').order('show_date');
  if (error) { console.error(error); return []; }
  return (data || []) as ActiveShow[];
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
