import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type ReplayRow = Tables<'replays'>;
export type MasterPasswordRow = Tables<'master_passwords'>;

export async function getReplays(): Promise<ReplayRow[]> {
  const { data, error } = await supabase
    .from('replays')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
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
  title: string; date: string; criteria: string; lineup: string[];
  password: string; youtube_id: string; image_url: string;
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
  const { data: existing } = await supabase
    .from('master_passwords')
    .select('id')
    .eq('month', month)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('master_passwords').update({ password }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('master_passwords').insert({ month, password });
    if (error) throw error;
  }
}

export async function verifyPassword(replayId: string, password: string): Promise<boolean> {
  const { data: replay } = await supabase
    .from('replays')
    .select('password, date')
    .eq('id', replayId)
    .single();

  if (!replay) return false;
  if (replay.password === password) return true;

  const d = new Date(replay.date);
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const { data: master } = await supabase
    .from('master_passwords')
    .select('password')
    .eq('month', monthKey)
    .maybeSingle();

  return master?.password === password;
}
