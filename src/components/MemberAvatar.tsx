import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Cache { [name: string]: string | null }
let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;

async function loadAll(): Promise<Cache> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase.from('members').select('name,photo_url');
    const map: Cache = {};
    (data || []).forEach((m: any) => { map[m.name.toLowerCase()] = m.photo_url || null; });
    cache = map;
    return map;
  })();
  return inflight;
}

export function clearMemberCache() { cache = null; inflight = null; }

interface Props {
  name: string;
  size?: number;
  showName?: boolean;
  className?: string;
}

export default function MemberAvatar({ name, size = 56, showName = true, className = '' }: Props) {
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAll().then(map => {
      if (cancelled) return;
      setPhoto(map[name.toLowerCase()] || null);
    });
    return () => { cancelled = true; };
  }, [name]);

  const initials = name.trim().slice(0, 2).toUpperCase();

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div
        className="rounded-full overflow-hidden border-2 border-primary/40 bg-secondary flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        {photo ? (
          <img src={photo} alt={name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-xs font-bold text-muted-foreground">{initials}</span>
        )}
      </div>
      {showName && <span className="text-xs text-foreground/90 max-w-[72px] truncate text-center">{name}</span>}
    </div>
  );
}
