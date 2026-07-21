import { act, renderHook, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";
import * as pagesApi from "@/features/website-cms/api/pages";
import { usePublishedPage } from "@/features/website-cms/hooks/useWebsitePage";
import {
  homeContentSchema,
  type HomeContent,
} from "@/features/website-cms/schemas/home";
import type { GeneralPageContent } from "@/features/website-cms/schemas/page";

type QueryError = { message: string };
type QueryResult = { data: unknown; error: QueryError | null };

type QueryCall = {
  table: string;
  operation: "insert" | "select" | "update";
  columns?: string;
  filters: Array<{ column: string; value: unknown }>;
  payload?: unknown;
};

const {
  fetchEditorPage,
  fetchPublishedPage,
  savePageDraft,
} = pagesApi;

const publishingApi = pagesApi as typeof pagesApi & {
  publishPageDraft(input: {
    expectedRevision: number;
    pageId: string;
  }): Promise<void>;
  restorePageVersionToDraft(input: {
    pageId: string;
    versionId: string;
  }): Promise<void>;
};

const supabaseState = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  getSession: vi.fn(),
  responses: [] as Array<Promise<QueryResult> | QueryResult>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: supabaseState.getSession,
    },
    from: (table: string) => {
      const call: QueryCall = {
        table,
        operation: "select",
        filters: [],
      };
      supabaseState.calls.push(call);

      const builder = {
        insert(payload: unknown) {
          call.operation = "insert";
          call.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          call.filters.push({ column, value });
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(
            supabaseState.responses.shift() ?? { data: null, error: null },
          );
        },
        select(columns: string) {
          call.columns = columns;
          return builder;
        },
        single() {
          return Promise.resolve(
            supabaseState.responses.shift() ?? { data: null, error: null },
          );
        },
        update(payload: unknown) {
          call.operation = "update";
          call.payload = payload;
          return builder;
        },
      };

      return builder;
    },
  },
}));

function createSession(userId = "manager-user"): Session {
  return {
    access_token: "test-access-token",
    expires_at: 2_000_000_000,
    expires_in: 3_600,
    refresh_token: "test-refresh-token",
    token_type: "bearer",
    user: {
      app_metadata: {},
      aud: "authenticated",
      created_at: "2026-07-21T00:00:00.000Z",
      id: userId,
      user_metadata: {},
    },
  };
}

function setSession(session: Session | null) {
  supabaseState.getSession.mockResolvedValue({
    data: { session },
    error: null,
  });
}

function customHomeContent(title: string): HomeContent {
  const content = structuredClone(DEFAULT_HOME_CONTENT);
  content.hero.slides[0].title.ms = title;
  return content;
}

function generalPageContent(title: string): GeneralPageContent {
  return {
    title: { ms: title, en: title },
    heroImage: null,
    heroAlt: { ms: "", en: "" },
    body: { ms: `${title} body`, en: `${title} body` },
    media: [],
    cta: null,
    seo: {
      title: { ms: title, en: title },
      description: { ms: `${title} description`, en: `${title} description` },
    },
  };
}

function deferredResult() {
  let resolve!: (result: QueryResult) => void;
  const promise = new Promise<QueryResult>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  supabaseState.calls.length = 0;
  supabaseState.responses.length = 0;
  supabaseState.getSession.mockReset();
  setSession(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchPublishedPage", () => {
  it("parses a published payload through the supplied schema", async () => {
    const published = customHomeContent("Kandungan diterbitkan");
    supabaseState.responses.push({
      data: {
        published_content: published,
        revision: 4,
        slug: "home",
        status: "published",
      },
      error: null,
    });

    const result = await fetchPublishedPage(
      "home",
      homeContentSchema,
      DEFAULT_HOME_CONTENT,
    );

    expect(result).toEqual(published);
    expect(result).not.toBe(published);
    expect(supabaseState.calls).toEqual([
      {
        table: "website_pages",
        operation: "select",
        columns: "slug,published_content,status,revision",
        filters: [
          { column: "slug", value: "home" },
          { column: "status", value: "published" },
        ],
      },
    ]);
  });

  it.each([
    ["missing row", { data: null, error: null }],
    ["query error", { data: null, error: { message: "read failed" } }],
    [
      "invalid payload",
      {
        data: {
          published_content: { hero: "invalid" },
          revision: 4,
          slug: "home",
          status: "published",
        },
        error: null,
      },
    ],
  ])("returns the bundled fallback for a %s", async (_case, response) => {
    supabaseState.responses.push(response);

    await expect(
      fetchPublishedPage("home", homeContentSchema, DEFAULT_HOME_CONTENT),
    ).resolves.toBe(DEFAULT_HOME_CONTENT);
  });

  it("returns the bundled fallback when the query throws", async () => {
    supabaseState.responses.push(Promise.reject(new Error("offline")));

    await expect(
      fetchPublishedPage("home", homeContentSchema, DEFAULT_HOME_CONTENT),
    ).resolves.toBe(DEFAULT_HOME_CONTENT);
  });
});

