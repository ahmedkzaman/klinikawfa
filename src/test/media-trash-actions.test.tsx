import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { MediaDetail } from "@/pages/editor/MediaDetail";

const { baseMedia } = vi.hoisted(() => ({ baseMedia: {
  id: "11111111-1111-4111-8111-111111111111", storageBucket: "website-media", storagePath: "gallery/x.webp",
  publicUrl: "https://example.test/x.webp", mimeType: "image/webp", byteSize: 100, width: 100, height: 100,
  altMs: "Clinic", altEn: "Clinic", captionMs: "", captionEn: "", descriptionMs: "", descriptionEn: "",
  createdAt: "2026-07-22T00:00:00Z", createdBy: "22222222-2222-4222-8222-222222222222",
  trashedAt: null, replacedBy: null, referenceCount: 0,
} }));

vi.mock("@/features/website-cms/media/api", () => ({
  getMedia: vi.fn().mockResolvedValue(baseMedia), updateMediaMetadata: vi.fn(), trashMedia: vi.fn(),
  restoreMedia: vi.fn(), deleteMediaPermanently: vi.fn(),
}));

describe("Media detail lifecycle actions", () => {
  it("only offers permanent deletion after the item is in Trash", async () => {
    render(<MemoryRouter initialEntries={[`/editor/media/${baseMedia.id}`]}><Routes><Route path="/editor/media/:id" element={<MediaDetail />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Move to Trash" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete permanently" })).not.toBeInTheDocument();
  });
});
