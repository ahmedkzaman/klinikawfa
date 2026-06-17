import { useEffect, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePatients } from '@/hooks/clinic/usePatients';
import type { PatientRow } from '@/types/clinic';
import { cn } from '@/lib/utils';
import { toMalayTitleCase } from '@/lib/textCase';

interface PatientPickerProps {
  value: PatientRow | null;
  onChange: (patient: PatientRow | null) => void;
  onRegisterNew?: () => void;
}

/**
 * Search-as-you-type patient picker with 250ms debounce.
 */
export function PatientPicker({ value, onChange, onRegisterNew }: PatientPickerProps) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const { data: patients = [], isLoading } = usePatients(debounced);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{value.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {value.phone ?? '—'}
            {value.national_id ? ` · ${value.national_id}` : ''}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            setSearch('');
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Search by name, phone, or IC…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-border">
        {isLoading && (
          <div className="px-3 py-4 text-sm text-muted-foreground">Searching…</div>
        )}
        {!isLoading && patients.length === 0 && (
          <div className="px-3 py-4 text-sm text-muted-foreground space-y-2">
            <p>No matching patients.</p>
            {onRegisterNew && (
              <Button type="button" variant="outline" size="sm" onClick={onRegisterNew}>
                Register new patient
              </Button>
            )}
          </div>
        )}
        {!isLoading && patients.length > 0 && (
          <ul className="divide-y divide-border">
            {patients.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onChange(p)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
                    'hover:bg-muted transition-colors',
                  )}
                >
                  <Check className="h-4 w-4 opacity-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{toMalayTitleCase(p.name)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.phone ?? '—'}
                      {p.national_id ? ` · ${p.national_id}` : ''}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
