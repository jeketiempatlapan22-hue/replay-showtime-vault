CREATE UNIQUE INDEX IF NOT EXISTS orders_pakasir_order_id_unique_not_null
ON public.orders (pakasir_order_id)
WHERE pakasir_order_id IS NOT NULL AND pakasir_order_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS membership_orders_pakasir_order_id_unique_not_null
ON public.membership_orders (pakasir_order_id)
WHERE pakasir_order_id IS NOT NULL AND pakasir_order_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS reseller_bills_pakasir_order_id_unique_not_null
ON public.reseller_bills (pakasir_order_id)
WHERE pakasir_order_id IS NOT NULL AND pakasir_order_id <> '';