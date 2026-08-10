import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const { HttpError } = await import("../_shared/auth-helpers.ts");
const {
  parseGeneratedServiceSeo,
  validateServiceSeoRequest,
} = await import("../generate-service-seo/validation.ts");

Deno.test("service SEO request validation accepts bounded public page context", () => {
  const result = validateServiceSeoRequest({
    path: "/services/sunat-kuantan/",
    titleMs: "Sunat Kuantan",
    titleEn: "Circumcision in Kuantan",
    focusPhraseMs: "sunat kanak-kanak kuantan",
    focusPhraseEn: "child circumcision Kuantan",
    contentMs: "Maklumat halaman perkhidmatan yang diterbitkan.",
  });
  assertEquals(result.path, "/services/sunat-kuantan/");
  assertEquals(result.focusPhraseMs, "sunat kanak-kanak kuantan");
  assertEquals(result.contentMs, "Maklumat halaman perkhidmatan yang diterbitkan.");
});

Deno.test("service SEO request validation accepts optional empty focus phrases", () => {
  const result = validateServiceSeoRequest({
    path: "/services/rawatan-umum/",
    titleMs: "Rawatan Umum",
    titleEn: "General Treatment",
    focusPhraseMs: "",
    focusPhraseEn: "",
  });
  assertEquals(result.focusPhraseMs, "");
  assertEquals(result.focusPhraseEn, "");
});

Deno.test("service SEO request validation rejects unknown pages and oversized input", () => {
  for (const input of [
    null,
    { path: "/services/khatan/", titleMs: "Khatan", titleEn: "Circumcision" },
    { path: "/services/sunat-kuantan/", titleMs: "x".repeat(201), titleEn: "Circumcision" },
    { path: "/services/sunat-kuantan/", titleMs: "Sunat", titleEn: "Circumcision", focusPhraseMs: "", focusPhraseEn: "", contentMs: "x".repeat(20_001) },
  ]) {
    let caught: unknown;
    try {
      validateServiceSeoRequest(input);
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof HttpError);
    assertEquals((caught as InstanceType<typeof HttpError>).status, 400);
  }
});

Deno.test("generated service SEO validation rejects malformed or incomplete provider output", () => {
  for (const content of [
    "not json",
    JSON.stringify({ ms: { title: "Only a title" }, en: {} }),
    JSON.stringify({
      ms: { title: "x".repeat(121), description: "d", socialTitle: "s", socialDescription: "sd" },
      en: { title: "t", description: "d", socialTitle: "s", socialDescription: "sd" },
    }),
  ]) {
    let caught: unknown;
    try {
      parseGeneratedServiceSeo(content);
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof HttpError);
    assertEquals((caught as InstanceType<typeof HttpError>).status, 502);
  }
});

Deno.test("generated service SEO validation returns strict bilingual suggestions", () => {
  const payload = {
    ms: { title: "Sunat Kuantan", description: "Penilaian dan prosedur sunat.", socialTitle: "Sunat di Klinik Awfa", socialDescription: "Maklumat penjagaan sunat." },
    en: { title: "Circumcision Kuantan", description: "Circumcision assessment and care.", socialTitle: "Circumcision at Klinik Awfa", socialDescription: "Learn about circumcision care." },
  };
  assertEquals(parseGeneratedServiceSeo(JSON.stringify(payload)), payload);
});
