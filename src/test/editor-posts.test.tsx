import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { EditorDirtyNavigationProvider } from "@/components/editor/EditorDirtyNavigation";
import { PostsWebsiteEditor } from "@/pages/editor/Posts";

vi.mock("@/components/admin/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange(value: string): void }) => <textarea aria-label="Post body editor" onChange={(event) => onChange(event.target.value)} value={value} />,
}));
vi.mock("@/components/editor/media/MediaSelectorDialog", () => ({
  MediaSelectorDialog: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock("@/features/website-cms/posts/api", () => ({
  createPostTag: vi.fn(),
  listPostTaxonomy: vi.fn().mockResolvedValue({ categories: [], tags: [] }),
}));
vi.mock("@/features/website-cms/api/resources", () => ({
  fetchResourceForEditor: vi.fn(),
  newResourceId: () => "3f1d9427-1f06-4e18-9bf1-d5dd1f242948",
  publishResourceDraft: vi.fn(),
  saveResourceDraft: vi.fn(),
}));
vi.mock("@/features/website-cms/resources/adapters", () => ({
  createWebsiteResourceAdapter: () => ({
    list: vi.fn(), load: vi.fn(), validate: vi.fn(), saveDraft: vi.fn(),
    publish: vi.fn(), schedule: vi.fn(), trash: vi.fn(), restore: vi.fn(), duplicate: vi.fn(),
  }),
}));

describe("Posts editor", () => {
  it("provides focused bilingual authoring, taxonomy, and featured media", () => {
    render(<MemoryRouter initialEntries={["/editor/posts/new"]}><EditorDirtyNavigationProvider><Routes><Route path="/editor/posts/:id" element={<PostsWebsiteEditor />} /></Routes></EditorDirtyNavigationProvider></MemoryRouter>);
    expect(screen.getByLabelText("Post title in Bahasa Melayu *")).toBeVisible();
    expect(screen.getByLabelText("Category")).toBeVisible();
    expect(screen.getByLabelText("Tags")).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose featured image" })).toBeVisible();
    expect(screen.getByText("Search and social appearance")).toBeVisible();
  });
});
