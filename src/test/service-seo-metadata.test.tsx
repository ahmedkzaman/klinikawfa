import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchPublishedServiceSeo: vi.fn() }));
vi.mock("@/features/website-cms/service-seo/api", () => api);

import { useServiceSeoMetadata } from "@/features/website-cms/service-seo/useServiceSeoMetadata";

const fallback = {
  title: "Fallback title",
  description: "Fallback description",
  socialTitle: "Fallback social title",
  socialDescription: "Fallback social description",
  image: "https://klinikawfa.com/fallback.webp",
  canonicalUrl: "https://klinikawfa.com/services/rawatan-telinga-kuantan/",
  noIndex: false,
  noFollow: false,
};

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("service SEO metadata resolver", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the selected language and falls back field-by-field", async () => {
    api.fetchPublishedServiceSeo.mockResolvedValue({
      id: "target",
      path: "/services/rawatan-telinga-kuantan/",
      revision: 2,
      publishedAt: "2026-08-10T10:00:00Z",
      seoMs: {
        title: "Rawatan Telinga Kuantan",
        description: "Pemeriksaan telinga di KotaSAS.",
        canonicalUrl: "",
        socialTitle: "",
        socialDescription: "",
        socialImageMediaId: null,
        index: true,
        follow: true,
      },
      seoEn: {
        title: "Ear Treatment in Kuantan",
        description: "",
        canonicalUrl: "",
        socialTitle: "Ear Care at Klinik Awfa",
        socialDescription: "",
        socialImageMediaId: null,
        index: true,
        follow: false,
      },
      imageMs: undefined,
      imageEn: undefined,
    });

    const { result } = renderHook(
      () => useServiceSeoMetadata("/services/rawatan-telinga-kuantan/", "en", fallback),
      { wrapper },
    );

    await waitFor(() => expect(result.current.title).toBe("Ear Treatment in Kuantan"));
    expect(result.current.description).toBe("Pemeriksaan telinga di KotaSAS.");
    expect(result.current.socialTitle).toBe("Ear Care at Klinik Awfa");
    expect(result.current.canonicalUrl).toBe("https://klinikawfa.com/services/rawatan-telinga-kuantan/");
    expect(result.current.noFollow).toBe(true);
  });

  it("preserves current metadata when the registry request fails", async () => {
    api.fetchPublishedServiceSeo.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(
      () => useServiceSeoMetadata("/services/rawatan-telinga-kuantan/", "ms", fallback),
      { wrapper },
    );
    await waitFor(() => expect(api.fetchPublishedServiceSeo).toHaveBeenCalled());
    expect(result.current).toEqual(fallback);
  });
});
