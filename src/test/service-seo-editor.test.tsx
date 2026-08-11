import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchServiceSeoForEditor: vi.fn(),
  saveServiceSeoDraft: vi.fn(),
  publishServiceSeo: vi.fn(),
  generateAndSaveServiceAeoDraft: vi.fn(),
  generateAndSaveServiceSeoDraft: vi.fn(),
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
    api.fetchServiceSeoForEditor.mockResolvedValue({
      payload,
      revision: 2,
      publishedAt: null,
      contextMs: "Published Malay service page content",
      contextEn: "Published English service page content",
      target: { id: targetId, path: "/services/rawatan-umum/", labelMs: "Rawatan Umum", labelEn: "General Treatment" },
    });
    api.saveServiceSeoDraft.mockImplementation(async (_id, revision, savedPayload) => ({
      baseRevision: revision,
      payload: savedPayload,
    }));
    api.publishServiceSeo.mockResolvedValue(3);
    api.generateAndSaveServiceAeoDraft.mockRejectedValue(new Error("AEO generation unavailable"));
    api.generateAndSaveServiceSeoDraft.mockRejectedValue(new Error("Generation unavailable"));
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

  it("sends registered page content to AI and preserves the draft when generation fails", async () => {
    renderEditor();
    const title = await screen.findByLabelText("Search title");
    fireEvent.change(title, { target: { value: "My unchanged draft title" } });
    fireEvent.click(screen.getByRole("button", { name: /generate seo with ai/i }));

    await waitFor(() => expect(api.generateAndSaveServiceSeoDraft).toHaveBeenCalledWith(expect.objectContaining({ resourceId: targetId })));
    expect(await screen.findByRole("alert")).toHaveTextContent("Generation unavailable");
    expect(screen.getByLabelText("Search title")).toHaveValue("My unchanged draft title");
  });

  it("generates Malay and English AEO as a private draft", async () => {
    const generated = createEmptyServiceSeoPayload("/services/rawatan-umum/");
    generated.seoMs.title = "Rawatan Umum Kuantan";
    generated.seoEn.title = "General Treatment Kuantan";
    generated.aeoMs = { answerSummary: "Jawapan Bahasa Melayu.", faqs: [{ question: "Soalan?", answer: "Jawapan." }] };
    generated.aeoEn = { answerSummary: "English answer.", faqs: [{ question: "Question?", answer: "Answer." }] };
    api.generateAndSaveServiceAeoDraft.mockResolvedValue({ baseRevision: 3, payload: generated });

    renderEditor();
    fireEvent.click(await screen.findByRole("button", { name: /generate aeo \(malay & english\)/i }));

    await waitFor(() => expect(api.generateAndSaveServiceAeoDraft).toHaveBeenCalledWith(expect.objectContaining({ resourceId: targetId })));
    expect(await screen.findByDisplayValue("Jawapan Bahasa Melayu.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/bilingual AEO suggestions were saved privately as a draft/i);
    expect(api.publishServiceSeo).not.toHaveBeenCalled();
  });

  it("shows an AEO loading state and preserves the editor when generation fails", async () => {
    let rejectGeneration!: (error: Error) => void;
    api.generateAndSaveServiceAeoDraft.mockReturnValue(new Promise((_resolve, reject) => { rejectGeneration = reject; }));

    renderEditor();
    const button = await screen.findByRole("button", { name: /generate aeo \(malay & english\)/i });
    fireEvent.click(button);

    expect(screen.getByRole("button", { name: /generating aeo/i })).toBeDisabled();
    rejectGeneration(new Error("AEO generation unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("AEO generation unavailable");
    expect(screen.getByDisplayValue("Rawatan Umum Kuantan")).toBeInTheDocument();
  });
});
