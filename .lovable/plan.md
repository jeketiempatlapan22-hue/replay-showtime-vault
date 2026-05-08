## Tujuan
1. Pulihkan tombol "Tap untuk aktifkan suara" + seek bar + tombol seek (±10 dtk) + durasi pada EmbedPlayer YouTube (replay & show aktif live).
2. Klik di mana pun pada layar memunculkan navbar dan menyembunyikannya kembali setelah 3 detik.
3. Responsif konsisten di mobile, PC, TV, dan proyektor — tidak ada tombol/UI yang terpotong.
4. Embed YouTube/Cloudflare tampil mulus tanpa stuck "Menghubungkan…", lag, atau loncatan posisi.

Tidak ada perubahan logika backend / verifikasi password / membership / RLS / edge functions.

---

## Perubahan per file

### `src/components/EmbedPlayer.tsx` (utama)
Player iframe sudah dirender langsung, tapi hint suara dan seek bar hilang karena state `showHint` dan `duration` baru di-set setelah API YouTube siap. Perbaikan:

- **Tap untuk aktifkan suara**: set `showHint=true` segera setelah `iframe.onLoad` saat `mutedRef.current === true` (autoplay paksa mute). Sembunyikan setelah user menekan tombol unmute.
- **Toggle mute fallback**: Saat YT API belum siap, ubah `iframe.src` (mengganti param `mute=0/1`) — sudah ada, pastikan tetap mempertahankan `currentTime` dengan param `start=`.
- **Seek bar & durasi**:
  - Pertahankan polling `getDuration/getCurrentTime` (sudah ada). Tampilkan seek bar segera ketika `type==='youtube'` walau `duration===0` dengan placeholder `--:--` agar UI tidak "loncat" muncul belakangan.
  - Pastikan tombol `SkipBack`/`SkipForward` tampil untuk YouTube replay (sudah ada via `hideSeekButtons`).
- **Hapus state mati `useYoutubeFallback`** yang tidak pernah di-set true (mengecoh logika `togglePlay`/`toggleMute`).
- **Auto-hide kontrol player**: tetap 3 dtk; hentikan `e.stopPropagation` pada wrapper kontrol — gunakan `pointer-events` yang lebih halus agar event `pointerdown` global (capture phase) tetap terdeteksi oleh `useAutoHideOnInteraction`.
- **Responsivitas**: tambah `landscape:` dan breakpoint `xl:` agar tombol fullscreen/volume tidak terpotong; gunakan `gap-1 xs:gap-2`; volume slider hidden di < 360px.

### `src/components/HlsPlayer.tsx`
- Audit: `e.stopPropagation` pada div control dihapus dari level pembungkus — biarkan tombol-tombolnya saja yang stopPropagation supaya klik area kosong tetap memicu autohide global.
- Pastikan seek bar VOD tetap berfungsi (tidak diubah perilakunya), hanya bersihkan sedikit styling untuk layar TV (tinggi track 3px → 4px landscape, target tap min 44×44 px).

### `src/hooks/useAutoHideOnInteraction.ts`
- Tambahkan listener `click` selain `pointerdown` (capture+passive) agar perangkat TV/remote yang hanya mengirim event `click` ikut memicu navbar muncul.
- Reset timer juga pada `touchstart` & `mousemove` (throttled 500ms).

### `src/pages/Live.tsx` & `src/components/YouTubePlayer.tsx`
- Tidak ubah logika; hanya pastikan kontainer player menggunakan `max-w-screen-2xl` + `w-full` + `aspect-video` agar di TV/proyektor (≥1920px) video memenuhi tanpa terpotong, dan pada mobile sempit (<360px) padding lateral berkurang menjadi `px-1`.
- Pada `Live.tsx`, hapus `e.stopPropagation` pada wrapper status/info card supaya klik di area mana pun tetap memunculkan navbar.

### `src/components/ActiveShowCard.tsx`
- DialogContent inline player live: ubah ke `w-[calc(100vw-0.5rem)] sm:w-[calc(100vw-2rem)] max-w-[1600px]` + `max-h-[100dvh]` agar di TV tidak terpotong; tambah `aspect-video` pada wrapper player.

---

## Cara verifikasi
- Buka `/live?show=…` (YouTube source) → player langsung tampil, "Tap untuk aktifkan suara" muncul, klik aktifkan suara, seek bar + tombol ±10s + durasi tampil setelah API ready (≤3 dtk).
- Buka kartu Show Aktif yang sedang live (YouTube) di Index → player inline punya semua kontrol sama.
- Klik area mana pun pada halaman saat menonton → navbar muncul, hilang 3 dtk kemudian.
- Resize preview: 320, 414, 768, 1280, 1920, 2560 — tidak ada tombol terpotong.
- Tidak ada error baru di console; status `200` untuk semua request.

## Apa yang TIDAK diubah
- Edge functions (`unlock-live`, `verify-password`, dst.)
- Skema database / RLS
- Logika membership, token, device-binding, atau viewer counter
- HLS player engine (hls.js config)
