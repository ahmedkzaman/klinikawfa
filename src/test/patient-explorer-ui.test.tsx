import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PatientExplorer from "@/pages/clinic/PatientExplorer";
import { ClinicLayout } from "@/components/clinic/ClinicLayout";
import { usePatientExplorer } from "@/hooks/clinic/usePatientExplorer";

vi.mock("@/hooks/clinic/usePatientExplorer", () => ({
  usePatientExplorer: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "staff-1", email: "staff@example.com" },
    isSpecialAdmin: false,
    isAdmin: false,
    isLocum: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/clinic/useClinicChimes", () => ({ useClinicChimes: vi.fn() }));
vi.mock("@/components/staff/chat/StaffChat", () => ({ StaffChat: () => null }));
vi.mock("@/components/seo/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("@/components/patients/PatientProfileSheet", () => ({
  PatientProfileSheet: ({ isOpen, patient }: { isOpen: boolean; patient: { name: string } | null }) =>
    isOpen ? <div role="dialog">Profile: {patient?.name}</div> : null,
}));

const explorer = vi.mocked(usePatientExplorer);

const response = {
  rows: [{
    patientId: "patient-1",
    patientName: "Jane Doe",
    icNumber: "900101-01-1234",
    phone: "0123456789",
    address: "1 Main Street",
    postcode: "50000",
    gender: "Female",
    dateOfBirth: "1990-01-01",
    currentAge: 36,
    matchingVisitDates: ["2026-08-01"],
    visitCount: 2,
    diagnoses: ["Asthma"],
    bloodInvestigations: ["FBC"],
    procedures: ["Nebulisation"],
    medicines: ["Salbutamol"],
    consultationStatuses: ["completed"],
    attendingDoctors: ["Dr. Lee"],
  }],
  totalCount: 51,
  page: 1,
  pageSize: 50,
  isLoading: false,
  isFetching: false,
  error: null,
};

function renderExplorer() {
  return render(<PatientExplorer />);
}

describe("Patient Explorer UI", () => {
  beforeEach(() => {
    explorer.mockReturnValue(response as ReturnType<typeof usePatientExplorer>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with all time filters and waits for Apply before querying", () => {
    renderExplorer();

    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Patient name")).toBeInTheDocument();
    expect(screen.getByLabelText("Diagnoses")).toBeInTheDocument();
    expect(explorer).toHaveBeenCalledWith(null, 1, 50);
  });

  it.each([
    ["Today", "2026-08-06", "2026-08-06"],
    ["Last 7 days", "2026-07-31", "2026-08-06"],
    ["Last 30 days", "2026-07-08", "2026-08-06"],
  ])("uses Kuala Lumpur calendar boundaries for the %s preset", (preset, startDate, endDate) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T16:30:00.000Z"));
    renderExplorer();

    fireEvent.click(screen.getByRole("button", { name: preset }));

    expect(screen.getByLabelText("Start date")).toHaveValue(startDate);
    expect(screen.getByLabelText("End date")).toHaveValue(endDate);
  });

  it("applies the draft filters and clears them without an immediate default query", () => {
    renderExplorer();
    fireEvent.change(screen.getByLabelText("Patient name"), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText("Minimum age"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Add diagnosis" }));
    fireEvent.change(screen.getByLabelText("Diagnoses"), { target: { value: "Asthma" } });
    fireEvent.keyDown(screen.getByLabelText("Diagnoses"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(explorer).toHaveBeenLastCalledWith(expect.objectContaining({
      dateMode: "all_time",
      patientName: "Jane",
      ageMin: 30,
      diagnoses: ["Asthma"],
    }), 1, 50);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByLabelText("Patient name")).toHaveValue("");
    expect(explorer).toHaveBeenLastCalledWith(null, 1, 50);
  });

  it("blocks custom date ranges longer than 365 days", () => {
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2025-01-01" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(screen.getByRole("alert")).toHaveTextContent("365 calendar days");
    expect(explorer).toHaveBeenLastCalledWith(null, 1, 50);
  });

  it("renders matching patient details, opens the established profile surface, and paginates", () => {
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("900101-01-1234")).toBeInTheDocument();
    expect(screen.getByText("Asthma")).toBeInTheDocument();
    expect(screen.getByText("Salbutamol")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Jane Doe profile" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Profile: Jane Doe");

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(explorer).toHaveBeenLastCalledWith(expect.any(Object), 2, 50);
  });

  it.each([
    ["loading", { ...response, rows: [], isLoading: true }, () => expect(screen.getByLabelText("Loading patients")).toBeInTheDocument()],
    ["refreshing", { ...response, isFetching: true }, () => expect(screen.getByText("Refreshing results")).toBeInTheDocument()],
    ["empty", { ...response, rows: [], totalCount: 0 }, () => expect(screen.getByText(/No patients match these filters/)).toBeInTheDocument()],
    ["permission", { ...response, rows: [], error: { message: "permission denied" } }, () => expect(screen.getByText(/do not have permission/)).toBeInTheDocument()],
    ["query error", { ...response, rows: [], error: new Error("RPC failed") }, () => expect(screen.getByText("Unable to load patient results")).toBeInTheDocument()],
  ])("shows the %s result state", (_name, queryResult, assertion) => {
    explorer.mockReturnValue(queryResult as ReturnType<typeof usePatientExplorer>);
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    assertion();
  });

  it("adds Patient Explorer to clinic navigation", () => {
    render(
      <MemoryRouter initialEntries={["/clinic/patient-explorer"]}>
        <Routes>
          <Route path="/clinic" element={<ClinicLayout />}>
            <Route path="patient-explorer" element={<div>Explorer outlet</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("link", { name: "Patient Explorer" })[0]).toHaveAttribute(
      "href",
      "/clinic/patient-explorer",
    );
  });
});
