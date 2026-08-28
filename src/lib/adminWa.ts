// Nomor admin terpusat + normalisasi ke format internasional (62...).
export const DEFAULT_ADMIN_WA = '6283899087711';

export function normalizeWa(raw?: string | null): string {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('62')) return d;
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

export function adminWaNumber(raw?: string | null): string {
  return normalizeWa(raw) || DEFAULT_ADMIN_WA;
}

export function adminWaLink(raw: string | null | undefined, text: string): string {
  return `https://wa.me/${adminWaNumber(raw)}?text=${encodeURIComponent(text)}`;
}
