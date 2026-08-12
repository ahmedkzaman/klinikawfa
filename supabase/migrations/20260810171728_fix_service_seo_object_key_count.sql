begin;

-- PostgreSQL has jsonb_array_length(), but no jsonb_object_length(). Keep the
-- established publishing function intact and replace only the unsupported
-- top-level key-count expression in its stored definition.
do $$
declare
  v_definition text;
  v_invalid_expression constant text := 'jsonb_object_length(v_payload)';
  v_supported_expression constant text := '(select count(*) from pg_catalog.jsonb_object_keys(v_payload))';
begin
  select pg_catalog.pg_get_functiondef(
    'public.publish_service_seo(uuid, integer)'::pg_catalog.regprocedure
  ) into v_definition;

  if pg_catalog.strpos(v_definition, v_invalid_expression) > 0 then
    v_definition := pg_catalog.replace(
      v_definition,
      v_invalid_expression,
      v_supported_expression
    );
    execute v_definition;
  elsif pg_catalog.strpos(v_definition, v_supported_expression) = 0 then
    raise exception 'publish_service_seo definition was not recognized';
  end if;
end;
$$;

commit;