describe("fetchEditorPage", () => {
  it("rejects an anonymous session before reading private editor data", async () => {
    await expect(fetchEditorPage("home")).rejects.toThrow(
      "Website editor authorization required",
    );
    expect(supabaseState.calls).toHaveLength(0);
  });

  it("rejects a non-manager session before reading page or draft rows", async () => {
    setSession(createSession("staff-user"));
    supabaseState.responses.push({ data: { role: "staff" }, error: null });

    await expect(fetchEditorPage("home")).rejects.toThrow(
      "Website editor authorization required",
    );
    expect(supabaseState.calls.map(({ table }) => table)).toEqual(["user_roles"]);
  });

  it("returns the published page and private draft for an authorized session", async () => {
    const published = customHomeContent("Kandungan semasa");
    const draft = customHomeContent("Draf peribadi");
    setSession(createSession());
    supabaseState.responses.push(
      { data: { role: "website_editor" }, error: null },
      {
        data: {
          id: "page-home",
          kind: "home",
          published_content: published,
          revision: 7,
          slug: "home",
          status: "published",
        },
        error: null,
      },
      {
        data: {
          base_revision: 6,
          draft_content: draft,
          page_id: "page-home",
        },
        error: null,
      },
    );

    await expect(fetchEditorPage("home")).resolves.toEqual({
      page: {
        id: "page-home",
        kind: "home",
        publishedContent: published,
        revision: 7,
        slug: "home",
        status: "published",
      },
      draft: {
        baseRevision: 6,
        content: draft,
        pageId: "page-home",
        persisted: true,
      },
    });
    expect(supabaseState.calls.map(({ table }) => table)).toEqual([
      "user_roles",
      "website_pages",
      "website_page_drafts",
    ]);
  });

  it("synthesizes a missing draft in memory without writing", async () => {
    const published = customHomeContent("Asas draf");
    setSession(createSession());
    supabaseState.responses.push(
      { data: { role: "admin" }, error: null },
      {
        data: {
          id: "page-home",
          kind: "home",
          published_content: published,
          revision: 9,
          slug: "home",
          status: "published",
        },
        error: null,
      },
      { data: null, error: null },
    );

    const result = await fetchEditorPage("home");

    expect(result.draft).toEqual({
      baseRevision: 9,
      content: published,
      pageId: "page-home",
      persisted: false,
    });
    expect(supabaseState.calls.every(({ operation }) => operation === "select")).toBe(
      true,
    );
  });

  it("isolates synthesized nested draft edits from published content", async () => {
    const published = customHomeContent("Published stays unchanged");
    setSession(createSession());
    supabaseState.responses.push(
      { data: { role: "website_editor" }, error: null },
      {
        data: {
          id: "page-home",
          kind: "home",
          published_content: published,
          revision: 12,
          slug: "home",
          status: "published",
        },
        error: null,
      },
      { data: null, error: null },
    );

    const result = await fetchEditorPage("home");

    expect(result.draft.content).not.toBe(result.page.publishedContent);
    expect(result.draft.content.hero.slides[0]).not.toBe(
      result.page.publishedContent.hero.slides[0],
    );
    result.draft.content.hero.slides[0].title.ms = "Unsaved nested edit";
    expect(result.page.publishedContent.hero.slides[0].title.ms).toBe(
      "Published stays unchanged",
    );
  });
});

