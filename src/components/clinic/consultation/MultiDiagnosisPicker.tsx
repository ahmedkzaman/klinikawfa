import * as React from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DiagnosisCombobox } from './DiagnosisCombobox';
import { useActiveDiagnoses } from '@/hooks/clinic/useDiagnoses';

/**
 * Multi-diagnosis picker.
 *
 * Wire-compatible with the existing `consultations` schema (single
 * `diagnosis_id` FK + free-text `diagnosis_text`):
 * - All diagnoses (structured + free-text) are stored as a comma-separated
 *   list of display names in `diagnosis_text`.
 * - The first picked structured diagnosis populates `diagnosis_id` for
 *   reporting / backward compatibility.
 */
interface Props {
  diagnosisId: string | null;
  diagnosisText: string;
  onChange: (next: { diagnosis_id: string | null; diagnosis_text: string }) => void;
  disabled?: boolean;
}

type Item = { id: string | null; name: string };

function splitText(text: string): string[] {
  return text
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function serialize(items: Item[]): {
  diagnosis_id: string | null;
  diagnosis_text: string;
} {
  const firstStructured = items.find((i) => i.id);
  return {
    diagnosis_id: firstStructured?.id ?? null,
    diagnosis_text: items.map((i) => i.name).join(', '),
  };
}

export function MultiDiagnosisPicker({
  diagnosisId,
  diagnosisText,
  onChange,
  disabled,
}: Props) {
  const { data: catalog = [] } = useActiveDiagnoses();

  // Derive list from inbound props + catalog. The first structured pick
  // (matched against `diagnosisId`) anchors the list; remaining names
  // come from `diagnosis_text`.
  const items = React.useMemo<Item[]>(() => {
    const names = splitText(diagnosisText);
    const primary = diagnosisId
      ? catalog.find((d) => d.id === diagnosisId)
      : undefined;
    const primaryName = primary?.name?.trim();

    const result: Item[] = [];
    if (primary) result.push({ id: primary.id, name: primary.name });

    for (const n of names) {
      if (primaryName && n.toLowerCase() === primaryName.toLowerCase()) continue;
      if (result.some((r) => r.name.toLowerCase() === n.toLowerCase())) continue;
      const match = catalog.find((d) => d.name.toLowerCase() === n.toLowerCase());
      result.push({ id: match?.id ?? null, name: match?.name ?? n });
    }
    return result;
  }, [diagnosisId, diagnosisText, catalog]);

  const handleAdd = (next: { diagnosis_id: string | null; diagnosis_text: string }) => {
    const name = next.diagnosis_text.trim();
    if (!name) return;
    // Avoid duplicates by name (case-insensitive)
    if (items.some((i) => i.name.toLowerCase() === name.toLowerCase())) return;
    const updated: Item[] = [...items, { id: next.diagnosis_id, name }];
    onChange(serialize(updated));
  };

  const handleRemove = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx);
    onChange(serialize(updated));
  };

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, idx) => {
            const catEntry = it.id ? catalog.find((d) => d.id === it.id) : null;
            const label = catEntry?.icd10_code
              ? `[${catEntry.icd10_code}] ${it.name}`
              : it.name;
            return (
              <Badge
                key={`${it.id ?? 'free'}-${idx}`}
                variant={it.id ? 'secondary' : 'outline'}
                className="gap-1 pl-2 pr-1 py-1 text-xs font-normal"
              >
                {idx === 0 && (
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground mr-0.5">
                    Primary
                  </span>
                )}
                <span className="truncate max-w-[260px]">{label}</span>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleRemove(idx)}
                    aria-label={`Remove ${it.name}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </Badge>
            );
          })}
        </div>
      )}
      {!disabled && (
        <DiagnosisCombobox
          diagnosisId={null}
          diagnosisText=""
          onChange={handleAdd}
          placeholder={
            items.length
              ? 'Add another diagnosis…'
              : 'Search diagnosis or ICD-10…'
          }
        />
      )}
    </div>
  );
}
