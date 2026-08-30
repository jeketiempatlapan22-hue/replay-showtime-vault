// Sidik jari perangkat ringan untuk mode gratis (/free).
// Menggabungkan browser_id stabil dengan sinyal perangkat, lalu di-hash SHA-256.

import { getBrowserId } from '@/lib/browserId';

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceFingerprint(): Promise<string> {
  const parts = [
    getBrowserId(),
    navigator.userAgent || '',
    navigator.language || '',
    String(navigator.hardwareConcurrency || 0),
    `${screen.width}x${screen.height}x${window.devicePixelRatio || 1}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  ];
  try {
    return await sha256Hex(parts.join('|'));
  } catch {
    return getBrowserId();
  }
}
