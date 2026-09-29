ALTER TABLE public.game_entries ADD COLUMN device_fp text, ADD COLUMN ip_hash text;
CREATE INDEX game_entries_device_idx ON public.game_entries(device_fp);
CREATE INDEX game_entries_ip_idx ON public.game_entries(round_id, ip_hash);