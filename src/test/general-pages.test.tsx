import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorDirtyNavigationProvider } from "@/components/editor/EditorDirtyNavigation";
import { LivePreview } from "@/components/editor/LivePreview";
import { GeneralPageRenderer } from "@/components/website/GeneralPageRenderer";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { GeneralPageContent } from "@/features/website-cms/schemas/page";
import GeneralPage from "@/pages/GeneralPage";
import { PageEditor } from "@/pages/editor/PageEditor";
import { Pages } from "@/pages/editor/Pages";

const pageApi = vi.hoisted(() => {
  class StaleWebsitePageDraftError extends Error {}

  return {
    createGeneralPage: vi.fn(),
    fetchEditorPageById: vi.fn(),
    fetchPageVersions: vi.fn(),
    fetchPublishedGeneralPage: vi.fn(),
    listEditorPages: vi.fn(),
    publishPageDraft: vi.fn(),
    restorePageVersionToDraft: vi.fn(),
    savePageDraft: vi.fn(),
    StaleWebsitePageDraftError,
  };
});

vi.mock("@/features/website-cms/api/pages", () => pageApi);
vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

const publishedContent: GeneralPageContent = {
  title: { ms: "Penjagaan keluarga", en: "Family care" },
  heroImage: "/images/family.webp",
  heroAlt: { ms: "Keluarga di klinik", en: "Family at the clinic" },
  body: {
    ms: '<p>Rawatan <strong>selamat</strong></p><script>alert("x")</script><img src=x onerror=alert(1)>',
    en: '<p>Safe <strong>care</strong></p>',
  },
  media: [
    {
      type: "image",
      url: "/images/care.webp",
      alt: { ms: "Rawatan", en: "Care" },
    },
    {
      type: "video",
      url: "https://media.example.com/clinic.mp4",
      alt: { ms: "Video klinik", en: "Clinic video" },
    },
  ],
  cta: {
    label: { ms: "Buat temujanji", en: "Book an appointment" },
    href: "/services",
  },
  seo: {
    title: { ms: "Penjagaan keluarga", en: "Family care" },
    description: {
      ms: "Maklumat penjagaan keluarga.",
      en: "Family care information.",
    },
  },
};

function editorResult(
  overrides: Partial<{
    kind: "content" | "system_content";
    status: "draft" | "published";
  }> = {},
) {
  return {
    page: {
      id: "page-family-care",
      kind: overrides.kind ?? ("content" as const),
      publishedContent: structuredClone(publishedContent),
      revision: 4,
      slug: "family-care",
      status: overrides.status ?? ("published" as const),
    },
    draft: {
      baseRevision: 4,
      content: structuredClone(publishedContent),
      pageId: "page-family-care",
      persisted: true,
    },
  };
}

