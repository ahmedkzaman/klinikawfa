import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Download, RefreshCw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { bento, primaryBtn, secondaryBtn } from "@/lib/clinic/bentoTokens";
import type { PatientExplorerRow } from "@/types/patientExplorer";

interface PatientExplorerResultsProps {
  hasApplied: boolean;
  rows: PatientExplorerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onPageChange: (page: number) => void;
  onViewProfile: (row: PatientExplorerRow) => void;
}

function summary(values: string[]): string {
  if (values.length === 0) return "-";
  return values.length > 2 ? `${values.slice(0, 2).join(", ")} +${values.length - 2}` : values.join(", ");
}

function visitDates(values: string[]): string {
  return values.map((value) => {
    try { return format(new Date(`${value}T00:00:00`), "d MMM yyyy"); } catch { return value; }
  }).join(", ");
}

export function PatientExplorerResults({
  hasApplied, rows, totalCount, page, pageSize, isLoading, isFetching, error, onPageChange, onViewProfile,
}: PatientExplorerResultsProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const errorMessage = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? "");
  const isPermissionError = /permission|not authorized|forbidden/i.test(errorMessage);

  return (
    <section className={cn(bento, "overflow-hidden")} aria-label="Patient Explorer results">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div><h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">Results</h2><p className="mt-0.5 text-sm text-slate-500">{hasApplied ? `${totalCount} patient${totalCount === 1 ? "" : "s"} found` : "Apply filters to search patient visits."}</p></div>
        <div className="flex items-center gap-2">{isFetching && <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Refreshing results</span>}<Button type="button" variant="ghost" className={secondaryBtn} disabled aria-label="Export results"><Download />Export</Button></div>
      </div>
      {!hasApplied ? <div className="px-4 py-12 text-center text-sm text-slate-500">Choose filters, then apply them to load patients.</div>
        : isLoading ? <div className="space-y-3 p-4" aria-label="Loading patients">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
        : error ? <div className="px-4 py-12 text-center"><p className="text-sm font-medium text-slate-800">{isPermissionError ? "You do not have permission to view these patient results." : "Unable to load patient results"}</p>{!isPermissionError && <p className="mt-1 text-sm text-slate-500">{errorMessage || "Please try again."}</p>}</div>
        : rows.length === 0 ? <div className="px-4 py-12 text-center text-sm text-slate-500">No patients match these filters.</div>
        : <><Table><TableHeader><TableRow className="border-slate-100 hover:bg-transparent"><TableHead>Patient</TableHead><TableHead>Contact</TableHead><TableHead>Demographics</TableHead><TableHead>Matching visits</TableHead><TableHead>Clinical details</TableHead><TableHead>Doctor</TableHead><TableHead className="text-right">Profile</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.patientId} className="border-slate-100"><TableCell><p className="font-medium text-slate-800">{row.patientName}</p><p className="font-mono text-xs text-slate-500">{row.icNumber ?? "-"}</p></TableCell><TableCell className="text-sm text-slate-600"><p>{row.phone ?? "-"}</p><p className="max-w-48 truncate text-xs text-slate-500" title={row.address ?? undefined}>{row.address ?? "-"}</p><p className="text-xs text-slate-500">{row.postcode ?? "-"}</p></TableCell><TableCell className="text-sm text-slate-600"><p>{row.currentAge == null ? "-" : `${row.currentAge} years`}</p><p className="text-xs">{row.gender ?? "-"}</p></TableCell><TableCell className="min-w-44 text-sm text-slate-600"><p>{visitDates(row.matchingVisitDates)}</p><Badge variant="outline" className="mt-1 border-slate-200 bg-slate-50 text-slate-600">{row.visitCount} visits</Badge></TableCell><TableCell className="min-w-60 text-xs text-slate-600"><p><strong>Dx:</strong> {summary(row.diagnoses)}</p><p><strong>Tests:</strong> {summary(row.bloodInvestigations)}</p><p><strong>Services:</strong> {summary(row.procedures)}</p><p><strong>Meds:</strong> {summary(row.medicines)}</p><p><strong>Status:</strong> {summary(row.consultationStatuses)}</p></TableCell><TableCell className="text-sm text-slate-600">{summary(row.attendingDoctors)}</TableCell><TableCell className="text-right"><Button type="button" variant="ghost" size="icon" className={secondaryBtn} aria-label={`View ${row.patientName} profile`} onClick={() => onViewProfile(row)}><UserRound /></Button></TableCell></TableRow>)}</TableBody></Table>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4"><p className="text-sm text-slate-500">Page {page} of {totalPages}</p><div className="flex gap-2"><Button type="button" variant="ghost" size="icon" className={secondaryBtn} aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft /></Button><Button type="button" variant="ghost" size="icon" className={primaryBtn} aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight /></Button></div></div></>}
    </section>
  );
}
