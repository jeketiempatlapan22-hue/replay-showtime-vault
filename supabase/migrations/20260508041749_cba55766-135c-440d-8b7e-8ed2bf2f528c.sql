INSERT INTO public.bot_commands (trigger, description, response_template, is_dynamic, enabled, sort_order)
VALUES ('/createtokenrep', 'Buat token replay (master) berdasarkan ID/alias', '', true, true, 50)
ON CONFLICT DO NOTHING;