import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/contexts/LanguageContext";
import LocalServicePage from "@/pages/LocalServicePage";
import ServiceDetail from "@/pages/ServiceDetail";

const seoState = vi.hoisted(() => ({
  value: {
    title: "Custom service SEO title",
    description: "Custom service SEO description for search engines.",
    socialTitle: "Custom social service title",
    socialDescription: "Custom social service description.",
    image: "https://example.com/custom-service.jpg",
    canonicalUrl: "https://klinikawfa.com/services/rawatan-umum/",
    noIndex: true,
    noFollow: true,
  },
}));

vi.mock("@/features/website-cms/service-seo/useServiceSeoMetadata", () => ({
  useServiceSeoMetadata: () => seoState.value,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      id: "service-1",
      slug: "rawatan-am",
      title: "Rawatan Am",
      description: "<p>Rawatan untuk keluarga.</p>",
      services_list: ["Pemeriksaan"],
      call_to_action: "Buat Temujanji",
      title_ms: "Rawatan Am",
      description_ms: "<p>Rawatan untuk keluarga.</p>",
      call_to_action_ms: "Buat Temujanji",
      services_list_ms: ["Pemeriksaan"],
      hero_image_url: "https://example.com/service.jpg",
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  seoState.value.canonicalUrl = "https://klinikawfa.com/services/rawatan-umum/";
});

function expectPublishedMetadata() {
  expect(document.title).toBe("Custom service SEO title | Klinik Awfa");
  expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute("content", seoState.value.description);
  expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  expect(document.head.querySelector('meta[property="og:title"]')).toHaveAttribute("content", seoState.value.socialTitle);
  expect(document.head.querySelector('meta[property="og:description"]')).toHaveAttribute("content", seoState.value.socialDescription);
  expect(document.head.querySelector('meta[property="og:image"]')).toHaveAttribute("content", seoState.value.image);
}

describe("published service SEO runtime", () => {
  it("applies published metadata and schema without replacing category page copy", async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/services/rawatan-umum"]}>
          <LanguageProvider>
            <Routes><Route path="/services/:slug" element={<ServiceDetail />} /></Routes>
          </LanguageProvider>
        </MemoryRouter>
      </HelmetProvider>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Rawatan Am" })).toBeInTheDocument();
    await waitFor(() => {
      expectPublishedMetadata();
      const schemas = Array.from(document.head.querySelectorAll('script[type="application/ld+json"]'))
        .map((script) => JSON.parse(script.textContent || "{}"));
      expect(schemas).toEqual(expect.arrayContaining([
        expect.objectContaining({ "@type": "WebPage", name: seoState.value.title, description: seoState.value.description }),
        expect.objectContaining({ "@type": "Service", name: seoState.value.title, description: seoState.value.description }),
      ]));
    });
  });

  it("applies published metadata without replacing local landing-page copy", async () => {
    seoState.value.canonicalUrl = "https://klinikawfa.com/services/sunat-kuantan/";
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/services/sunat-kuantan"]}>
          <LanguageProvider>
            <Routes><Route path="/services/sunat-kuantan" element={<LocalServicePage slug="sunat-kuantan" />} /></Routes>
          </LanguageProvider>
        </MemoryRouter>
      </HelmetProvider>,
    );

    expect(screen.getByRole("heading", { level: 1, name: /sunat di kuantan/i })).toBeInTheDocument();
    await waitFor(expectPublishedMetadata);
  });
});
