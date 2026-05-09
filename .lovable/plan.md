## 1. Update foto member ke versi terbaru

Sumber URL digabung dengan prioritas: `Daftar_Member_JKT48-1.txt` → `Member_JKT_3-12.txt` → `Daftar_Member_JKT48.txt`. Untuk setiap nama, pakai URL dari file dengan prioritas tertinggi yang memuatnya.

- Pastikan tabel `members` punya unique constraint pada `name` (jika belum, tambahkan via migration: `ALTER TABLE members ADD CONSTRAINT members_name_key UNIQUE (name);`).
- Jalankan bulk upsert (`INSERT ... ON CONFLICT (name) DO UPDATE SET photo_url = EXCLUDED.photo_url`) untuk semua member dari ketiga dokumen.
- Member baru yang belum ada di DB (mis. Auwia, Ekin, Bella, dst) akan ditambahkan otomatis.
- Entri error di file (mis. `Maxine` di file -1 menunjuk ke `jazzy_w6xbp0.jpg`) di-skip jika tidak ada URL valid di file lain.

Tidak menyentuh komponen `MemberAvatar.tsx` atau halaman lain.

## 2. Live Chat — tampilan jelas & menarik tanpa avatar (gaya YouTube/TikTok/Instagram)

Hanya file `src/components/LiveChat.tsx` yang diubah.

Referensi tampilan:
- **YouTube Live Chat**: padat tapi terbaca, satu baris per pesan, nama berwarna, timestamp halus, bubble super-flat (tanpa background per pesan), hover row.
- **TikTok LIVE**: bubble pill membulat di bawah, nama warna gradient/aksen.
- **Instagram Live**: kompak, nama bold, pesan langsung di sebelahnya.

Penerapan:
- **Tanpa avatar** — sesuai permintaan, hanya nama + pesan.
- Layout: row per pesan dengan padding kiri-kanan `px-3 py-1.5`, hover `bg-secondary/40 rounded-lg` (gaya YouTube).
- Nama: `font-semibold text-sm`, warna konsisten per nama via hash sederhana ke palet token semantik (mis. 6 warna dari `text-primary`, `text-accent`, dll). Admin: badge merah + ikon `ShieldCheck`, nama `text-yellow-400`.
- Pesan: `text-sm text-foreground/95`, di baris yang sama dengan nama (inline) seperti YouTube — wrap otomatis.
- Timestamp: `text-[10px] text-muted-foreground/60`, muncul di akhir baris atau saat hover (gaya YouTube).
- Pinned banner tetap ada, di-restyle sedikit lebih ramping.
- Spacing antar pesan `space-y-0.5` agar padat tapi tetap jelas.
- Auto-scroll, rate-limit, modal nama: tidak diubah.

## 3. Fitur balas pesan (reply)

Schema:
- Tambah kolom `reply_to_id uuid NULL` ke tabel `live_messages`.
- Tambah index `CREATE INDEX live_messages_reply_to_id_idx ON live_messages(reply_to_id);`.
- RLS existing tetap berlaku — kolom baru otomatis bisa diisi karena `WITH CHECK` hanya membatasi `is_admin` & `pinned`.

UI di `LiveChat.tsx`:
- Hover pesan (atau long-press di mobile) → muncul tombol kecil "Balas" (ikon `Reply` dari lucide).
- Klik "Balas" → set state `replyTo = { id, name, message }`. Muncul **preview reply** di atas input box: bar tipis dengan border kiri aksen, isi `Membalas @nama: <cuplikan 60 char>` + tombol ✕ untuk batal.
- Saat `send()`, sertakan `reply_to_id: replyTo.id` pada insert. Reset `replyTo` setelah sukses.
- Render: jika pesan punya `reply_to_id`, di atas isi pesan tampilkan kutipan kecil (border kiri 2px warna aksen, `text-xs text-muted-foreground`, `truncate`): `↪ @namaAsli: cuplikan`. Lookup dari state `messages` & `pinned`; bila tidak ditemukan tampilkan `Pesan tidak tersedia`.
- Klik kutipan reply → scroll ke pesan asli + highlight singkat (jika masih ada di list).

## 4. Admin block / unblock user di Live Chat

Schema baru (terpisah dari `blocked_browsers` yang dipakai untuk devtools detector):

```sql
CREATE TABLE public.chat_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_id text NOT NULL UNIQUE,
  last_name text DEFAULT '',
  reason text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view chat_blocks" ON public.chat_blocks FOR SELECT USING (true);
CREATE POLICY "Admins manage chat_blocks" ON public.chat_blocks FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_blocks;
```

Tambah guard RLS di `live_messages` (defensive, selain blok di client):
```sql
DROP POLICY "Anyone insert live_messages" ON public.live_messages;
CREATE POLICY "Anyone insert live_messages" ON public.live_messages
  FOR INSERT WITH CHECK (
    is_admin = false AND pinned = false
    AND NOT EXISTS (SELECT 1 FROM public.chat_blocks b WHERE b.browser_id = live_messages.browser_id)
  );
```

UI di `LiveChat.tsx`:
- Load semua row `chat_blocks` ke `Set<string>` lokal + subscribe realtime (channel postgres_changes pada tabel `chat_blocks`) untuk update otomatis.
- **User biasa**: kalau `blockedSet.has(getBrowserId())` → input dinonaktifkan + banner merah halus di atas input: "Kamu diblokir oleh admin dari live chat."
- **Admin**: di setiap pesan non-admin (saat hover) tambah ikon kecil:
  - 🚫 **Blokir** (jika `browser_id` belum diblokir) → insert ke `chat_blocks` `{ browser_id, last_name: m.name }`.
  - ✅ **Buka blokir** (jika sudah diblokir) → delete row sesuai `browser_id`.
- Pesan dari user terblokir tetap di-render (riwayat tidak hilang) tetapi diberi badge kecil "Diblokir" di sebelah nama.

## 5. Files & migrations

**Migration (schema):**
1. Add column `live_messages.reply_to_id` + index.
2. Create table `chat_blocks` + RLS + tambahkan ke realtime publication.
3. Replace policy `Anyone insert live_messages` agar menolak browser yang diblokir.
4. (Conditional) tambah unique constraint `members_name_key`.

**Insert tool (data):**
- Bulk upsert `members` dari URL gabungan ketiga file.

**Code changes:**
- `src/components/LiveChat.tsx` — restyle (gaya YT/TikTok/IG, tanpa avatar), fitur reply, fitur block/unblock, banner user terblokir.

**Tidak diubah:** `MemberAvatar.tsx`, `Live.tsx`, edge functions, sistem token, halaman lain, RLS lain.
