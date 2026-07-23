import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HelmetProvider } from "react-helmet-async";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
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
    id: string;
    kind: "content" | "system_content";
    slug: string;
    status: "draft" | "published";
    title: string;
  }> = {},
) {
  const content = structuredClone(publishedContent);
  if (overrides.title) {
    content.title.ms = overrides.title;
    content.title.en = overrides.title;
  }
  const pageId = overrides.id ?? "page-family-care";

  return {
    page: {
      id: pageId,
      kind: overrides.kind ?? ("content" as const),
      publishedContent: structuredClone(content),
      revision: 4,
      slug: overrides.slug ?? "family-care",
      status: overrides.status ?? ("published" as const),
    },
    draft: {
      baseRevision: 4,
      content,
      pageId,
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
  it("uses a saved grid layout while omitting hidden blocks", () => {
    const content: GeneralPageContent = {
      ...structuredClone(publishedContent),
      layout: {
        version: 1,
        blocks: [
          {
            id: "body",
            kind: "body",
            contentRef: "body",
            order: 0,
            hidden: false,
            desktop: { column: 5, width: 8, row: 1, height: 1 },
          },
          {
            id: "title",
            kind: "title",
            contentRef: "title",
            order: 1,
            hidden: false,
            desktop: { column: 1, width: 4, row: 1, height: 1 },
          },
          {
            id: "cta",
            kind: "cta",
            contentRef: "cta",
            order: 2,
            hidden: true,
            desktop: { column: 1, width: 12, row: 2, height: 1 },
          },
        ],
      },
    };

    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <GeneralPageRenderer content={content} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(
      Array.from(container.querySelectorAll("[data-layout-kind]")).map(
        (element) => element.getAttribute("data-layout-kind"),
      ),
    ).toEqual(["body", "title"]);
    expect(screen.queryByRole("link", { name: "Buat temujanji" })).not.toBeInTheDocument();
  });

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

  it("allows safe rich-text formatting but strips every resource-loading element and attribute", () => {
    const content = structuredClone(publishedContent);
    content.heroImage = null;
    content.media = [];
    content.cta = null;
    content.body.ms = `
      <h2>Maklumat selamat</h2>
      <p><strong>Tebal</strong> <em>condong</em> <a href="/services" title="Servis">Pautan</a></p>
      <ul><li>Senarai</li></ul><blockquote>Petikan</blockquote><pre><code>kod</code></pre>
      <svg><image href="https://tracker.example/svg.png"></image></svg>
      <input type="image" src="https://tracker.example/input.png">
      <form action="https://tracker.example/form"><button formaction="https://tracker.example/button">Hantar</button></form>
      <video poster="https://tracker.example/poster.png"><source src="https://tracker.example/video.mp4" srcset="https://tracker.example/video-2.mp4"></video>
      <object data="https://tracker.example/object"></object>
    `;

    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <GeneralPageRenderer content={content} />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Maklumat selamat" })).toBeInTheDocument();
    expect(screen.getByText("Tebal").tagName).toBe("STRONG");
    expect(screen.getByText("condong").tagName).toBe("EM");
    expect(screen.getByRole("link", { name: "Pautan" })).toHaveAttribute("href", "/services");
    expect(container.querySelector("svg, image, input, form, button, video, source, object")).toBeNull();
    expect(container.querySelector("[src], [srcset], [poster], [data], [action], [formaction]")).toBeNull();
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

  it("uses the non-resource rich-text allowlist inside live preview", async () => {
    const content = structuredClone(publishedContent);
    content.heroImage = null;
    content.media = [];
    content.cta = null;
    content.body.ms = `
      <p><strong>Format selamat</strong></p>
      <svg><image href="https://tracker.example/svg.png"></image></svg>
      <input type="image" src="https://tracker.example/input.png">
      <form action="https://tracker.example/form"><button formaction="https://tracker.example/button">Hantar</button></form>
    `;

    render(
      <MemoryRouter>
        <LanguageProvider>
          <LivePreview title="Live Preview">
            <GeneralPageRenderer content={content} preview />
          </LivePreview>
        </LanguageProvider>
      </MemoryRouter>,
    );

    const frame = screen.getByTestId("live-preview-frame") as HTMLIFrameElement;
    const preview = withinPreviewFrame();
    expect(await preview.findByText("Format selamat")).toBeInTheDocument();
    const previewBody = frame.contentDocument?.body;
    expect(previewBody?.querySelector("strong")?.textContent).toBe("Format selamat");
    expect(previewBody?.querySelector("svg, image, input, form, button")).toBeNull();
    expect(previewBody?.querySelector("[src], [data], [action], [formaction]")).toBeNull();
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
      await waitFor(() => {
        expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
          "content",
          "noindex, nofollow",
        );
      });
    },
  );
});

describe("general page editor", () => {
  it("saves a custom page grid through the existing private draft", async () => {
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

    expect(
      await screen.findByRole("heading", { name: "Advanced grid designer" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Two equal columns" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    await waitFor(() =>
      expect(pageApi.savePageDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            layout: expect.objectContaining({ version: 1 }),
          }),
        }),
      ),
    );
  });

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

  it("clears the prior page immediately when the route id changes and the next load fails", async () => {
    let rejectSecondLoad!: (reason?: unknown) => void;
    const secondLoad = new Promise<ReturnType<typeof editorResult>>(
      (_resolve, reject) => {
        rejectSecondLoad = reject;
      },
    );
    pageApi.fetchEditorPageById
      .mockResolvedValueOnce(
        editorResult({
          id: "page-one",
          slug: "page-one",
          title: "Page one title",
        }),
      )
      .mockReturnValueOnce(secondLoad);

    render(
      <MemoryRouter initialEntries={["/editor/pages/page-one"]}>
        <EditorDirtyNavigationProvider>
          <LanguageProvider>
            <Link to="/editor/pages/page-two">Open page two</Link>
            <Routes>
              <Route path="/editor/pages/:id" element={<PageEditor />} />
            </Routes>
          </LanguageProvider>
        </EditorDirtyNavigationProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("textbox", { name: "Title (Malay)" }),
    ).toHaveValue("Page one title");
    fireEvent.click(screen.getByRole("link", { name: "Open page two" }));

    expect(screen.getByRole("status")).toHaveTextContent("Loading page draft");
    expect(
      screen.queryByRole("textbox", { name: "Title (Malay)" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      rejectSecondLoad(new Error("load failed"));
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("The page draft could not be loaded");
    expect(
      screen.queryByRole("textbox", { name: "Title (Malay)" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save Draft" })).not.toBeInTheDocument();
    expect(pageApi.savePageDraft).not.toHaveBeenCalled();
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
