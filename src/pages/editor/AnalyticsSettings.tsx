import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Save, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canEnableGoogleTracking,
  fetchGoogleTrackingConfig,
  updateGoogleTrackingConfig,
  type GoogleTrackingUpdateInput,
} from "@/features/analytics/config";

const emptyForm: GoogleTrackingUpdateInput = {
  adsConversionId: null,
  adsConversionLabels: {},
  consentVersion: 1,
  enabled: false,
  measurementId: null,
};

export function AnalyticsSettings() {
  const [form, setForm] = useState<GoogleTrackingUpdateInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchGoogleTrackingConfig().then((config) => {
      if (!active) return;
      if (!config) {
        setLoadError(true);
      } else {
        setForm({
          adsConversionId: config.adsConversionId,
          adsConversionLabels: config.adsConversionLabels,
          consentVersion: config.consentVersion,
          enabled: config.enabled,
          measurementId: config.measurementId,
        });
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const canEnable = useMemo(
    () =>
      canEnableGoogleTracking({
        adsConversionId: form.adsConversionId,
        adsConversionLabels: form.adsConversionLabels,
        consentVersion: form.consentVersion,
        measurementId: form.measurementId,
      }),
    [form],
  );

  const setIdentifier = (
    key: "measurementId" | "adsConversionId",
    value: string,
  ) => {
    setForm((current) => ({ ...current, [key]: value.trim() || null }));
    setMessage(null);
  };

  const setLabel = (
    key: "contact_click" | "phone_click" | "whatsapp_click",
    value: string,
  ) => {
    setForm((current) => {
      const labels = { ...current.adsConversionLabels };
      const trimmed = value.trim();
      if (trimmed) labels[key] = trimmed;
      else delete labels[key];
      return { ...current, adsConversionLabels: labels };
    });
    setMessage(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const saved = await updateGoogleTrackingConfig(form);
      setForm({
        adsConversionId: saved.adsConversionId,
        adsConversionLabels: saved.adsConversionLabels,
        consentVersion: saved.consentVersion,
        enabled: saved.enabled,
        measurementId: saved.measurementId,
      });
      setMessage("Google tracking settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save tracking settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" />
        <span className="sr-only">Loading analytics settings</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-6" aria-labelledby="analytics-consent-title">
        <h1 className="text-xl font-semibold text-red-950" id="analytics-consent-title">
          Analytics &amp; Consent
        </h1>
        <p className="mt-2 text-sm text-red-800">Google tracking settings are unavailable.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="analytics-consent-title" className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Public website measurement</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900" id="analytics-consent-title">
          Analytics &amp; Consent
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Configure public Google Analytics 4 and Google Ads identifiers. Tracking remains off until this setting is enabled and a visitor grants marketing consent.
        </p>
      </div>

      <form className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={save}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ga4-measurement-id">GA4 measurement ID</Label>
            <Input
              autoComplete="off"
              id="ga4-measurement-id"
              onChange={(event) => setIdentifier("measurementId", event.target.value)}
              placeholder="G- followed by 10 letters or digits"
              value={form.measurementId ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ads-conversion-id">Google Ads conversion ID</Label>
            <Input
              autoComplete="off"
              id="ads-conversion-id"
              onChange={(event) => setIdentifier("adsConversionId", event.target.value)}
              placeholder="AW- followed by 9 to 12 digits"
              value={form.adsConversionId ?? ""}
            />
          </div>
        </div>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900">Approved conversion labels</legend>
          <p className="text-sm leading-6 text-slate-600">
            Only generic contact, phone, and WhatsApp click intent is configurable. Custom event names and healthcare conversions are not supported.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            <ConversionLabelField
              id="contact-click-label"
              label="Contact click conversion label"
              onChange={(value) => setLabel("contact_click", value)}
              value={form.adsConversionLabels.contact_click ?? ""}
            />
            <ConversionLabelField
              id="phone-click-label"
              label="Phone click conversion label"
              onChange={(value) => setLabel("phone_click", value)}
              value={form.adsConversionLabels.phone_click ?? ""}
            />
            <ConversionLabelField
              id="whatsapp-click-label"
              label="WhatsApp click conversion label"
              onChange={(value) => setLabel("whatsapp_click", value)}
              value={form.adsConversionLabels.whatsapp_click ?? ""}
            />
          </div>
        </fieldset>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="consent-version">Consent version</Label>
            <Input
              id="consent-version"
              min={1}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  consentVersion: Number(event.target.value),
                }))
              }
              type="number"
              value={form.consentVersion}
            />
            <p className="text-xs leading-5 text-slate-500">
              Increasing this version asks visitors to make a new consent choice.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
            <input
              aria-label="Enable Google tracking"
              checked={form.enabled}
              className="mt-0.5 h-5 w-9 cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving || (!form.enabled && !canEnable)}
              onChange={(event) => {
                const enabled = event.target.checked;
                if (enabled && !canEnable) return;
                setForm((current) => ({ ...current, enabled }));
                setMessage(null);
              }}
              role="switch"
              type="checkbox"
            />
            <div>
              <p className="text-sm font-medium text-slate-900">Enable Google tracking</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Valid GA4, Ads, and all three approved conversion labels are required. Visitor consent is still required before loading the Google tag.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
          <Button disabled={saving} type="submit">
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Save settings
          </Button>
          {message && <p className="text-sm text-slate-700" role="status">{message}</p>}
        </div>
      </form>

      <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>These identifiers are public when active. Audit ownership remains database-managed, and this editor cannot create arbitrary or healthcare event names.</p>
      </div>
    </section>
  );
}

function ConversionLabelField({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete="off"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}
