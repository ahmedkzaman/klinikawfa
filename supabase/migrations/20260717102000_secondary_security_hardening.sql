-- Close the remaining high-impact access paths reported by the fresh
-- 2026-07-17 security scan. This migration changes access control only.

BEGIN;

DO $preflight$
DECLARE
  actual_final text[];
  actual_old text[];
  expected_final text[] := ARRAY[
    'public|client_invoice_items|Finance staff can read client invoice items|{authenticated}|PERMISSIVE|SELECT|is_staff_or_adminauth.uid|',
    'public|diagnoses|Authenticated can read active diagnoses|{authenticated}|PERMISSIVE|SELECT|coalesceis_active,true=trueandcoalescestatus,''active''::text=''active''::text|',
    'public|diagnoses|Operations can read all diagnoses|{authenticated}|PERMISSIVE|SELECT|is_ops_or_adminauth.uid|',
    'public|einvoices|Operations can read einvoices|{authenticated}|PERMISSIVE|SELECT|is_ops_or_adminauth.uid|',
    'public|panel_price_overrides|Operations can read panel price overrides|{authenticated}|PERMISSIVE|SELECT|is_ops_or_adminauth.uid|',
    'public|queue_entries|Internal staff can update active queue entries|{authenticated}|PERMISSIVE|UPDATE|deleted_atisnullandis_internal_staffauth.uid|deleted_atisnullandis_internal_staffauth.uid',
    'realtime|messages|Authorized staff can receive realtime|{authenticated}|PERMISSIVE|SELECT|is_staff_or_clinicalauth.uidandrealtime.topic!~~''video-room-%''::textoris_staff_or_adminauth.uidandexistsselect1fromvideo_roomsvrwherevr.room_code=uppersubstrrealtime.topic,12|',
    'realtime|messages|Authorized staff can send realtime|{authenticated}|PERMISSIVE|INSERT||is_staff_or_clinicalauth.uidandrealtime.topic!~~''video-room-%''::textoris_staff_or_adminauth.uidandexistsselect1fromvideo_roomsvrwherevr.room_code=uppersubstrrealtime.topic,12',
    'realtime|messages|Room holder can receive video realtime|{anon}|PERMISSIVE|SELECT|realtime.topic~~''video-room-%''::textandexistsselect1fromvideo_roomsvrwherevr.room_code=uppersubstrrealtime.topic,12|',
    'realtime|messages|Room holder can send video realtime|{anon}|PERMISSIVE|INSERT||realtime.topic~~''video-room-%''::textandexistsselect1fromvideo_roomsvrwherevr.room_code=uppersubstrrealtime.topic,12'
  ];
  expected_old text[] := ARRAY[
    'public|client_invoice_items|client_invoice_items_auth_select|{authenticated}|PERMISSIVE|SELECT|true|',
    'public|diagnoses|Allow public read active diagnoses|{anon,authenticated}|PERMISSIVE|SELECT|coalesceis_active,true=trueandcoalescestatus,''active''::text=''active''::text|',
    'public|diagnoses|Authenticated can read diagnoses|{authenticated}|PERMISSIVE|SELECT|true|',
    'public|einvoices|Authenticated can read einvoices|{authenticated}|PERMISSIVE|SELECT|true|',
    'public|panel_price_overrides|panel_price_overrides_read|{authenticated}|PERMISSIVE|SELECT|true|'
  ];
  bad_count integer;
  invoker_count integer;
