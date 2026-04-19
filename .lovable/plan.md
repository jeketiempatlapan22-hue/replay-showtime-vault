
## Analisis Masalah

User ingin memastikan:
1. **Fitur M3U8 + YouTube fallback** sudah diterapkan dan jalan di semua browser/device
2. **Sembunyikan source video** (youtube_id & m3u8_url) dari DevTools/inspect — user tanpa sandi tidak boleh bisa menemukannya
3. **Deteksi DevTools tetap aktif** — auto-keluar jika terdeteksi
4. **Zero false-positive** — user normal tidak boleh kena blok

## Masalah Saat Ini (hasil eksplorasi codebase)

1. **Source video bocor di DevTools**: `replays` table di-fetch via `supabase.from('replays').select('*')` — semua field termasuk `youtube_id`, `m3u8_url`, `password` ikut terkirim ke client. Bisa dilihat di Network tab atau React DevTools sebagai props.
2. **Iframe YouTube** punya `src` langsung dengan ID terlihat di DOM Inspector.
3. **HLS player** punya `src` M3U8 terlihat di `<video>` element.
4. **Deteksi DevTools sekarang berisiko false-positive**:
   - `debugger` statement tiap 1.5 detik → bisa freeze tab Chrome / kena anti-debugger blocker / extension
   - Window size diff threshold 200px → bisa salah trigger di laptop kecil dengan zoom browser
   - `Ctrl+U` (view source) bukan DevTools, blokir terlalu agresif

## Solusi

### A. Sembunyikan source video (CRITICAL)

**Server-side proxy via Edge Function:**
- Buat edge function `get-replay-source` yang menerima `replay_id` + `password` (sandi yang user input)
- Function verifikasi sandi (mirip `verify-password` yang sudah ada), kalau valid baru return `{ youtube_id, m3u8_url, source_type }`
- Frontend **tidak pernah** load `youtube_id`/`m3u8_url` di list awal — hanya saat user buka player setelah masukkan sandi

**Frontend changes:**
- `getReplays()` di `src/lib/store.ts`: select kolom whitelist saja (exclude `youtube_id`, `m3u8_url`, `password`)
- `YouTubePlayer.tsx`: terima `replay` tanpa source, fetch source via edge function saat mount, simpan di state lokal (tidak di-prop ke child)
- Iframe YouTube: gunakan `srcDoc` minimal atau set `src` setelah mount via ref agar tidak ada di static HTML SSR-like inspect
- M3U8: pakai blob URL untuk hide direct M3U8 link dari `<video src>` (catatan: HLS pakai MediaSource Extensions, src video element jadi `blob:` otomatis — sudah tersembunyi). Manifest URL hanya hidup di memory hls.js instance.

### B. Perbaiki deteksi DevTools (kurangi false-positive, tetap efektif)

- **Hapus `debugger` interval** — terlalu agresif, bisa freeze browser. Ganti dengan deteksi via `console.log` getter trick (lebih ringan & reliable).
- **Naikkan size threshold** dari 200px ke 250px + tambah delay 3 detik untuk konfirmasi (hindari trigger saat resize manual).
- **Hapus blokir Ctrl+U** (view source bukan DevTools).
- **Tambahkan disable text selection di player area saja**, bukan global (UX lebih baik).

### C. Pastikan kompatibilitas Chrome & semua browser

- HLS.js sudah handle Safari (native HLS) + Chrome/Firefox/Edge (MSE).
- Cek `youtube-nocookie.com` embed: tambahkan `enablejsapi=0` & pastikan `referrerPolicy` benar.
- Test di viewport mobile (lebar < 600px sudah di-skip detector).

## Rencana Implementasi

1. **Edge function baru `get-replay-source`** — verify sandi server-side, return source data hanya jika valid
2. **Update `src/lib/store.ts`** — `getReplays()` exclude kolom sensitif
3. **Update `src/integrations/supabase/types.ts`** — auto-regen setelah migration (kalau perlu)
4. **Update `src/components/YouTubePlayer.tsx`** — fetch source via edge function on mount, render player setelah dapat data
5. **Update `src/hooks/useDevToolsDetector.ts`** — hapus debugger trick, naikkan threshold, hapus Ctrl+U block, tambah console getter detection
6. **Update `src/pages/Index.tsx`** — pass `password` (yang user sudah input) ke YouTubePlayer agar bisa fetch source
7. **Tambahkan loading state** di player saat fetch source

## Detail Teknis Penting

- **Sandi user**: sudah disimpan di `sessionStorage` per replay (lihat memory `password-logic`). Reuse untuk autentikasi ke edge function source.
- **Edge function** akan dideploy otomatis dengan `verify_jwt = false` di `supabase/config.toml`.
- **YouTube iframe**: tetap embed langsung (tidak bisa diproxy karena CORS), tapi `src` di-set via JS setelah mount sehingga tidak muncul di "View Source" awal.
- **M3U8**: hls.js otomatis menggunakan blob URL untuk video element — segment URL tetap di-load dari Mux, tapi user perlu HLS analyzer untuk extract (jauh lebih sulit dari sekedar lihat HTML).

## Files yang Akan Diubah

- `supabase/functions/get-replay-source/index.ts` (baru)
- `supabase/config.toml` (tambah function entry kalau perlu)
- `src/lib/store.ts`
- `src/components/YouTubePlayer.tsx`
- `src/hooks/useDevToolsDetector.ts`
- `src/pages/Index.tsx` (pass password ke player)

## Risiko & Mitigasi

- **YouTube ID masih terlihat di iframe `src` setelah load**: tidak bisa 100% disembunyikan karena harus di-render. Mitigasi: hanya muncul setelah sandi benar, jadi user tanpa akses tetap tidak bisa lihat.
- **M3U8 segment URL terlihat di Network tab**: tidak bisa dihindari (browser harus fetch). Tapi DevTools sudah di-blokir → user normal tidak bisa akses Network tab. Plus base manifest URL tidak terekspos di DOM.
