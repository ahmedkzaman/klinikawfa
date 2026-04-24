import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, Plus, Search, UserPlus } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { RegisterPatientDialog } from '@/components/clinic/RegisterPatientDialog';
import { PatientProfileSheet } from '@/components/patients/PatientProfileSheet';
import { CheckInWalkInDialog } from '@/components/clinic/CheckInWalkInDialog';
import type { PatientRow } from '@/types/clinic';

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

      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Patients</h1>
          <p className="text-sm text-muted-foreground">
            Search the registry or register a new patient.
          </p>
        </div>
        <Button onClick={() => setRegisterOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Register Patient
        </Button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search name, phone, or MyKad…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {showEmpty ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <UserPlus className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              {debouncedSearch
                ? 'No patients match your search.'
                : 'No patients yet. Register the first one to get started.'}
            </p>
            <Button variant="outline" onClick={() => setRegisterOpen(true)}>
              Register Patient
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableCaption className="sr-only">Patient registry</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>MyKad</TableHead>
                  <TableHead>DOB</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="w-12 text-right">…</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={`skel-${i}`}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : patients.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.phone ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.national_id ?? '—'}
                        </TableCell>
                        <TableCell>
                          {p.date_of_birth
                            ? format(new Date(p.date_of_birth), 'd MMM yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell className="capitalize">{p.gender ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(p.created_at), 'd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Actions">
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
              <div className="text-xs text-muted-foreground px-4 py-2 border-t">
                Refreshing…
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