BEGIN
  SELECT array_agg(
      schemaname || '|' || tablename || '|' || policyname || '|' || roles::text || '|' ||
      permissive || '|' || cmd || '|' ||
      regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g') || '|' ||
      regexp_replace(lower(coalesce(with_check,'')), '[[:space:]()]', '', 'g')
      ORDER BY schemaname, tablename, policyname
    ) INTO actual_final
  FROM pg_policies
  WHERE (schemaname, tablename, policyname) IN (
    ('public','queue_entries','Internal staff can update active queue entries'),
    ('public','einvoices','Operations can read einvoices'),
    ('public','panel_price_overrides','Operations can read panel price overrides'),
    ('public','client_invoice_items','Finance staff can read client invoice items'),
    ('public','diagnoses','Authenticated can read active diagnoses'),
    ('public','diagnoses','Operations can read all diagnoses'),
    ('realtime','messages','Authorized staff can receive realtime'),
    ('realtime','messages','Authorized staff can send realtime'),
    ('realtime','messages','Room holder can receive video realtime'),
    ('realtime','messages','Room holder can send video realtime')
  );

  SELECT count(*) INTO invoker_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('inventory_items_safe','packages_safe','services_safe','v_seasonal_diagnosis_trends')
    AND 'security_invoker=true' = ANY (c.reloptions);

  IF actual_final IS DISTINCT FROM expected_final THEN
    -- A partial or drifted final inventory is never accepted.
    IF actual_final IS NOT NULL THEN
      RAISE EXCEPTION 'secondary hardening preflight failed: final policy inventory drifted: %', actual_final;
    END IF;

    SELECT array_agg(
        schemaname || '|' || tablename || '|' || policyname || '|' || roles::text || '|' ||
        permissive || '|' || cmd || '|' ||
        regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g') || '|' ||
        regexp_replace(lower(coalesce(with_check,'')), '[[:space:]()]', '', 'g')
        ORDER BY schemaname, tablename, policyname
      ) INTO actual_old
    FROM pg_policies
    WHERE (schemaname, tablename, policyname) IN (
      ('public','einvoices','Authenticated can read einvoices'),
      ('public','panel_price_overrides','panel_price_overrides_read'),
      ('public','client_invoice_items','client_invoice_items_auth_select'),
      ('public','diagnoses','Authenticated can read diagnoses'),
      ('public','diagnoses','Allow public read active diagnoses')
    );

    IF actual_old IS DISTINCT FROM expected_old THEN
      RAISE EXCEPTION 'secondary hardening preflight failed: baseline policy inventory drifted: %', actual_old;
    END IF;

    -- These two out-of-band production findings may be absent from a
    -- sanitized staging clone. If present, their definitions must match the
    -- captured production baseline exactly before replacement.
    SELECT count(*) INTO bad_count
    FROM pg_policies p
    WHERE (p.schemaname, p.tablename, p.policyname) IN (
      ('public','queue_entries','Staff can update queue entries'),
      ('realtime','messages','Authenticated users can use realtime')
    )
    AND NOT (
      p.cmd = CASE WHEN p.schemaname='public' THEN 'UPDATE' ELSE 'SELECT' END
      AND (CASE WHEN p.schemaname='public' THEN 'public' ELSE 'authenticated' END) = ANY (p.roles::text[])
      AND regexp_replace(lower(coalesce(p.qual,'')), '[[:space:]()]', '', 'g') =
        CASE WHEN p.schemaname='public'
          THEN regexp_replace(lower('(( SELECT profiles."position" FROM profiles WHERE (profiles.id = auth.uid())) <> ''locum''::text)'), '[[:space:]()]', '', 'g')
          ELSE 'true'
        END
      AND coalesce(p.with_check, '') = ''
    );
    IF bad_count <> 0 THEN
      RAISE EXCEPTION 'secondary hardening preflight failed: optional production policy drifted';
    END IF;
  ELSE
    -- The exact final state is accepted for safe replay after a manual apply.
    SELECT count(*) INTO bad_count
    FROM pg_policies
    WHERE (schemaname, tablename, policyname) IN (
      ('public','queue_entries','Staff can update queue entries'),
      ('public','einvoices','Authenticated can read einvoices'),
      ('public','panel_price_overrides','panel_price_overrides_read'),
      ('public','client_invoice_items','client_invoice_items_auth_select'),
      ('public','diagnoses','Authenticated can read diagnoses'),
      ('public','diagnoses','Allow public read active diagnoses'),
      ('realtime','messages','Authenticated users can use realtime')
    );
    IF bad_count <> 0 OR invoker_count <> 4 THEN
      RAISE EXCEPTION 'secondary hardening preflight failed: final state mixed with old policies or view drift (old=% invoker=%)',
        bad_count, invoker_count;
    END IF;
  END IF;
END
$preflight$;

