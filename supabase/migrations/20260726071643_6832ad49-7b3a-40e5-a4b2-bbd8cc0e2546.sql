ALTER TABLE public.membership_payment_proofs
  ADD COLUMN IF NOT EXISTS show_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mpp_show_order_id ON public.membership_payment_proofs(show_order_id);

CREATE OR REPLACE FUNCTION public.admin_list_membership_proofs()
RETURNS SETOF public.membership_payment_proofs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.cleanup_expired_membership_proofs();
  RETURN QUERY SELECT * FROM public.membership_payment_proofs ORDER BY created_at DESC;
END $$;