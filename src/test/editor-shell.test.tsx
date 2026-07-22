import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    canManageTrackingSettings: true,
    signOut: vi.fn(),
    user: { email: "editor@klinikawfa.com" },
  }),
}));

import { EditorLayout } from "@/components/editor/EditorLayout";

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/editor"]}>
      <Routes>
        <Route path="/editor" element={<EditorLayout />}>
          <Route index element={<div>Dashboard content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("website editor shell", () => {
  it("shows grouped desktop navigation and the mobile menu control", () => {
    renderEditor();

    expect(
      screen.getByRole("navigation", { name: "Website editor" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Pages" })).toHaveAttribute(
      "href",
      "/editor/pages",
    );
    expect(screen.getByRole("link", { name: "Posts" })).toHaveAttribute(
      "href",
      "/editor/posts",
    );
    expect(screen.getByRole("link", { name: "Media" })).toHaveAttribute(
      "href",
      "/editor/media",
    );
    expect(screen.getByText("Website Content")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open editor menu" }),
    ).toBeVisible();
  });
});
