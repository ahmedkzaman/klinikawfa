import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const catalogue = vi.hoisted(() => ({ listWebsiteDestinations: vi.fn() }));
vi.mock("@/features/website-cms/catalogue/api", () => catalogue);
vi.mock("@/features/website-cms/resources/pageAdapter", () => ({
  pageAdapter: { list: vi.fn().mockResolvedValue({ items: [], total: 0, totalsByStatus: { draft: 0, scheduled: 0, published: 0, trash: 0 } }) },
}));

import { Pages } from "@/pages/editor/Pages";

const items = [
  { id: "fixed-home", type: "fixed", titleMs: "Laman Utama", titleEn: "Home", href: "/", editHref: "/editor/home", status: "published", updatedAt: null },
  { id: "service-1", type: "service", titleMs: "Rawatan Telinga Kuantan", titleEn: "Ear Treatment", href: "/services/rawatan-telinga-kuantan", editHref: "/editor/services/service-1", status: "published", updatedAt: null },
  { id: "page-1", type: "page", titleMs: "Tentang Kami", titleEn: "About Us", href: "/pages/about-us", editHref: "/editor/pages/page-1", status: "draft", updatedAt: "2026-08-10T00:00:00Z" },
  { id: "post-1", type: "post", titleMs: "Panduan Demam", titleEn: "Fever Guide", href: "/health-tips/demam", editHref: "/editor/posts/post-1", status: "scheduled", updatedAt: "2026-08-09T00:00:00Z" },
];

describe("editor Pages catalogue", () => {
  beforeEach(() => catalogue.listWebsiteDestinations.mockResolvedValue({ items, errors: ["page"] }));

  it("shows every content type with its owner edit route and source warning", async () => {
    render(<MemoryRouter><Pages /></MemoryRouter>);

    expect(await screen.findByText("Rawatan Telinga Kuantan")).toBeInTheDocument();
    expect(screen.getByText("Panduan Demam")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Rawatan Telinga Kuantan" }))
      .toHaveAttribute("href", "/editor/services/service-1");
    expect(screen.getByRole("link", { name: "Add page" })).toHaveAttribute("href", "/editor/pages/new");
    expect(screen.getByRole("alert")).toHaveTextContent("Pages");
  });

  it("filters the catalogue by search and content type", async () => {
    render(<MemoryRouter><Pages /></MemoryRouter>);
    await screen.findByText("Rawatan Telinga Kuantan");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search pages" }), { target: { value: "demam" } });
    expect(screen.getByText("Panduan Demam")).toBeInTheDocument();
    expect(screen.queryByText("Rawatan Telinga Kuantan")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Page type"), { target: { value: "service" } });
    expect(within(screen.getByTestId("pages-catalogue")).queryByText("Panduan Demam")).not.toBeInTheDocument();
  });
});
