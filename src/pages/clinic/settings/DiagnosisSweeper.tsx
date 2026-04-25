import { Link } from 'react-router-dom';
import { ArrowLeft, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import {
  useUncategorizedDiagnoses,
  useUpdateDiagnosisCategory,
} from '@/hooks/clinic/useDiagnoses';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

const CATEGORIES = [
  'Respiratory',
  'Cardiovascular',
  'Gastrointestinal',
  'Musculoskeletal',
  'Neurology',
  'Dermatology',
  'Endocrine',
  'Psychiatric',
  'Infectious Disease',
  'Occupational Health',
  'Obstetrics/Gynecology',
  'Pediatrics',
  'Other',
];

export default function DiagnosisSweeper() {
  const { data: diagnoses = [], isLoading } = useUncategorizedDiagnoses();
  const updateCategory = useUpdateDiagnosisCategory();

  const handleChange = (id: string, category: string, name: string) => {
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/clinic/settings">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Settings
          </Link>
        </Button>
      </div>

      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 text-primary p-2.5 shrink-0">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Diagnosis Categorization Sweeper
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Map raw clinical diagnoses into standard reporting categories. Categorized entries
            will leave this list automatically.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[55%]">Diagnosis Name</TableHead>
              <TableHead>Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-2/3" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-9 w-full max-w-xs" />
                  </TableCell>
                </TableRow>
              ))
            ) : diagnoses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-12 text-muted-foreground">
                  All diagnoses are categorized. Nothing to sweep right now. 🎉
                </TableCell>
              </TableRow>
            ) : (
              diagnoses.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>
                    <Select
                      onValueChange={(value) => handleChange(d.id, value, d.name)}
                      disabled={updateCategory.isPending}
                    >
                      <SelectTrigger className="max-w-xs">
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
      </Card>
    </div>
  );
}