describe("savePageDraft", () => {
  it("rejects invalid content locally without reading or writing Supabase", async () => {
    await expect(
      savePageDraft({
        baseRevision: 3,
        content: { hero: "invalid" },
        pageId: "page-home",
        slug: "home",
      }),
    ).rejects.toThrow("Invalid website page draft");
    expect(supabaseState.getSession).not.toHaveBeenCalled();
    expect(supabaseState.calls).toHaveLength(0);
  });

  it("updates an existing draft without submitting its page_id", async () => {
    const content = customHomeContent("Draf disimpan");
    setSession(createSession());
    supabaseState.responses.push(
      { data: { role: "doctor_admin" }, error: null },
      {
        data: {
          base_revision: 3,
          draft_content: content,
          page_id: "page-home",
        },
        error: null,
      },
    );

    await expect(
      savePageDraft({
        baseRevision: 3,
        content,
        pageId: "page-home",
        slug: "home",
      }),
    ).resolves.toEqual({
      baseRevision: 3,
      content,
      pageId: "page-home",
      persisted: true,
    });

    const write = supabaseState.calls.find(({ operation }) => operation === "update");
    expect(write).toEqual({
      table: "website_page_drafts",
      operation: "update",
      columns: "page_id,draft_content,base_revision",
      filters: [{ column: "page_id", value: "page-home" }],
      payload: {
        draft_content: content,
        base_revision: 3,
      },
    });
    expect(supabaseState.calls.map(({ table }) => table)).toEqual([
      "user_roles",
      "website_page_drafts",
    ]);
    expect(Object.keys(write?.payload as object)).not.toContain("page_id");
    expect(Object.keys(write?.payload as object)).not.toContain("updated_by");
    expect(Object.keys(write?.payload as object)).not.toContain("updated_at");
  });

  it("inserts a missing draft with exactly the permitted create fields", async () => {
    const content = customHomeContent("Draf pertama");
    setSession(createSession());
    supabaseState.responses.push(
      { data: { role: "website_editor" }, error: null },
      { data: null, error: null },
      {
        data: {
          base_revision: 5,
          draft_content: content,
          page_id: "page-home",
        },
        error: null,
      },
    );

    await expect(
      savePageDraft({
        baseRevision: 5,
        content,
        pageId: "page-home",
        slug: "home",
      }),
    ).resolves.toEqual({
      baseRevision: 5,
      content,
      pageId: "page-home",
      persisted: true,
    });

    const writes = supabaseState.calls.filter(
      ({ operation }) => operation === "update" || operation === "insert",
    );
    expect(writes).toEqual([
      {
        table: "website_page_drafts",
        operation: "update",
        columns: "page_id,draft_content,base_revision",
        filters: [{ column: "page_id", value: "page-home" }],
        payload: {
          draft_content: content,
          base_revision: 5,
        },
      },
      {
        table: "website_page_drafts",
        operation: "insert",
        columns: "page_id,draft_content,base_revision",
        filters: [],
        payload: {
          page_id: "page-home",
          draft_content: content,
          base_revision: 5,
        },
      },
    ]);
    expect(supabaseState.calls.map(({ table }) => table)).toEqual([
      "user_roles",
      "website_page_drafts",
      "website_page_drafts",
    ]);
  });

  it("does not fall through to insert when the existing-draft update errors", async () => {
    const content = customHomeContent("Draf gagal");
    setSession(createSession());
    supabaseState.responses.push(
      { data: { role: "admin" }, error: null },
      { data: null, error: { message: "update denied" } },
    );

    await expect(
      savePageDraft({
        baseRevision: 2,
        content,
        pageId: "page-home",
        slug: "home",
      }),
    ).rejects.toThrow("Website page draft could not be saved");

    expect(
      supabaseState.calls.filter(({ operation }) => operation === "update"),
    ).toHaveLength(1);
    expect(
      supabaseState.calls.filter(({ operation }) => operation === "insert"),
    ).toHaveLength(0);
    expect(supabaseState.calls.map(({ table }) => table)).toEqual([
      "user_roles",
      "website_page_drafts",
    ]);
  });
});

describe("publishPageDraft", () => {
  it("requests publish through the draft row with both optimistic filters", async () => {
    setSession(createSession());
    supabaseState.responses.push(
      { data: { role: "website_editor" }, error: null },
      { data: { page_id: "page-home" }, error: null },
    );

    await expect(
      publishingApi.publishPageDraft({
        expectedRevision: 8,
        pageId: "page-home",
      }),
    ).resolves.toBeUndefined();

    const write = supabaseState.calls.find(
      ({ operation }) => operation === "update",
    );
    expect(write?.table).toBe("website_page_drafts");
    expect(write?.filters).toEqual([
      { column: "page_id", value: "page-home" },
      { column: "base_revision", value: 8 },
    ]);
    expect(write?.columns).toBe("page_id");
    expect(Object.keys(write?.payload as object)).toEqual([
      "publish_requested_at",
    ]);
    const requestedAt = (write?.payload as { publish_requested_at: string })
      .publish_requested_at;
    expect(new Date(requestedAt).toISOString()).toBe(requestedAt);
    expect(
      supabaseState.calls.some(
        ({ table, operation }) =>
          table === "website_pages" && operation !== "select",
      ),
    ).toBe(false);
  });
});

