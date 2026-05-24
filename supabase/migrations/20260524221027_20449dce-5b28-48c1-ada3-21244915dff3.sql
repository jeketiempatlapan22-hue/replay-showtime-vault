
REVOKE EXECUTE ON FUNCTION public.reserve_membership_slot(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_membership_slot(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_membership_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_membership_reservations() FROM PUBLIC, anon, authenticated;
