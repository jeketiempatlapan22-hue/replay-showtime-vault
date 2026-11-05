import { describe, expect, it } from 'vitest';
import { buildReplaySources, liveBufferPolicy, nextReplaySource, shouldJumpToLive } from './playbackPolicy';

describe('Server 3 playback rules', () => {
  it('retains DVR history and removes the live latency limit', () => {
    expect(liveBufferPolicy(true, 8, 10)).toEqual({ backBufferLength: Infinity, liveMaxLatencyDurationCount: Infinity });
    expect(liveBufferPolicy(false, 8, 10)).toEqual({ backBufferLength: 8, liveMaxLatencyDurationCount: 10 });
  });
  it('never forces DVR viewers back to live', () => {
    expect(shouldJumpToLive(true, true, 120)).toBe(false);
    expect(shouldJumpToLive(false, true, 27)).toBe(true);
    expect(shouldJumpToLive(false, false, 120)).toBe(false);
  });
  it('makes SForge replay default and YouTube the second source without mutating input', () => {
    const source = { m3u8_url: 'https://sforge.my.id/master-final.m3u8', youtube_id: 'video', youtube_alt_id: '', source_type: 'm3u8', sources: [{ id: 'yt', label: 'YouTube', type: 'youtube' as const, url: 'video', is_default: true }] };
    const list = buildReplaySources(source);
    expect(list.map(s => s.label)).toEqual(['Server 3', 'YouTube']);
    expect(list.map(s => s.is_default)).toEqual([true, false]);
    expect(source.sources[0].is_default).toBe(true);
  });
  it('falls back to YouTube and never retries already failed sources', () => {
    const list = buildReplaySources({ m3u8_url: 'https://sforge.my.id/final.m3u8', youtube_id: 'video', youtube_alt_id: '', source_type: 'm3u8', sources: [] });
    expect(nextReplaySource(list, 'legacy-m3u8', ['legacy-m3u8'])?.id).toBe('legacy-yt');
    expect(nextReplaySource(list, 'legacy-yt', ['legacy-m3u8', 'legacy-yt'])).toBeUndefined();
  });
});