import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/imageUrl';

export interface Member {
  id: string;
  name: string;
  photo_url: string;
  created_at?: string;
}

export async function getMembers(): Promise<Member[]> {
  const { data } = await supabase.from('members').select('id,name,photo_url,created_at').order('name');
  return (data || []) as Member[];
}

export async function upsertMember(name: string, photo_url: string, id?: string) {
  if (id) {
    const { error } = await supabase.from('members').update({ name, photo_url }).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('members').insert({ name, photo_url });
    if (error) throw error;
  }
}

export async function deleteMember(id: string) {
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadMemberPhoto(file: File): Promise<string> {
  const compressed = await compressImage(file, 512, 0.7);
  const ext = compressed.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg');
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('member-photos').upload(fileName, compressed, { contentType: compressed.type });
  if (error) throw error;
  const { data } = supabase.storage.from('member-photos').getPublicUrl(fileName);
  return data.publicUrl;
}
