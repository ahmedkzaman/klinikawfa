import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { HeroCarousel } from "@/components/home/HeroCarousel";
import { LanguageProvider } from "@/contexts/LanguageContext";

describe("HeroCarousel clinic background", () => {
  it("renders the clinic photograph as a faint decorative image", () => {
    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <HeroCarousel autoPlayInterval={60_000} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    const background = container.querySelector(
      'img[alt=""][aria-hidden="true"]',
    );

    expect(background).toBeInstanceOf(HTMLImageElement);
    expect(background?.getAttribute("src")).toContain(
      "klinik-awfa-exterior",
    );
    expect(background).toHaveAttribute("decoding", "async");
    expect(background).toHaveAttribute("loading", "eager");
    expect(background).toHaveAttribute("draggable", "false");
    expect(background).toHaveClass(
      "pointer-events-none",
      "object-cover",
      "opacity-[0.13]",
      "md:object-center",
    );
  });
});
