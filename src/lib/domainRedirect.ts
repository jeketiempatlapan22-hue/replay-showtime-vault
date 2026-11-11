/** Halaman yang tidak boleh dipindah ke domain lain oleh DomainRouter. */
export function skipDomainRedirect(path: string, search: string, inIframe: boolean): boolean {
  if (/^\/(adpan|reseller)/i.test(path)) return true;
  // Monitor live di panel admin dimuat dalam iframe: harus tetap di domain admin
  // agar sesi login admin (badge Admin, info pengirim chat) ikut terbaca.
  if (new URLSearchParams(search).get('admin_monitor') === '1') return true;
  return inIframe;
}
