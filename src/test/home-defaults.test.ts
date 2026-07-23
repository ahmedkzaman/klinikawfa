import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GalleryLightbox } from "@/components/gallery/GalleryLightbox";
import { GalleryStrip } from "@/components/home/GalleryStrip";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { MapSection } from "@/components/home/MapSection";
import { ServicesPreview } from "@/components/home/ServicesPreview";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { VideoSection } from "@/components/home/VideoSection";
import { WhySection } from "@/components/home/WhySection";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";
import { homeContentSchema } from "@/features/website-cms/schemas/home";
import Index from "@/pages/Index";

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

const testState = vi.hoisted(() => ({
  indexSections: [] as Array<{ id: string; content: unknown; preview?: boolean }>,
  galleryLightboxLabels: vi.fn(),
  videoSettingsData: [] as Array<{ key: string; value: string }>,
  videoSettingKeys: vi.fn(),
}));

vi.mock("@/components/gallery", () => ({
  GalleryLightbox: ({
    labels,
    open,
  }: {
    labels?: {
      close: string;
      previous: string;
      next: string;
      swipeHint: string;
    };
    open: boolean;
  }) => {
    testState.galleryLightboxLabels(labels);

    return open
      ? createElement(
          "div",
          null,
          createElement("button", null, labels?.close),
          createElement("button", null, labels?.previous),
          createElement("button", null, labels?.next),
          createElement("p", null, labels?.swipeHint),
        )
      : null;
  },
}));

vi.mock("@/hooks/useGalleryImages", () => ({
  useGalleryImages: () => ({
    allImages: Array.from({ length: 10 }, (_, index) => ({
      id: `image-${index}`,
      url: `/images/image-${index}.webp`,
      alt_text: `Image ${index}`,
    })),
    isLoading: false,
  }),
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
        in: (_column: string, keys: string[]) => {
          testState.videoSettingKeys(keys);
          return Promise.resolve({ data: testState.videoSettingsData, error: null });
        },
      }),
    }),
  },
}));

vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/seo", () => ({
  SEOHead: () => null,
}));

vi.mock("@/components/home", async () => {
  const { HomeRenderer } = await vi.importActual<
    typeof import("@/components/home/HomeRenderer")
  >("@/components/home/HomeRenderer");
  const section = (id: string) =>
    function MockHomeSection({
      content,
      preview,
    }: {
      content: unknown;
      preview?: boolean;
    }) {
      testState.indexSections.push({ id, content, preview });
      return createElement("div", { "data-testid": `index-${id}` });
    };

  return {
    HomeRenderer,
    HeroCarousel: section("hero"),
    WhySection: section("why"),
    VideoSection: section("video"),
    ServicesPreview: section("services"),
    GalleryStrip: section("gallery"),
    TestimonialsSection: section("testimonials"),
    MapSection: section("map"),
  };
});

function renderSection(section: ReactNode) {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(LanguageProvider, null, section),
    ),
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  testState.indexSections.length = 0;
  testState.galleryLightboxLabels.mockClear();
  testState.videoSettingsData.length = 0;
  testState.videoSettingKeys.mockClear();
});

