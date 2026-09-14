ALTER TABLE public.show_bundles
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'gold',
  ADD COLUMN IF NOT EXISTS promo_label text NOT NULL DEFAULT '';

DROP FUNCTION IF EXISTS public.get_show_bundle();
CREATE FUNCTION public.get_show_bundle()
RETURNS TABLE (
  id uuid, name text, description text, is_active boolean,
  price_idr integer, price_coins integer, show_count integer, show_ids uuid[],
  theme text, promo_label text, discount_idr integer, discount_coins integer
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.name, b.description, b.is_active, b.price_idr, b.price_coins, b.show_count,
    coalesce((
      SELECT array_agg(i.show_id)
      FROM public.show_bundle_items i
      JOIN public.active_shows s ON s.id = i.show_id
      WHERE i.bundle_id = b.id AND i.excluded = false AND s.is_active = true AND s.replay_id IS NULL
    ), '{}'::uuid[]),
    b.theme, b.promo_label, b.discount_idr, b.discount_coins
  FROM public.show_bundles b
  ORDER BY b.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.admin_update_bundle_style(
  _name text DEFAULT NULL,
  _description text DEFAULT NULL,
  _theme text DEFAULT NULL,
  _promo_label text DEFAULT NULL,
  _discount_idr integer DEFAULT NULL,
  _discount_coins integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT id INTO b_id FROM public.show_bundles ORDER BY created_at LIMIT 1;
  IF b_id IS NULL THEN RAISE EXCEPTION 'no_bundle'; END IF;

  UPDATE public.show_bundles SET
    name = coalesce(nullif(_name, ''), name),
    description = coalesce(_description, description),
    theme = coalesce(nullif(_theme, ''), theme),
    promo_label = coalesce(_promo_label, promo_label),
    discount_idr = greatest(0, coalesce(_discount_idr, discount_idr)),
    discount_coins = greatest(0, coalesce(_discount_coins, discount_coins)),
    updated_at = now()
  WHERE id = b_id;

  PERFORM public.sync_show_bundle();
END;
$$;