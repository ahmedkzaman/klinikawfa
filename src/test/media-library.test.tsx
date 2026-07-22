import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaLibrary } from "@/pages/editor/MediaLibrary";
import * as mediaApi from "@/features/website-cms/media/api";

vi.mock("@/features/website-cms/media/api", () => ({
  listMedia: vi.fn(),
  uploadAndCreateMedia: vi.fn(),
}));

describe("Media Library", () => {
  beforeEach(() => {
    vi.mocked(mediaApi.listMedia).mockResolvedValue({ items: [], total: 0 });
  });

  it("offers searchable catalog and safe upload", async () => {
    render(<MediaLibrary />);
    expect(await screen.findByRole("heading", { name: "Media Library" })).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search media" }), { target: { value: "clinic exterior" } });
    await waitFor(() => expect(mediaApi.listMedia).toHaveBeenCalledWith(expect.objectContaining({ search: "clinic exterior" })));
    expect(screen.getByRole("button", { name: "Upload media" })).toBeVisible();
  });
});
