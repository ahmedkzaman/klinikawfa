import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ContentListPage } from "@/components/editor/content-list/ContentListPage";
import type { WebsiteResourceAdapter } from "@/features/website-cms/resources/adapters";

function createAdapter(): WebsiteResourceAdapter<Record<string, unknown>> {
  return {
    list: vi.fn().mockResolvedValue({
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          type: "page",
          title: "Family Care",
          slug: "family-care",
          status: "draft",
          authorName: "Website Editor",
          updatedAt: "2026-07-22T10:00:00.000Z",
          scheduledAt: null,
          revision: 2,
        },
      ],
      total: 4,
      totalsByStatus: { draft: 2, scheduled: 0, published: 2, trash: 0 },
    }),
    load: vi.fn(),
    validate: vi.fn((value) => value as Record<string, unknown>),
    saveDraft: vi.fn(),
    publish: vi.fn(),
    schedule: vi.fn(),
    trash: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn(),
    duplicate: vi.fn(),
  };
}

describe("shared website content list", () => {
  it("filters, searches, selects, and exposes safe bulk actions", async () => {
    const adapter = createAdapter();
    render(
      <MemoryRouter>
        <ContentListPage
          adapter={adapter}
          resourceLabel="Pages"
          createHref="/editor/pages/new"
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Pages" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Draft 2" }));
    await waitFor(() =>
      expect(adapter.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "draft" }),
      ),
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search Pages" }), {
      target: { value: "family" },
    });
    expect((await screen.findAllByText("Family Care"))[0]).toBeVisible();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Family Care" }),
    );
    expect(
      screen.getByRole("button", { name: "Apply bulk action" }),
    ).toBeEnabled();
  });
});
