-- 1) auth.users
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  created_at, updated_at, phone, phone_confirmed_at,
  confirmation_token, email_change, email_change_token_new, recovery_token,
  is_sso_user, is_anonymous
)
SELECT
  COALESCE(s.instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
  s.id, COALESCE(s.aud, 'authenticated'), COALESCE(s.role, 'authenticated'),
  s.email, s.encrypted_password,
  COALESCE(s.email_confirmed_at, s.confirmed_at, s.created_at, now()),
  s.recovery_sent_at, s.last_sign_in_at,
  COALESCE(s.raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  COALESCE(s.raw_user_meta_data, '{}'::jsonb),
  COALESCE(s.is_super_admin, false),
  COALESCE(s.created_at, now()), COALESCE(s.updated_at, now()),
  s.phone, s.phone_confirmed_at,
  COALESCE(s.confirmation_token,''), COALESCE(s.email_change,''),
  COALESCE(s.email_change_token_new,''), COALESCE(s.recovery_token,''),
  COALESCE(s.is_sso_user,false), COALESCE(s.is_anonymous,false)
FROM _imp_auth_users s
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.id)
  AND s.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(s.email));

-- 2) auth.identities
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
)
SELECT
  COALESCE(s.provider_id, s.user_id::text), s.user_id,
  COALESCE(s.identity_data, jsonb_build_object('sub', s.user_id::text, 'email', s.email)),
  COALESCE(s.provider, 'email'),
  COALESCE(s.last_sign_in_at, s.created_at, now()),
  COALESCE(s.created_at, now()), COALESCE(s.updated_at, now()),
  COALESCE(s.id, gen_random_uuid())
FROM _imp_auth_identities s
WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.provider = COALESCE(s.provider,'email')
      AND i.provider_id = COALESCE(s.provider_id, s.user_id::text)
  );

-- 3) public.profiles with deduped username + phone
WITH phone_raw AS (
  SELECT DISTINCT ON (user_id) user_id, phone
  FROM _imp_coin_orders
  WHERE user_id IS NOT NULL AND phone IS NOT NULL AND phone <> ''
  ORDER BY user_id, created_at DESC NULLS LAST
),
phone_dedup AS (
  SELECT user_id, phone,
    ROW_NUMBER() OVER (PARTITION BY phone ORDER BY user_id) AS rn
  FROM phone_raw
),
phone_map AS (
  SELECT pd.user_id,
    CASE WHEN pd.rn = 1
         AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.phone = pd.phone AND p.user_id <> pd.user_id)
         THEN pd.phone ELSE NULL END AS phone
  FROM phone_dedup pd
),
ranked AS (
  SELECT ip.id, ip.username,
         ROW_NUMBER() OVER (PARTITION BY lower(ip.username) ORDER BY ip.created_at NULLS LAST, ip.id) AS rn
  FROM _imp_profiles ip
  WHERE ip.username IS NOT NULL AND ip.username <> ''
),
final_username AS (
  SELECT id,
    CASE WHEN rn = 1
         AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(ranked.username) AND p.user_id <> ranked.id)
         THEN username
         ELSE username || '_' || substr(id::text, 1, 6)
    END AS username
  FROM ranked
)
INSERT INTO public.profiles (user_id, email, phone, username, created_at, updated_at)
SELECT
  ip.id, au.email, pm.phone, fu.username,
  COALESCE(ip.created_at, now()), COALESCE(ip.updated_at, now())
FROM _imp_profiles ip
JOIN auth.users au ON au.id = ip.id
LEFT JOIN phone_map pm ON pm.user_id = ip.id
LEFT JOIN final_username fu ON fu.id = ip.id
ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
      username = COALESCE(public.profiles.username, EXCLUDED.username),
      updated_at = now();

-- 4) coin_balances
INSERT INTO public.coin_balances (user_id, balance, updated_at)
SELECT b.user_id, COALESCE(b.balance,0), COALESCE(b.updated_at, now())
FROM _imp_coin_balances b
WHERE b.user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = b.user_id)
ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = now();

-- 5) coin_transactions
INSERT INTO public.coin_transactions (id, user_id, delta, reason, meta, created_at, related_order_id)
SELECT
  COALESCE(t.id, gen_random_uuid()), t.user_id,
  COALESCE(t.amount, 0), COALESCE(t.type, 'legacy'),
  jsonb_build_object('legacy_description', COALESCE(t.description,'')),
  COALESCE(t.created_at, now()), t.reference_id
FROM _imp_coin_transactions t
WHERE t.user_id IS NOT NULL
  AND COALESCE(t.amount,0) <> 0
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
ON CONFLICT (id) DO NOTHING;

-- 6) Drop staging
DROP TABLE IF EXISTS _imp_auth_identities;
DROP TABLE IF EXISTS _imp_auth_users;
DROP TABLE IF EXISTS _imp_profiles;
DROP TABLE IF EXISTS _imp_coin_balances;
DROP TABLE IF EXISTS _imp_coin_transactions;
DROP TABLE IF EXISTS _imp_coin_orders;