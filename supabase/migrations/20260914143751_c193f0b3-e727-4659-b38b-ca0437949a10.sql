-- Pass 1: cocokkan judul penuh (tanpa prefix "Show • ") dengan judul replay, beda tanggal maks 3 hari
WITH o AS (
  SELECT o.id, o.created_at,
         lower(regexp_replace(regexp_replace(o.item_title,'^Show • ',''), '[^a-z0-9]+', '', 'gi')) AS k
  FROM public.orders o
  LEFT JOIN public.active_shows s ON s.id = o.show_id
  WHERE o.status = 'paid' AND o.show_id IS NOT NULL AND s.id IS NULL AND o.replay_id IS NULL
), r AS (
  SELECT id, date, lower(regexp_replace(title,'[^a-z0-9]+','','gi')) AS k FROM public.replays
), m AS (
  SELECT o.id AS order_id, x.rid
  FROM o
  JOIN LATERAL (
    SELECT r.id AS rid FROM r
    WHERE r.k = o.k
      AND abs(r.date - (o.created_at AT TIME ZONE 'Asia/Makassar')::date) <= 3
    ORDER BY abs(r.date - (o.created_at AT TIME ZONE 'Asia/Makassar')::date)
    LIMIT 1
  ) x ON true
)
UPDATE public.orders ord
SET replay_id = m.rid, updated_at = now()
FROM m WHERE ord.id = m.order_id;

-- Pass 2: cocokkan dua kata pertama judul, beda tanggal maks 2 hari
WITH o AS (
  SELECT o.id, o.created_at,
         lower(regexp_replace(
           array_to_string((regexp_split_to_array(btrim(regexp_replace(o.item_title,'^Show • ','')), '\s+'))[1:2], ' '),
           '[^a-z0-9]+','','gi')) AS k
  FROM public.orders o
  LEFT JOIN public.active_shows s ON s.id = o.show_id
  WHERE o.status = 'paid' AND o.show_id IS NOT NULL AND s.id IS NULL AND o.replay_id IS NULL
), r AS (
  SELECT id, date,
         lower(regexp_replace(
           array_to_string((regexp_split_to_array(btrim(title), '\s+'))[1:2], ' '),
           '[^a-z0-9]+','','gi')) AS k
  FROM public.replays
), m AS (
  SELECT o.id AS order_id, x.rid
  FROM o
  JOIN LATERAL (
    SELECT r.id AS rid FROM r
    WHERE r.k = o.k AND length(r.k) > 3
      AND abs(r.date - (o.created_at AT TIME ZONE 'Asia/Makassar')::date) <= 2
    ORDER BY abs(r.date - (o.created_at AT TIME ZONE 'Asia/Makassar')::date)
    LIMIT 1
  ) x ON true
)
UPDATE public.orders ord
SET replay_id = m.rid, updated_at = now()
FROM m WHERE ord.id = m.order_id;