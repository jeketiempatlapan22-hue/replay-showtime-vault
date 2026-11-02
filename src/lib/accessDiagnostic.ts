// Penelusuran link token tanpa memanggil server: mengikuti aturan DomainRouter
// dan MaintenanceGate agar admin tahu di langkah mana link tertutup.
export type DiagStep = { label: string; status: 'ok' | 'fail' | 'info'; detail: string };
export type ParsedLink = {
  kind: 'live' | 'replay' | 'other';
  path: string;
  token?: string; mtoken?: string; btoken?: string; replayId?: string; password?: string;
};

const LIVE_PATHS = ['/live', '/kunci', '/free', '/tv', '/reseller', '/akses'];
const TOKEN_PARAMS = ['token', 'mtoken', 'btoken', 'replay', 't'];
const cleanOrigin = (v: unknown) => {
  const raw = String(v || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+$/i.test(raw) ? raw.toLowerCase() : '';
};
const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

export function diagnoseLinkRouting(input: string, settings: Record<string, string>, replayIds: string[]) {
  const steps: DiagStep[] = [];
  const raw = (input.match(/https?:\/\/\S+/)?.[0] || input).trim().replace(/[).,]+$/, '');
  let url: URL;
  try { url = new URL(raw); } catch {
    steps.push({ label: 'Membaca link', status: 'fail', detail: 'Bukan link yang valid. Tempel link lengkap yang diawali https://' });
    return { steps, parsed: null as ParsedLink | null };
  }
  const q = url.searchParams;
  const get = (k: string) => (q.get(k) || '').trim() || undefined;
  const path = url.pathname.toLowerCase();
  const rp = String(settings.replay_path || 'rply').toLowerCase();
  const seg = path.replace(/^\/+|\/+$/g, '');
  const isLive = /^\/(live|tv)(\/|$)/.test(path);
  const parsed: ParsedLink = {
    kind: isLive ? 'live' : get('replay') ? 'replay' : 'other', path,
    token: get('token') || get('t'), mtoken: get('mtoken'), btoken: get('btoken'), replayId: get('replay'),
    password: get('mp') || get('password') || get('pw'),
  };
  const type = parsed.mtoken ? 'Membership' : parsed.btoken ? 'Bundel' : parsed.token ? 'Token show (admin/reseller/pembelian)' : 'Tanpa token';
  steps.push({ label: 'Membaca link', status: 'ok', detail: `${url.host}${url.pathname} — jenis: ${type}${parsed.kind === 'replay' ? ', replay' : parsed.kind === 'live' ? ', live' : ''}` });

  const hasToken = TOKEN_PARAMS.some((k) => get(k));
  if (!hasToken && !parsed.password) {
    steps.push({ label: 'Token di link', status: 'fail', detail: 'Link tidak membawa token (token/mtoken/btoken/replay). Saat Mode Perbaikan, link tanpa token akan tertutup.' });
  }

  const target = isLive ? cleanOrigin(settings.live_origin) : seg === rp ? cleanOrigin(settings.replay_origin) : cleanOrigin(settings.main_origin);
  const redirected = !!target && bareHost(new URL(target).host) !== bareHost(url.host);
  const finalHost = redirected ? new URL(target).host : url.host;
  steps.push({ label: 'Pengalihan domain', status: 'ok', detail: redirected ? `Dialihkan ke ${finalHost}${url.pathname} (token ikut terbawa).` : `Tetap di ${finalHost}.` });

  const open = LIVE_PATHS.some((p) => path.startsWith(p)) || seg === rp || hasToken;
  if (settings.maintenance_mode === 'true') {
    steps.push(open
      ? { label: 'Gerbang Mode Perbaikan', status: 'ok', detail: `Halaman ini tetap terbuka di ${finalHost}. Pastikan website ${finalHost} sudah dipublish dengan versi terbaru.` }
      : { label: 'Gerbang Mode Perbaikan', status: 'fail', detail: 'Halaman ini tertutup "Website dalam perbaikan" karena bukan halaman live dan tidak membawa token.' });
  }

  if (parsed.kind === 'replay' && parsed.replayId) {
    const exists = replayIds.includes(parsed.replayId);
    steps.push(exists
      ? { label: 'Replay di daftar', status: 'ok', detail: 'Replay ditemukan dan sedang tampil.' }
      : { label: 'Replay di daftar', status: 'fail', detail: 'Replay tidak ada di daftar (terhapus atau masuk "Replay Off"), jadi pemutar tidak akan terbuka.' });
    if (!parsed.token && !parsed.mtoken && !parsed.btoken) {
      steps.push({ label: 'Token replay', status: 'fail', detail: 'Link replay butuh parameter token=… bersama replay=…' });
    }
  }
  return { steps, parsed };
}
