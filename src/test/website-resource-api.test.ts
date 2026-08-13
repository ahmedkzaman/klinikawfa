import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));

import {
  publishResourceDraft,
  StaleWebsiteResourceError,
} from "@/features/website-cms/api/resources";

describe("website resource publishing API", () => {
  beforeEach(() => rpc.mockReset());

  it("reports an immediate PostgREST revision conflict as stale content", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "stale website resource revision" },
    });

    await expect(
      publishResourceDraft("service", "7082984a-0d98-4b14-9979-3d278fcc64a2", 1),
    ).rejects.toBeInstanceOf(StaleWebsiteResourceError);
  });
});

describe("immediate website revision conflict migration", () => {
  it("changes stale website conflicts from retryable 40001 to HTTP 409", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260811073059_return_immediate_website_revision_conflicts.sql"),
      "utf8",
    );

    expect(sql).toContain("PT409");
    expect(sql).toContain("stale website");
    expect(sql).toContain("pg_get_functiondef");
  });
});
