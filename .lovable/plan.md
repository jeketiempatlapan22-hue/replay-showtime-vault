
## Analisis

User minta 3 hal:
1. **M3U8 lebih lancar** — kurangi lag dengan tuning hls.js buffer config + ABR settings
2. **Animasi loading lebih jelas** — saat connect awal & saat buffering/lag mid-playback
3. **Tombol PiP** di sebelah kanan RatingStars dengan deskripsi jelas

## Rencana Implementasi

### A. Tuning HLS.js untuk pemutaran lebih lancar (`src/components/HlsPlayer.tsx`)

Ganti config `new Hls(...)` dengan parameter optimal:
- `enableWorker: true` (sudah ada) → offload parsing ke web worker
- `lowLatencyMode: false` (sudah ada)
- `backBufferLength: 30` → batasi back-buffer agar memory tidak bengkak
- `maxBufferLength: 60` → buffer ke depan 60 detik
- `maxMaxBufferLength: 120` → cap absolut
- `maxBufferSize: 60 * 1000 * 1000` → 60MB cap
- `maxBufferHole: 0.5` → toleransi gap kecil
- `highBufferWatchdogPeriod: 2`
- `nudgeOffset: 0.1`, `nudgeMaxRetry: 5`
- ABR: `abrEwmaDefaultEstimate: 500_000` (mulai konservatif untuk koneksi lambat), `startLevel: -1` (auto pilih lowest dulu untuk fast start)
- **Auto-recovery saat error non-fatal**: di handler `Hls.Events.ERROR`, kalau `data.type === NETWORK_ERROR` panggil `hls.startLoad()`, kalau `MEDIA_ERROR` panggil `hls.recoverMediaError()` — hanya escalate ke `onFatalError` setelah retry gagal

### B. Animasi loading yang lebih informatif

- State baru: `buffering` (terpisah dari initial `loading`)
- `loading` = saat manifest belum di-parse / sumber baru di-load
- `buffering` = `waiting` event mid-playback
- Overlay berbeda:
  - **Initial loading**: spinner besar + teks "Menghubungkan ke server..."
  - **Buffering**: spinner kecil pojok + teks "Memuat..." dengan backdrop blur ringan (tidak menghalangi tonton)
- Tambahkan animasi pulse untuk indikator buffer

### C. Picture-in-Picture

**Di `HlsPlayer.tsx`**: expose method PiP via `useImperativeHandle` ATAU lebih simpel — handle PiP sepenuhnya di parent dengan ref ke video element.

**Pendekatan terpilih**: Tambahkan prop `videoRef` external + atau forwardRef ke video element, ATAU simplest — buat fungsi PiP di `YouTubePlayer.tsx` yang akses video element via querySelector di container HLS player.

Lebih clean: ubah `HlsPlayer` jadi `forwardRef` yang expose `{ requestPip, exitPip, isPipActive }` ke parent.

**Di `YouTubePlayer.tsx`** (lokasi tombol):
- Bagian rating: ubah dari `<RatingStars />` jadi flex container `<div><RatingStars /><PipButton /></div>`
- Tombol PiP:
  - Icon `PictureInPicture2` dari lucide-react
  - Label visible: "PiP"
  - Tooltip + helper text di bawah: "Picture-in-Picture: tonton video dalam jendela kecil mengambang sambil membuka tab/aplikasi lain"
  - Disabled & tampilkan pesan kalau:
    - Sumber adalah YouTube iframe (PiP tidak bisa diakses dari cross-origin iframe — sembunyikan tombol)
    - Browser tidak support (`!document.pictureInPictureEnabled`)
- State PiP active untuk toggle label "Buka PiP" / "Keluar PiP"

### D. Hindari false-positive di mobile

Viewport user 484px → mobile. Pastikan tombol PiP tetap tampil di layout flex-col yang sudah ada (`flex-col sm:flex-row`).

## Files yang Akan Diubah

- `src/components/HlsPlayer.tsx` — tuning hls.js, recovery error, dual loading state, forwardRef untuk PiP
- `src/components/YouTubePlayer.tsx` — ref ke HlsPlayer, tombol PiP di samping RatingStars dengan deskripsi, hide saat YouTube/unsupported

## Catatan Teknis

- PiP **tidak akan tersedia untuk source YouTube** karena iframe cross-origin. Tombol akan disembunyikan otomatis saat sumber aktif YouTube — UI memberi info "PiP hanya tersedia untuk sumber M3U8".
- Recovery loop dibatasi (max 3 retry per session) untuk hindari infinite loop saat sumber benar-benar mati → escalate ke `onFatalError` (fallback ke YouTube tetap jalan).
