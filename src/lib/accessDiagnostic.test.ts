import { describe, it, expect } from 'vitest';
import { diagnoseLinkRouting } from './accessDiagnostic';

const s = { maintenance_mode: 'true', live_origin: 'https://realtim48show.my.id', replay_path: 'rply' };

describe('diagnoseLinkRouting', () => {
  it('live token link stays open in maintenance and follows live domain', () => {
    const r = diagnoseLinkRouting('https://realtime48show.my.id/live?token=ABC', s, []);
    expect(r.steps.find((x) => x.label === 'Gerbang Mode Perbaikan')?.status).toBe('ok');
    expect(r.steps.find((x) => x.label === 'Pengalihan domain')?.detail).toContain('realtim48show.my.id');
  });
  it('home page without token is closed in maintenance', () => {
    const r = diagnoseLinkRouting('https://realtime48show.my.id/', s, []);
    expect(r.steps.find((x) => x.label === 'Gerbang Mode Perbaikan')?.status).toBe('fail');
  });
  it('replay link to a missing replay fails', () => {
    const r = diagnoseLinkRouting('https://realtime48show.my.id/?token=T&replay=x1', s, ['other']);
    expect(r.steps.find((x) => x.label === 'Replay di daftar')?.status).toBe('fail');
  });
});
