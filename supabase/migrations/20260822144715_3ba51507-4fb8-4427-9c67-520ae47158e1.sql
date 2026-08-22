ALTER TABLE public.replays
ADD COLUMN IF NOT EXISTS image_fit text NOT NULL DEFAULT 'contain';

ALTER TABLE public.replays
DROP CONSTRAINT IF EXISTS replays_image_fit_check;

ALTER TABLE public.replays
ADD CONSTRAINT replays_image_fit_check CHECK (image_fit IN ('contain','scale-down','cover'));