describe("DEFAULT_HOME_CONTENT", () => {
  it("preserves the exact current Home content snapshot", () => {
    expect(homeContentSchema.parse(DEFAULT_HOME_CONTENT)).toEqual(
      DEFAULT_HOME_CONTENT,
    );
    expect(DEFAULT_HOME_CONTENT).toEqual({
      hero: {
        backgroundImage: "/klinik-awfa-exterior.webp",
        backgroundAlt: { ms: "", en: "" },
        backgroundOpacity: 13,
        autoplayMs: 5000,
        slides: [
          {
            title: { ms: "Klinik Keluarga Anda", en: "Your Family Clinic" },
            subtitle: {
              ms: "Rawatan berkualiti untuk seluruh keluarga di KotaSAS",
              en: "Quality healthcare for the whole family at KotaSAS",
            },
          },
          {
            title: { ms: "Buka Setiap Hari", en: "Open Every Day" },
            subtitle: {
              ms: "8.00 pagi hingga 12.00 tengah malam untuk keselesaan anda",
              en: "8:00 AM to 12:00 Midnight for your convenience",
            },
          },
          {
            title: {
              ms: "Pengkhususan Minor Surgery",
              en: "Special Interest in Minor Surgery",
            },
            subtitle: {
              ms: "Kepakaran dalam rawatan ketumbuhan, ketuat & khatan",
              en: "Expertise in lumps, warts & circumcision treatment",
            },
          },
        ],
        ctas: [
          {
            label: { ms: "Buat Temujanji", en: "Book Appointment" },
            href: "/appointment",
          },
          {
            label: { ms: "WhatsApp", en: "WhatsApp" },
            href: "https://wa.me/60182523531",
          },
          {
            label: { ms: "Hubungi", en: "Call" },
            href: "tel:+60182523531",
          },
        ],
        carouselLabels: {
          previous: { ms: "Previous slide", en: "Previous slide" },
          next: { ms: "Next slide", en: "Next slide" },
          goTo: { ms: "Go to slide", en: "Go to slide" },
        },
      },
      why: {
        eyebrow: { ms: "Mengapa Pilih Kami", en: "Why Choose Us" },
        title: { ms: "Mengapa Klinik Awfa?", en: "Why Klinik Awfa?" },
        description: {
          ms: "Kami komited untuk menyediakan perkhidmatan kesihatan yang terbaik untuk anda dan keluarga.",
          en: "We are committed to providing the best healthcare services for you and your family.",
        },
        items: [
          {
            icon: "clock",
            title: { ms: "Buka Setiap Hari", en: "Open Daily" },
            description: {
              ms: "8.00 pagi – 12.00 tengah malam",
              en: "8:00 AM – 12:00 Midnight",
            },
          },
          {
            icon: "sofa",
            title: {
              ms: "Ruang Menunggu Selesa",
              en: "Comfortable Waiting Area",
            },
            description: {
              ms: "Termasuk zon permainan kanak-kanak",
              en: "Including kids play zone",
            },
          },
          {
            icon: "users",
            title: { ms: "Klinik Keluarga", en: "Family Clinic" },
            description: {
              ms: "Melayani seluruh keluarga di KotaSAS",
              en: "Serving all families at KotaSAS",
            },
          },
          {
            icon: "user-check",
            title: {
              ms: "Doktor Berpengalaman",
              en: "Experienced Doctors",
            },
            description: {
              ms: "Bertahun-tahun pengalaman dalam perubatan keluarga",
              en: "Years of experience in family medicine",
            },
          },
          {
            icon: "scissors",
            title: {
              ms: "Pengkhususan Minor Surgery",
              en: "Special Interest in Minor Surgery",
            },
            description: {
              ms: "Kepakaran dalam rawatan ketumbuhan, ketuat & khatan",
              en: "Expertise in lumps, warts & circumcision treatment",
            },
          },
          {
            icon: "ear",
            title: { ms: "Perkhidmatan ENT", en: "ENT Services" },
            description: {
              ms: "Termasuk microsuction untuk penjagaan telinga profesional",
              en: "Including microsuction for professional ear care",
            },
          },
        ],
      },
      video: {
        eyebrow: { ms: "Video Klinik", en: "Clinic Video" },
        title: { ms: "Lawat Klinik Kami", en: "Visit Our Clinic" },
        description: {
          ms: "Lihat suasana mesra dan selesa di Klinik Awfa.",
          en: "See the friendly and comfortable atmosphere at Klinik Awfa.",
        },
        placeholder: {
          ms: "📹 Video klinik akan ditambah di sini",
          en: "📹 Clinic video will be added here",
        },
        unsupportedMessage: {
          ms: "Your browser does not support the video tag.",
          en: "Your browser does not support the video tag.",
        },
        videoUrlSettingKey: "homepage_video_url",
        posterSettingKey: "homepage_video_poster",
      },
      services: {
        eyebrow: { ms: "Perkhidmatan Kami", en: "Our Services" },
        title: { ms: "Perkhidmatan Kami", en: "Our Services" },
        description: {
          ms: "Pelbagai perkhidmatan kesihatan untuk memenuhi keperluan anda.",
          en: "A wide range of health services to meet your needs.",
        },
        cta: {
          label: { ms: "Lihat Semua", en: "View All" },
          href: "/services",
        },
        learnMoreLabel: { ms: "Ketahui Lebih", en: "Learn More" },
        itemLimit: 6,
      },
      gallery: {
        eyebrow: { ms: "Galeri Foto", en: "Photo Gallery" },
        title: { ms: "Galeri Klinik", en: "Clinic Gallery" },
        description: {
          ms: "Lihat suasana di Klinik Awfa.",
          en: "See the atmosphere at Klinik Awfa.",
        },
        cta: {
          label: { ms: "Lihat Semua", en: "View All" },
          href: "/gallery",
        },
        emptyMessage: { ms: "Tiada gambar", en: "No images" },
        moreLabel: { ms: "lagi", en: "more" },
        carouselLabels: {
          previous: { ms: "Previous slide", en: "Previous slide" },
          next: { ms: "Next slide", en: "Next slide" },
          goTo: { ms: "Go to slide", en: "Go to slide" },
        },
        closeLabel: { ms: "Close", en: "Close" },
        previousLabel: { ms: "Previous", en: "Previous" },
        nextLabel: { ms: "Next", en: "Next" },
        swipeHint: { ms: "Swipe to navigate", en: "Swipe to navigate" },
        itemLimit: 8,
      },
      testimonials: {
        eyebrow: { ms: "Testimoni", en: "Testimonials" },
        title: {
          ms: "Apa Kata Pesakit Kami",
          en: "What Our Patients Say",
        },
        description: {
          ms: "Kepuasan pesakit adalah keutamaan kami.",
          en: "Patient satisfaction is our priority.",
        },
        patientLabel: {
          ms: "Pesakit Klinik Awfa",
          en: "Klinik Awfa Patient",
        },
        goToSlideLabel: { ms: "Go to slide", en: "Go to slide" },
        previousSlideLabel: { ms: "Previous slide", en: "Previous slide" },
        nextSlideLabel: { ms: "Next slide", en: "Next slide" },
        carouselRoleDescription: { ms: "carousel", en: "carousel" },
        slideRoleDescription: { ms: "slide", en: "slide" },
      },
      map: {
        eyebrow: { ms: "Cari Kami", en: "Find Us" },
        title: { ms: "Lokasi Kami", en: "Our Location" },
        description: {
          ms: "Mudah diakses di KotaSAS Avenue, Kuantan. Kami sedia menerima kunjungan anda.",
          en: "Easily accessible at KotaSAS Avenue, Kuantan. We are ready to welcome your visit.",
        },
        hoursLabel: { ms: "Waktu Operasi", en: "Operating Hours" },
        everydayLabel: { ms: "Setiap Hari", en: "Every Day" },
        callLabel: { ms: "Hubungi", en: "Call" },
        directionsCta: {
          label: { ms: "Dapatkan Arah", en: "Get Directions" },
          href: "https://maps.google.com/?q=3.871944656053272,103.27734116870465",
        },
        embedUrl:
          "https://maps.google.com/maps?q=3.871944656053272,103.27734116870465&t=&z=17&ie=UTF8&iwloc=&output=embed",
        embedTitle: {
          ms: "Klinik Awfa Location",
          en: "Klinik Awfa Location",
        },
      },
      seo: {
        title: { ms: "Klinik Keluarga Anda", en: "" },
        description: {
          ms: "Klinik Awfa menawarkan rawatan kesihatan berkualiti untuk keluarga anda di KotaSAS, Kuantan. Buka setiap hari 8 pagi - 12 tengah malam.",
          en: "",
        },
      },
      sectionOrder: [
        "hero",
        "why",
        "video",
        "services",
        "gallery",
        "testimonials",
        "map",
      ],
    });

    expect(DEFAULT_HOME_CONTENT.hero.slides.map((slide) => slide.title.ms)).toEqual([
      "Klinik Keluarga Anda",
      "Buka Setiap Hari",
      "Pengkhususan Minor Surgery",
    ]);
    expect(DEFAULT_HOME_CONTENT.hero.backgroundOpacity).toBe(13);
    expect(DEFAULT_HOME_CONTENT.hero.autoplayMs).toBe(5000);
    expect(DEFAULT_HOME_CONTENT.sectionOrder).toEqual([
      "hero",
      "why",
      "video",
      "services",
      "gallery",
      "testimonials",
      "map",
    ]);
  });
});

