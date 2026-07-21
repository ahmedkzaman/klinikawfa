import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div data-testid="location">{to}</div>,
  };
});

const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

import { EditorProtectedRoute } from "@/components/editor/EditorProtectedRoute";

const baseAuth = {
  user: { id: "user-id" },
  loading: false,
  rolesLoading: false,
  canManageWebsite: false,
  canManageTrackingSettings: false,
};

function setRole(role: string) {
  const canManage = ["website_editor", "admin", "special_admin", "doctor_admin"].includes(role);
  useAuthMock.mockReturnValue({
    ...baseAuth,
    role,
    canManageWebsite: canManage,
    canManageTrackingSettings: canManage,
  });
}

function renderGuard(role: string) {
  setRole(role);
  return render(
    <MemoryRouter initialEntries={["/editor"]}>
      <EditorProtectedRoute>
        <div>Editor content</div>
      </EditorProtectedRoute>
    </MemoryRouter>,
  );
}

function renderTrackingSettingsGuard(role: string) {
  const canManageTrackingSettings = ["website_editor", "admin", "special_admin", "doctor_admin"].includes(role);
  useAuthMock.mockReturnValue({
    ...baseAuth,
    role,
    // Exercise the tracking-settings branch after website access is granted.
    canManageWebsite: true,
    canManageTrackingSettings,
  });
  return render(
    <MemoryRouter initialEntries={["/editor/analytics"]}>
      <EditorProtectedRoute requireTrackingSettings>
        <div>Tracking settings</div>
      </EditorProtectedRoute>
    </MemoryRouter>,
  );
}

function renderAnonymousGuard() {
  useAuthMock.mockReturnValue({ ...baseAuth, user: null });
  return render(
    <MemoryRouter initialEntries={["/editor"]}>
      <EditorProtectedRoute>
        <div>Editor content</div>
      </EditorProtectedRoute>
    </MemoryRouter>,
  );
}

describe("EditorProtectedRoute", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it.each(["website_editor", "admin", "special_admin", "doctor_admin"])(
    "allows %s into /editor",
    (role) => expect(renderGuard(role).queryByText("Editor content")).toBeInTheDocument(),
  );

  it.each(["staff", "ops_staff", "operations", "locum", "resident_doctor", "guest"])(
    "redirects %s away from /editor",
    (role) => expect(renderGuard(role).queryByTestId("location")).toHaveTextContent("/"),
  );

  it.each(["website_editor", "admin", "special_admin", "doctor_admin"])(
    "allows %s into /editor/analytics with the tracking-settings guard",
    (role) =>
      expect(renderTrackingSettingsGuard(role).queryByText("Tracking settings")).toBeInTheDocument(),
  );

  it.each(["staff", "ops_staff", "operations", "locum", "resident_doctor", "guest"])(
    "redirects %s away from /editor/analytics",
    (role) =>
      expect(renderTrackingSettingsGuard(role).queryByTestId("location")).toHaveTextContent("/editor"),
  );

  it("redirects anonymous visitors to /auth", () => {
    expect(renderAnonymousGuard().queryByTestId("location")).toHaveTextContent("/auth");
  });
});
