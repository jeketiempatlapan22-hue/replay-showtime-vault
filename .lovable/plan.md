# Rencana: Live Access, Watermark Token, & Fix DevTools

## 1. Token Live (Admin Panel) — buat/revoke/salin cepat

Edit `src/pages/Admin.tsx` (tab Live → seksi Token):
- Hilangkan input **Label**. Form pembuatan token cukup 2 elemen sebaris: input angka **Jumlah Device** + tombol **+ Buat Token**.
- Tabel token tampilkan kolom: **Kode (RT-XXXX)**, Token (truncate), Device terpakai/maks, Status (Aktif/Dicabut), Aksi (📋 Salin Link, 🔄 Reset Device, ⛔ Revoke/Aktifkan, 🗑 Hapus).
- Tambah aksi **Revoke** baru (toggle `revoked`) — selama ini hanya Hapus. User dgn token yang di-revoke otomatis tidak bisa unlock & player live miliknya akan kick keluar (lihat §4 realtime).
- Label `RT-XXXX` = `RT-` + 4 karakter terakhir token. Ini juga yg muncul di watermark (§3) supaya admin tinggal cocokkan & klik Revoke.

Edit `supabase/functions/manage-live/index.ts`:
- `create_token`: label opsional (default `''`), tetap simpan; tidak wajib di body.
- Tambah action baru `revoke_token` `{ id, revoked: bool }` yang update kolom `revoked`.

## 2. Aktifkan Kembali Sandi Live (selain token link)

Edit `supabase/functions/unlock-live/index.ts`:
- Terima `{ password?, token?, browser_id }`. Jika ada `token` → alur lama (device lock). Jika tidak ada token tapi ada `password` & cocok dengan `live_config_private.password` (& `require_password=true`) → unlock; tapi jangan kirimkan watermark token (set `watermark = "RT-PWD"` agar admin tahu sumber password).
- Validasi: jika keduanya kosong → `password_or_token_required`.
- Response sukses tambahkan `watermark: "RT-XXXX"` (4 char terakhir token) atau `"RT-PWD"`.

Edit `src/pages/Live.tsx`:
- Jika tidak ada token URL & belum unlock → tampilkan form sandi (Input + tombol "Buka") DAN tombol "Punya link token? Buka link Anda".
- Simpan `watermark` ke state & sessionStorage.

Edit `src/pages/Admin.tsx` (tab Live):
- Kembalikan input **Sandi Live** + switch **Wajib Sandi**. Kirim ke `manage-live` set_config (sudah ada di backend).

## 3. Watermark RT-XXXX di Player Live

Buat komponen baru `src/components/LiveWatermark.tsx`:
- Overlay absolute pojok (rotasi posisi tiap ~12 detik antara 4 sudut agar sulit di-crop), `pointer-events:none`, opacity ~0.55, font monospace, background blur ringan.
- Props: `code: string` (mis. `"RT-1A2B"`).

Edit `src/components/HlsPlayer.tsx` & `src/components/EmbedPlayer.tsx`:
- Terima prop opsional `watermark?: string`. Render `<LiveWatermark>` di dalam container player setelah video/iframe.

Edit `src/pages/Live.tsx`:
- Teruskan `watermark` ke kedua player.

## 4. Realtime Kick saat Token Direvoke / Dihapus

Edit `src/pages/Live.tsx`:
- Tambah subscribe ke channel `postgres_changes` tabel `live_tokens` (filter event UPDATE/DELETE). Saat ada perubahan, panggil `unlock-live` ulang (silent) dengan token URL; jika respons tidak `valid` → reset state (`unlocked=null`, hapus sessionStorage), tampilkan pesan "Akses dicabut admin".
- Migrasi DB: `ALTER PUBLICATION supabase_realtime ADD TABLE public.live_tokens;` + set `REPLICA IDENTITY FULL`.

## 5. CTA "Beli Show" untuk User Tanpa Akses

Edit `src/pages/Live.tsx` di state "akses terkunci":
- Heading besar **"Beli Show"** + deskripsi singkat ("Hubungi admin untuk mendapatkan token akses live.").
- Tombol utama hijau **"Hubungi Admin via WhatsApp"** → `https://wa.me/6288809048431?text=Halo%20admin%2C%20saya%20ingin%20beli%20akses%20show%20live.` (target `_blank`, `rel="noopener"`).
- Form sandi tetap di bawahnya (collapsible).

## 6. Fix DevTools False-Positive

Edit `src/hooks/useDevToolsDetector.ts`:
- **Buang** strategi `console.debug(probe)` + getter trick — ini false-positive di banyak browser modern (extension, React DevTools, atau preview iframe Lovable mem-format objek).
- **Buang** `console.clear()` periodik (mengganggu user & kadang trigger detector lain).
- Detector hanya pakai size-diff dengan threshold lebih ketat: `SIZE_THRESHOLD = 320`, `CONFIRM_COUNT = 4` (≥6 detik konsisten), dan **skip total** jika:
  - viewport mobile (`innerWidth < 900` atau `window.matchMedia('(pointer: coarse)').matches`)
  - di iframe (`window.top !== window.self`) — preview Lovable jalan di iframe
  - device pixel ratio aneh / zoom (`Math.abs(window.devicePixelRatio - Math.round(window.devicePixelRatio)) > 0.1` cukup → skip karena zoom UI bikin diff)
- Tetap blokir F12 / Ctrl+Shift+I/J/C dan right-click (instant trigger).
- Hapus interval check jika sudah triggered.

## 7. Penegakan Device-Lock yang Sebenarnya

Saat ini `unlock-live` sudah cek `browser_id` di `live_token_devices`. Tambahkan:
- Edit `unlock-live/index.ts`: gunakan transaksi soft — gunakan `upsert` `(token_id, browser_id)` dengan unique index agar concurrent request tak melebihi limit. Tambah migrasi:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS live_token_devices_token_browser_uniq
    ON public.live_token_devices(token_id, browser_id);
  ```
- Sebelum insert: hitung lagi `count` dgn `head: true`; jika `>= max_devices` → tolak `device_limit`. (Race kecil tapi limit umumnya ≤10, dan unique index memastikan tidak ada duplikat browser_id.)
- Di `Live.tsx`: simpan `browser_id` yang di-acknowledge server ke sessionStorage; setiap kali tab live aktif (visibilitychange → visible), re-validate via `unlock-live` silent. Jika invalid (mis. admin reset device) → kick.

## 8. File yang Diubah / Dibuat

**Baru**
- `src/components/LiveWatermark.tsx`
- Migrasi: unique index `live_token_devices`, enable realtime `live_tokens`.

**Diubah**
- `src/hooks/useDevToolsDetector.ts`
- `src/pages/Live.tsx` (form sandi, CTA Beli Show, watermark, kick realtime, revalidate)
- `src/pages/Admin.tsx` (form token tanpa label, kolom kode RT-XXXX, tombol revoke, sandi live UI kembali)
- `src/components/HlsPlayer.tsx` & `src/components/EmbedPlayer.tsx` (prop watermark)
- `supabase/functions/manage-live/index.ts` (action `revoke_token`, label opsional)
- `supabase/functions/unlock-live/index.ts` (password fallback, watermark dalam respons, device-lock ketat)

Setelah disetujui saya implementasi semuanya berurutan + jalankan migrasi & deploy fungsi.