DROP POLICY IF EXISTS "Staff can update queue entries" ON public.queue_entries;
DROP POLICY IF EXISTS "Internal staff can update active queue entries" ON public.queue_entries;
CREATE POLICY "Internal staff can update active queue entries"
  ON public.queue_entries FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.is_internal_staff(auth.uid()))
  WITH CHECK (deleted_at IS NULL AND public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read einvoices" ON public.einvoices;
DROP POLICY IF EXISTS "Operations can read einvoices" ON public.einvoices;
CREATE POLICY "Operations can read einvoices"
  ON public.einvoices FOR SELECT TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

DROP POLICY IF EXISTS "panel_price_overrides_read" ON public.panel_price_overrides;
DROP POLICY IF EXISTS "Operations can read panel price overrides" ON public.panel_price_overrides;
CREATE POLICY "Operations can read panel price overrides"
  ON public.panel_price_overrides FOR SELECT TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

DROP POLICY IF EXISTS "client_invoice_items_auth_select" ON public.client_invoice_items;
DROP POLICY IF EXISTS "Finance staff can read client invoice items" ON public.client_invoice_items;
CREATE POLICY "Finance staff can read client invoice items"
  ON public.client_invoice_items FOR SELECT TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Allow public read active diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Authenticated can read active diagnoses" ON public.diagnoses;
DROP POLICY IF EXISTS "Operations can read all diagnoses" ON public.diagnoses;
CREATE POLICY "Authenticated can read active diagnoses"
  ON public.diagnoses FOR SELECT TO authenticated
  USING (COALESCE(is_active, true) = true AND COALESCE(status, 'active') = 'active');
CREATE POLICY "Operations can read all diagnoses"
  ON public.diagnoses FOR SELECT TO authenticated
  USING (public.is_ops_or_admin(auth.uid()));

ALTER VIEW public.inventory_items_safe SET (security_invoker = true);
ALTER VIEW public.packages_safe SET (security_invoker = true);
ALTER VIEW public.services_safe SET (security_invoker = true);
ALTER VIEW public.v_seasonal_diagnosis_trends SET (security_invoker = true);

DROP POLICY IF EXISTS "Authenticated users can use realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authorized staff can receive realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authorized staff can send realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Room holder can receive video realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Room holder can send video realtime" ON realtime.messages;

CREATE POLICY "Authorized staff can receive realtime"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    public.is_staff_or_clinical(auth.uid())
    AND (
      realtime.topic() NOT LIKE 'video-room-%'
      OR (
        public.is_staff_or_admin(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.video_rooms vr
          WHERE vr.room_code = upper(substr(realtime.topic(), 12))
        )
      )
    )
  );

CREATE POLICY "Authorized staff can send realtime"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff_or_clinical(auth.uid())
    AND (
      realtime.topic() NOT LIKE 'video-room-%'
      OR (
        public.is_staff_or_admin(auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.video_rooms vr
          WHERE vr.room_code = upper(substr(realtime.topic(), 12))
        )
      )
    )
  );

-- A video room code is the anonymous patient's capability. Codes are generated
-- from 32 symbols with cryptographic randomness; a matching live row is also
-- required. Staff access above remains role-gated.
CREATE POLICY "Room holder can receive video realtime"
  ON realtime.messages FOR SELECT TO anon
  USING (
    realtime.topic() LIKE 'video-room-%'
    AND EXISTS (
      SELECT 1 FROM public.video_rooms vr
      WHERE vr.room_code = upper(substr(realtime.topic(), 12))
    )
  );

CREATE POLICY "Room holder can send video realtime"
  ON realtime.messages FOR INSERT TO anon
  WITH CHECK (
    realtime.topic() LIKE 'video-room-%'
    AND EXISTS (
      SELECT 1 FROM public.video_rooms vr
      WHERE vr.room_code = upper(substr(realtime.topic(), 12))
    )
  );