function renderPublic(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider>
          <Routes>
            <Route path="/pages/:slug" element={<GeneralPage />} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function renderNewEditor() {
  return render(
    <MemoryRouter initialEntries={["/editor/pages/new"]}>
      <EditorDirtyNavigationProvider>
        <LanguageProvider>
          <Routes>
            <Route path="/editor/pages/:id" element={<PageEditor />} />
          </Routes>
        </LanguageProvider>
      </EditorDirtyNavigationProvider>
    </MemoryRouter>,
  );
}

function withinPreviewFrame() {
  const frame = screen.getByTestId("live-preview-frame") as HTMLIFrameElement;
  fireEvent.load(frame);
  const previewDocument = frame.contentDocument;
  if (!previewDocument) throw new Error("Expected preview document");
  return within(previewDocument.body);
}

beforeEach(() => {
  localStorage.clear();
  pageApi.createGeneralPage.mockReset();
  pageApi.fetchEditorPageById.mockReset().mockResolvedValue(editorResult());
  pageApi.fetchPageVersions.mockReset().mockResolvedValue([]);
  pageApi.fetchPublishedGeneralPage
    .mockReset()
    .mockResolvedValue(structuredClone(publishedContent));
  pageApi.listEditorPages.mockReset().mockResolvedValue([]);
  pageApi.publishPageDraft.mockReset().mockResolvedValue(undefined);
  pageApi.restorePageVersionToDraft.mockReset().mockResolvedValue(undefined);
  pageApi.savePageDraft.mockReset().mockImplementation(async ({ content }) => ({
    baseRevision: 4,
    content: structuredClone(content as GeneralPageContent),
    pageId: "page-family-care",
    persisted: true,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("GeneralPageRenderer", () => {
  it("renders valid Malay published content and sanitizes rich HTML", () => {
    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <GeneralPageRenderer content={publishedContent} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Penjagaan keluarga" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent === "Rawatan selamat",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("[onerror]")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Rawatan" })).toHaveAttribute(
      "src",
      "/images/care.webp",
    );
    expect(screen.getByLabelText("Video klinik")).toHaveAttribute(
      "src",
      "https://media.example.com/clinic.mp4",
    );
  });

  it("falls back field-by-field to Malay when optional English is blank", async () => {
    localStorage.setItem("klinik-awfa-language", "en");
    const content = structuredClone(publishedContent);
    content.title.en = "";
    content.body.en = "";
    content.media[0].alt.en = "";
    content.cta!.label.en = "";

    render(
      <MemoryRouter>
        <LanguageProvider>
          <GeneralPageRenderer content={content} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Penjagaan keluarga" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent === "Rawatan selamat",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Rawatan" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Buat temujanji" }),
    ).toBeInTheDocument();
  });

  it("drops unsupported media and an unsafe CTA at the render boundary", () => {
    const content = structuredClone(publishedContent) as GeneralPageContent & {
      media: Array<Record<string, unknown>>;
    };
    content.media = [
      {
        type: "audio",
        url: "https://media.example.com/recording.mp3",
        alt: { ms: "Rakaman", en: "Recording" },
      },
    ];
    content.cta = {
      label: { ms: "Bahaya", en: "Unsafe" },
      href: "javascript:alert(1)",
    } as GeneralPageContent["cta"];

    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <GeneralPageRenderer content={content} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(container.querySelector("audio")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bahaya" })).not.toBeInTheDocument();
  });

  it("blocks preview interactions and performs no media requests", async () => {
    render(
      <MemoryRouter>
        <LanguageProvider>
          <LivePreview title="Live Preview">
            <GeneralPageRenderer content={publishedContent} preview />
          </LivePreview>
        </LanguageProvider>
      </MemoryRouter>,
    );

    const frame = screen.getByTestId("live-preview-frame") as HTMLIFrameElement;
    const preview = withinPreviewFrame();
    expect(
      frame.contentDocument?.head.querySelector('meta[name="robots"]'),
    ).toHaveAttribute("content", "noindex, nofollow");
    const cta = await preview.findByRole("link", { name: "Buat temujanji" });
    expect(fireEvent.click(cta)).toBe(false);
    expect(preview.queryByRole("img")).not.toBeInTheDocument();
    expect(preview.queryByLabelText("Video klinik")).not.toBeInTheDocument();
    expect(preview.getAllByText("Media preview disabled")).toHaveLength(3);
  });
});

describe("GeneralPage public route", () => {
  it("loads only validated published content for a valid slug", async () => {
    renderPublic("/pages/family-care");

    expect(
      await screen.findByRole("heading", { name: "Penjagaan keluarga" }),
    ).toBeInTheDocument();
    expect(pageApi.fetchPublishedGeneralPage).toHaveBeenCalledWith("family-care");
  });

  it.each(["missing-page", "unpublished-page"])(
    "renders a non-indexable 404 when %s is unavailable",
    async (slug) => {
      pageApi.fetchPublishedGeneralPage.mockResolvedValueOnce(null);
      renderPublic(`/pages/${slug}`);

      expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument();
      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      );
    },
  );
});

describe("general page editor", () => {
  it("rejects a reserved slug before creating a page or private draft", async () => {
    renderNewEditor();

    fireEvent.change(screen.getByRole("textbox", { name: "Page slug" }), {
      target: { value: "privacy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    expect(await screen.findByText("Reserved page slug")).toBeInTheDocument();
    expect(pageApi.createGeneralPage).not.toHaveBeenCalled();
  });

  it("lists content and system-content pages", async () => {
    pageApi.listEditorPages.mockResolvedValueOnce([
      {
        id: "page-family-care",
        kind: "content",
        revision: 4,
        slug: "family-care",
        status: "published",
      },
      {
        id: "page-privacy",
        kind: "system_content",
        revision: 1,
        slug: "privacy",
        status: "published",
      },
    ]);

    render(
      <MemoryRouter>
        <Pages />
      </MemoryRouter>,
    );

    expect(await screen.findByText("family-care")).toBeInTheDocument();
    expect(screen.getByText("privacy")).toBeInTheDocument();
    expect(screen.getByText("System content")).toBeInTheDocument();
  });

  it("keeps system-content and published slugs read-only", async () => {
    pageApi.fetchEditorPageById.mockResolvedValueOnce(
      editorResult({ kind: "system_content", status: "published" }),
    );
    render(
      <MemoryRouter initialEntries={["/editor/pages/page-family-care"]}>
        <EditorDirtyNavigationProvider>
          <LanguageProvider>
            <Routes>
              <Route path="/editor/pages/:id" element={<PageEditor />} />
            </Routes>
          </LanguageProvider>
        </EditorDirtyNavigationProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("textbox", { name: "Page slug" })).toHaveAttribute(
      "readonly",
    );
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByText("Version history")).toBeInTheDocument();
    expect(screen.getByTestId("live-preview-frame")).toBeInTheDocument();
  });
});

describe("general page routes", () => {
  it("registers public and guarded editor routes before the catch-all", () => {
    const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
    const publicRoute = appSource.indexOf('path="/pages/:slug"');
    const editorListRoute = appSource.indexOf('path="pages"');
    const editorDetailRoute = appSource.indexOf('path="pages/:id"');
    const catchAllRoute = appSource.indexOf('path="*"');

    expect(publicRoute).toBeGreaterThan(-1);
    expect(editorListRoute).toBeGreaterThan(-1);
    expect(editorDetailRoute).toBeGreaterThan(-1);
    expect(publicRoute).toBeLessThan(catchAllRoute);
    expect(editorListRoute).toBeLessThan(catchAllRoute);
    expect(editorDetailRoute).toBeLessThan(catchAllRoute);
  });
});
