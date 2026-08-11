import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ServicesEditorList } from "@/pages/editor/Services";

const mutationMocks = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/website-cms/api/resources", () => ({
  listServiceResources: vi.fn().mockResolvedValue([
    { id: "1", revision: 1, slug: "rawatan-am", title: "Rawatan Am" },
    { id: "2", revision: 1, slug: "prosedur-minor", title: "Prosedur Minor" },
    { id: "3", revision: 1, slug: "pemeriksaan-kesihatan", title: "Pemeriksaan Kesihatan" },
    { id: "4", revision: 1, slug: "rawatan-telinga-microsuction-kuantan", title: "Rawatan Telinga & Ear Microsuction di Kuantan" },
    { id: "5", revision: 1, slug: "rawatan-telinga-kuantan", title: "Rawatan Telinga Kuantan" },
  ]),
}));
vi.mock("@/features/website-cms/services/landingPageApi", () => ({
  saveLandingPage: mutationMocks.save,
  deleteLandingPage: mutationMocks.remove,
}));

describe("services website editor", () => {
  it("lists all eight SEO targets while retaining content editing for every database service", async () => {
    render(<MemoryRouter><ServicesEditorList /></MemoryRouter>);
    expect(await screen.findByText("Rawatan Umum & Penyakit Akut")).toBeInTheDocument();
    expect(screen.getByText("Prosedur Minor & Pembedahan")).toBeInTheDocument();
    expect(screen.getByText("Pemeriksaan Kesihatan & Pekerjaan")).toBeInTheDocument();
    expect(screen.getByText("Sunat Kuantan")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /edit seo/i })).toHaveLength(8);
    expect(screen.getAllByRole("link", { name: /edit content/i })).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /add service/i })).not.toBeInTheDocument();
  });

  it("includes newly created landing-page services with content editing", async () => {
    render(<MemoryRouter><ServicesEditorList /></MemoryRouter>);

    expect(await screen.findByText("Rawatan Telinga & Ear Microsuction di Kuantan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit content: rawatan telinga & ear microsuction di kuantan/i }))
      .toHaveAttribute("href", "/editor/services/4");
  });

  it("offers creation and deletion only for dynamic landing pages", async () => {
    render(<MemoryRouter><ServicesEditorList /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: /create service page/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete rawatan telinga & ear microsuction/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete rawatan telinga kuantan/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete rawatan umum/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete prosedur minor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete pemeriksaan kesihatan/i })).not.toBeInTheDocument();
  });

  it("requires confirmation before deleting a dynamic landing page", async () => {
    mutationMocks.remove.mockClear();
    render(<MemoryRouter><ServicesEditorList /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: /delete rawatan telinga & ear microsuction/i }));
    expect(screen.getByText(/public url will stop working immediately/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /delete page/i }));

    await waitFor(() => expect(mutationMocks.remove).toHaveBeenCalledWith("4"));
  });
});
