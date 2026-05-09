## 1. Sandi master bulanan untuk Live & Replay

**Replay** — sudah didukung (`verify-password` & `get-replay-source` mengecek `master_passwords` berdasarkan bulan dari `replay.date`). Tidak diubah.

**Live per-show (`active_shows`)** — sudah didukung di `unlock-live` Branch A (cek `master_passwords` berdasarkan `show.show_date`). Tidak diubah.

**Live legacy (`live_config_private`)** — saat ini hanya cocokkan `cfg.password`. Tambahkan fallback master:
- File: `supabase/functions/unlock-live/index.ts`, blok `if (password)` di Branch B.
- Hitung bulan `YYYY-MM` dari `now()`, query `master_passwords`, valid bila `paused !== true` dan password cocok.

## 2. Membership multi-device (sesuai input admin, mis. 300)

**Migrasi DB** — tambah kolom `max_devices` di `membership_tokens`:
```sql
ALTER TABLE public.membership_tokens
  ADD COLUMN max_devices integer NOT NULL DEFAULT 1;
```

**Edge function `unlock-live`** (`bindMembershipDevice`):
- Ganti `maybeSingle()` menjadi cek per `(token_id, browser_id)`. Jika ada → update `last_seen`.
- Jika tidak ada → hitung total device untuk token (`count`). Jika `count >= tokenRow.max_devices` → `device_limit`. Jika belum penuh → insert.

**Edge function `verify-password`** — terapkan logika `bindMembershipDevice` yang sama (perlu menerima `tokenRow` agar tahu `max_devices`).

**Admin UI `MembershipAdmin.tsx`**:
- Tambah field `max_devices` di form pembuatan (input number, default 1, min 1, max 1000) — admin bebas isi 300, dst.
- Saat insert, sertakan `max_devices`.
- Tampilkan rasio "Perangkat tertaut (n/{max_devices})".
- Tambah tombol kecil "Ubah max device" via prompt → update kolom.

## 3. Daftar command otomatis (bot `/menu` & website)

**Bot `/menu`** — jadikan dinamis:
- Update row `bot_commands` `/menu` → `is_dynamic = true`.
- Di `supabase/functions/fonnte-webhook/index.ts` blok `command.is_dynamic`, tambah handler:
  ```ts
  if (cmd === '/menu') {
    const { data: cmds } = await admin.from('bot_commands')
      .select('trigger,description').eq('enabled', true).order('sort_order');
    reply = '📋 *DAFTAR COMMAND*\n\n' +
      (cmds || []).map(c => `• *${c.trigger}* — ${c.description || '-'}`).join('\n') +
      '\n\nKetik salah satu untuk mencoba.';
  }
  ```

**Website** — buat komponen baru `src/components/BotCommandsPublic.tsx`:
- Fetch `bot_commands` (RLS publik untuk SELECT sudah aktif).
- Render daftar trigger + description.
- Sisipkan section di bagian bawah `src/pages/Index.tsx` ("Daftar Perintah Bot").

## 4. File yang diubah

1. Migrasi DB — `ALTER TABLE membership_tokens ADD COLUMN max_devices` + `UPDATE bot_commands SET is_dynamic = true WHERE trigger = '/menu'`.
2. `supabase/functions/unlock-live/index.ts` — fallback master di Branch B + `bindMembershipDevice` multi-device.
3. `supabase/functions/verify-password/index.ts` — `bindMembershipDevice` multi-device.
4. `supabase/functions/fonnte-webhook/index.ts` — handler dinamis `/menu`.
5. `src/components/admin/MembershipAdmin.tsx` — input & tampilan `max_devices`.
6. `src/components/BotCommandsPublic.tsx` (baru) + sisipkan ke `src/pages/Index.tsx`.

## 5. Tidak disentuh

- `Live.tsx`, `Akses.tsx`, `LiveChat`, player components, RLS lain, sistem token replay/live yang sudah ada, kolom membership lain (kuota reset, dll).
