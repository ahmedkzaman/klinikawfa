import * as React from 'react';
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { useActiveDiagnoses, useDiagnoses, type DiagnosisRow } from '@/hooks/clinic/useDiagnoses';

interface DiagnosisComboboxProps {
  /** Selected diagnosis id (FK). */
  diagnosisId: string | null;
  /** Free-text fallback / display text — used when no FK match. */
  diagnosisText: string;
  /** Called whenever the user picks/creates an item, OR types free text. */
  onChange: (next: { diagnosis_id: string | null; diagnosis_text: string }) => void;
  className?: string;
  placeholder?: string;
}

export function DiagnosisCombobox({
  diagnosisId,
  diagnosisText,
  onChange,
  className,
  placeholder = 'Search diagnosis or ICD-10…',
}: DiagnosisComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const { data: diagnoses = [], isLoading } = useActiveDiagnoses();
  const { addDiagnosis } = useDiagnoses();

  const selected = React.useMemo<DiagnosisRow | undefined>(
    () => diagnoses.find((d) => d.id === diagnosisId),
    [diagnoses, diagnosisId],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return diagnoses.slice(0, 50);
    return diagnoses
      .filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.icd10_code ?? '').toLowerCase().includes(q) ||
          (d.search_aliases ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [diagnoses, search]);

  const exactMatch = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return diagnoses.some((d) => d.name.toLowerCase() === q);
  }, [diagnoses, search]);

  const display = selected
    ? `${selected.icd10_code ? `[${selected.icd10_code}] ` : ''}${selected.name}`
    : diagnosisText || '';

  const handleSelect = (d: DiagnosisRow) => {
    onChange({ diagnosis_id: d.id, diagnosis_text: d.name });
    setOpen(false);
    setSearch('');
  };

  const handleCreate = async () => {
    const name = search.trim();
    if (!name) return;
    try {
      const created = await addDiagnosis.mutateAsync({ name });
      toast.success(`Created "${created.name}"`);
      handleSelect(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create diagnosis');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal h-9',
            !display && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate text-left">{display || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search by name or ICD-10 code…"
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading diagnoses…
              </div>
            ) : (
              <>
                {filtered.length === 0 && exactMatch && (
                  <CommandEmpty>No diagnoses found.</CommandEmpty>
                )}
                {filtered.length > 0 && (
                  <CommandGroup heading="Diagnoses">
                    {filtered.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={d.id}
                        onSelect={() => handleSelect(d)}
                        className="flex items-center gap-2"
                      >
                        <Check
                          className={cn(
                            'h-4 w-4 shrink-0',
                            d.id === diagnosisId ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        {d.icd10_code ? (
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px] shrink-0"
                          >
                            {d.icd10_code}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-mono w-12 shrink-0">
                            —
                          </span>
                        )}
                        <span className="truncate">{d.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {search.trim() && !exactMatch && (
                  <CommandGroup heading="Create new">
                    <CommandItem
                      value={`__create__${search}`}
                      onSelect={handleCreate}
                      disabled={addDiagnosis.isPending}
                    >
                      {addDiagnosis.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Create new diagnosis: <strong className="ml-1">{search.trim()}</strong>
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
