import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PostTaxonomyFields } from "@/components/editor/posts/PostTaxonomyFields";

vi.mock("@/features/website-cms/posts/api", () => ({
  createPostTag: vi.fn().mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", name: "Kanak-kanak" }),
  listPostTaxonomy: vi.fn().mockResolvedValue({
    categories: [{ id: "11111111-1111-4111-8111-111111111111", name: "Kesihatan" }],
    tags: [{ id: "22222222-2222-4222-8222-222222222222", name: "Keluarga" }],
  }),
}));

describe("PostTaxonomyFields", () => {
  it("uses named category and tag controls instead of raw UUID fields", async () => {
    const onCategoryChange = vi.fn();
    const onTagsChange = vi.fn();
    render(<PostTaxonomyFields categoryId={null} onCategoryChange={onCategoryChange} onTagsChange={onTagsChange} tagIds={[]} />);

    const category = await screen.findByLabelText("Category");
    fireEvent.change(category, { target: { value: "11111111-1111-4111-8111-111111111111" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Keluarga" }));

    expect(onCategoryChange).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(onTagsChange).toHaveBeenCalledWith(["22222222-2222-4222-8222-222222222222"]);
    expect(screen.getByRole("button", { name: "Add tag" })).toBeVisible();
  });
});
