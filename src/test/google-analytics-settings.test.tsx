import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryError = { message: string };
type QueryResult = { data: unknown; error: QueryError | null };

type QueryCall = {
  columns?: string;
  filters: Array<{ column: string; value: unknown }>;
  operation: "select" | "update";
  payload?: unknown;
  table: string;
};

const supabaseState = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  responses: [] as QueryResult[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const call: QueryCall = {
        filters: [],
        operation: "select",
        table,
      };
      supabaseState.calls.push(call);

      const builder = {
        eq(column: string, value: unknown) {
          call.filters.push({ column, value });
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(
            supabaseState.responses.shift() ?? { data: null, error: null },
          );
        },
        select(columns: string) {
          call.columns = columns;
          return builder;
        },
        single() {
          return Promise.resolve(
            supabaseState.responses.shift() ?? { data: null, error: null },
          );
        },
        update(payload: unknown) {
          call.operation = "update";
          call.payload = payload;
          return builder;
        },
      };

      return builder;
    },
  },
}));

import {
  GOOGLE_TRACKING_SELECT,
  fetchGoogleTrackingConfig,
  updateGoogleTrackingConfig,
} from "@/features/analytics/config";
import { AnalyticsSettings } from "@/pages/editor/AnalyticsSettings";

const validRow = {
  ads_conversion_id: "AW-123456789",
  ads_conversion_labels: {
    contact_click: "ContactLabel_123",
    phone_click: "PhoneLabel_123",
    whatsapp_click: "WhatsAppLabel_123",
  },
  consent_version: 2,
  enabled: true,
  measurement_id: "G-ABC123DEF4",
  provider: "google_tag",
};

const validUpdate = {
  adsConversionId: validRow.ads_conversion_id,
  adsConversionLabels: validRow.ads_conversion_labels,
  consentVersion: validRow.consent_version,
  enabled: true,
  measurementId: validRow.measurement_id,
};

describe("Google tracking configuration", () => {
  beforeEach(() => {
    supabaseState.calls.length = 0;
    supabaseState.responses.length = 0;
  });

  it("selects and maps only the public-safe Google columns", async () => {
    supabaseState.responses.push({ data: validRow, error: null });

    await expect(fetchGoogleTrackingConfig()).resolves.toEqual({
      adsConversionId: "AW-123456789",
      adsConversionLabels: validRow.ads_conversion_labels,
      consentVersion: 2,
      enabled: true,
      measurementId: "G-ABC123DEF4",
      provider: "google_tag",
    });

    expect(GOOGLE_TRACKING_SELECT).toBe(
      "provider,enabled,measurement_id,ads_conversion_id,ads_conversion_labels,consent_version",
    );
    expect(supabaseState.calls[0]).toMatchObject({
      columns: GOOGLE_TRACKING_SELECT,
      filters: [{ column: "provider", value: "google_tag" }],
      operation: "select",
      table: "website_tracking_settings",
    });
  });

  it.each([
    ["wrong provider", { ...validRow, provider: "other" }],
    ["malformed measurement ID", { ...validRow, measurement_id: "UA-12345" }],
    ["malformed Ads conversion ID", { ...validRow, ads_conversion_id: "AW-bad" }],
    [
      "unknown event key",
      {
        ...validRow,
        ads_conversion_labels: {
          ...validRow.ads_conversion_labels,
          appointment_submitted: "NotAllowed",
        },
      },
    ],
  ])("fails closed for a %s", async (_name, row) => {
    supabaseState.responses.push({ data: row, error: null });
    await expect(fetchGoogleTrackingConfig()).resolves.toBeNull();
  });

  it("updates only Google public configuration columns", async () => {
    supabaseState.responses.push({ data: validRow, error: null });

    await expect(updateGoogleTrackingConfig(validUpdate)).resolves.toMatchObject({
      provider: "google_tag",
      enabled: true,
    });

    expect(supabaseState.calls[0]).toMatchObject({
      columns: GOOGLE_TRACKING_SELECT,
      filters: [{ column: "provider", value: "google_tag" }],
      operation: "update",
      payload: {
        ads_conversion_id: "AW-123456789",
        ads_conversion_labels: validRow.ads_conversion_labels,
        consent_version: 2,
        enabled: true,
        measurement_id: "G-ABC123DEF4",
      },
      table: "website_tracking_settings",
    });
    expect(supabaseState.calls[0].payload).not.toHaveProperty("provider");
    expect(supabaseState.calls[0].payload).not.toHaveProperty("updated_at");
    expect(supabaseState.calls[0].payload).not.toHaveProperty("updated_by");
  });

  it.each([
    ["malformed measurement ID", { measurementId: "G-short" }],
    ["malformed Ads conversion ID", { adsConversionId: "123456789" }],
    [
      "unknown conversion event",
      {
        adsConversionLabels: {
          ...validUpdate.adsConversionLabels,
          patient_registered: "NotAllowed",
        },
      },
    ],
    [
      "missing fixed conversion label",
      {
        adsConversionLabels: {
          contact_click: "ContactLabel_123",
          phone_click: "PhoneLabel_123",
        },
      },
    ],
  ])("rejects %s before a request", async (_name, override) => {
    await expect(
      updateGoogleTrackingConfig({ ...validUpdate, ...override }),
    ).rejects.toThrow();
    expect(supabaseState.calls).toHaveLength(0);
  });

  it("requires valid identifiers and every fixed label before enabling", async () => {
    supabaseState.responses.push({
      data: {
        ...validRow,
        ads_conversion_id: null,
        ads_conversion_labels: {},
        enabled: false,
        measurement_id: null,
      },
      error: null,
    });

    render(<AnalyticsSettings />);

    const enableSwitch = await screen.findByRole("switch", {
      name: /enable google tracking/i,
    });
    expect(enableSwitch).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/ga4 measurement id/i), {
      target: { value: "G-ABC123DEF4" },
    });
    fireEvent.change(screen.getByLabelText(/google ads conversion id/i), {
      target: { value: "AW-123456789" },
    });
    fireEvent.change(screen.getByLabelText(/contact click conversion label/i), {
      target: { value: "ContactLabel_123" },
    });
    fireEvent.change(screen.getByLabelText(/phone click conversion label/i), {
      target: { value: "PhoneLabel_123" },
    });
    expect(enableSwitch).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/whatsapp click conversion label/i), {
      target: { value: "WhatsAppLabel_123" },
    });

    await waitFor(() => expect(enableSwitch).toBeEnabled());
  });

  it("renders only the three fixed generic conversion label fields", async () => {
    supabaseState.responses.push({
      data: { ...validRow, enabled: false },
      error: null,
    });

    render(<AnalyticsSettings />);

    expect(
      await screen.findByRole("heading", { name: /analytics.*consent/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText(/conversion label/i)).toHaveLength(3);
    expect(screen.queryByLabelText(/event name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/appointment/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/patient/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/medical/i)).not.toBeInTheDocument();
  });
});
