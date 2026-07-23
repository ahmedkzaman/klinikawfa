import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "ms" }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [
              {
                key: "homepage_video_url",
                value: "https://example.com/clinic.mp4",
              },
            ],
            error: null,
          }),
      }),
    }),
  },
}));

import { VideoSection } from "@/components/home/VideoSection";
import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";

describe("Homepage video clarity", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    });
  });

  it("does not blur or darken the video beneath its play control", async () => {
    const { container } = render(
      <VideoSection content={DEFAULT_HOME_CONTENT.video} />,
    );

    await waitFor(() =>
      expect(container.querySelector("video")).toBeInTheDocument(),
    );

    const videoControl = screen.getAllByRole("button")[0];
    const overlay = videoControl.parentElement;

    expect(overlay).not.toBeNull();
    expect(overlay).not.toHaveClass("backdrop-blur-sm");
    expect(overlay).not.toHaveClass("bg-foreground/30");
  });
});
