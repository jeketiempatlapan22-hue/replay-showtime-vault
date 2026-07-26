## Masalah 1 — Approve bukti transaksi tidak mengaktifkan membership & tidak mengirim WA

**Diagnosa (terverifikasi)**
- Tombol "Selesai" di admin panel (`MembershipProofsAdmin.tsx`) hanya memanggil RPC `admin_set_proof_handled` yang isinya cuma `UPDATE handled = true`. Tidak ada finalize order, tidak ada issue token, tidak ada trigger WA.
- Flow paid asli ada di edge function `check-pakasir-status` (branch membership + branch show): mark paid → `finalize_membership_order` / `ensurePurchaseToken` → kirim Fonnte → catat ke `wa_outbox`, `token_deliveries`, dan `wa_sent_at/token_sent_at`.
- Table `membership_payment_proofs.order_id` FK ke `membership_orders`. Untuk show belum ada kolomnya sehingga bukti show tidak bisa di-approve otomatis.

**Perbaikan**

1. **Migrasi DB** — perluas `membership_payment_proofs`:
   - Tambah kolom `show_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL` (nullable).
   - Update RPC `admin_list_membership_proofs` agar ikut me-return kolom baru.

2. **Edge function baru `admin-approve-proof`** (verify_jwt=false, cek admin via `has_role` pakai user JWT dari header):
   - Input: `{ proof_id }`.
   - Ambil proof; jika `order_id` (membership) → set `membership_orders.status='paid'`, `paid_at=now()`, lalu panggil `finalize_membership_order`, susun pesan pakai template `wa_membership_template` + link `/live?mtoken=...&mp=...`, kirim via Fonnte, tulis `wa_outbox` + `token_deliveries`, set `wa_sent_at`.
   - Jika `show_order_id` → panggil logika serupa branch show di `check-pakasir-status` (`ensurePurchaseToken`, update `orders.status='paid'`, kirim WA pakai `wa_message_template` / `wa_show_template`, set `token_sent_at`).
   - Selalu set `membership_payment_proofs.handled=true` di akhir jika sukses.
   - Idempoten: skip finalize/WA jika sudah `paid` + `wa_sent_at/token_sent_at`.
   - Kembalikan `{ ok, sent, token, order_kind }`.

3. **UI admin (`MembershipProofsAdmin.tsx`)**
   - Ganti tombol "Selesai" menjadi tombol utama **"Setujui & Kirim Token"** (hijau) yang memanggil `admin-approve-proof`. Tampilkan spinner + toast hasil ("Membership aktif & WA terkirim" / "Gagal kirim WA — cek log").
   - Sisakan tombol kecil "Tandai selesai manual" untuk kasus admin memang sudah proses di luar sistem (memanggil RPC lama).
   - Setelah sukses, refresh row → badge jadi "Selesai".

4. **Upload bukti untuk show** (`BuyShowDialog.tsx` + `MembershipProofUpload.tsx`)
   - Tambah prop `showOrderId` pada komponen upload; jika diisi, insert `show_order_id` alih-alih `order_id`.
   - Munculkan tombol "Kirim bukti transaksi" di `BuyShowDialog` setelah user klik bayar QRIS/manual, seperti pada flow membership.

## Masalah 2 — Replay YouTube selalu memunculkan subtitle

**Diagnosa (terverifikasi)** — di `EmbedPlayer.tsx` baris 546 URL embed tidak memiliki `cc_load_policy=0` maupun `cc_lang_pref`, sehingga caption otomatis muncul ketika default track ada.

**Perbaikan (`EmbedPlayer.tsx`)**
- Tambah `cc_load_policy=0&cc_lang_pref=none&hl=id` pada query string embed YouTube.
- Setelah `onReady`, panggil `player.unloadModule?.('captions')` dan `player.unloadModule?.('cc')`; sebagai jaring pengaman panggil juga saat `onPlaybackQualityChange` dan `onStateChange` (state 1 = PLAYING) — YouTube kadang me-reload modul caption setelah quality switch.
- Tidak mengubah aturan player Live: patch hanya dilakukan ketika `!isLive` (subtitle Live tetap apa adanya biar tidak ganggu halaman live).

## Masalah 3 — Resolusi tertinggi + downgrade adaptif saat buffering

Logika ini sudah ada di `EmbedPlayer.tsx` (lihat `YT_QUALITY_LADDER`, `applyQualityCap`, `bufferEventsRef`, cooldown 15 dtk, threshold 3 buffer / 30 dtk untuk turun 1 tingkat). Tidak perlu perubahan tambahan; hanya dipastikan tetap aktif setelah patch subtitle.

## Halaman yang tidak disentuh

`src/pages/Live.tsx`, `HlsPlayer.tsx`, aturan playlist Live, serta path Live di `EmbedPlayer` (kondisi `isLive` dipertahankan).

## Detail teknis singkat

- Auth admin di edge function baru: buat client dengan header `Authorization` user, `getUser()` lalu cek `user_roles` role='admin'. Untuk aksi DB dipakai service-role client (bypass RLS) mirip pola `check-pakasir-status`.
- Fungsi helper `sendFonnte`, `isFonntePaused`, `shouldDelayWaRetry` dipindah/di-duplikasi ke edge function baru (kode kecil, tidak layak refactor shared).
- Perubahan URL YouTube contoh:
  ```text
  https://www.youtube-nocookie.com/embed/<id>?rel=0&modestbranding=1&playsinline=1&autoplay=1&mute=1&controls=0&fs=0&iv_load_policy=3&cc_load_policy=0&cc_lang_pref=none&hl=id&disablekb=1&enablejsapi=1&origin=<origin>
  ```
