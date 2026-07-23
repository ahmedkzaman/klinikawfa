import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeRenderer } from "@/components/home/HomeRenderer";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";

vi.stubGlobal(
  "IntersectionObserver",
  class IntersectionObserver {
    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  },
);

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
);

vi.mock("@/hooks/useGalleryImages", () => ({
  useGalleryImages: () => ({ allImages: [], isLoading: false }),
}));

vi.mock("@/hooks/useReviews", () => ({
  useReviews: () => ({
    data: [
      {
        id: "review-1",
        name_ms: "Pesakit",
        name_en: "Patient",
        text_ms: "Ulasan",
        text_en: "Review",
        rating: 5,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderHome() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <HomeRenderer content={DEFAULT_HOME_CONTENT} preview />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe("Trusted Family Clinic homepage", () => {
  it("keeps the clinic image decorative and low opacity", () => {
    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <HeroCarousel content={DEFAULT_HOME_CONTENT.hero} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    const image = container.querySelector('img[alt=""][aria-hidden="true"]');
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveClass("opacity-[0.13]");
  });

  it("uses clinic-line section headers while preserving CMS order and preview-safe actions", () => {
    const { container } = renderHome();

    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(
      expect.arrayContaining([
        "Klinik Keluarga Anda",
        "Mengapa Klinik Awfa?",
        "Lawat Klinik Kami",
        "Perkhidmatan Kami",
        "Galeri Klinik",
        "Apa Kata Pesakit Kami",
        "Lokasi Kami",
      ]),
    );
    expect(container.querySelectorAll(".public-clinic-line")).toHaveLength(6);

    const appointment = screen.getByRole("link", { name: /buat temujanji/i });
    expect(fireEvent.click(appointment)).toBe(false);
  });

  it("keeps homepage actions within the motion, target, and preview-surface contracts", () => {
    const { container } = renderHome();

    expect(
      [...container.querySelectorAll("svg")].filter((arrow) =>
        arrow.classList.contains("group-hover:translate-x-1"),
      ),
    ).toHaveLength(0);
    expect(screen.getByRole("link", { name: "+60 18-252 3531" })).toHaveClass(
      "min-h-11",
    );
    const mapPreview = screen.getByRole("img", { name: /location preview/i });
    expect(mapPreview).toHaveClass("bg-muted");
    expect(mapPreview).not.toHaveClass("bg-gradient-to-br");
  });

  it("uses the accessible foreground token for the hero WhatsApp action", () => {
    render(
      <MemoryRouter>
        <LanguageProvider>
          <HeroCarousel content={DEFAULT_HOME_CONTENT.hero} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveClass(
      "bg-whatsapp",
      "text-whatsapp-foreground",
    );
  });
});
