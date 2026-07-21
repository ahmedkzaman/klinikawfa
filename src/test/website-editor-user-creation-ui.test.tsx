import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const useAuthMock = vi.fn();
const useClinicUsersMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/hooks/clinic/useClinicUsers", () => ({
  useClinicUsers: () => useClinicUsersMock(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock("@/components/clinic/settings/DoctorProfileDialog", () => ({
  DoctorProfileDialog: () => null,
}));

vi.mock("@/components/clinic/settings/AddUserDialog", () => ({
  AddUserDialog: ({ role }: { role: string }) => <output data-testid="add-user-role">{role}</output>,
}));

import UserManagementSettings from "@/pages/clinic/settings/UserManagementSettings";

const baseAuth = {
  user: { id: "admin-1" },
  isAdmin: true,
  isSpecialAdmin: false,
  role: "admin",
};

describe("Website Editor account creation", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    useClinicUsersMock.mockReset();
    useClinicUsersMock.mockReturnValue({ data: [], isLoading: false });
  });

  it.each(["admin", "special_admin", "doctor_admin"])(
    "offers Add Website Editor to %s users and passes the website_editor role to the dialog",
    (role) => {
      useAuthMock.mockReturnValue({
        ...baseAuth,
        role,
        isSpecialAdmin: role === "special_admin",
      });

      render(
        <MemoryRouter>
          <UserManagementSettings />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Add Website Editor" }));

      expect(screen.getByTestId("add-user-role")).toHaveTextContent("website_editor");
    },
  );

  it("does not offer Website Editor creation to non-administrators", () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      role: "ops_staff",
      isAdmin: false,
      isSpecialAdmin: false,
    });

    render(
      <MemoryRouter>
        <UserManagementSettings />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "Add Website Editor" })).toBeNull();
  });

  it("shows Website Editor rows and offers the guarded role option to special admins", () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      role: "special_admin",
      isSpecialAdmin: true,
    });
    useClinicUsersMock.mockReturnValue({
      data: [
        {
          id: "website-editor-1",
          full_name: "Website Editor",
          email: "editor@klinikawfa.com",
          phone: null,
          mmc_number: null,
          requested_role: "website_editor",
          role: "website_editor",
          doctor: null,
        },
      ],
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <UserManagementSettings />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Website Editor", { exact: true })).toHaveLength(2);
    const roleSelect = screen.getByRole("combobox");
    expect(roleSelect).toBeEnabled();
    fireEvent.click(roleSelect);
    expect(screen.getByRole("option", { name: "Website Editor" })).toBeInTheDocument();
  });
});
