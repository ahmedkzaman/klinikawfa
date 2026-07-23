import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "admin-1", email: "admin@example.com" },
    isStaffOrAdmin: true,
    signOut: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({
    language: "ms",
    setLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/usePublishedNavigation", () => ({
  usePublishedNavigation: () => null,
}));

import { Header } from "@/components/layout/Header";

describe("Header clinic portal navigation", () => {
  it("gives authenticated clinic staff a direct link to the clinic portal", () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link", { name: "Portal Klinik" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/clinic");
    }
  });
});
