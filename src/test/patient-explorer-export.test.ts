import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PatientExplorer from "@/pages/clinic/PatientExplorer";
import { usePatientExplorer } from "@/hooks/clinic/usePatientExplorer";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/hooks/clinic/usePatientExplorer", () => ({
  usePatientExplorer: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

vi.mock("@/components/seo/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/patients/PatientProfileSheet", () => ({ PatientProfileSheet: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const explorer = vi.mocked(usePatientExplorer);
const rpc = vi.mocked(supabase.rpc);
const download = vi.fn();
const createObjectURL = vi.fn<(object: Blob) => string>(() => "blob:patient-explorer");
const revokeObjectURL = vi.fn();

const row = {
  patient_id: "patient-1",
  patient_name: "Jane Doe",
  ic_number: "900101-01-1234",
  phone: "0123456789",
  address: "1 Main Street",
  postcode: "50000",
  gender: "Female",
  date_of_birth: "1990-01-01",
  current_age: 36,
  matching_visit_dates: ["2026-08-01"],
  visit_count: 1,
  diagnoses: ["Asthma"],
  blood_investigations: ["FBC"],
  procedures: ["Nebulisation"],
  medicines: ["Salbutamol"],
  consultation_statuses: ["completed"],
  attending_doctors: ["Dr. Lee"],
};

const queryResult = {
  rows: [],
  totalCount: 0,
  page: 1,
  pageSize: 50,
  isLoading: false,
  isFetching: false,
  error: null,
};

function rpcPage(rows: typeof row[], totalCount: number, page = 1) {
  return { data: { rows, total_count: totalCount, page, page_size: 100 }, error: null } as never;
}

function renderExplorer() {
  return render(createElement(PatientExplorer));
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}

function applyFilters() {
  fireEvent.change(screen.getByLabelText("Patient name"), { target: { value: "Jane" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
}

describe("Patient Explorer CSV export", () => {
  beforeEach(() => {
    explorer.mockReturnValue(queryResult as ReturnType<typeof usePatientExplorer>);
    rpc.mockReset();
    download.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(download);
  });

  it("exports the approved headers and one CSV row per patient", async () => {
    rpc.mockResolvedValueOnce(rpcPage([row, { ...row, patient_id: "patient-2", patient_name: "John Tan" }], 2));
    renderExplorer();
    applyFilters();
    fireEvent.click(screen.getByRole("button", { name: "Export filtered results" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(await readBlob(blob)).toBe(
      "Patient Name,IC Number,Phone,Address,Postcode,Gender,Date of Birth,Current Age,Matching Visit Dates,Visit Count,Diagnoses,Blood Investigations,Procedures/Services,Medicines,Consultation Statuses,Attending Doctors\n" +
      "Jane Doe,900101-01-1234,0123456789,1 Main Street,50000,Female,1990-01-01,36,2026-08-01,1,Asthma,FBC,Nebulisation,Salbutamol,completed,Dr. Lee\n" +
      "John Tan,900101-01-1234,0123456789,1 Main Street,50000,Female,1990-01-01,36,2026-08-01,1,Asthma,FBC,Nebulisation,Salbutamol,completed,Dr. Lee\n",
    );
  });

  it("retrieves every export batch with the currently applied filters", async () => {
    rpc.mockResolvedValueOnce(rpcPage([row, { ...row, patient_id: "patient-2" }], 3, 1));
    rpc.mockResolvedValueOnce(rpcPage([{ ...row, patient_id: "patient-3" }], 3, 2));
    renderExplorer();
    applyFilters();
    fireEvent.click(screen.getByRole("button", { name: "Export filtered results" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc).toHaveBeenNthCalledWith(1, "search_patient_explorer", expect.objectContaining({
      p_filters: expect.objectContaining({ patientName: "Jane" }), p_page: 1, p_page_size: 100,
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "search_patient_explorer", expect.objectContaining({
      p_filters: expect.objectContaining({ patientName: "Jane" }), p_page: 2, p_page_size: 100,
    }));
  });

  it("escapes special characters and leaves absent values empty", async () => {
    rpc.mockResolvedValueOnce(rpcPage([{
      ...row,
      patient_name: 'Doe, "Jane"',
      address: "Line 1\nLine 2",
      ic_number: null,
      phone: null,
      postcode: null,
      gender: null,
      date_of_birth: null,
      current_age: null,
      blood_investigations: [],
      procedures: [],
      medicines: [],
      consultation_statuses: [],
      attending_doctors: [],
    }], 1));
    renderExplorer();
    applyFilters();
    fireEvent.click(screen.getByRole("button", { name: "Export filtered results" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(await readBlob(blob)).toContain('"Doe, ""Jane""",,,"Line 1\nLine 2",,,,,' +
      "2026-08-01,1,Asthma,,,,,");
  });

  it("labels the download with the active custom date scope", async () => {
    rpc.mockResolvedValueOnce(rpcPage([row], 1));
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Export filtered results" }));

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect((download.mock.instances[0] as HTMLAnchorElement).download).toBe(
      "patient-explorer-2026-01-01-to-2026-01-31.csv",
    );
  });

  it("disables export until its batch retrieval finishes", async () => {
    let resolve: ((value: ReturnType<typeof rpcPage>) => void) | undefined;
    rpc.mockImplementationOnce(() => new Promise((done) => { resolve = done; }) as never);
    renderExplorer();
    applyFilters();
    const exportButton = screen.getByRole("button", { name: "Export filtered results" });
    fireEvent.click(exportButton);

    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveTextContent("Exporting");
    await waitFor(() => expect(resolve).toBeTypeOf("function"));
    resolve?.(rpcPage([row], 1));
    await waitFor(() => expect(exportButton).not.toBeDisabled());
  });

  it("does not download a partial export when a batch fails", async () => {
    rpc.mockResolvedValueOnce(rpcPage([row], 2, 1));
    rpc.mockResolvedValueOnce({ data: null, error: new Error("RPC failed") } as never);
    renderExplorer();
    applyFilters();
    fireEvent.click(screen.getByRole("button", { name: "Export filtered results" }));

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
});
