import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn();
const navigationState = {
  items: null as null | Array<{
    id: string;
    href: string;
    labelMs: string;
    labelEn: string;
    parentId: string | null;
  }>,
};
let authState = {
  user: null as null | { email: string },
  isStaffOrAdmin: false,
  signOut: signOutMock,
  loading: false,
};

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: "en",
    setLanguage: vi.fn(),
    t: (key: string) => ({
      "nav.home": "Home",
      "nav.services": "Services",
      "nav.doctors": "Doctors",
      "nav.onDuty": "Doctor On Duty",
      "nav.appointment": "Appointment",
      "nav.gallery": "Gallery",
      "nav.healthTips": "Health Tips",
      "cta.bookAppointment": "Book Appointment",
      "cta.call": "Call",
    })[key] ?? key,
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/usePublishedNavigation", () => ({
  usePublishedNavigation: () => navigationState.items,
}));

vi.mock("@/components/ui/dropdown-menu", async () => {
  const React = await import("react");
  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <div role="menuitem" onClick={onClick}>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { MobileCTABar } from "@/components/layout/MobileCTABar";
import { SkipToContent } from "@/components/layout/SkipToContent";

function renderPublicShell() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Header />
      <Footer />
    </MemoryRouter>,
  );
}

describe("public layout", () => {
  beforeEach(() => {
    signOutMock.mockReset();
    authState = {
      user: null,
      isStaffOrAdmin: false,
      signOut: signOutMock,
      loading: false,
    };
    navigationState.items = null;
  });

  it("provides accessible navigation and contact actions", () => {
    renderPublicShell();

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("navigation", { name: /main|utama/i })).toBeVisible();
    expect(within(header).getByRole("link", { name: /book appointment|buat temujanji/i })).toHaveAttribute("href", "/appointment");
    expect(within(header).getByRole("link", { name: /whatsapp/i })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: /menu/i })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByRole("contentinfo")).toBeVisible();
  });

  it("uses the accessible WhatsApp foreground in every header and mobile action", () => {
    renderPublicShell();
    render(<MobileCTABar />);

    for (const action of screen.getAllByRole("link", { name: "WhatsApp" })) {
      expect(action).toHaveClass("bg-whatsapp", "text-whatsapp-foreground");
    }
  });

  it("provides a skip link to the public main landmark", () => {
    render(<SkipToContent />);

    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute("href", "#main-content");
  });

  it("keeps desktop and mobile language controls plus the login branch", () => {
    renderPublicShell();

    expect(screen.getAllByRole("group", { name: "Language selection" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Tukar ke Bahasa Melayu" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Switch to English" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Login" })).toBeVisible();
  });

  it("keeps the compact drawer through 1024px and exposes desktop layout at 1440px", () => {
    renderPublicShell();

    const [desktopNavigation] = screen.getAllByRole("navigation", {
      name: "Main navigation",
    });
    const menuButton = screen.getByRole("button", { name: "Menu" });

    expect(desktopNavigation).toHaveClass("hidden", "2xl:flex");
    expect(desktopNavigation).not.toHaveClass("lg:flex");
    expect(screen.getByTestId("compact-header-controls")).toHaveClass("2xl:hidden");
  });

  it("preserves fallback navigation order in desktop and drawer presentations", () => {
    renderPublicShell();

    for (const navigation of screen.getAllByRole("navigation", {
      name: "Main navigation",
    })) {
      expect(
        within(navigation)
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual([
        "Home",
        "Services",
        "Doctors",
        "Doctor On Duty",
        "Appointment",
        "Gallery",
        "Health Tips",
      ]);
    }
  });

  it("preserves managed navigation order in desktop and drawer presentations", () => {
    navigationState.items = [
      { id: "one", href: "/one", labelMs: "Satu", labelEn: "One", parentId: null },
      { id: "two", href: "/two", labelMs: "Dua", labelEn: "Two", parentId: null },
      { id: "child", href: "/child", labelMs: "Anak", labelEn: "Child", parentId: "one" },
      { id: "three", href: "/three", labelMs: "Tiga", labelEn: "Three", parentId: null },
    ];
    renderPublicShell();

    for (const navigation of screen.getAllByRole("navigation", {
      name: "Main navigation",
    })) {
      expect(
        within(navigation)
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["One", "Two", "Three"]);
    }
  });

  it("keeps compact actions in appointment, WhatsApp, contact, and login priority", () => {
    renderPublicShell();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const compactActions = screen.getByTestId("compact-header-actions");
    expect(
      within(compactActions)
        .getAllByRole("link")
        .map((link) => link.textContent?.replace(/\s+/g, " ").trim()),
    ).toEqual([
      "Book Appointment",
      "WhatsApp",
      "Call - +60 18-252 3531",
      "Login",
    ]);
  });

  it("reserves space beneath the footer for the fixed mobile actions", () => {
    renderPublicShell();

    expect(screen.getByRole("contentinfo")).toHaveClass("pb-20");
  });

  it("preserves footer links without an invented visible navigation heading", () => {
    renderPublicShell();

    const footerNavigation = screen.getByRole("navigation", {
      name: "Footer navigation",
    });
    expect(
      within(footerNavigation).getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      within(footerNavigation).getByRole("link", { name: "Terms of Service" }),
    ).toHaveAttribute("href", "/terms");
    expect(
      screen.queryByRole("heading", { name: "Navigation" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the authenticated user menu and logout action", () => {
    authState = {
      user: { email: "patient@example.com" },
      isStaffOrAdmin: false,
      signOut: signOutMock,
      loading: false,
    };
    renderPublicShell();

    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeVisible();
    fireEvent.click(screen.getByRole("menuitem", { name: "Logout" }));
    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it("keeps the staff account action in the authenticated menu and footer", () => {
    authState = {
      user: { email: "staff@example.com" },
      isStaffOrAdmin: true,
      signOut: signOutMock,
      loading: false,
    };
    renderPublicShell();

    expect(screen.getAllByRole("link", { name: "Staff Portal" })).toHaveLength(2);
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeVisible();
  });
});
