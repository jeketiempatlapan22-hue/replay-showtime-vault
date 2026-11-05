import type { PlaylistSource, ReplaySource } from '@/lib/store';

export function liveBufferPolicy(dvr: boolean, back: number, latency: number) {
  return {
    backBufferLength: dvr ? Infinity : back,
    liveMaxLatencyDurationCount: dvr ? Infinity : latency,
  };
}

export function shouldJumpToLive(dvr: boolean, live: boolean, lag: number) {
  return !dvr && live && lag > 26;
}

export function buildReplaySources(source: ReplaySource | null): PlaylistSource[] {
  if (!source) return [];
  const list = Array.isArray(source.sources) ? source.sources.filter(s => s.url).map(s => ({ ...s })) : [];
  if (source.m3u8_url && !list.some(s => s.type === 'm3u8' && s.url === source.m3u8_url)) {
    list.push({ id: 'legacy-m3u8', label: 'M3U8', type: 'm3u8', url: source.m3u8_url, is_default: list.length === 0 });
  }
  if (source.youtube_id && !list.some(s => s.type === 'youtube' && s.url === source.youtube_id)) {
    list.push({ id: 'legacy-yt', label: 'YouTube', type: 'youtube', url: source.youtube_id, is_default: list.length === 0 });
  }
  if (source.youtube_alt_id && !list.some(s => s.type === 'youtube' && s.url === source.youtube_alt_id)) {
    list.push({ id: 'alternate-yt', label: 'YouTube 2', type: 'youtube', url: source.youtube_alt_id });
  }
  const sforge = list.find(s => s.type === 'm3u8' && s.url === source.m3u8_url && /sforge/i.test(s.url));
  if (!sforge) return list;
  const rest = list.filter(s => s !== sforge);
  return [
    { ...sforge, label: 'Server 3', is_default: true },
    ...rest.filter(s => s.type === 'youtube').map(s => ({ ...s, is_default: false })),
    ...rest.filter(s => s.type !== 'youtube').map(s => ({ ...s, is_default: false })),
  ];
}

export function nextReplaySource(sources: PlaylistSource[], activeId: string, failedIds: string[]): PlaylistSource | undefined {
  return sources.find(s => s.id !== activeId && !failedIds.includes(s.id) && s.type === 'youtube')
    || sources.find(s => s.id !== activeId && !failedIds.includes(s.id));
}