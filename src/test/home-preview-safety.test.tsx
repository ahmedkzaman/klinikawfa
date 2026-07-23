import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeroCarousel } from "@/components/home/HeroCarousel";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";
import { projectHomePreview } from "@/features/website-cms/home/projectHomePreview";
import { homeContentSchema } from "@/features/website-cms/schemas/home";

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

function renderHero(content = structuredClone(DEFAULT_HOME_CONTENT.hero)) {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <HeroCarousel content={content} preview />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("projectHomePreview", () => {
  it("preserves local copy while clamping numeric fields and defaulting unsafe arrays", () => {
    const raw = structuredClone(DEFAULT_HOME_CONTENT) as unknown as {
      gallery: Record<string, unknown>;
      hero: Record<string, unknown>;
      sectionOrder: unknown;
      services: Record<string, unknown>;
      why: Record<string, unknown>;
    };
    raw.hero.backgroundOpacity = Number.NaN;
    raw.hero.autoplayMs = Number.POSITIVE_INFINITY;
    raw.hero.slides = [];
    raw.hero.ctas = null;
    raw.why.items = [];
    raw.services.itemLimit = -8;
    raw.gallery.itemLimit = 99;
    raw.sectionOrder = ["map", "map", "not-a-section", 42];

    const preview = projectHomePreview(raw);

    expect(preview.hero.backgroundOpacity).toBe(
      DEFAULT_HOME_CONTENT.hero.backgroundOpacity,
    );
    expect(preview.hero.autoplayMs).toBe(DEFAULT_HOME_CONTENT.hero.autoplayMs);
    expect(preview.hero.slides).toEqual(DEFAULT_HOME_CONTENT.hero.slides);
    expect(preview.hero.ctas).toEqual(DEFAULT_HOME_CONTENT.hero.ctas);
    expect(preview.why.items).toEqual(DEFAULT_HOME_CONTENT.why.items);
    expect(preview.services.itemLimit).toBe(1);
    expect(preview.gallery.itemLimit).toBe(12);
    expect(preview.sectionOrder).toEqual(["map"]);
    expect(homeContentSchema.parse(preview)).toEqual(preview);
  });

  it("keeps valid unsaved structural copy without mutating the watched value", () => {
    const raw = structuredClone(DEFAULT_HOME_CONTENT);
    raw.hero.slides[0].title.ms = "Tajuk belum disimpan";
    raw.hero.backgroundOpacity = 19;
    raw.hero.autoplayMs = 4200;
    raw.sectionOrder = ["gallery", "hero"];

    const preview = projectHomePreview(raw);

    expect(preview.hero.slides[0].title.ms).toBe("Tajuk belum disimpan");
    expect(preview.hero.backgroundOpacity).toBe(19);
    expect(preview.hero.autoplayMs).toBe(4200);
    expect(preview.sectionOrder).toEqual(["gallery", "hero"]);
    expect(preview).not.toBe(raw);
    expect(preview.hero).not.toBe(raw.hero);
  });

  it("keeps a valid unsaved layout for the exact public preview renderer", () => {
    const raw = structuredClone(DEFAULT_HOME_CONTENT) as typeof DEFAULT_HOME_CONTENT & {
      layout: unknown;
    };
    raw.layout = {
      version: 1,
      blocks: [
        {
          id: "hero",
          kind: "hero",
          contentRef: "hero",
          order: 0,
          hidden: false,
          desktop: { column: 1, width: 12, row: 1, height: 1 },
        },
      ],
    };

    expect(projectHomePreview(raw).layout).toEqual(raw.layout);
  });
});

describe("HeroCarousel preview safety", () => {
  it("renders safely when a transient watched value has no slides", () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.hero);
    content.slides = [];

    const { container } = renderHero(content);

    expect(container.querySelector("section")).not.toBeInTheDocument();
  });

  it("reconciles the selected slide when the watched array shrinks", () => {
    vi.useFakeTimers();
    const content = structuredClone(DEFAULT_HOME_CONTENT.hero);
    content.autoplayMs = 3000;
    const rendered = renderHero(content);

    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("button", { name: "Go to slide 3" })).toHaveClass(
      "w-10",
    );

    const shrunk = structuredClone(content);
    shrunk.slides = [shrunk.slides[0]];
    rendered.rerender(
      <MemoryRouter>
        <LanguageProvider>
          <HeroCarousel content={shrunk} preview />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Klinik Keluarga Anda" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to slide 1" })).toHaveClass(
      "w-10",
    );
  });

  it("uses the safe default interval for a non-finite transient value", () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    const content = structuredClone(DEFAULT_HOME_CONTENT.hero);
    content.autoplayMs = Number.NaN;

    renderHero(content);

    expect(
      intervalSpy.mock.calls.some(
        ([, delay]) => delay === DEFAULT_HOME_CONTENT.hero.autoplayMs,
      ),
    ).toBe(true);
  });
});
