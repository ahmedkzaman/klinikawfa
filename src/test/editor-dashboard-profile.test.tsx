import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EditorDashboard from "@/pages/editor/Dashboard";
import { EditorProfile } from "@/pages/editor/EditorProfile";

const auth = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  role: "website_editor",
  signOut: vi.fn(),
  user: { email: "editor@example.com" },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

describe("website editor dashboard and profile", () => {
  beforeEach(() => {
    auth.resetPassword.mockReset().mockResolvedValue({ error: null });
    auth.signOut.mockReset().mockResolvedValue(undefined);
  });

  it("shows every approved website section without clinic operational data", () => {
    render(
      <MemoryRouter>
        <EditorDashboard />
      </MemoryRouter>,
    );

    for (const label of [
      "Home",
      "Pages",
      "Services",
      "Team",
      "Blog",
      "Gallery",
      "Reviews",
      "Navigation",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }

    expect(screen.queryByText(/patients|appointments|payments|payroll/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/coming in the next cms plan/i)).not.toBeInTheDocument();
  });

  it("shows only the current editor account and sends its reset email", async () => {
    render(
      <MemoryRouter>
        <EditorProfile />
      </MemoryRouter>,
    );

    expect(screen.getByText("editor@example.com")).toBeInTheDocument();
    expect(screen.getByText("website_editor")).toBeInTheDocument();
    expect(screen.queryByText(/assign role|other users|secret/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /send password-reset email/i }));
    await waitFor(() => expect(auth.resetPassword).toHaveBeenCalledWith("editor@example.com"));
    expect(await screen.findByText(/password-reset email has been sent/i)).toBeInTheDocument();
  });
});
