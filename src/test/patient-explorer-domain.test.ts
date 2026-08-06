import {
  buildPatientExplorerRpcArgs,
  normalizePatientExplorerFilters,
  serializePatientExplorerCsv,
} from "@/lib/clinic/patientExplorer";
import type { PatientExplorerFilters, PatientExplorerRow } from "@/types/patientExplorer";

describe("Patient Explorer domain contract", () => {
  it("defaults to an explicit all-time filter with empty restrictions", () => {
    expect(normalizePatientExplorerFilters({})).toEqual({
      dateMode: "all_time",
      startDate: null,
      endDate: null,
      patientName: "",
      icNumber: "",
      phone: "",
      address: "",
      postcode: "",
      gender: "",
      ageMin: null,
      ageMax: null,
      diagnoses: [],
      bloodInvestigations: [],
      procedures: [],
      medicines: [],
      consultationStatuses: [],
      attendingDoctors: [],
    });
  });

  it("normalizes custom dates as inclusive calendar boundaries", () => {
    expect(normalizePatientExplorerFilters({
      dateMode: "custom",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    })).toMatchObject({
      dateMode: "custom",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
  });

  it.each([
    [{ dateMode: "custom", startDate: "2026-01-02", endDate: "2026-01-01" }, "end date"],
    [{ dateMode: "custom", startDate: "2026-01-01", endDate: "2027-01-01" }, "365"],
    [{ dateMode: "custom", startDate: "2026-02-30", endDate: "2026-03-01" }, "date"],
  ])("rejects invalid custom ranges (%s)", (filters, message) => {
    expect(() => normalizePatientExplorerFilters(filters as PatientExplorerFilters)).toThrow(message);
  });

  it("rejects ages outside the supported bounds and inverted bounds", () => {
    expect(() => normalizePatientExplorerFilters({ ageMin: -1 })).toThrow("age");
    expect(() => normalizePatientExplorerFilters({ ageMax: 151 })).toThrow("age");
    expect(() => normalizePatientExplorerFilters({ ageMin: 60, ageMax: 40 })).toThrow("age");
  });

  it("sorts and deduplicates OR-list filters and keeps pagination stable", () => {
    const filters = normalizePatientExplorerFilters({
      diagnoses: [" Flu ", "Asthma", "flu", ""],
      gender: " Female ",
    });

    expect(filters.diagnoses).toEqual(["Asthma", "Flu"]);
    expect(filters.gender).toBe("Female");
    expect(buildPatientExplorerRpcArgs(filters, { page: 2, pageSize: 50 })).toEqual({
      p_filters: filters,
      p_page: 2,
      p_page_size: 50,
    });
    expect(buildPatientExplorerRpcArgs(filters, { page: 2, pageSize: 50 })).toEqual(
      buildPatientExplorerRpcArgs({ ...filters }, { page: 2, pageSize: 50 }),
    );
  });

  it("escapes CSV commas, quotes, and line breaks using the approved header order", () => {
    const row: PatientExplorerRow = {
      patientId: "p-1",
      patientName: 'Doe, "Jane"',
      icNumber: "900101-01-1234",
      phone: "0123",
      address: "Line 1\nLine 2",
      postcode: "50000",
      gender: "Female",
      dateOfBirth: "1990-01-01",
      currentAge: 36,
      matchingVisitDates: ["2026-01-01"],
      visitCount: 1,
      diagnoses: ["Asthma"],
      bloodInvestigations: [],
      procedures: [],
      medicines: [],
      consultationStatuses: ["Completed"],
      attendingDoctors: ["Dr. Lee"],
    };

    expect(serializePatientExplorerCsv([row])).toBe(
      'Patient Name,IC Number,Phone,Address,Postcode,Gender,Date of Birth,Current Age,Matching Visit Dates,Visit Count,Diagnoses,Blood Investigations,Procedures/Services,Medicines,Consultation Statuses,Attending Doctors\n' +
      '"Doe, ""Jane""",900101-01-1234,0123,"Line 1\nLine 2",50000,Female,1990-01-01,36,2026-01-01,1,Asthma,,, ,Completed,Dr. Lee\n'.replace(",,, ,", ",,,,"),
    );
  });
});
