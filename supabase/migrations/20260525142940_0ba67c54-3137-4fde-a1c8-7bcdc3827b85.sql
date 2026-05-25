ALTER TABLE public.membership_tokens
ADD COLUMN IF NOT EXISTS replay_info text NOT NULL DEFAULT '';