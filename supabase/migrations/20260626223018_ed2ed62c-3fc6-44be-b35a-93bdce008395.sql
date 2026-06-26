GRANT INSERT, SELECT ON public.membership_payment_proofs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_payment_proofs TO authenticated;
GRANT ALL ON public.membership_payment_proofs TO service_role;