describe("data-driven Home renderer", () => {
  it("renders custom Hero content and blocks every preview CTA", () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.hero);
    content.slides[0].title.ms = "Hero tersuai";
    content.ctas[0].label.ms = "Tindakan tersuai";
    content.backgroundOpacity = 21;

    const { container } = renderSection(
      createElement(HeroCarousel, { content, preview: true }),
    );

    expect(
      screen.getByRole("heading", { name: "Hero tersuai" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tindakan tersuai/ })).toHaveAttribute(
      "href",
      content.ctas[0].href,
    );
    expect(
      fireEvent.click(screen.getByRole("link", { name: /Tindakan tersuai/ })),
    ).toBe(false);
    expect(fireEvent.click(screen.getByRole("link", { name: /WhatsApp/ }))).toBe(
      false,
    );
    expect(fireEvent.click(screen.getByRole("link", { name: /Hubungi/ }))).toBe(
      false,
    );
    expect(container.querySelector('img[aria-hidden="true"]')).toHaveStyle({
      opacity: "0.21",
    });
  });

  it("renders custom Why copy and typed icon items", () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.why);
    content.title.ms = "Mengapa tersuai";
    content.items = [
      {
        icon: "ear",
        title: { ms: "Item tersuai", en: "Custom item" },
        description: { ms: "Butiran tersuai", en: "Custom details" },
      },
    ];

    renderSection(createElement(WhySection, { content, preview: true }));

    expect(screen.getByRole("heading", { name: "Mengapa tersuai" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Item tersuai" })).toBeVisible();
    expect(screen.queryByText("Buka Setiap Hari")).not.toBeInTheDocument();
  });

  it("renders a side-effect-free Video placeholder in preview mode", async () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.video);
    content.title.ms = "Video tersuai";
    content.placeholder.ms = "Video pratonton selamat";
    testState.videoSettingsData.push(
      { key: content.videoUrlSettingKey, value: "/clinic.mp4" },
      { key: content.posterSettingKey, value: "/clinic.webp" },
    );
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);

    const { container } = renderSection(
      createElement(VideoSection, { content, preview: true }),
    );

    expect(screen.getByRole("heading", { name: "Video tersuai" })).toBeVisible();
    expect(screen.getByText("Video pratonton selamat")).toBeVisible();
    expect(container.querySelector("video")).not.toBeInTheDocument();
    await act(async () => undefined);
    expect(testState.videoSettingKeys).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it("retains configured Video settings and playback in public mode", async () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.video);
    testState.videoSettingsData.push(
      { key: content.videoUrlSettingKey, value: "/clinic.mp4" },
      { key: content.posterSettingKey, value: "/clinic.webp" },
    );
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);

    const { container } = renderSection(
      createElement(VideoSection, { content, preview: false }),
    );

    await waitFor(() => {
      expect(testState.videoSettingKeys).toHaveBeenCalledWith([
        content.videoUrlSettingKey,
        content.posterSettingKey,
      ]);
    });
    const video = await waitFor(() => {
      const element = container.querySelector("video");
      expect(element).toBeInTheDocument();
      return element!;
    });
    expect(video).toHaveAttribute("src", "/clinic.mp4");
    expect(video).toHaveAttribute("poster", "/clinic.webp");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("renders the configured Services limit and blocks preview links", () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.services);
    content.title.ms = "Servis tersuai";
    content.cta.label.ms = "Semua servis tersuai";
    content.itemLimit = 1;

    const { container } = renderSection(
      createElement(ServicesPreview, { content, preview: true }),
    );

    expect(screen.getByRole("heading", { name: "Servis tersuai" })).toBeVisible();
    expect(container.querySelectorAll('a[href^="/services/"]')).toHaveLength(1);
    for (const link of screen.getAllByRole("link")) {
      expect(fireEvent.click(link)).toBe(false);
    }
  });

  it("renders configured Gallery lightbox labels and blocks preview CTAs", () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.gallery);
    content.title.ms = "Galeri tersuai";
    content.cta.label.ms = "Semua gambar tersuai";
    content.closeLabel.ms = "Tutup tersuai";
    content.previousLabel.ms = "Sebelumnya tersuai";
    content.nextLabel.ms = "Seterusnya tersuai";
    content.swipeHint.ms = "Leret tersuai";
    content.itemLimit = 2;

    const { container } = renderSection(
      createElement(GalleryStrip, { content, preview: true }),
    );

    expect(screen.getByRole("heading", { name: "Galeri tersuai" })).toBeVisible();
    expect(container.querySelectorAll("img")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Image 0" }));
    expect(screen.getByRole("button", { name: "Tutup tersuai" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sebelumnya tersuai" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Seterusnya tersuai" })).toBeVisible();
    expect(screen.getByText("Leret tersuai")).toBeVisible();
    expect(testState.galleryLightboxLabels).toHaveBeenLastCalledWith({
      close: "Tutup tersuai",
      previous: "Sebelumnya tersuai",
      next: "Seterusnya tersuai",
      swipeHint: "Leret tersuai",
    });
    for (const link of screen.getAllByRole("link")) {
      expect(fireEvent.click(link)).toBe(false);
    }
  });

  it("renders custom Testimonials copy and localized carousel labels", () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.testimonials);
    content.title.ms = "Testimoni tersuai";
    content.previousSlideLabel.ms = "Testimoni sebelumnya";
    content.nextSlideLabel.ms = "Testimoni seterusnya";
    Object.assign(content, {
      carouselRoleDescription: {
        ms: "Karusel testimoni tersuai",
        en: "Custom testimonial carousel",
      },
      slideRoleDescription: {
        ms: "Slaid testimoni tersuai",
        en: "Custom testimonial slide",
      },
    });

    renderSection(
      createElement(TestimonialsSection, { content, preview: true }),
    );

    expect(
      screen.getByRole("heading", { name: "Testimoni tersuai" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Testimoni sebelumnya" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Testimoni seterusnya" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Previous slide")).not.toBeInTheDocument();
    expect(screen.queryByText("Next slide")).not.toBeInTheDocument();
    expect(screen.getByRole("region")).toHaveAttribute(
      "aria-roledescription",
      "Karusel testimoni tersuai",
    );
    expect(screen.getByRole("group")).toHaveAttribute(
      "aria-roledescription",
      "Slaid testimoni tersuai",
    );
  });

  it("retains the shared Carousel role-description defaults for unrelated consumers", () => {
    const { container } = render(
      createElement(
        Carousel,
        null,
        createElement(
          CarouselContent,
          null,
          createElement(CarouselItem, null, "Unrelated slide"),
        ),
      ),
    );

    expect(screen.getByRole("region")).toHaveAttribute(
      "aria-roledescription",
      "carousel",
    );
    expect(container.querySelector('[role="group"]')).toHaveAttribute(
      "aria-roledescription",
      "slide",
    );
  });

  it("renders custom GalleryLightbox labels while retaining exact legacy defaults", () => {
    const images = [
      {
        id: "image-1",
        url: "/images/image-1.webp",
        alt_text: "Image 1",
        created_at: "2026-07-21T00:00:00.000Z",
        display_order: 1,
        tags: null,
      },
      {
        id: "image-2",
        url: "/images/image-2.webp",
        alt_text: "Image 2",
        created_at: "2026-07-21T00:00:00.000Z",
        display_order: 2,
        tags: null,
      },
    ];

    const { unmount } = render(
      createElement(GalleryLightbox, {
        images,
        currentIndex: 0,
        open: true,
        onOpenChange: vi.fn(),
        onIndexChange: vi.fn(),
      }),
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByText("Swipe to navigate")).toBeVisible();
    unmount();

    render(
      createElement(GalleryLightbox, {
        images,
        currentIndex: 0,
        open: true,
        onOpenChange: vi.fn(),
        onIndexChange: vi.fn(),
        labels: {
          close: "Tutup sebenar",
          previous: "Sebelumnya sebenar",
          next: "Seterusnya sebenar",
          swipeHint: "Leret sebenar",
        },
      }),
    );

    expect(screen.getByRole("button", { name: "Tutup sebenar" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sebelumnya sebenar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seterusnya sebenar" })).toBeInTheDocument();
    expect(screen.getByText("Leret sebenar")).toBeVisible();
  });

  it("renders a side-effect-free Map placeholder and blocks preview navigation", () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.map);
    content.title.ms = "Peta tersuai";
    content.directionsCta.label.ms = "Arah tersuai";

    const { container } = renderSection(
      createElement(MapSection, { content, preview: true }),
    );

    expect(screen.getByRole("heading", { name: "Peta tersuai" })).toBeVisible();
    expect(container.querySelector("iframe")).not.toBeInTheDocument();
    expect(screen.getByText("Klinik Awfa Location")).toBeVisible();
    expect(fireEvent.click(screen.getByRole("link", { name: /Arah tersuai/ }))).toBe(
      false,
    );
    expect(fireEvent.click(container.querySelector('a[href^="tel:"]')!)).toBe(
      false,
    );
  });

  it("retains the configured live Map embed in public mode", () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT.map);

    const { container } = renderSection(
      createElement(MapSection, { content, preview: false }),
    );

    expect(container.querySelector("iframe")).toHaveAttribute(
      "src",
      content.embedUrl,
    );
  });

  it("renders the fixed allowlisted sections in configured order through the shared public renderer", async () => {
    let rendered: ReturnType<typeof render> | undefined;
    await act(async () => {
      rendered = render(
        createElement(
          MemoryRouter,
          null,
          createElement(LanguageProvider, null, createElement(Index)),
        ),
      );
    });
    const { container } = rendered!;
    const sections = Array.from(container.children).filter(
      (element) => element.tagName === "SECTION",
    );
    const expectedHeadings = DEFAULT_HOME_CONTENT.sectionOrder.map((id) =>
      id === "hero"
        ? DEFAULT_HOME_CONTENT.hero.slides[0].title.ms
        : DEFAULT_HOME_CONTENT[id].title.ms,
    );

    expect(sections).toHaveLength(expectedHeadings.length);
    sections.forEach((section, index) => {
      expect(
        within(section as HTMLElement).getByRole("heading", {
          name: expectedHeadings[index],
        }),
      ).toBeInTheDocument();
    });
  });
});
