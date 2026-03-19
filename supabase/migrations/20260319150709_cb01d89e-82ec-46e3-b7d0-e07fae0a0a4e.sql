-- Create replays table
CREATE TABLE public.replays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  criteria TEXT NOT NULL DEFAULT '',
  lineup TEXT[] NOT NULL DEFAULT '{}',
  password TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create master_passwords table
CREATE TABLE public.master_passwords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.replays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_passwords ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can view replays" ON public.replays FOR SELECT USING (true);
CREATE POLICY "Anyone can view master_passwords" ON public.master_passwords FOR SELECT USING (true);

-- Public write access (admin auth handled in app code)
CREATE POLICY "Allow insert replays" ON public.replays FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update replays" ON public.replays FOR UPDATE USING (true);
CREATE POLICY "Allow delete replays" ON public.replays FOR DELETE USING (true);
CREATE POLICY "Allow insert master_passwords" ON public.master_passwords FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update master_passwords" ON public.master_passwords FOR UPDATE USING (true);
CREATE POLICY "Allow delete master_passwords" ON public.master_passwords FOR DELETE USING (true);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_replays_updated_at
  BEFORE UPDATE ON public.replays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_master_passwords_updated_at
  BEFORE UPDATE ON public.master_passwords
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();