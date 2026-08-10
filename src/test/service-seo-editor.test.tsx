import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchServiceSeoForEditor: vi.fn(),
  saveServiceSeoDraft: vi.fn(),
  publishServiceSeo: vi.fn(),
}));
vi.mock("@/features/website-cms/service-seo/api", () => api);

import { createEmptyServiceSeoPayload } from "@/features/website-cms/service-seo/domain";
import { ServiceSeoEditor } from "@/pages/editor/ServiceSeoEditor";

const targetId = "b9838947-9b48-4f1d-a378-21224c4b5c01";

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={[`/editor/services/seo/${targetId}`]}>
      <Routes>
        <Route path="/editor/services/seo/:id" element={<ServiceSeoEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("service SEO editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const payload = createEmptyServiceSeoPayload("/services/rawatan-umum/");
    payload.seoMs.title = "Rawatan Umum Kuantan";
    payload.seoEn.title = "General Treatment Kuantan";
    api.fetchServiceSeoForEditor.mockResolvedValue({ payload, revision: 2, publishedAt: null });
    api.saveServiceSeoDraft.mockImplementation(async (_id, revision, savedPayload) => ({
      baseRevision: revision,
      payload: savedPayload,
    }));
    api.publishServiceSeo.mockResolvedValue(3);
  });

  it("keeps Malay and English fields separate and locks the canonical URL", async () => {
    renderEditor();
    expect(await screen.findByDisplayValue("Rawatan Umum Kuantan")).toBeInTheDocument();
    expect(screen.getByLabelText("Canonical URL")).toHaveValue("https://klinikawfa.com/services/rawatan-umum/");
    expect(screen.getByLabelText("Canonical URL")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByDisplayValue("General Treatment Kuantan")).toBeInTheDocument();
  });

  it("saves a private draft separately from publishing", async () => {
    renderEditor();
    const title = await screen.findByLabelText("Search title");
    fireEvent.change(title, { target: { value: "Rawatan Umum Klinik Awfa Kuantan" } });
    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(api.saveServiceSeoDraft).toHaveBeenCalled());
    expect(api.publishServiceSeo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /publish seo/i }));
    await waitFor(() => expect(api.publishServiceSeo).toHaveBeenCalledWith(targetId, 2));
  });
});
