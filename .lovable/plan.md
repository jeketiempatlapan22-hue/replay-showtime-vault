# Perbaikan Pengiriman Token, Bukti Transaksi, Tanggal Replay & Menu Replay Off

## 1. Token tidak terkirim saat user bayar (real-time)

Kondisi sekarang (terverifikasi):
- `pakasir-webhook` sudah memverifikasi ulang ke Pakasir dan mengirim WA, tapi jalur cadangan `poll-pending-orders` hanya memindai order `paid` yang `token_sent_at` kosong dengan limit 15 dan hanya untuk rentang waktu tertentu.
- `sendFonnte` di `pakasir-webhook` hanya 1 percobaan dengan timeout 10 detik, jadi satu timeout = token tidak terkirim dan tidak ada antrian ulang otomatis.

Perbaikan:
- Perketat konfirmasi Pakasir: setelah webhook masuk, selalu panggil ulang `transactiondetail` (sudah ada) dan simpan hasil verifikasi di order; jika `paid`, langsung terbitkan token + kirim WA di background (`EdgeRuntime.waitUntil`) sehingga webhook tetap balas cepat.
- Retry berlapis di `pakasir-webhook` dan `check-pakasir-status`: percobaan Fonnte 10s → 20s → 32s sebelum dianggap gagal; kalau tetap gagal, order ditandai `paid` tapi `token_sent_at` tetap kosong dan dicatat error ke `wa_outbox`.
- Perbesar cakupan `poll-pending-orders`: limit paid-unsent dinaikkan (15 → 100), jendela waktu diperluas, dan order paid-unsent selalu dicoba ulang tiap eksekusi cron sampai `wa_outbox` punya baris `sent`.
- Frontend polling status pembayaran (`check-pakasir-status`) tetap seperti sekarang, hanya ikut memicu pengiriman ulang jika token belum terkirim.

## 2. Menu Bukti Transaksi — tombol setujui & kirim WA

Tombol "Setujui & Kirim Token" sudah ada di `MembershipProofsAdmin.tsx` untuk bukti yang punya `order_id`/`show_order_id`. Yang ditambahkan:
- Bukti tanpa order (upload manual murni) mendapat form kecil: pilih jenis (Show / Replay / Membership), pilih show/replay/paket, lalu tombol **Setujui & Kirim via WhatsApp**. Edge function `admin-approve-proof` diperluas untuk membuat order + token dari input ini, sehingga token otomatis muncul di daftar token show (`active_show_tokens` / `replay_personal_tokens`) atau membership (`membership_tokens`) dan tampil di Token Factory / User Membership.
- Setelah sukses, kartu bukti menampilkan token yang dibuat + status WA (terkirim / gagal) dan tombol "Kirim ulang WA".

## 3. Tanggal pada pesan token replay

Terverifikasi: di `check-pakasir-status` (dan poller) cabang replay memakai `new Date()` (tanggal pembelian); hanya cabang show yang memakai `show_date`.

Perbaikan: untuk order replay, ambil `replays.date` (+ `show_time`) dan pakai itu sebagai `{date}` / `{date_line}` di template pesan. Jika data replay tidak ada, baru fallback ke tanggal sekarang. Perubahan diterapkan konsisten di `check-pakasir-status`, `pakasir-webhook`, `poll-pending-orders`, dan `resend-show-wa`.

## 4. Menu "Replay Off" di admin panel

Migrasi DB pada tabel `replays`:
- `is_offline boolean not null default false`
- `offline_reason text not null default ''`
- `offline_at timestamptz`

Perilaku:
- `getReplays()` (landing page) memfilter `is_offline = false`, jadi replay bermasalah hilang dari daftar kartu.
- Admin dapat menandai replay off manual (tombol di daftar replay admin), dan `get-replay-source` otomatis menandai off bila sumber YouTube/m3u8 tidak valid atau kosong.
- Menu baru **Replay Off** di admin panel: daftar replay off + alasan, form isi ulang **ID/URL YouTube atau URL m3u8/sumber lain**, tombol "Aktifkan kembali" yang menyimpan sumber baru, mengosongkan `is_offline`, dan replay langsung muncul kembali di landing page (realtime channel `replays` sudah ada).

## Detail teknis

- Migrasi: `ALTER TABLE public.replays ADD COLUMN ...` + update RPC `admin_get_replays` (kolom baru ikut terbawa otomatis karena `SETOF replays`).
- `admin-approve-proof`: tambah input opsional `{ kind, target_id, phone, email, duration_days }` untuk bukti tanpa order; tetap cek `has_role(auth.uid(),'admin')`.
- File yang disentuh: `supabase/functions/{pakasir-webhook,check-pakasir-status,poll-pending-orders,admin-approve-proof,resend-show-wa,get-replay-source}/index.ts`, `src/lib/store.ts`, `src/components/admin/MembershipProofsAdmin.tsx`, komponen baru `src/components/admin/ReplayOffAdmin.tsx`, dan registrasi menu di `src/pages/Admin.tsx`.
- Tidak menyentuh `src/pages/Live.tsx`, `HlsPlayer.tsx`, maupun aturan player/playlist live.
