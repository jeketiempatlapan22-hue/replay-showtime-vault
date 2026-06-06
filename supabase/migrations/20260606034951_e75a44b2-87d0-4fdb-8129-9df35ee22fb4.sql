CREATE UNIQUE INDEX IF NOT EXISTS coin_transactions_one_topup_per_order
ON public.coin_transactions (related_order_id)
WHERE related_order_id IS NOT NULL AND reason = 'topup' AND delta > 0;

CREATE OR REPLACE FUNCTION public.credit_coin_topup_order(_order_id uuid)
RETURNS TABLE(new_balance integer, already_credited boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing public.coin_transactions%ROWTYPE;
BEGIN
  IF _order_id IS NULL THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.kind <> 'coin_topup' THEN
    RAISE EXCEPTION 'not_coin_topup';
  END IF;

  IF v_order.user_id IS NULL OR COALESCE(v_order.coin_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'invalid_coin_order';
  END IF;

  SELECT * INTO v_existing
  FROM public.coin_transactions
  WHERE related_order_id = v_order.id
    AND reason = 'topup'
    AND delta > 0
  LIMIT 1;

  IF FOUND THEN
    SELECT balance INTO new_balance
    FROM public.coin_balances
    WHERE user_id = v_order.user_id;

    already_credited := true;
    new_balance := COALESCE(new_balance, 0);
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.coin_balances(user_id, balance, updated_at)
  VALUES (v_order.user_id, v_order.coin_amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.coin_balances.balance + v_order.coin_amount,
        updated_at = now()
  RETURNING balance INTO new_balance;

  INSERT INTO public.coin_transactions(user_id, delta, reason, meta, related_order_id)
  VALUES (
    v_order.user_id,
    v_order.coin_amount,
    'topup',
    jsonb_build_object('order_id', v_order.id, 'source', 'credit_coin_topup_order'),
    v_order.id
  );

  UPDATE public.orders
    SET status = 'paid',
        paid_at = COALESCE(paid_at, now()),
        updated_at = now()
    WHERE id = v_order.id;

  already_credited := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_coin_topup_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_coin_topup_order(uuid) TO service_role;