describe("restorePageVersionToDraft", () => {
  it("reads the authorized page version then restores only draft_content", async () => {
    const restored = customHomeContent("Versi dipulihkan");
    setSession(createSession());
    supabaseState.responses.push(
      { data: { role: "admin" }, error: null },
      {
        data: {
          id: "version-4",
          payload: restored,
          resource_id: "page-home",
        },
        error: null,
      },
      { data: { page_id: "page-home" }, error: null },
    );

    await expect(
      publishingApi.restorePageVersionToDraft({
        pageId: "page-home",
        versionId: "version-4",
      }),
    ).resolves.toBeUndefined();

    const versionRead = supabaseState.calls.find(
      ({ table }) => table === "website_content_versions",
    );
    expect(versionRead).toEqual({
      table: "website_content_versions",
      operation: "select",
      columns: "id,resource_id,payload",
      filters: [
        { column: "id", value: "version-4" },
        { column: "resource_type", value: "page" },
        { column: "resource_id", value: "page-home" },
      ],
    });

    const draftWrite = supabaseState.calls.find(
      ({ table, operation }) =>
        table === "website_page_drafts" && operation === "update",
    );
    expect(draftWrite).toEqual({
      table: "website_page_drafts",
      operation: "update",
      columns: "page_id",
      filters: [{ column: "page_id", value: "page-home" }],
      payload: { draft_content: restored },
    });
    expect(
      supabaseState.calls.some(
        ({ table, operation }) =>
          table === "website_pages" && operation !== "select",
      ),
    ).toBe(false);
  });
});

describe("usePublishedPage", () => {
  it("keeps the bundled fallback visible while the published query is loading", async () => {
    const pending = deferredResult();
    const published = customHomeContent("Kandungan jauh");
    supabaseState.responses.push(pending.promise);

    const { result } = renderHook(() =>
      usePublishedPage("home", DEFAULT_HOME_CONTENT),
    );

    expect(result.current).toBe(DEFAULT_HOME_CONTENT);

    await act(async () => {
      pending.resolve({
        data: {
          published_content: published,
          revision: 10,
          slug: "home",
          status: "published",
        },
        error: null,
      });
      await pending.promise;
    });

    await waitFor(() => expect(result.current).toEqual(published));
  });

  it("keeps the bundled fallback visible after a published query error", async () => {
    supabaseState.responses.push({
      data: null,
      error: { message: "not available" },
    });

    const { result } = renderHook(() =>
      usePublishedPage("home", DEFAULT_HOME_CONTENT),
    );

    expect(result.current).toBe(DEFAULT_HOME_CONTENT);
    await waitFor(() => expect(supabaseState.calls).toHaveLength(1));
    expect(result.current).toBe(DEFAULT_HOME_CONTENT);
  });

  it("does not refetch or reset resolved content for equivalent fallback allocations", async () => {
    const published = customHomeContent("Kandungan stabil");
    const initialFallback = structuredClone(DEFAULT_HOME_CONTENT);
    supabaseState.responses.push({
      data: {
        published_content: published,
        revision: 11,
        slug: "home",
        status: "published",
      },
      error: null,
    });

    const { result, rerender } = renderHook(
      ({ fallback }: { fallback: HomeContent }) =>
        usePublishedPage("home", fallback),
      { initialProps: { fallback: initialFallback } },
    );

    await waitFor(() => expect(result.current).toEqual(published));
    expect(supabaseState.calls).toHaveLength(1);

    rerender({ fallback: structuredClone(DEFAULT_HOME_CONTENT) });
    expect(result.current).toEqual(published);
    rerender({ fallback: structuredClone(DEFAULT_HOME_CONTENT) });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual(published);
    expect(supabaseState.calls).toHaveLength(1);
  });

  it("shows the new slug fallback immediately and ignores the stale request", async () => {
    const firstPending = deferredResult();
    const secondPending = deferredResult();
    const firstFallback = generalPageContent("Fallback first");
    const secondFallback = generalPageContent("Fallback second");
    const firstPublished = generalPageContent("Published first");
    const secondPublished = generalPageContent("Published second");
    supabaseState.responses.push(firstPending.promise, secondPending.promise);

    const { result, rerender } = renderHook(
      ({ fallback, slug }: { fallback: GeneralPageContent; slug: string }) =>
        usePublishedPage(slug, fallback),
      { initialProps: { fallback: firstFallback, slug: "first-page" } },
    );

    expect(result.current).toBe(firstFallback);
    await waitFor(() => expect(supabaseState.calls).toHaveLength(1));

    rerender({ fallback: secondFallback, slug: "second-page" });
    expect(result.current).toBe(secondFallback);
    await waitFor(() => expect(supabaseState.calls).toHaveLength(2));

    await act(async () => {
      firstPending.resolve({
        data: {
          published_content: firstPublished,
          revision: 1,
          slug: "first-page",
          status: "published",
        },
        error: null,
      });
      await firstPending.promise;
    });
    expect(result.current).toBe(secondFallback);

    await act(async () => {
      secondPending.resolve({
        data: {
          published_content: secondPublished,
          revision: 2,
          slug: "second-page",
          status: "published",
        },
        error: null,
      });
      await secondPending.promise;
    });
    await waitFor(() => expect(result.current).toEqual(secondPublished));
  });
});
