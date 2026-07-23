-- Add strict, optional grid-layout validation without rewriting existing content.
ALTER FUNCTION private.website_page_payload_is_valid(text, jsonb)
  RENAME TO website_page_payload_without_layout_is_valid;

REVOKE ALL ON FUNCTION private.website_page_payload_without_layout_is_valid(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.website_page_payload_without_layout_is_valid(text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.website_layout_is_valid(
  p_kind text,
  p_layout jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $validator$
DECLARE
  v_block_count integer;
BEGIN
  IF jsonb_typeof(p_layout) <> 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_layout) key)
        IS DISTINCT FROM ARRAY['blocks', 'version']::text[]
     OR jsonb_typeof(p_layout->'version') <> 'number'
     OR (p_layout->>'version')::numeric <> 1
     OR jsonb_typeof(p_layout->'blocks') <> 'array'
  THEN
    RETURN false;
  END IF;

  v_block_count := jsonb_array_length(p_layout->'blocks');
  IF v_block_count < 1 OR v_block_count > 50 THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_layout->'blocks') AS entry(block)
    WHERE jsonb_typeof(block) <> 'object'
       OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(block) key)
          IS DISTINCT FROM ARRAY['contentRef', 'desktop', 'hidden', 'id', 'kind', 'order']::text[]
       OR jsonb_typeof(block->'id') <> 'string'
       OR block->>'id' !~ '^[a-z0-9]+(?:[-_:][a-z0-9]+)*$'
       OR length(block->>'id') > 80
       OR jsonb_typeof(block->'contentRef') <> 'string'
       OR block->>'contentRef' !~ '^[a-z0-9]+(?:[-_:][a-z0-9]+)*$'
       OR length(block->>'contentRef') > 80
       OR jsonb_typeof(block->'kind') <> 'string'
       OR CASE
            WHEN p_kind = 'home' THEN block->>'kind' <> ALL (ARRAY['hero','why','video','services','gallery','testimonials','map'])
            WHEN p_kind IN ('content', 'system_content') THEN block->>'kind' <> ALL (ARRAY['title','hero','body','media','cta'])
            ELSE true
          END
       OR jsonb_typeof(block->'order') <> 'number'
       OR (block->>'order')::numeric <> trunc((block->>'order')::numeric)
       OR (block->>'order')::integer < 0
       OR (block->>'order')::integer >= v_block_count
       OR jsonb_typeof(block->'hidden') <> 'boolean'
       OR jsonb_typeof(block->'desktop') <> 'object'
       OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(block->'desktop') key)
          IS DISTINCT FROM ARRAY['column', 'height', 'row', 'width']::text[]
       OR EXISTS (
         SELECT 1
         FROM (VALUES ('column', 1, 12), ('width', 1, 12), ('row', 1, 100), ('height', 1, 24))
           AS limit_value(field, minimum_value, maximum_value)
         WHERE jsonb_typeof(block->'desktop'->field) <> 'number'
            OR (block->'desktop'->>field)::numeric <> trunc((block->'desktop'->>field)::numeric)
            OR (block->'desktop'->>field)::integer NOT BETWEEN minimum_value AND maximum_value
       )
       OR (block->'desktop'->>'column')::integer
          + (block->'desktop'->>'width')::integer - 1 > 12
  ) THEN
    RETURN false;
  END IF;

  IF (SELECT count(DISTINCT block->>'id') FROM jsonb_array_elements(p_layout->'blocks') entry(block)) <> v_block_count
     OR (SELECT count(DISTINCT block->>'contentRef') FROM jsonb_array_elements(p_layout->'blocks') entry(block)) <> v_block_count
     OR (SELECT count(DISTINCT (block->>'order')::integer) FROM jsonb_array_elements(p_layout->'blocks') entry(block)) <> v_block_count
     OR EXISTS (
       SELECT expected_order
       FROM generate_series(0, v_block_count - 1) expected_order
       EXCEPT
       SELECT (block->>'order')::integer
       FROM jsonb_array_elements(p_layout->'blocks') entry(block)
     )
  THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT ordinality, (block->'desktop'->>'column')::integer a_column,
             (block->'desktop'->>'width')::integer a_width,
             (block->'desktop'->>'row')::integer a_row,
             (block->'desktop'->>'height')::integer a_height
      FROM jsonb_array_elements(p_layout->'blocks') WITH ORDINALITY entry(block, ordinality)
    ) a
    JOIN (
      SELECT ordinality, (block->'desktop'->>'column')::integer b_column,
             (block->'desktop'->>'width')::integer b_width,
             (block->'desktop'->>'row')::integer b_row,
             (block->'desktop'->>'height')::integer b_height
      FROM jsonb_array_elements(p_layout->'blocks') WITH ORDINALITY entry(block, ordinality)
    ) b ON a.ordinality < b.ordinality
    WHERE a.a_column < b.b_column + b.b_width
      AND b.b_column < a.a_column + a.a_width
      AND a.a_row < b.b_row + b.b_height
      AND b.b_row < a.a_row + a.a_height
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$validator$;

REVOKE ALL ON FUNCTION private.website_layout_is_valid(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.website_layout_is_valid(text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.website_page_payload_is_valid(
  p_kind text,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $validator$
  SELECT private.website_page_payload_without_layout_is_valid(
           p_kind,
           p_payload - 'layout'
         )
     AND (
       NOT (p_payload ? 'layout')
       OR private.website_layout_is_valid(p_kind, p_payload->'layout')
     );
$validator$;

REVOKE ALL ON FUNCTION private.website_page_payload_is_valid(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.website_page_payload_is_valid(text, jsonb)
  TO authenticated;
