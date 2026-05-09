-- 1. reply_to_id pada live_messages
ALTER TABLE public.live_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid;
CREATE INDEX IF NOT EXISTS live_messages_reply_to_id_idx ON public.live_messages(reply_to_id);

-- 2. chat_blocks
CREATE TABLE IF NOT EXISTS public.chat_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  browser_id text NOT NULL UNIQUE,
  last_name text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone view chat_blocks" ON public.chat_blocks;
CREATE POLICY "Anyone view chat_blocks" ON public.chat_blocks FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage chat_blocks" ON public.chat_blocks;
CREATE POLICY "Admins manage chat_blocks" ON public.chat_blocks FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_blocks;

-- 3. block-aware insert policy on live_messages
DROP POLICY IF EXISTS "Anyone insert live_messages" ON public.live_messages;
CREATE POLICY "Anyone insert live_messages" ON public.live_messages
  FOR INSERT WITH CHECK (
    is_admin = false AND pinned = false
    AND NOT EXISTS (SELECT 1 FROM public.chat_blocks b WHERE b.browser_id = live_messages.browser_id)
  );

-- 4. unique constraint on members.name (if missing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_name_key' AND conrelid = 'public.members'::regclass) THEN
    ALTER TABLE public.members ADD CONSTRAINT members_name_key UNIQUE (name);
  END IF;
END $$;