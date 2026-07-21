import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";
import type { HomeContent } from "@/features/website-cms/schemas/home";
import { HomeEditor } from "@/pages/editor/HomeEditor";
import { EditorDirtyNavigationProvider } from "@/components/editor/EditorDirtyNavigation";
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
      <EditorDirtyNavigationProvider>
        <LanguageProvider>
          <HomeEditor />
        </LanguageProvider>
      </EditorDirtyNavigationProvider>
    </MemoryRouter>,
  );
}

async function loadEditor() {
  renderEditor();
  await screen.findByRole("heading", { name: "Home page" });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function withinPreviewFrame() {
  const frame = screen.getByTestId("live-preview-frame") as HTMLIFrameElement;
  fireEvent.load(frame);

  const previewDocument = frame.contentDocument;
  if (!previewDocument) throw new Error("Expected the live-preview iframe document");

  return within(previewDocument.body);
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
  document.querySelectorAll("[data-live-preview-test-style]").forEach((node) =>
    node.remove(),
  );
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
});

describe("LivePreview", () => {
  it("portals into a scriptless sandboxed browsing context with exact viewport controls", async () => {
    render(
      <LivePreview title="Live Preview">
        <p>Preview content</p>
      </LivePreview>,
    );

    const frame = screen.getByTestId("live-preview-frame");
    expect(frame).toBeInstanceOf(HTMLIFrameElement);
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(frame).toHaveAttribute("srcdoc");
    expect(frame).toHaveAttribute("tabindex", "-1");
    expect(frame).toHaveStyle({ width: "1280px" });
    expect(screen.getByRole("button", { name: "Desktop 1280 px" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.load(frame);
    const previewDocument = (frame as HTMLIFrameElement).contentDocument!;
    await waitFor(() =>
      expect(previewDocument.getElementById("live-preview-root")).toHaveTextContent(
        "Preview content",
      ),
    );
    const previewRoot = previewDocument.getElementById("live-preview-root")!;
    expect(previewRoot).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Mobile 390 px" }));

    expect(frame).toHaveStyle({ width: "390px" });
    expect(screen.getByRole("button", { name: "Mobile 390 px" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("mirrors stylesheet nodes and document theme attributes, then cleans up observers", async () => {
    const sourceStyle = document.createElement("style");
    sourceStyle.setAttribute("data-live-preview-test-style", "true");
    sourceStyle.textContent = ".preview-probe { color: rgb(1, 2, 3); }";
    document.head.append(sourceStyle);
    document.documentElement.className = "dark test-theme";
    document.documentElement.setAttribute("data-theme", "clinic");

    const { unmount } = render(
      <LivePreview title="Live Preview">
        <p className="preview-probe">Preview content</p>
      </LivePreview>,
    );
    const frame = screen.getByTestId("live-preview-frame") as HTMLIFrameElement;
    fireEvent.load(frame);
    const previewDocument = frame.contentDocument!;

    await waitFor(() => {
      expect(
        previewDocument.head.querySelector(
          '[data-live-preview-style="true"]',
        )?.textContent,
      ).toContain("rgb(1, 2, 3)");
      expect(previewDocument.documentElement).toHaveClass("dark", "test-theme");
      expect(previewDocument.documentElement).toHaveAttribute(
        "data-theme",
        "clinic",
      );
    });

    sourceStyle.textContent = ".preview-probe { color: rgb(4, 5, 6); }";
    document.documentElement.setAttribute("data-theme", "updated");
    await waitFor(() => {
      expect(
        previewDocument.head.querySelector(
          '[data-live-preview-style="true"]',
        )?.textContent,
      ).toContain("rgb(4, 5, 6)");
      expect(previewDocument.documentElement).toHaveAttribute(
        "data-theme",
        "updated",
      );
    });

    unmount();
    expect(
      previewDocument.head.querySelector('[data-live-preview-style="true"]'),
    ).not.toBeInTheDocument();
    sourceStyle.remove();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
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

    const frame = screen.getByTestId("live-preview-frame") as HTMLIFrameElement;
    fireEvent.load(frame);
    const previewDocument = frame.contentDocument!;
    await waitFor(() =>
      expect(
        within(previewDocument.body).getByRole("link", { name: "Services" }),
      ).toBeInTheDocument(),
    );
    const preview = within(previewDocument.body);

    expect(fireEvent.click(preview.getByRole("link", { name: "Services" }))).toBe(false);
    expect(
      fireEvent.click(preview.getByRole("button", { name: "Analytics action" })),
    ).toBe(false);
    expect(analyticsAction).not.toHaveBeenCalled();
    fireEvent.submit(preview.getByRole("button", { name: "Send" }).closest("form")!);
    expect(submitted).not.toHaveBeenCalled();

    const iframe = preview.getByTitle("Map");
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
    expect(
      withinPreviewFrame().getByRole("heading", {
        name: "Rawatan dekat dengan anda",
      }),
    ).toBeInTheDocument();
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

    expect(
      withinPreviewFrame().getByRole("heading", { name: "Care close to home" }),
    ).toBeInTheDocument();
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

  it("locks the whole editable fieldset while a save is in flight", async () => {
    const pendingSave = deferred<ReturnType<typeof editorResult>["draft"]>();
    pageApi.savePageDraft.mockReturnValue(pendingSave.promise);
    await loadEditor();
    const title = screen.getByRole("textbox", {
      name: "Hero slide 1 title (Malay)",
    });
    fireEvent.change(title, { target: { value: "Draf terkunci" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    const editableFields = screen.getByRole("group", {
      name: "Home page editable fields",
    });
    await waitFor(() => expect(editableFields).toBeDisabled());
    expect(title).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    expect(pageApi.savePageDraft).toHaveBeenCalledTimes(1);

    const saved = editorResult().draft;
    saved.content.hero.slides[0].title.ms = "Draf terkunci";
    await act(async () => pendingSave.resolve(saved));

    expect(await screen.findByText("Draft saved privately.")).toBeInTheDocument();
    expect(editableFields).not.toBeDisabled();
  });

  it("coordinates delegated restore so batched confirmations cannot overlap", async () => {
    const pendingRestore = deferred<void>();
    pageApi.restorePageVersionToDraft.mockReturnValue(pendingRestore.promise);
    await loadEditor();
    const restoreChoice = await screen.findByRole("button", {
      name: "Restore revision 6 to draft",
    });
    const title = screen.getByRole("textbox", {
      name: "Hero slide 1 title (Malay)",
    });
    fireEvent.click(restoreChoice);
    const confirmRestore = screen.getByRole("button", {
      name: "Restore revision 6",
    });

    act(() => {
      confirmRestore.click();
      confirmRestore.click();
    });

    expect(pageApi.restorePageVersionToDraft).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(title).toBeDisabled());

    await act(async () => pendingRestore.resolve());
    expect(
      await screen.findByText(
        "Version restored to the private draft. Review it before publishing.",
      ),
    ).toBeInTheDocument();
    expect(pageApi.fetchEditorPage).toHaveBeenCalledTimes(2);
  });

  it("does no follow-up load when publish resolves after unmount", async () => {
    const pendingPublish = deferred<void>();
    pageApi.publishPageDraft.mockReturnValue(pendingPublish.promise);
    const rendered = renderEditor();
    await screen.findByRole("heading", { name: "Home page" });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
    expect(pageApi.publishPageDraft).toHaveBeenCalledTimes(1);

    rendered.unmount();
    await act(async () => pendingPublish.resolve());

    expect(pageApi.fetchEditorPage).toHaveBeenCalledTimes(1);
  });

  it("ignores an older load generation after a newer draft becomes dirty", async () => {
    const firstLoad = deferred<ReturnType<typeof editorResult>>();
    const secondLoad = deferred<ReturnType<typeof editorResult>>();
    pageApi.fetchEditorPage
      .mockReset()
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise);

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/editor/home"]}>
          <EditorDirtyNavigationProvider>
            <LanguageProvider>
              <HomeEditor />
            </LanguageProvider>
          </EditorDirtyNavigationProvider>
        </MemoryRouter>
      </StrictMode>,
    );
    await waitFor(() => expect(pageApi.fetchEditorPage).toHaveBeenCalledTimes(2));
    const newer = editorResult();
    newer.draft.content.hero.slides[0].title.ms = "Draf lebih baharu";
    await act(async () => secondLoad.resolve(newer));
    const title = await screen.findByRole("textbox", {
      name: "Hero slide 1 title (Malay)",
    });
    fireEvent.change(title, { target: { value: "Perubahan tempatan" } });

    await act(async () => firstLoad.resolve(editorResult()));

    expect(
      screen.getByRole("textbox", { name: "Hero slide 1 title (Malay)" }),
    ).toHaveValue("Perubahan tempatan");
    expect(screen.getByText("Unsaved local changes")).toBeInTheDocument();
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

  it("warns before unload, guards same-tab anchors, and exempts public new tabs", async () => {
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
    publicLink.target = "_blank";
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
