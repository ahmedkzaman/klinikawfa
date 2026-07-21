import { act, renderHook, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";
import {
  fetchEditorPage,
  fetchPublishedPage,
  savePageDraft,
} from "@/features/website-cms/api/pages";
import { usePublishedPage } from "@/features/website-cms/hooks/useWebsitePage";
import {
  homeContentSchema,
  type HomeContent,
} from "@/features/website-cms/schemas/home";

type QueryError = { message: string };
type QueryResult = { data: unknown; error: QueryError | null };

type QueryCall = {
  table: string;
  operation: "select" | "upsert";
  columns?: string;
  filters: Array<{ column: string; value: unknown }>;
  payload?: unknown;
  options?: unknown;
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
        upsert(payload: unknown, options?: unknown) {
          call.operation = "upsert";
          call.payload = payload;
          call.options = options;
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

  it("upserts only validated draft fields and omits actor and audit fields", async () => {
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

    const write = supabaseState.calls.find(({ operation }) => operation === "upsert");
    expect(write).toEqual({
      table: "website_page_drafts",
      operation: "upsert",
      columns: "page_id,draft_content,base_revision",
      filters: [],
      payload: {
        page_id: "page-home",
        draft_content: content,
        base_revision: 3,
      },
      options: { onConflict: "page_id" },
    });
    expect(supabaseState.calls.some(({ table }) => table === "website_pages")).toBe(
      false,
    );
    expect(Object.keys(write?.payload as object)).not.toContain("updated_by");
    expect(Object.keys(write?.payload as object)).not.toContain("updated_at");
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
});
