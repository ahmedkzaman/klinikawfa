import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ServicesEditorList } from "@/pages/editor/Services";

vi.mock("@/features/website-cms/api/resources", () => ({
  listServiceResources: vi.fn().mockResolvedValue([
    { id: "1", revision: 1, slug: "rawatan-am", title: "Rawatan Am" },
    { id: "2", revision: 1, slug: "prosedur-minor", title: "Prosedur Minor" },
    { id: "3", revision: 1, slug: "pemeriksaan-kesihatan", title: "Pemeriksaan Kesihatan" },
  ]),
}));

describe("services website editor", () => {
  it("lists all eight SEO targets while retaining content editing for the three categories", async () => {
    render(<MemoryRouter><ServicesEditorList /></MemoryRouter>);
    expect(await screen.findByText("Rawatan Umum & Penyakit Akut")).toBeInTheDocument();
    expect(screen.getByText("Prosedur Minor & Pembedahan")).toBeInTheDocument();
    expect(screen.getByText("Pemeriksaan Kesihatan & Pekerjaan")).toBeInTheDocument();
    expect(screen.getByText("Sunat Kuantan")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /edit seo/i })).toHaveLength(8);
    expect(screen.getAllByRole("link", { name: /edit content/i })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /add service/i })).not.toBeInTheDocument();
  });
});
