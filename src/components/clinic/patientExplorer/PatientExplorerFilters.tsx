import type { ChangeEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PatientExplorerFilters as PatientExplorerFiltersValue } from "@/types/patientExplorer";
import {
  bento,
  fieldLabel,
  pillTabActive,
  pillTabIdle,
  primaryBtn,
  secondaryBtn,
  softInput,
} from "@/lib/clinic/bentoTokens";

type ListFilter = Pick<PatientExplorerFiltersValue,
  "diagnoses" | "bloodInvestigations" | "procedures" | "medicines" | "consultationStatuses" | "attendingDoctors"
>;

type ListFilterKey = keyof ListFilter;

const listFields: Array<{ key: ListFilterKey; label: string; addLabel: string }> = [
  { key: "diagnoses", label: "Diagnoses", addLabel: "Add diagnosis" },
  { key: "bloodInvestigations", label: "Blood investigations", addLabel: "Add blood investigation" },
  { key: "procedures", label: "Procedures / services", addLabel: "Add procedure or service" },
  { key: "medicines", label: "Medicines", addLabel: "Add medicine" },
  { key: "consultationStatuses", label: "Consultation statuses", addLabel: "Add consultation status" },
  { key: "attendingDoctors", label: "Attending doctors", addLabel: "Add attending doctor" },
];

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateInputValue(date);
}

interface PatientExplorerFiltersProps {
  value: PatientExplorerFiltersValue;
  error: string | null;
  onChange: (next: PatientExplorerFiltersValue) => void;
  onApply: () => void;
  onClear: () => void;
}

export function PatientExplorerFilters({
  value,
  error,
  onChange,
  onApply,
  onClear,
}: PatientExplorerFiltersProps) {
  const setField = <K extends keyof PatientExplorerFiltersValue>(key: K, fieldValue: PatientExplorerFiltersValue[K]) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const setPreset = (days: number) => {
    onChange({
      ...value,
      dateMode: "custom",
      startDate: dateDaysAgo(days),
      endDate: toDateInputValue(new Date()),
    });
  };

  const addListValue = (key: ListFilterKey, event: ChangeEvent<HTMLInputElement>) => {
    const candidate = event.target.value.trim();
    if (!candidate || value[key].some((item) => item.toLowerCase() === candidate.toLowerCase())) return;
    setField(key, [...value[key], candidate]);
    event.target.value = "";
  };

  return (
    <section className={cn(bento, "p-4 space-y-5")} aria-label="Patient Explorer filters">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Filters</h2>
          <p className="mt-0.5 text-sm text-slate-500">Draft filters stay local until applied.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className={secondaryBtn} onClick={onClear}>Clear filters</Button>
          <Button type="button" className={primaryBtn} onClick={onApply}>Apply filters</Button>
        </div>
      </div>

      <div className="space-y-2">
        <span className={fieldLabel}>Visit date</span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" aria-pressed={value.dateMode === "all_time"} className={value.dateMode === "all_time" ? pillTabActive : pillTabIdle} onClick={() => setField("dateMode", "all_time")}>All time</Button>
          <Button type="button" variant="ghost" aria-pressed={value.dateMode === "custom"} className={value.dateMode === "custom" ? pillTabActive : pillTabIdle} onClick={() => setField("dateMode", "custom")}>Custom range</Button>
          <Button type="button" variant="ghost" className={pillTabIdle} onClick={() => setPreset(0)}>Today</Button>
          <Button type="button" variant="ghost" className={pillTabIdle} onClick={() => setPreset(6)}>Last 7 days</Button>
          <Button type="button" variant="ghost" className={pillTabIdle} onClick={() => setPreset(29)}>Last 30 days</Button>
        </div>
        {value.dateMode === "custom" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className={fieldLabel}>Start date</span><Input aria-label="Start date" type="date" value={value.startDate ?? ""} onChange={(event) => setField("startDate", event.target.value || null)} className={softInput} /></label>
            <label className="grid gap-1.5"><span className={fieldLabel}>End date</span><Input aria-label="End date" type="date" value={value.endDate ?? ""} onChange={(event) => setField("endDate", event.target.value || null)} className={softInput} /></label>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="grid gap-1.5"><span className={fieldLabel}>Patient name</span><Input aria-label="Patient name" value={value.patientName} onChange={(event) => setField("patientName", event.target.value)} className={softInput} /></label>
        <label className="grid gap-1.5"><span className={fieldLabel}>IC number</span><Input aria-label="IC number" value={value.icNumber} onChange={(event) => setField("icNumber", event.target.value)} className={softInput} /></label>
        <label className="grid gap-1.5"><span className={fieldLabel}>Phone</span><Input aria-label="Phone" value={value.phone} onChange={(event) => setField("phone", event.target.value)} className={softInput} /></label>
        <label className="grid gap-1.5"><span className={fieldLabel}>Minimum age</span><Input aria-label="Minimum age" type="number" min="0" max="150" value={value.ageMin ?? ""} onChange={(event) => setField("ageMin", event.target.value === "" ? null : Number(event.target.value))} className={softInput} /></label>
        <label className="grid gap-1.5"><span className={fieldLabel}>Maximum age</span><Input aria-label="Maximum age" type="number" min="0" max="150" value={value.ageMax ?? ""} onChange={(event) => setField("ageMax", event.target.value === "" ? null : Number(event.target.value))} className={softInput} /></label>
        <label className="grid gap-1.5"><span className={fieldLabel}>Postcode</span><Input aria-label="Postcode" value={value.postcode} onChange={(event) => setField("postcode", event.target.value)} className={softInput} /></label>
        <label className="grid gap-1.5"><span className={fieldLabel}>Gender</span><select aria-label="Gender" value={value.gender} onChange={(event) => setField("gender", event.target.value)} className={cn(softInput, "h-10 px-3 text-sm")}><option value="">Any gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></label>
        <label className="grid gap-1.5 md:col-span-2"><span className={fieldLabel}>Address</span><Input aria-label="Address" value={value.address} onChange={(event) => setField("address", event.target.value)} className={softInput} /></label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {listFields.map(({ key, label, addLabel }) => (
          <div key={key} className="grid gap-1.5">
            <span className={fieldLabel}>{label}</span>
            <div className="flex gap-2">
              <Input aria-label={label} className={softInput} placeholder={`Add ${label.toLowerCase()}`} onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); addListValue(key, event as unknown as ChangeEvent<HTMLInputElement>); }
              }} onBlur={(event) => addListValue(key, event)} />
              <Button type="button" variant="ghost" size="icon" aria-label={addLabel} className={secondaryBtn} onClick={(event) => {
                const input = event.currentTarget.parentElement?.querySelector("input");
                if (input) addListValue(key, { target: input } as ChangeEvent<HTMLInputElement>);
              }}><Plus /></Button>
            </div>
            {value[key].length > 0 && <div className="flex flex-wrap gap-1">{value[key].map((item) => <Badge key={item} variant="outline" className="bg-slate-50 text-slate-700 border-slate-200"><span>{item}</span><button type="button" aria-label={`Remove ${item}`} onClick={() => setField(key, value[key].filter((entry) => entry !== item))}><X className="ml-1 h-3 w-3" /></button></Badge>)}</div>}
          </div>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
