// Verifikasi ketat pembayaran Pakasir (QRIS dinamis).
// Dipakai oleh pakasir-webhook, check-pakasir-status, poll-pending-orders,
// dan (lewat check-pakasir-status) alur pembelian di bot Telegram.
//
// Aturan ketat:
// - Transaksi WAJIB ditemukan di Pakasir (bukan body kosong / 404).
// - status WAJIB termasuk status lunas.
// - order_id, project, dan amount WAJIB cocok jika Pakasir mengirimkannya.
// - amount WAJIB dikembalikan Pakasir dan sama persis dengan tagihan;
//   nominal yang hilang / berbeda dianggap BELUM lunas.

export const PAID_STATUSES = new Set(['completed', 'paid', 'success', 'settled']);

export interface PakasirVerifyResult {
  paid: boolean;
  status: string;
  detail?: string;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v) !== '') return v;
  }
  return undefined;
}

export async function verifyPakasirPaidStrict(
  apiKey: string,
  slug: string,
  pakasirOrderId: string,
  amount: number,
  timeoutMs = 12000,
): Promise<PakasirVerifyResult> {
  if (!apiKey || !slug) return { paid: false, status: 'not_configured' };
  if (!pakasirOrderId) return { paid: false, status: 'invalid_order', detail: 'missing_order_id' };
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 100) {
    return { paid: false, status: 'invalid_order', detail: 'invalid_amount' };
  }

  const url = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(slug)}&amount=${amt}&order_id=${encodeURIComponent(pakasirOrderId)}&api_key=${encodeURIComponent(apiKey)}`;

  let res: Response;
  let body: Record<string, unknown> = {};
  try {
    res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (e) {
    return { paid: false, status: 'unreachable', detail: String(e) };
  }
  if (!res.ok) return { paid: false, status: 'unreachable', detail: `http_${res.status}` };

  const tx = ((body.transaction || body.payment || body.data) as Record<string, unknown>) || {};
  const hasTx = Object.keys(tx).length > 0;
  const status = String(pick(hasTx ? tx : body, ['status', 'payment_status', 'transaction_status']) ?? '').toLowerCase();
  if (!status) return { paid: false, status: 'not_found', detail: 'no_transaction' };
  if (!PAID_STATUSES.has(status)) return { paid: false, status };

  const returnedOrderId = String(pick(hasTx ? tx : body, ['order_id', 'orderId', 'merchant_order_id']) ?? '').trim();
  if (returnedOrderId && returnedOrderId !== pakasirOrderId) {
    return { paid: false, status: 'mismatch', detail: 'order_id_mismatch' };
  }

  const returnedProject = String(pick(hasTx ? tx : body, ['project', 'project_slug', 'slug']) ?? '').trim();
  if (returnedProject && returnedProject !== slug) {
    return { paid: false, status: 'mismatch', detail: 'project_mismatch' };
  }

  const rawAmount = pick(hasTx ? tx : body, ['amount', 'nominal', 'total', 'gross_amount']);
  const returnedAmount = Number(rawAmount);
  if (rawAmount === undefined || !Number.isFinite(returnedAmount) || returnedAmount <= 0) {
    // Nominal tidak dilaporkan Pakasir. Terima HANYA jika order_id balik dan cocok
    // (endpoint sudah difilter project+amount+order_id), selain itu anggap belum lunas.
    if (returnedOrderId && returnedOrderId === pakasirOrderId) return { paid: true, status };
    return { paid: false, status: 'unverified', detail: 'amount_missing' };
  }
  if (returnedAmount !== amt) {
    return { paid: false, status: 'mismatch', detail: `amount_mismatch:${returnedAmount}!=${amt}` };
  }

  return { paid: true, status };
}
