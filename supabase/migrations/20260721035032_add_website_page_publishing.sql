CREATE EXTENSION IF NOT EXISTS pg_jsonschema WITH SCHEMA extensions;

ALTER TABLE public.website_page_drafts
ADD COLUMN publish_requested_at timestamptz;

GRANT UPDATE (publish_requested_at)
  ON TABLE public.website_page_drafts TO authenticated;

CREATE OR REPLACE FUNCTION private.website_page_payload_is_valid(
  p_kind text,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $validator$
BEGIN
  CASE
    WHEN p_kind = 'home' THEN
      RETURN extensions.jsonb_matches_schema(
        $home_schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","additionalProperties":false,"required":["hero","why","video","services","gallery","testimonials","map","seo","sectionOrder"],"properties":{"hero":{"type":"object","additionalProperties":false,"required":["backgroundImage","backgroundAlt","backgroundOpacity","autoplayMs","slides","ctas","carouselLabels"],"properties":{"backgroundImage":{"type":"string","minLength":1,"maxLength":2048,"anyOf":[{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$"},{"pattern":"^https?://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?:/(?:[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^mailto:[A-Za-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},{"pattern":"^tel:\\+?[0-9][0-9-]{0,30}$"},{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/)*[A-Za-z0-9][A-Za-z0-9_.-]{0,191}\\.(?:avif|gif|jpe?g|png|svg|webp)$"}]},"backgroundAlt":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string"},"en":{"type":"string","default":""}}},"backgroundOpacity":{"type":"number","minimum":5,"maximum":25},"autoplayMs":{"type":"integer","minimum":3000,"maximum":15000},"slides":{"type":"array","minItems":1,"maxItems":12,"items":{"type":"object","additionalProperties":false,"required":["title","subtitle"],"properties":{"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"subtitle":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}}}}},"ctas":{"type":"array","minItems":1,"maxItems":12,"items":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"href":{"type":"string","minLength":1,"maxLength":2048,"anyOf":[{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$"},{"pattern":"^https?://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?:/(?:[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^mailto:[A-Za-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},{"pattern":"^tel:\\+?[0-9][0-9-]{0,30}$"}]}}}},"carouselLabels":{"type":"object","additionalProperties":false,"required":["previous","next","goTo"],"properties":{"previous":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"next":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"goTo":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}}}}}},"why":{"type":"object","additionalProperties":false,"required":["eyebrow","title","description","items"],"properties":{"eyebrow":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"description":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"items":{"type":"array","minItems":1,"maxItems":12,"items":{"type":"object","additionalProperties":false,"required":["icon","title","description"],"properties":{"icon":{"enum":["clock","sofa","users","user-check","scissors","ear"]},"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"description":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}}}}}}},"video":{"type":"object","additionalProperties":false,"required":["eyebrow","title","description","placeholder","unsupportedMessage","videoUrlSettingKey","posterSettingKey"],"properties":{"eyebrow":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"description":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"placeholder":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"unsupportedMessage":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"videoUrlSettingKey":{"enum":["homepage_video_url"]},"posterSettingKey":{"enum":["homepage_video_poster"]}}},"services":{"type":"object","additionalProperties":false,"required":["eyebrow","title","description","cta","learnMoreLabel","itemLimit"],"properties":{"eyebrow":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"description":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"cta":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"href":{"type":"string","minLength":1,"maxLength":2048,"anyOf":[{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$"},{"pattern":"^https?://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?:/(?:[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^mailto:[A-Za-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},{"pattern":"^tel:\\+?[0-9][0-9-]{0,30}$"}]}}},"learnMoreLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"itemLimit":{"type":"integer","minimum":1,"maximum":12}}},"gallery":{"type":"object","additionalProperties":false,"required":["eyebrow","title","description","cta","emptyMessage","moreLabel","carouselLabels","closeLabel","previousLabel","nextLabel","swipeHint","itemLimit"],"properties":{"eyebrow":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"description":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"cta":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"href":{"type":"string","minLength":1,"maxLength":2048,"anyOf":[{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$"},{"pattern":"^https?://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?:/(?:[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^mailto:[A-Za-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},{"pattern":"^tel:\\+?[0-9][0-9-]{0,30}$"}]}}},"emptyMessage":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"moreLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"carouselLabels":{"type":"object","additionalProperties":false,"required":["previous","next","goTo"],"properties":{"previous":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"next":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"goTo":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}}}},"closeLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"previousLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"nextLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"swipeHint":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"itemLimit":{"type":"integer","minimum":1,"maximum":12}}},"testimonials":{"type":"object","additionalProperties":false,"required":["eyebrow","title","description","patientLabel","goToSlideLabel","previousSlideLabel","nextSlideLabel","carouselRoleDescription","slideRoleDescription"],"properties":{"eyebrow":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"description":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"patientLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"goToSlideLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"previousSlideLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"nextSlideLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"carouselRoleDescription":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"slideRoleDescription":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}}}},"map":{"type":"object","additionalProperties":false,"required":["eyebrow","title","description","hoursLabel","everydayLabel","callLabel","directionsCta","embedUrl","embedTitle"],"properties":{"eyebrow":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"description":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"hoursLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"everydayLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"callLabel":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"directionsCta":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"href":{"type":"string","minLength":1,"maxLength":2048,"anyOf":[{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$"},{"pattern":"^https?://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?:/(?:[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^mailto:[A-Za-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},{"pattern":"^tel:\\+?[0-9][0-9-]{0,30}$"}]}}},"embedUrl":{"type":"string","minLength":1,"maxLength":2048,"anyOf":[{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$"},{"pattern":"^https?://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?:/(?:[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^mailto:[A-Za-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},{"pattern":"^tel:\\+?[0-9][0-9-]{0,30}$"},{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/)*[A-Za-z0-9][A-Za-z0-9_.-]{0,191}\\.(?:avif|gif|jpe?g|png|svg|webp)$"}]},"embedTitle":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}}}},"seo":{"type":"object","additionalProperties":false,"required":["title","description"],"properties":{"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"description":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}}}},"sectionOrder":{"type":"array","minItems":1,"maxItems":7,"uniqueItems":true,"items":{"enum":["hero","why","video","services","gallery","testimonials","map"]}}}}$home_schema$::json,
        p_payload
      );
    WHEN p_kind IN ('system_content', 'content') THEN
      RETURN extensions.jsonb_matches_schema(
        $general_schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","additionalProperties":false,"required":["title","heroImage","heroAlt","body","media","cta","seo"],"properties":{"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"heroImage":{"anyOf":[{"type":"string","minLength":1,"maxLength":2048,"anyOf":[{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$"},{"pattern":"^https?://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?:/(?:[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^mailto:[A-Za-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},{"pattern":"^tel:\\+?[0-9][0-9-]{0,30}$"},{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/)*[A-Za-z0-9][A-Za-z0-9_.-]{0,191}\\.(?:avif|gif|jpe?g|png|svg|webp)$"}]},{"type":"null"}]},"heroAlt":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string"},"en":{"type":"string","default":""}}},"body":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"media":{"type":"array","maxItems":12,"items":{"type":"object","additionalProperties":false,"required":["type","url","alt"],"properties":{"type":{"enum":["image","video"]},"url":{"type":"string","minLength":1,"maxLength":2048,"anyOf":[{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$"},{"pattern":"^https?://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?:/(?:[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^mailto:[A-Za-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},{"pattern":"^tel:\\+?[0-9][0-9-]{0,30}$"},{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*/)*[A-Za-z0-9][A-Za-z0-9_.-]{0,191}\\.(?:avif|gif|jpe?g|png|svg|webp)$"}]},"alt":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string"},"en":{"type":"string","default":""}}}}}},"cta":{"anyOf":[{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"href":{"allOf":[{"type":"string","minLength":1,"maxLength":2048,"anyOf":[{"pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^#[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$"},{"pattern":"^https?://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?:/(?:[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?)?(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^mailto:[A-Za-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},{"pattern":"^tel:\\+?[0-9][0-9-]{0,30}$"}]},{"not":{"anyOf":[{"pattern":"^/(?:auth|staff|clinic|editor|appointment|video-call|reset-password|locum-register|tv|api|functions|payment|payments|callback)(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"},{"pattern":"^https?://(?:www\\.)?klinikawfa\\.com/(?:[aA][uU][tT][hH]|[sS][tT][aA][fF][fF]|[cC][lL][iI][nN][iI][cC]|[eE][dD][iI][tT][oO][rR]|[aA][pP][pP][oO][iI][nN][tT][mM][eE][nN][tT]|[vV][iI][dD][eE][oO][--][cC][aA][lL][lL]|[rR][eE][sS][eE][tT][--][pP][aA][sS][sS][wW][oO][rR][dD]|[lL][oO][cC][uU][mM][--][rR][eE][gG][iI][sS][tT][eE][rR]|[tT][vV]|[aA][pP][iI]|[fF][uU][nN][cC][tT][iI][oO][nN][sS]|[pP][aA][yY][mM][eE][nN][tT]|[pP][aA][yY][mM][eE][nN][tT][sS]|[cC][aA][lL][lL][bB][aA][cC][kK])(?:/[A-Za-z0-9_~!$&'()*+,;=:@-][A-Za-z0-9._~!$&'()*+,;=:@-]*)*(?:\\?[A-Za-z0-9._~!$'()*,-=&]{0,256})?(?:#[A-Za-z0-9._~-]{0,128})?$"}]}}]}}},{"type":"null"}]},"seo":{"type":"object","additionalProperties":false,"required":["title","description"],"properties":{"title":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}},"description":{"type":"object","additionalProperties":false,"required":["ms"],"properties":{"ms":{"type":"string","pattern":"\\S"},"en":{"type":"string","default":""}}}}}}}$general_schema$::json,
        p_payload
      );
    ELSE
      RETURN false;
  END CASE;
END;
$validator$;

REVOKE ALL ON FUNCTION private.website_page_payload_is_valid(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.website_page_payload_is_valid(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION private.website_page_payload_is_valid(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.validate_website_page_draft_payload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $draft_validator$
DECLARE
  v_kind text;
BEGIN
  SELECT page.kind
  INTO v_kind
  FROM public.website_pages AS page
  WHERE page.id = NEW.page_id;

  IF NOT private.website_page_payload_is_valid(v_kind, NEW.draft_content) THEN
    RAISE EXCEPTION 'invalid website page draft payload'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$draft_validator$;

REVOKE ALL ON FUNCTION private.validate_website_page_draft_payload() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.validate_website_page_draft_payload() FROM anon, authenticated;

CREATE TRIGGER validate_website_page_draft_payload
BEFORE INSERT OR UPDATE OF draft_content ON public.website_page_drafts
FOR EACH ROW
EXECUTE FUNCTION private.validate_website_page_draft_payload();

CREATE OR REPLACE FUNCTION private.publish_website_page_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $publisher$
DECLARE
  v_page public.website_pages%ROWTYPE;
BEGIN
  IF NOT private.can_manage_website() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_page
  FROM public.website_pages
  WHERE id = NEW.page_id
  FOR UPDATE;

  IF NOT private.website_page_payload_is_valid(
    v_page.kind,
    NEW.draft_content
  ) THEN
    RAISE EXCEPTION 'invalid website page draft payload'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.base_revision <> v_page.revision THEN
    RAISE EXCEPTION 'stale website page draft' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.website_content_versions
    (resource_type, resource_id, revision, payload, published_by)
  VALUES
    ('page', v_page.id, v_page.revision, v_page.published_content, auth.uid());

  UPDATE public.website_pages
  SET published_content = NEW.draft_content,
      status = 'published',
      revision = revision + 1,
      published_at = now(),
      published_by = auth.uid(),
      updated_at = now()
  WHERE id = NEW.page_id;

  NEW.base_revision := v_page.revision + 1;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$publisher$;

REVOKE ALL ON FUNCTION private.publish_website_page_draft() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.publish_website_page_draft() FROM anon, authenticated;

CREATE TRIGGER publish_website_page_draft
BEFORE UPDATE OF publish_requested_at ON public.website_page_drafts
FOR EACH ROW
EXECUTE FUNCTION private.publish_website_page_draft();
