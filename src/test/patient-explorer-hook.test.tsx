import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePatientExplorer } from "@/hooks/clinic/usePatientExplorer";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpc = vi.mocked(supabase.rpc);

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
  blood_investigations: [],
  procedures: [],
  medicines: [],
  consultation_statuses: ["completed"],
  attending_doctors: ["Dr. Lee"],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("usePatientExplorer", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("calls the RPC with normalized filters and returns the normalized payload", async () => {
    rpc.mockResolvedValue({
      data: { rows: [row], total_count: 1, page: 2, page_size: 25 },
      error: null,
    } as never);

    const { result } = renderHook(
      () => usePatientExplorer({ patientName: " Jane ", diagnoses: ["flu", " Flu "] }, 2, 25),
      { wrapper },
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith("search_patient_explorer", {
      p_filters: expect.objectContaining({ patientName: "Jane", diagnoses: ["flu"] }),
      p_page: 2,
      p_page_size: 25,
    });
    expect(result.current).toMatchObject({
      rows: [expect.objectContaining({ patientId: "patient-1", patientName: "Jane Doe" })],
      totalCount: 1,
      page: 2,
      pageSize: 25,
    });
  });

  it("invalidates the query when applied filters change", async () => {
    rpc.mockResolvedValue({ data: { rows: [], total_count: 0, page: 1, page_size: 50 }, error: null } as never);
    const { result, rerender } = renderHook(
      ({ filters }) => usePatientExplorer(filters, 1, 50),
      { initialProps: { filters: { patientName: "Jane" } }, wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ filters: { patientName: "John" } });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1][1]).toEqual(expect.objectContaining({
      p_filters: expect.objectContaining({ patientName: "John" }),
    }));
  });

  it("resets to page one when applied filters change", async () => {
    rpc.mockResolvedValue({ data: { rows: [], total_count: 0, page: 1, page_size: 50 }, error: null } as never);
    const { result, rerender } = renderHook(
      ({ filters, page }) => usePatientExplorer(filters, page, 50),
      { initialProps: { filters: { patientName: "Jane" }, page: 3 }, wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rerender({ filters: { patientName: "John" }, page: 3 });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1][1]).toEqual(expect.objectContaining({ p_page: 1 }));
    expect(result.current.page).toBe(1);
  });

  it("propagates RPC errors", async () => {
    const error = new Error("RPC failed");
    rpc.mockResolvedValue({ data: null, error } as never);
    const { result } = renderHook(() => usePatientExplorer({ patientName: "Jane" }, 1, 50), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(error));
  });

  it("stays disabled until the page supplies applied filters", () => {
    const { result } = renderHook(() => usePatientExplorer(undefined, 1, 50), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("exposes loading and fetching states", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    rpc.mockImplementation(() => new Promise((res) => { resolve = res; }) as never);
    const { result } = renderHook(() => usePatientExplorer({}, 1, 50), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);

    await act(async () => {
      resolve?.({ data: { rows: [], total_count: 0, page: 1, page_size: 50 }, error: null });
    });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
  });
});