DO $postflight$
DECLARE
  unsafe_count integer;
  invoker_count integer;
  actual text[];
  expected text[] := ARRAY[
    'public|client_invoice_items|Finance staff can read client invoice items|{authenticated}|PERMISSIVE|SELECT|is_staff_or_adminauth.uid|',
    'public|diagnoses|Authenticated can read active diagnoses|{authenticated}|PERMISSIVE|SELECT|coalesceis_active,true=trueandcoalescestatus,''active''::text=''active''::text|',
    'public|diagnoses|Operations can read all diagnoses|{authenticated}|PERMISSIVE|SELECT|is_ops_or_adminauth.uid|',
    'public|einvoices|Operations can read einvoices|{authenticated}|PERMISSIVE|SELECT|is_ops_or_adminauth.uid|',
    'public|panel_price_overrides|Operations can read panel price overrides|{authenticated}|PERMISSIVE|SELECT|is_ops_or_adminauth.uid|',
    'public|queue_entries|Internal staff can update active queue entries|{authenticated}|PERMISSIVE|UPDATE|deleted_atisnullandis_internal_staffauth.uid|deleted_atisnullandis_internal_staffauth.uid',
    'realtime|messages|Authorized staff can receive realtime|{authenticated}|PERMISSIVE|SELECT|is_staff_or_clinicalauth.uidandrealtime.topic!~~''video-room-%''::textoris_staff_or_adminauth.uidandexistsselect1fromvideo_roomsvrwherevr.room_code=uppersubstrrealtime.topic,12|',
    'realtime|messages|Authorized staff can send realtime|{authenticated}|PERMISSIVE|INSERT||is_staff_or_clinicalauth.uidandrealtime.topic!~~''video-room-%''::textoris_staff_or_adminauth.uidandexistsselect1fromvideo_roomsvrwherevr.room_code=uppersubstrrealtime.topic,12',
    'realtime|messages|Room holder can receive video realtime|{anon}|PERMISSIVE|SELECT|realtime.topic~~''video-room-%''::textandexistsselect1fromvideo_roomsvrwherevr.room_code=uppersubstrrealtime.topic,12|',
    'realtime|messages|Room holder can send video realtime|{anon}|PERMISSIVE|INSERT||realtime.topic~~''video-room-%''::textandexistsselect1fromvideo_roomsvrwherevr.room_code=uppersubstrrealtime.topic,12'
  ];
BEGIN
  SELECT count(*) INTO unsafe_count
  FROM pg_policies
  WHERE (
      schemaname = 'public'
      AND tablename IN ('queue_entries','einvoices','panel_price_overrides','client_invoice_items','diagnoses')
      AND policyname IN (
        'Staff can update queue entries','Authenticated can read einvoices',
        'panel_price_overrides_read','client_invoice_items_auth_select',
        'Authenticated can read diagnoses','Allow public read active diagnoses'
      )
    )
    OR (
      schemaname = 'realtime' AND tablename = 'messages'
      AND regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g') = 'true'
    );

  SELECT array_agg(
      schemaname || '|' || tablename || '|' || policyname || '|' || roles::text || '|' ||
      permissive || '|' || cmd || '|' ||
      regexp_replace(lower(coalesce(qual,'')), '[[:space:]()]', '', 'g') || '|' ||
      regexp_replace(lower(coalesce(with_check,'')), '[[:space:]()]', '', 'g')
      ORDER BY schemaname, tablename, policyname
    ) INTO actual
  FROM pg_policies
  WHERE (schemaname, tablename, policyname) IN (
    ('public','queue_entries','Internal staff can update active queue entries'),
    ('public','einvoices','Operations can read einvoices'),
    ('public','panel_price_overrides','Operations can read panel price overrides'),
    ('public','client_invoice_items','Finance staff can read client invoice items'),
    ('public','diagnoses','Authenticated can read active diagnoses'),
    ('public','diagnoses','Operations can read all diagnoses'),
    ('realtime','messages','Authorized staff can receive realtime'),
    ('realtime','messages','Authorized staff can send realtime'),
    ('realtime','messages','Room holder can receive video realtime'),
    ('realtime','messages','Room holder can send video realtime')
  );

  SELECT count(*) INTO invoker_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('inventory_items_safe','packages_safe','services_safe','v_seasonal_diagnosis_trends')
    AND 'security_invoker=true' = ANY (c.reloptions);

  IF unsafe_count <> 0 OR actual IS DISTINCT FROM expected OR invoker_count <> 4 THEN
    RAISE EXCEPTION 'secondary hardening postflight failed: unsafe=% policies=% invoker_views=%',
      unsafe_count, actual, invoker_count;
  END IF;
END
$postflight$;

COMMIT;
