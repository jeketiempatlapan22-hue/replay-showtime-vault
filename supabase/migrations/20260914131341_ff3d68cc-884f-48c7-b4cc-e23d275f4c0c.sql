CREATE OR REPLACE FUNCTION public.sync_show_bundle()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.show_bundles;
  before_count integer;
  after_count integer;
  sum_idr integer;
  sum_coins integer;
BEGIN
  SELECT * INTO b FROM public.show_bundles ORDER BY created_at LIMIT 1;
  IF b.id IS NULL THEN
    INSERT INTO public.show_bundles DEFAULT VALUES RETURNING * INTO b;
    INSERT INTO public.show_bundle_passwords (bundle_id, password)
      VALUES (b.id, public.gen_bundle_password());
  END IF;

  INSERT INTO public.show_bundle_items (bundle_id, show_id)
  SELECT b.id, s.id FROM public.active_shows s
  WHERE s.is_active = true AND s.replay_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.show_bundle_items i WHERE i.bundle_id = b.id AND i.show_id = s.id
    );

  before_count := b.show_count;

  SELECT coalesce(sum(coalesce(nullif(s.price_show, 0), s.pakasir_amount, 0)), 0),
         coalesce(sum(coalesce(s.price_show_coins, 0)), 0),
         count(*)
    INTO sum_idr, sum_coins, after_count
  FROM public.show_bundle_items i
  JOIN public.active_shows s ON s.id = i.show_id
  WHERE i.bundle_id = b.id AND i.excluded = false
    AND s.is_active = true AND s.replay_id IS NULL;

  UPDATE public.show_bundles SET
    price_idr = CASE WHEN after_count > 0 THEN greatest(0, sum_idr - b.discount_idr) ELSE 0 END,
    price_coins = CASE WHEN after_count > 0 THEN greatest(0, sum_coins - b.discount_coins) ELSE 0 END,
    show_count = after_count,
    updated_at = now()
  WHERE id = b.id;

  IF after_count < before_count THEN
    UPDATE public.show_bundle_passwords SET is_current = false
      WHERE bundle_id = b.id AND is_current = true;
    INSERT INTO public.show_bundle_passwords (bundle_id, password)
      VALUES (b.id, public.gen_bundle_password());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.show_bundle_passwords WHERE bundle_id = b.id AND is_current = true) THEN
    INSERT INTO public.show_bundle_passwords (bundle_id, password)
      VALUES (b.id, public.gen_bundle_password());
  END IF;
END;
$$;

SELECT public.sync_show_bundle();