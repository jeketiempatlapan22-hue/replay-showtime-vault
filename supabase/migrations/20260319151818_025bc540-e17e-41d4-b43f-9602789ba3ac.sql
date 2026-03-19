-- Add show_name and featured_member columns to replays
ALTER TABLE public.replays ADD COLUMN show_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.replays ADD COLUMN featured_member TEXT NOT NULL DEFAULT '';