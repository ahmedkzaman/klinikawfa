import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import {
  FileText,
  Image as ImageIcon,
  Minus,
  Package as PackageIcon,
  Pill,
  Plus,
  Stethoscope,
  Tag,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useConsultationItems,
  useUpdateConsultationItem,
  useRemoveConsultationItem,
} from '@/hooks/clinic/useConsultationItems';
import { useConsultationAttachments } from '@/hooks/clinic/useAttachments';
import {
  useDrugLabelSettings,
  type DrugLabelSettings,
} from '@/hooks/clinic/useDrugLabelSettings';
import { CLINIC_INFO } from '@/lib/constants';

/**
 * Defaults that mirror the DB defaults (every field visible). Used while the
 * singleton settings row is still loading so we never accidentally print a
 * stripped-down label by accident.
 */
const DEFAULT_LABEL_SETTINGS: Pick<
  DrugLabelSettings,
  | 'show_address'
  | 'show_tel_number'
  | 'show_precaution'
  | 'show_quantity'
  | 'show_date'
  | 'show_expiry_date'
  | 'show_duration'
  | 'show_indication'
> = {
  show_address: true,
  show_tel_number: true,
  show_precaution: true,
  show_quantity: true,
  show_date: true,
  show_expiry_date: true,
  show_duration: true,
  show_indication: true,
};

interface Props {
  consultationId: string | undefined;
  canEdit?: boolean;
  /**
   * Optional patient display name forwarded to the printed label so the
   * dispensary can stick it on the bag immediately. Falls back gracefully
   * when not provided.
   */
  patientName?: string | null;
}

type ConsultationItemRow = {
  id: string;
  consultation_id: string;
  item_name: string;
  quantity: number | null;
  price: number | null;
  price_tier: string | null;
  item_id: string | null;
  service_id: string | null;
  package_id: string | null;
  indication: string | null;
  dosage: string | null;
  dosage_qty: number | null;
  dosage_unit: string | null;
  frequency: string | null;
  instruction: string | null;
  duration: string | null;
  precaution: string | null;
};

/**
 * Compose Yezza-style dosage chip parts (e.g. "GASTRIK | 10 ML | 3X SEHARI |
 * SELEPAS MAKAN") from the structured columns on `consultation_items`.
 */
function buildDosageBits(item: ConsultationItemRow): string[] {
  const qtyUnit =
    item.dosage_qty != null && item.dosage_unit
      ? `${item.dosage_qty} ${item.dosage_unit}`
      : item.dosage ?? null;
  return [item.indication, qtyUnit, item.frequency, item.instruction]
    .filter((s): s is string => Boolean(s && String(s).trim()))
    .map((s) => String(s).toUpperCase());
}

/**
 * Tiny tab label that pairs the name with a count chip so staff can see how
 * many rows live behind each tab without switching.
 */
function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <Badge
        variant="secondary"
        className="h-5 min-w-5 px-1.5 text-[10px] font-semibold leading-none rounded-full"
      >
        {count}
      </Badge>
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Icon className="h-10 w-10 mb-2 opacity-20" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs mt-1 max-w-xs text-center">{hint}</p>
    </div>
  );
}

