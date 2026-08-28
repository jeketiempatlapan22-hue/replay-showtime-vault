CREATE TABLE public.telegram_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  chat_id BIGINT,
  link_code TEXT NOT NULL,
  user_id UUID,
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phone),
  UNIQUE (link_code)
);
CREATE INDEX idx_telegram_links_chat_id ON public.telegram_links (chat_id);
GRANT SELECT ON public.telegram_links TO authenticated;
GRANT ALL ON public.telegram_links TO service_role;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own telegram link" ON public.telegram_links FOR SELECT TO authenticated USING (auth.uid() = user_id);