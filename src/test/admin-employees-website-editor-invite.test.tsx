import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const useAuthMock = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }

      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
    },
    rpc: vi.fn(),
  },
}));

vi.mock("@/components/clinic/settings/AddUserDialog", () => ({
  AddUserDialog: ({ open, role }: { open: boolean; role: string }) =>
    open ? <output data-testid="invite-role">{role}</output> : null,
}));

import AdminEmployees from "@/pages/staff/admin/Employees";

describe("Admin Employees website-editor invitation", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it.each(["admin", "special_admin", "doctor_admin"])(
    "lets %s invite a Website Editor from the Employees page",
    async (role) => {
      useAuthMock.mockReturnValue({
        user: { id: `${role}-1` },
        role,
        isAdmin: true,
      });

      render(
        <MemoryRouter>
          <AdminEmployees />
        </MemoryRouter>,
      );

      const inviteButton = await screen.findByRole("button", {
        name: "Invite Website Editor",
      });
      fireEvent.click(inviteButton);

      expect(screen.getByTestId("invite-role")).toHaveTextContent(
        "website_editor",
      );
    },
  );

  it("does not expose the invitation control to a Website Editor", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "editor-1" },
      role: "website_editor",
      isAdmin: false,
    });

    render(
      <MemoryRouter>
        <AdminEmployees />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText("No employees found.")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Invite Website Editor" }),
    ).toBeNull();
  });
});
