## Masalah & Penyebab

### 1. Galeri foto kosong
Bucket `card-images` & `member-photos` **tidak punya RLS policy SELECT** di `storage.objects`. Akibatnya `supabase.storage.list(...)` mengembalikan array kosong meski file masih ada (11 foto masih utuh di storage). File tetap bisa diakses lewat URL publik, tetapi tidak bisa dilist.

### 2. User tidak menerima token setelah bayar
- Tidak ada satupun log webhook `pakasir-webhook` masuk → callback Pakasir tidak pernah memanggil server kita (kemungkinan URL webhook belum/blm benar di dashboard Pakasir, atau callback gagal di tengah jalan).
- Semua 10 order terakhir berstatus `pending`, tidak ada `paid_at`.
- Setting `site_origin` juga kosong → meski webhook jalan, link akses jadi `?token=...` tanpa domain.
- Tidak ada mekanisme fallback (polling status ke Pakasir) jika webhook gagal.

### 3. Belum ada alternatif QRIS statis & tombol kontak admin

---

## Rencana Perbaikan

### A. Galeri foto — RLS storage
Migration menambah policy SELECT publik untuk dua bucket:
- `Anyone can view card-images` (SELECT, bucket_id='card-images')
- `Anyone can view member-photos` (SELECT, bucket_id='member-photos')

Setelah ini, galeri akan kembali menampilkan semua foto.

### B. Pengiriman token QRIS dinamis — fallback polling
Tambahkan edge function baru **`check-pakasir-status`** yang:
1. Menerima `order_id` (UUID order kita).
2. Memanggil endpoint Pakasir `transactiondetail` (atau `status`) memakai `PAKASIR_API_KEY` + `PAKASIR_PROJECT_SLUG` + `pakasir_order_id`.
3. Jika status = `completed/paid/success` dan order belum dibayar:
   - Update order: `status='paid'`, generate `access_token`, `paid_at`.
   - Kirim WhatsApp via Fonnte dengan format yang sama persis seperti webhook (link akses + sandi live untuk show).
   - Tulis ke `token_deliveries` & `wa_outbox`.

`BuyShowDialog.tsx` polling 3 detik diubah: selain cek tabel `orders`, juga panggil `check-pakasir-status` setiap 5 detik. Jadi token tetap terkirim walau webhook Pakasir gagal.

Webhook `pakasir-webhook` tetap dipertahankan (jalur cepat). Logika kirim WA dipindah ke helper internal supaya dipakai bersama oleh webhook + status checker (DRY, mencegah double-send dengan check `token_sent_at`).

### C. Set `site_origin` otomatis
Migration insert `site_origin = 'https://replaytime.lovable.app'` ke `site_settings` agar link WhatsApp lengkap.

### D. Notifikasi sesuai show yang dibeli
Format pesan WA (sudah ada per show di webhook) dipindah ke helper bersama. Memastikan: untuk pembelian show aktif, pesan menyertakan **sandi tonton LIVE** dari kolom `active_shows.live_password` + link `/live?show=<id>&t=<token>`. Untuk replay: link `/akses?token=...&replay=<id>`. Sama persis seperti format pesan bot admin sekarang.

### E. Fallback QRIS statis + tombol Hubungi Admin
- Tambah dua kolom setting baru: `static_qris_url` (URL gambar QRIS statis, diupload admin) dan opsional `owner_wa_number` (default `6288809048431`).
- UI Admin: tambah field upload QRIS statis & input nomor admin (Settings panel).
- `BuyShowDialog.tsx`:
  - Jika `create-pakasir-order` gagal (status `creating` → error), tampilkan blok "QRIS Dinamis gagal — gunakan QRIS statis":
    - Tampilkan gambar QRIS statis dari setting.
    - Catatan nominal yang harus ditransfer.
    - Tombol **Hubungi Admin** → `https://wa.me/6288809048431?text=...` (auto-isi: order id sementara, nominal, judul show/replay, nomor user).
  - Tombol "Hubungi Admin" juga selalu ditampilkan kecil di footer dialog QRIS dinamis (sebagai jaring pengaman).

---

## Detail Teknis

**Files baru/ubah:**
- `supabase/migrations/<ts>_gallery_rls_and_settings.sql` — policy SELECT card-images & member-photos, insert `site_origin`, `owner_wa_number`, `static_qris_url`.
- `supabase/functions/check-pakasir-status/index.ts` — polling status + kirim token (dipanggil dari client).
- `supabase/functions/pakasir-webhook/index.ts` — refactor untuk pakai shared helper (atau duplikasi minor; tetap idempotent via `token_sent_at`).
- `supabase/config.toml` — `[functions.check-pakasir-status] verify_jwt = false`.
- `src/components/BuyShowDialog.tsx` — tambah polling status function, blok fallback QRIS statis, tombol Hubungi Admin.
- `src/pages/Admin.tsx` — input upload QRIS statis & nomor owner.

**Catatan untuk user (penting):** Pastikan di dashboard Pakasir, **Webhook URL** disetel ke:
`https://zkuxrztgotfenywmopjn.supabase.co/functions/v1/pakasir-webhook`

Polling client tetap menjadi safety net jika dashboard belum disetel.
