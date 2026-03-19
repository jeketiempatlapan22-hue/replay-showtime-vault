-- Create storage bucket for card images
INSERT INTO storage.buckets (id, name, public) VALUES ('card-images', 'card-images', true);

-- Storage policies
CREATE POLICY "Anyone can view card images" ON storage.objects FOR SELECT USING (bucket_id = 'card-images');
CREATE POLICY "Anyone can upload card images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'card-images');
CREATE POLICY "Anyone can delete card images" ON storage.objects FOR DELETE USING (bucket_id = 'card-images');

-- Create site_settings table for theme, whatsapp info, etc.
CREATE TABLE public.site_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert settings" ON public.site_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update settings" ON public.site_settings FOR UPDATE USING (true);

CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.site_settings (key, value) VALUES
  ('theme', 'ramadhan'),
  ('whatsapp_number', ''),
  ('whatsapp_link', '');