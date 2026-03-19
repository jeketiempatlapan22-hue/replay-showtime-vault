
-- Create admin role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- user_roles: only admins can read roles
CREATE POLICY "Admins can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ======= REPLAYS: public read, admin write =======
DROP POLICY IF EXISTS "Allow delete replays" ON public.replays;
DROP POLICY IF EXISTS "Allow insert replays" ON public.replays;
DROP POLICY IF EXISTS "Allow update replays" ON public.replays;

CREATE POLICY "Admin insert replays" ON public.replays
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update replays" ON public.replays
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete replays" ON public.replays
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ======= MASTER_PASSWORDS: public read, admin write =======
DROP POLICY IF EXISTS "Allow delete master_passwords" ON public.master_passwords;
DROP POLICY IF EXISTS "Allow insert master_passwords" ON public.master_passwords;
DROP POLICY IF EXISTS "Allow update master_passwords" ON public.master_passwords;

CREATE POLICY "Admin insert master_passwords" ON public.master_passwords
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update master_passwords" ON public.master_passwords
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete master_passwords" ON public.master_passwords
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ======= SITE_SETTINGS: public read, admin write =======
DROP POLICY IF EXISTS "Anyone can insert settings" ON public.site_settings;
DROP POLICY IF EXISTS "Anyone can update settings" ON public.site_settings;

CREATE POLICY "Admin insert settings" ON public.site_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update settings" ON public.site_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ======= RATINGS: public read, anyone insert/update (anonymous) =======
-- Already fine: public select, public insert, public update

-- ======= COMMENTS: public read, anyone insert, admin delete =======
DROP POLICY IF EXISTS "Anyone can delete comments" ON public.comments;
CREATE POLICY "Admin delete comments" ON public.comments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
