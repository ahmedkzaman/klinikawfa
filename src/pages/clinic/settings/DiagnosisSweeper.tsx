import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import {
  useUncategorizedDiagnoses,
  useUpdateDiagnosisCategory,
  type DiagnosisRow,
} from '@/hooks/clinic/useDiagnoses';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { bento, pageInner, pageShell, softInput } from '@/lib/clinic/bentoTokens';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  'Cardiometabolic / Endocrine',
  'Dermatology',
  'Eye',
  'Gastrointestinal',
  'Musculoskeletal / Injury',
  'Neurology / Mental Health / General',
  'Pediatrics / Infectious',
  'Preventive / Administrative',
  'Respiratory / ENT',
  'Urology / Renal',
  'Women’s Health / Reproductive',
];

const TH = 'text-[11px] font-semibold text-slate-500 uppercase tracking-wider';
const TR = 'border-slate-100';

function IcdCell({ row }: { row: DiagnosisRow }) {
  const updateCategory = useUpdateDiagnosisCategory();
  const [val, setVal] = useState(row.icd10_code ?? '');

  useEffect(() => {
    setVal(row.icd10_code ?? '');
  }, [row.icd10_code]);

  const handleBlur = () => {
    const next = val.trim() || null;
    if (next === (row.icd10_code ?? null)) return;
    updateCategory.mutate(
      { id: row.id, icd10_code: next },
      {
        onSuccess: () =>
          toast.success(next ? `ICD-10 set to ${next}` : 'ICD-10 cleared'),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : 'Failed to update ICD-10'),
      },
    );
  };

  return (
    <Input
      value={val}
      onChange={(e) => setVal(e.target.value.toUpperCase())}
      onBlur={handleBlur}
      placeholder="—"
      className={cn(softInput, 'h-8 max-w-[120px] font-mono text-xs')}
    />
  );
}

export default function DiagnosisSweeper() {
  const { data: diagnoses = [], isLoading } = useUncategorizedDiagnoses();
  const updateCategory = useUpdateDiagnosisCategory();

  const handleCategoryChange = (id: string, category: string, name: string) => {
    updateCategory.mutate(
      { id, category },
      {
        onSuccess: () => toast.success(`"${name}" categorized as ${category}`),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : 'Failed to update category'),
      },
    );
  };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900 hover:bg-slate-100">
            <Link to="/clinic/settings">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Settings
            </Link>
          </Button>
        </div>

        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 text-blue-600 p-3 shrink-0">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Diagnosis Categorization Sweeper
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Map raw clinical diagnoses into standard reporting categories and tag them with
              ICD-10 codes. Categorized entries leave this list automatically.
            </p>
          </div>
        </div>

        <Card className={cn(bento, 'overflow-hidden')}>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className={cn(TR, 'hover:bg-transparent bg-slate-50/50')}>
                  <TableHead className={cn(TH, 'w-[45%]')}>Diagnosis Name</TableHead>
                  <TableHead className={cn(TH, 'w-[20%]')}>ICD-10</TableHead>
                  <TableHead className={TH}>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className={TR}>
                      <TableCell>
                        <Skeleton className="h-5 w-2/3" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-9 w-full max-w-xs" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : diagnoses.length === 0 ? (
                  <TableRow className={TR}>
                    <TableCell colSpan={3} className="text-center py-12 text-slate-400">
                      All diagnoses are categorized. Nothing to sweep right now. 🎉
                    </TableCell>
                  </TableRow>
                ) : (
                  diagnoses.map((d) => (
                    <TableRow key={d.id} className={TR}>
                      <TableCell className="font-medium text-slate-800">{d.name}</TableCell>
                      <TableCell>
                        <IcdCell row={d} />
                      </TableCell>
                      <TableCell>
                        <Select
                          onValueChange={(value) => handleCategoryChange(d.id, value, d.name)}
                          disabled={updateCategory.isPending}
                        >
                          <SelectTrigger className={cn(softInput, 'max-w-xs')}>
                            <SelectValue placeholder="Select category…" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
