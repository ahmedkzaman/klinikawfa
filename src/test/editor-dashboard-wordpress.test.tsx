import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import EditorDashboard from "@/pages/editor/Dashboard";

vi.mock("@/features/website-cms/api/dashboard", () => ({
  fetchEditorDashboard: vi.fn().mockResolvedValue({ drafts: 3, scheduled: 1, published: 8, trash: 0, activity: [] }),
}));

describe("WordPress-inspired editor dashboard", () => {
  it("shows overview, queues, activity, and quick creation", async () => {
    render(<MemoryRouter><EditorDashboard /></MemoryRouter>);
    expect(await screen.findByText("Content overview")).toBeVisible();
    expect(screen.getByText("Drafts requiring attention")).toBeVisible();
    expect(screen.getByText("Scheduled publications")).toBeVisible();
    expect(screen.getByText("Recent activity")).toBeVisible();
    expect(screen.getByRole("link", { name: "Add page" })).toHaveAttribute("href", "/editor/pages/new");
    expect(screen.getByRole("link", { name: "Add post" })).toHaveAttribute("href", "/editor/posts/new");
  });
});
