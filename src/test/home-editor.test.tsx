import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";
import type { HomeContent } from "@/features/website-cms/schemas/home";
import { HomeEditor } from "@/pages/editor/HomeEditor";
import { LivePreview } from "@/components/editor/LivePreview";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
}

Object.defineProperty(globalThis, "IntersectionObserver", {
  configurable: true,
  value: IntersectionObserverStub,
  writable: true,
});

const pageApi = vi.hoisted(() => {
  class StaleWebsitePageDraftError extends Error {}

  return {
    fetchEditorPage: vi.fn(),
    fetchPageVersions: vi.fn(),
    publishPageDraft: vi.fn(),
    restorePageVersionToDraft: vi.fn(),
    savePageDraft: vi.fn(),
    StaleWebsitePageDraftError,
  };
});

vi.mock("@/features/website-cms/api/pages", () => pageApi);
vi.mock("@/hooks/useGalleryImages", () => ({
  useGalleryImages: () => ({ allImages: [], isLoading: false }),
}));
vi.mock("@/hooks/useReviews", () => ({
  useReviews: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async () => ({ data: [], error: null }),
      }),
    }),
  },
}));

function editorResult(content = structuredClone(DEFAULT_HOME_CONTENT)) {
  content.sectionOrder = ["hero"];
  return {
    page: {
      id: "page-home",
      kind: "home" as const,
      publishedContent: structuredClone(DEFAULT_HOME_CONTENT),
      revision: 7,
      slug: "home",
      status: "published" as const,
    },
    draft: {
      baseRevision: 7,
      content,
      pageId: "page-home",
      persisted: true,
    },
  };
}

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/editor/home"]}>
      <LanguageProvider>
        <HomeEditor />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

async function loadEditor() {
  renderEditor();
  await screen.findByRole("heading", { name: "Home page" });
}

