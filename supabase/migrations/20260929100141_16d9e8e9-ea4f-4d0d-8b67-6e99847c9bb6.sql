CREATE OR REPLACE FUNCTION public.gen_bundle_password()
 RETURNS text LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
  letters text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  digits text := '23456789';
  al text := letters || digits;
  r text;
BEGIN
  LOOP
    r := '';
    FOR i IN 1..6 LOOP
      r := r || substr(al, 1 + floor(random() * length(al))::int, 1);
    END LOOP;
    EXIT WHEN r ~ '[A-Z]' AND r ~ '[0-9]';
  END LOOP;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.gen_bundle_password() FROM anon, authenticated, public;