export function VisitDetailsColumn({
  consultationId,
  canEdit = true,
  patientName,
}: Props) {
  const { data: rawItems = [], isLoading } = useConsultationItems(consultationId);
  const items = rawItems as unknown as ConsultationItemRow[];

  const { data: attachments = [], isLoading: attachmentsLoading } =
    useConsultationAttachments(consultationId);

  const { data: labelSettings } = useDrugLabelSettings();

  const updateItem = useUpdateConsultationItem();
  const removeItem = useRemoveConsultationItem();

  const [activeTab, setActiveTab] = useState<
    'all' | 'items' | 'services' | 'packages' | 'documents'
  >('all');

  // Single-rendering print state — when populated we render a hidden
  // `print:block` block then call window.print() once. Cleared on
  // `afterprint` so subsequent prints stay deterministic.
  const [printQueue, setPrintQueue] = useState<ConsultationItemRow[]>([]);
  const printTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (printQueue.length === 0) return;
    // Defer one tick so React commits the hidden print block to the DOM.
    printTimerRef.current = window.setTimeout(() => {
      window.print();
    }, 50);
    const clear = () => setPrintQueue([]);
    window.addEventListener('afterprint', clear, { once: true });
    return () => {
      if (printTimerRef.current) window.clearTimeout(printTimerRef.current);
      window.removeEventListener('afterprint', clear);
    };
  }, [printQueue]);

  // ── Filtered slices ───────────────────────────────────────────────────────
  const itemsRows = useMemo(
    () => items.filter((i) => i.item_id != null),
    [items],
  );
  const servicesRows = useMemo(
    () => items.filter((i) => i.service_id != null),
    [items],
  );
  const packagesRows = useMemo(
    () => items.filter((i) => i.package_id != null),
    [items],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const handleQty = async (
    id: string,
    currentQty: number,
    delta: number,
  ) => {
    if (!consultationId) return;
    const next = currentQty + delta;
    if (next < 1) return;
    try {
      await updateItem.mutateAsync({ id, consultationId, quantity: next });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRemove = async (id: string) => {
    if (!consultationId) return;
    try {
      await removeItem.mutateAsync({ id, consultationId });
      toast.success('Item removed');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ── Print actions ─────────────────────────────────────────────────────────
  const handlePrintLabel = (item: ConsultationItemRow) => {
    setPrintQueue([item]);
  };

  const handlePrintAllLabels = () => {
    if (itemsRows.length === 0) {
      toast.info('No medicines to print labels for');
      return;
    }
    setPrintQueue(itemsRows);
  };

  const handlePrintAllDocuments = () => {
    if (attachments.length === 0) {
      toast.info('No documents attached');
      return;
    }
    // Open each in a new tab; the user prints from the browser viewer.
    attachments.forEach((a) => {
      if (a.signedUrl) window.open(a.signedUrl, '_blank', 'noopener,noreferrer');
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border overflow-hidden">
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl bg-card border overflow-hidden print:hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        >
          {/* Tab strip */}
          <div className="px-3 pt-3 border-b border-border bg-muted/30">
            <TabsList className="bg-transparent h-auto p-0 gap-1">
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-md rounded-b-none px-3 py-2"
              >
                <TabLabel label="All" count={items.length} />
              </TabsTrigger>
              <TabsTrigger
                value="items"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-md rounded-b-none px-3 py-2"
              >
                <TabLabel label="Items" count={itemsRows.length} />
              </TabsTrigger>
              <TabsTrigger
                value="services"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-md rounded-b-none px-3 py-2"
              >
                <TabLabel label="Services" count={servicesRows.length} />
              </TabsTrigger>
              <TabsTrigger
                value="packages"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-md rounded-b-none px-3 py-2"
              >
                <TabLabel label="Packages" count={packagesRows.length} />
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-md rounded-b-none px-3 py-2"
              >
                <TabLabel label="Documents" count={attachments.length} />
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Bulk-actions header */}
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full text-xs"
                onClick={handlePrintAllLabels}
                disabled={itemsRows.length === 0}
              >
                <Tag className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                Print all labels
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full text-xs"
                onClick={handlePrintAllDocuments}
                disabled={attachments.length === 0}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                Print all documents
              </Button>
            </div>
            {!canEdit && (
              <span className="text-[10px] uppercase tracking-wide font-semibold rounded-full bg-muted text-muted-foreground px-2 py-0.5">
                View only
              </span>
            )}
          </div>

          {/* Tab content panes */}
          <TabsContent value="all" className="m-0">
            <ItemList
              rows={items}
              canEdit={canEdit}
              onQty={handleQty}
              onRemove={handleRemove}
              onPrintLabel={handlePrintLabel}
              updatingId={updateItem.isPending}
              removingId={removeItem.isPending}
              emptyState={
                <EmptyState
                  icon={Pill}
                  title="No items prescribed"
                  hint="Items added by the doctor during consultation appear here."
                />
              }
            />
          </TabsContent>
          <TabsContent value="items" className="m-0">
            <ItemList
              rows={itemsRows}
              canEdit={canEdit}
              onQty={handleQty}
              onRemove={handleRemove}
              onPrintLabel={handlePrintLabel}
              updatingId={updateItem.isPending}
              removingId={removeItem.isPending}
              emptyState={
                <EmptyState
                  icon={Pill}
                  title="No medicines"
                  hint="Physical inventory items prescribed by the doctor appear here."
                />
              }
            />
          </TabsContent>
          <TabsContent value="services" className="m-0">
            <ItemList
              rows={servicesRows}
              canEdit={canEdit}
              onQty={handleQty}
              onRemove={handleRemove}
              onPrintLabel={handlePrintLabel}
              updatingId={updateItem.isPending}
              removingId={removeItem.isPending}
              emptyState={
                <EmptyState
                  icon={Stethoscope}
                  title="No services"
                  hint="Consultations, procedures, and other services appear here."
                />
              }
            />
          </TabsContent>
          <TabsContent value="packages" className="m-0">
            <ItemList
              rows={packagesRows}
              canEdit={canEdit}
              onQty={handleQty}
              onRemove={handleRemove}
              onPrintLabel={handlePrintLabel}
              updatingId={updateItem.isPending}
              removingId={removeItem.isPending}
              emptyState={
                <EmptyState
                  icon={PackageIcon}
                  title="No packages"
                  hint="Bundled service or product packages appear here."
                />
              }
            />
          </TabsContent>
          <TabsContent value="documents" className="m-0">
            <DocumentsList
              attachments={attachments}
              isLoading={attachmentsLoading}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Hidden print portal — mounts as a direct child of <body> via createPortal
          so the label escapes every layout container (sidebar, header, padding,
          max-width). The scoped @page rule + body > *:not(...) hide rule
          forces the browser onto a true 60×50mm thermal page. */}
      <ThermalLabelPortal
        rows={printQueue}
        patientName={patientName ?? null}
        settings={labelSettings ?? DEFAULT_LABEL_SETTINGS}
      />
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface ItemListProps {
  rows: ConsultationItemRow[];
  canEdit: boolean;
  onQty: (id: string, currentQty: number, delta: number) => void;
  onRemove: (id: string) => void;
  onPrintLabel: (item: ConsultationItemRow) => void;
  updatingId: boolean;
  removingId: boolean;
  emptyState: React.ReactNode;
}

function ItemList({
  rows,
  canEdit,
  onQty,
  onRemove,
  onPrintLabel,
  updatingId,
  removingId,
  emptyState,
}: ItemListProps) {
  if (rows.length === 0) return <>{emptyState}</>;

  return (
    <div className="divide-y divide-border">
      {rows.map((item) => {
        const lineTotal = Number(item.price ?? 0) * (item.quantity ?? 0);
        const dosageBits = item.item_id ? buildDosageBits(item) : [];
        const tier = item.price_tier ?? 'SELF PAY';
        return (
          <div
            key={item.id}
            className="px-4 py-3 flex items-start gap-3 hover:bg-muted/30"
          >
            <div className="flex-1 min-w-0">
              {/* Bold uppercase name — Yezza style */}
              <div className="text-sm font-bold uppercase tracking-tight text-foreground">
                {item.item_name}
              </div>

              {/* Pricing tier sub-line */}
              <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                {tier}, RM {Number(item.price ?? 0).toFixed(2)}
              </div>

              {/* Dosage chips — only for medicines (item_id present) and only
                  when at least one structured field is set. */}
              {dosageBits.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-slate-500 uppercase tracking-wide">
                  {dosageBits.map((bit, i) => (
                    <span key={`${item.id}-bit-${i}`} className="inline-flex items-center">
                      {i > 0 && (
                        <span className="mx-1.5 text-slate-300" aria-hidden>
                          |
                        </span>
                      )}
                      {bit}
                    </span>
                  ))}
                </div>
              )}

              {/* Inline qty controls + remove (kept for editability) */}
              {canEdit && (
                <div className="mt-2 flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onQty(item.id, item.quantity ?? 1, -1)}
                    disabled={(item.quantity ?? 1) <= 1 || updatingId}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-7 text-center text-xs font-medium tabular-nums">
                    {item.quantity ?? 1}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onQty(item.id, item.quantity ?? 1, 1)}
                    disabled={updatingId}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-1 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(item.id)}
                    disabled={removingId}
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {!canEdit && (
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  Qty ×{item.quantity ?? 1}
                </div>
              )}
            </div>

            {/* Right rail: total + (medicine-only) Print label */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className="text-sm font-semibold tabular-nums">
                RM {lineTotal.toFixed(2)}
              </div>
              {item.item_id && canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full text-xs px-3"
                  onClick={() => onPrintLabel(item)}
                >
                  <Tag className="h-3 w-3 mr-1.5 text-amber-600" />
                  Print label
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface DocumentsListProps {
  attachments: ReturnType<typeof useConsultationAttachments>['data'] extends
    | infer T
    | undefined
    ? Exclude<T, undefined>
    : never;
  isLoading: boolean;
}

function DocumentsList({ attachments, isLoading }: DocumentsListProps) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (!attachments || attachments.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents attached"
        hint="Lab results, photos, and other files uploaded for this visit appear here."
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {attachments.map((a) => {
        const isImage = (a.content_type ?? '').startsWith('image/');
        const Icon = isImage ? ImageIcon : FileText;
        return (
          <li
            key={a.id}
            className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon className="h-4 w-4 text-slate-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-bold uppercase tracking-tight truncate">
                  {a.file_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    try {
                      return format(new Date(a.created_at), 'd MMM yyyy, h:mma');
                    } catch {
                      return '';
                    }
                  })()}
                </div>
              </div>
            </div>
            {a.signedUrl ? (
              <a
                href={a.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-primary hover:underline shrink-0"
              >
                View
              </a>
            ) : (
              <span className="text-xs text-muted-foreground shrink-0">
                Unavailable
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Hidden print-only label block. Each medicine prints on its own page so a
 * thermal printer feeds correctly between labels.
 */
function PrintLabels({
  rows,
  patientName,
}: {
  rows: ConsultationItemRow[];
  patientName: string | null;
}) {
  return (
    <div className="hidden print:block">
      {rows.map((r, idx) => {
        const dosageBits = buildDosageBits(r);
        return (
          <div
            key={`${r.id}-print-${idx}`}
            className="p-6 text-black"
            style={{
              pageBreakAfter: idx < rows.length - 1 ? 'always' : 'auto',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {patientName && (
              <div className="text-sm mb-2">
                <span className="font-semibold">Patient:</span> {patientName}
              </div>
            )}
            <div className="text-lg font-bold uppercase tracking-tight">
              {r.item_name}
            </div>
            {r.indication && (
              <div className="text-sm uppercase mt-1">
                For: {r.indication}
              </div>
            )}
            {dosageBits.length > 0 && (
              <div className="text-sm uppercase mt-2 leading-relaxed">
                {dosageBits.join(' | ')}
              </div>
            )}
            {r.duration && (
              <div className="text-sm mt-2">
                Duration: {r.duration}
              </div>
            )}
            {r.precaution && (
              <div className="text-xs mt-3 italic">⚠ {r.precaution}</div>
            )}
            <div className="text-[10px] mt-4 opacity-60">
              Qty: {r.quantity ?? 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}
