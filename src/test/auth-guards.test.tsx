import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Track navigations performed by <Navigate />.
const navigations: string[] = [];

// Mock react-router-dom's Navigate to a sentinel that records the `to` prop.
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      navigations.push(typeof to === "string" ? to : JSON.stringify(to));
      return <div data-testid="navigate" data-to={to as string} />;
    },
  };
});

// Mock the auth context. Tests override the return value per case.
const useAuthMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

// Avoid pulling the real Supabase client (and its env) into the test bundle
// if ProtectedRoute's transitive imports ever change.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { ProtectedRoute } from "@/components/ProtectedRoute";

const baseAuth = {
  user: null as null | { id: string },
  session: null,
  loading: false,
  rolesLoading: false,
  role: null as string | null,
  isAdmin: false,
  isStaffOrAdmin: false,
  isGuest: false,
  isSpecialAdmin: false,
  isOperations: false,
  isOpsStaff: false,
  isOpsOrAdmin: false,
  isDoctorAdmin: false,
  isLocum: false,
  isClinical: false,
  canViewInsights: false,
  canManageWebsite: false,
  canManageTrackingSettings: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
};

function renderGuard(props: {
  requireAdmin?: boolean;
  requireStaffOrAdmin?: boolean;
}) {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <ProtectedRoute {...props}>
        <div data-testid="children">secret content</div>
      </ProtectedRoute>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    navigations.length = 0;
    useAuthMock.mockReset();
  });

  it("redirects unauthenticated users to /auth", () => {
    useAuthMock.mockReturnValue({ ...baseAuth, user: null });

    renderGuard({ requireStaffOrAdmin: true });

    expect(screen.queryByTestId("children")).toBeNull();
    expect(navigations).toContain("/auth");
  });

  it("redirects authenticated non-admin away from admin-only routes", () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      user: { id: "u-ops" },
      role: "ops_staff",
      isAdmin: false,
      isStaffOrAdmin: true,
    });

    renderGuard({ requireAdmin: true });

    expect(screen.queryByTestId("children")).toBeNull();
    expect(navigations).toContain("/");
  });

  it("redirects guest role away from staff/admin routes", () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      user: { id: "u-guest" },
      role: "guest",
      isStaffOrAdmin: false,
    });

    renderGuard({ requireStaffOrAdmin: true });

    expect(screen.queryByTestId("children")).toBeNull();
    expect(navigations).toContain("/");
  });

  it("keeps Website Editor excluded from existing staff and administrator guards", () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      user: { id: "u-website-editor" },
      role: "website_editor",
      canManageWebsite: true,
      canManageTrackingSettings: true,
    });

    const { unmount } = renderGuard({ requireStaffOrAdmin: true });

    expect(screen.queryByTestId("children")).toBeNull();
    expect(navigations).toContain("/");

    unmount();
    navigations.length = 0;
    renderGuard({ requireAdmin: true });

    expect(screen.queryByTestId("children")).toBeNull();
    expect(navigations).toContain("/");
  });

  it("renders children for admin users on admin-only routes", () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      user: { id: "u-admin" },
      role: "admin",
      isAdmin: true,
      isStaffOrAdmin: true,
    });

    renderGuard({ requireAdmin: true });

    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(navigations).toHaveLength(0);
  });

  it("shows loader while roles are loading on role-gated routes", () => {
    useAuthMock.mockReturnValue({
      ...baseAuth,
      user: { id: "u-x" },
      loading: false,
      rolesLoading: true,
    });

    renderGuard({ requireAdmin: true });

    expect(screen.queryByTestId("children")).toBeNull();
    expect(navigations).toHaveLength(0);
  });
});
