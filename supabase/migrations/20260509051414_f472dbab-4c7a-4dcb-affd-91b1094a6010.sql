ALTER TABLE public.membership_tokens ADD COLUMN IF NOT EXISTS max_devices integer NOT NULL DEFAULT 1;
UPDATE public.bot_commands SET is_dynamic = true WHERE trigger = '/menu';