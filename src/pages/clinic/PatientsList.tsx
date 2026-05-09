import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, Plus, Search, UserPlus } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatients } from '@/hooks/clinic/usePatients';
import { toMalayTitleCase } from '@/lib/textCase';
import { RegisterPatientDialog } from '@/components/clinic/RegisterPatientDialog';
import { PatientProfileSheet } from '@/components/patients/PatientProfileSheet';
import { CheckInWalkInDialog } from '@/components/clinic/CheckInWalkInDialog';
import type { PatientRow } from '@/types/clinic';
import { cn } from '@/lib/utils';
import {
  bento,
  pageInner,
  pageShell,
  primaryBtn,
  secondaryBtn,
  softInput,
} from '@/lib/clinic/bentoTokens';

export default function PatientsList() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [prefillPatient, setPrefillPatient] = useState<PatientRow | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const { data: patients = [], isLoading, isFetching } = usePatients(debouncedSearch);

  const showEmpty = !isLoading && patients.length === 0;

  return (
    <>
      <SEOHead
        title="Patients — Clinic Portal"
        description="Patient registry and demographics."
        noIndex
      />

      <div className={pageShell}>
        <div className={pageInner}>
          {/* Header bar */}
          <div className={cn(bento, 'p-4 flex items-center justify-between gap-3 flex-wrap')}>
            <div>
              <h1 className="text-2xl font-semibold text-slate-800">Patients</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Search the registry or register a new patient.
              </p>
            </div>
            <Button onClick={() => setRegisterOpen(true)} className={primaryBtn}>
              <Plus className="h-4 w-4 mr-1" /> Register Patient
            </Button>
          </div>

          {/* Search */}
          <div className={cn(bento, 'p-3')}>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search name, phone, or MyKad…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(softInput, 'pl-9')}
              />
            </div>
          </div>

          {showEmpty ? (
            <div className={cn(bento, 'flex flex-col items-center gap-3 py-12 text-center')}>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <UserPlus className="h-7 w-7 text-blue-600" />
              </div>
              <p className="text-sm text-slate-500">
                {debouncedSearch
                  ? 'No patients match your search.'
                  : 'No patients yet. Register the first one to get started.'}
              </p>
              <Button
                variant="ghost"
                onClick={() => setRegisterOpen(true)}
                className={secondaryBtn}
              >
                Register Patient
              </Button>
            </div>
          ) : (
            <div className={cn(bento, 'overflow-x-auto')}>
              <Table>
                <TableCaption className="sr-only">Patient registry</TableCaption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Name
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Phone
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      MyKad
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      DOB
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Gender
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Registered
                    </TableHead>
                    <TableHead className="w-12 text-right text-xs font-bold uppercase tracking-wider text-slate-500">
                      …
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={`skel-${i}`} className="border-slate-100">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : patients.map((p) => (
                        <TableRow
                          key={p.id}
                          className="border-slate-100 hover:bg-slate-50/60"
                        >
                          <TableCell className="font-medium text-slate-800">{toMalayTitleCase(p.name)}</TableCell>
                          <TableCell className="text-slate-600">{p.phone ?? '—'}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {p.national_id ?? '—'}
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {p.date_of_birth
                              ? format(new Date(p.date_of_birth), 'd MMM yyyy')
                              : '—'}
                          </TableCell>
                          <TableCell className="capitalize text-slate-600">
                            {p.gender ?? '—'}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {format(new Date(p.created_at), 'd MMM yyyy')}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Actions"
                                  className="rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedPatient(p);
                                    setSheetOpen(true);
                                  }}
                                >
                                  View profile
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
              {isFetching && !isLoading && (
                <div className="text-xs text-slate-400 px-4 py-2 border-t border-slate-100">
                  Refreshing…
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <RegisterPatientDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onCreated={() => {
          setSearch('');
          setDebouncedSearch('');
        }}
      />

      <PatientProfileSheet
        patient={selectedPatient}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onRegisterVisit={(p) => {
          setPrefillPatient(p);
          setCheckInOpen(true);
        }}
      />

      <CheckInWalkInDialog
        open={checkInOpen}
        onOpenChange={(o) => {
          setCheckInOpen(o);
          if (!o) setPrefillPatient(null);
        }}
        initialPatient={prefillPatient}
      />
    </>
  );
}