beforeEach(() => {
  localStorage.clear();
  pageApi.fetchEditorPage.mockReset().mockResolvedValue(editorResult());
  pageApi.fetchPageVersions.mockReset().mockResolvedValue([
    {
      id: "version-6",
      publishedAt: "2026-07-20T08:30:00.000Z",
      publishedBy: "manager-user",
      revision: 6,
    },
  ]);
  pageApi.publishPageDraft.mockReset().mockResolvedValue(undefined);
  pageApi.restorePageVersionToDraft.mockReset().mockResolvedValue(undefined);
  pageApi.savePageDraft.mockReset().mockImplementation(async ({ content }) => ({
    baseRevision: 7,
    content: structuredClone(content as HomeContent),
    pageId: "page-home",
    persisted: true,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LivePreview", () => {
  it("switches between exact desktop and mobile frames with accessible controls", () => {
    render(
      <LivePreview title="Live Preview">
        <p>Preview content</p>
      </LivePreview>,
    );

    const frame = screen.getByTestId("live-preview-frame");
    expect(frame).toHaveStyle({ width: "1280px" });
    expect(screen.getByRole("button", { name: "Desktop 1280 px" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Mobile 390 px" }));

    expect(frame).toHaveStyle({ width: "390px" });
    expect(screen.getByRole("button", { name: "Mobile 390 px" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("blocks preview navigation, submissions, iframe focus, and iframe capabilities", async () => {
    const analyticsAction = vi.fn();
    const submitted = vi.fn();
    render(
      <LivePreview title="Live Preview">
        <a href="/services">Services</a>
        <button type="button" onClick={analyticsAction}>
          Analytics action
        </button>
        <form onSubmit={submitted}>
          <button type="submit">Send</button>
        </form>
        <iframe src="about:blank" title="Map" />
      </LivePreview>,
    );

    expect(fireEvent.click(screen.getByRole("link", { name: "Services" }))).toBe(false);
    expect(
      fireEvent.click(screen.getByRole("button", { name: "Analytics action" })),
    ).toBe(false);
    expect(analyticsAction).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole("button", { name: "Send" }).closest("form")!);
    expect(submitted).not.toHaveBeenCalled();

    const iframe = screen.getByTitle("Map");
    await waitFor(() => expect(iframe).toHaveAttribute("sandbox", ""));
    expect(iframe).toHaveAttribute("tabindex", "-1");
  });
});

describe("HomeEditor", { timeout: 30_000 }, () => {
  it("renders local unsaved changes in the final bottom preview before saving", async () => {
    await loadEditor();
    const input = screen.getByRole("textbox", {
      name: "Hero slide 1 title (Malay)",
    });

    fireEvent.change(input, { target: { value: "Rawatan dekat dengan anda" } });

    const preview = screen.getByRole("region", { name: "Pratonton Langsung" });
    expect(within(preview).getByRole("heading", { name: "Rawatan dekat dengan anda" })).toBeInTheDocument();
    expect(pageApi.savePageDraft).not.toHaveBeenCalled();
    expect(preview.parentElement).toBe(preview.parentElement?.parentElement?.lastElementChild);
  });

  it("exposes every approved Home schema group through labeled controls", async () => {
    await loadEditor();

    const labels = [
      "Hero background image URL",
      "Hero background alt text (English)",
      "Hero background opacity",
      "Hero autoplay interval",
      "Hero slide 1 subtitle (English)",
      "Hero CTA 1 URL",
      "Hero carousel previous label (Malay)",
      "Why eyebrow (Malay)",
      "Why item 1 icon",
      "Why item 1 description (English)",
      "Video placeholder (Malay)",
      "Video unsupported message (English)",
      "Video URL setting key",
      "Video poster setting key",
      "Services CTA label (English)",
      "Services item limit",
      "Services learn more label (Malay)",
      "Gallery empty message (English)",
      "Gallery more label (Malay)",
      "Gallery close label (English)",
      "Gallery swipe hint (Malay)",
      "Testimonials patient label (English)",
      "Testimonials carousel role description (Malay)",
      "Map hours label (English)",
      "Map directions URL",
      "Map embed URL",
      "Map embed title (Malay)",
      "SEO title (English)",
      "SEO description (Malay)",
      "Show Hero",
      "Show Map",
    ];

    for (const label of labels) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Move Hero down" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Media upload available in the resources phase",
      }),
    ).toBeDisabled();
  });

  it("keeps local state bilingual and switches the preview language", async () => {
    const content = structuredClone(DEFAULT_HOME_CONTENT);
    content.hero.slides[0].title.en = "Care close to home";
    pageApi.fetchEditorPage.mockResolvedValue(editorResult(content));
    await loadEditor();

    fireEvent.click(screen.getByRole("button", { name: "Preview in English" }));

    const preview = screen.getByRole("region", { name: "Live Preview" });
    expect(within(preview).getByRole("heading", { name: "Care close to home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview in English" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Save Draft writes only through the draft API", async () => {
    await loadEditor();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Hero slide 1 title (Malay)" }),
      { target: { value: "Draf tempatan" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    await waitFor(() =>
      expect(pageApi.savePageDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          baseRevision: 7,
          pageId: "page-home",
          slug: "home",
          content: expect.objectContaining({
            hero: expect.objectContaining({
              slides: expect.arrayContaining([
                expect.objectContaining({
                  title: expect.objectContaining({ ms: "Draf tempatan" }),
                }),
              ]),
            }),
          }),
        }),
      ),
    );
    expect(pageApi.publishPageDraft).not.toHaveBeenCalled();
    expect(await screen.findByText("Draft saved privately.")).toBeInTheDocument();
  });

  it("requires explicit confirmation before using the atomic publish API", async () => {
    await loadEditor();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(pageApi.publishPageDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Publish Home page?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));

    await waitFor(() =>
      expect(pageApi.publishPageDraft).toHaveBeenCalledWith({
        expectedRevision: 7,
        pageId: "page-home",
      }),
    );
  });

  it("shows clear reload and merge guidance for a stale publish", async () => {
    pageApi.publishPageDraft.mockRejectedValue(
      new pageApi.StaleWebsitePageDraftError(
        "Website page draft is based on a stale revision",
      ),
    );
    await loadEditor();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reload the latest draft, then merge your local edits before publishing again.",
    );
    expect(screen.getByRole("button", { name: "Reload latest draft" })).toBeInTheDocument();
  });

  it("shows a redacted retry message instead of merge guidance for other publish failures", async () => {
    pageApi.publishPageDraft.mockRejectedValue(
      new Error("permission denied for private.website_page_drafts"),
    );
    await loadEditor();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Home page could not be published. The saved draft is unchanged. Try again.",
    );
    expect(screen.queryByText(/permission denied|private\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/merge your local edits/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reload latest draft" }),
    ).not.toBeInTheDocument();
  });

  it("lists readable revisions and restores a confirmed version only to draft", async () => {
    await loadEditor();
    expect(await screen.findByText("Revision 6")).toBeInTheDocument();
    expect(screen.getByText(/20 Jul 2026, 4:30 p\.?m\.?/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Restore revision 6 to draft" }),
    );
    expect(pageApi.restorePageVersionToDraft).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "Restore revision 6?" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore revision 6" }));

    await waitFor(() =>
      expect(pageApi.restorePageVersionToDraft).toHaveBeenCalledWith({
        pageId: "page-home",
        versionId: "version-6",
      }),
    );
    expect(pageApi.publishPageDraft).not.toHaveBeenCalled();
  });

  it("warns before unload and blocks only internal editor links while dirty", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await loadEditor();

    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Hero slide 1 title (Malay)" }),
      { target: { value: "Belum disimpan" } },
    );
    expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);

    const internal = document.createElement("a");
    internal.href = "/editor/pages";
    document.body.append(internal);
    const internalClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    internal.dispatchEvent(internalClick);
    expect(internalClick.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);

    const publicLink = document.createElement("a");
    publicLink.href = "/services";
    let publicWasBlockedByCapture = false;
    publicLink.addEventListener("click", (event) => {
      publicWasBlockedByCapture = event.defaultPrevented;
      event.preventDefault();
    });
    document.body.append(publicLink);
    const publicClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    publicLink.dispatchEvent(publicClick);
    expect(publicWasBlockedByCapture).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    internal.remove();
    publicLink.remove();
  });
});
