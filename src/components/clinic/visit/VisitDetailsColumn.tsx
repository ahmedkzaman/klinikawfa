import { useMemo, useState } from 'react';
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
import { useDrugLabelSettings } from '@/hooks/clinic/useDrugLabelSettings';
import { generateDrugLabelPdf } from '@/lib/clinic/printDrugLabel';

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

  // Print orchestration: build a real 60×50mm PDF with jsPDF and open it in
  // a new tab. The PDF carries its physical page dimensions in its metadata,
  // so the browser's print dialog auto-selects the right paper size and skips
  // the A4-fallback / browser-injected headers/footers that broke the
  // window.print() approach.
  const openLabelPdf = (rows: ConsultationItemRow[]) => {
    if (rows.length === 0) return;
    try {
      const url = generateDrugLabelPdf(
        rows,
        patientName ?? null,
        labelSettings ?? null,
      );
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        toast.error('Pop-up blocked — allow pop-ups to print labels');
        return;
      }
      // Auto-prompt the print dialog once the PDF viewer finishes loading.
      win.addEventListener(
        'load',
        () => {
          try {
            win.print();
          } catch {
            /* user can still hit Ctrl+P manually */
          }
        },
        { once: true },
      );
    } catch (err) {
      toast.error((err as Error).message || 'Failed to generate label PDF');
    }
  };

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
    openLabelPdf([item]);
  };

  const handlePrintAllLabels = () => {
    if (itemsRows.length === 0) {
      toast.info('No medicines to print labels for');
      return;
    }
    openLabelPdf(itemsRows);
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
 * Scoped print stylesheet shipped with the portal. Lives inside the portal
 * (which mounts under <body>) so the rules are present whenever the portal
 * is present and removed when it isn't.
 *
 * The two key rules:
 *   1. `body > *:not(#thermal-label-portal) { display: none }` — surgical
 *      hide that prevents A4-creep from inherited app paddings.
 *   2. `@page { size: 60mm 50mm; margin: 0 }` — physically forces the
 *      browser onto the thermal roll dimensions.
 */
const THERMAL_PRINT_CSS = `
@media screen {
  #thermal-label-portal { display: none; }
}
@media print {
  body > *:not(#thermal-label-portal) { display: none !important; }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  #thermal-label-portal {
    display: block !important;
    width: 60mm;
    margin: 0;
    padding: 0;
  }

  @page {
    size: 60mm 50mm;
    margin: 0;
  }

  .thermal-label-page {
    width: 60mm;
    height: 50mm;
    padding: 2mm 3mm;
    box-sizing: border-box;
    page-break-after: always;
    font-family: 'Inter', system-ui, sans-serif;
    color: #000;
    background: #fff;
    overflow: hidden;
    position: relative;
  }
  .thermal-label-page:last-child { page-break-after: auto; }
}
`;

interface ThermalLabelPortalProps {
  rows: ConsultationItemRow[];
  patientName: string | null;
  settings: Pick<
    DrugLabelSettings,
    | 'show_address'
    | 'show_tel_number'
    | 'show_precaution'
    | 'show_quantity'
    | 'show_date'
    | 'show_expiry_date'
    | 'show_duration'
    | 'show_indication'
  >;
}

function ThermalLabelPortal({
  rows,
  patientName,
  settings,
}: ThermalLabelPortalProps) {
  // Don't mount anything when there's nothing to print — keeps the DOM clean
  // between print jobs and ensures `afterprint` returns the page to its
  // normal state without leftover hidden nodes.
  if (rows.length === 0 || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <style>{THERMAL_PRINT_CSS}</style>
      <div id="thermal-label-portal">
        {rows.map((r, idx) => (
          <ThermalLabel
            key={`${r.id}-thermal-${idx}`}
            item={r}
            patientName={patientName}
            settings={settings}
          />
        ))}
      </div>
    </>,
    document.body,
  );
}

function ThermalLabel({
  item,
  patientName,
  settings,
}: {
  item: ConsultationItemRow;
  patientName: string | null;
  settings: ThermalLabelPortalProps['settings'];
}) {
  const dosageBits = buildDosageBits(item);
  const today = format(new Date(), 'dd/MM/yyyy');
  // Placeholder expiry — `consultation_items` doesn't store one yet. Defaulting
  // to today + 30 days gives the dispensary a reasonable use-by hint until a
  // real expiry source is added (future migration). The toggle still controls
  // visibility so clinics that don't want a guess can hide it.
  const expiryDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return format(d, 'dd/MM/yyyy');
  })();

  const clinicLine = `${CLINIC_INFO.name.toUpperCase()}, KOTASAS`;
  const addressLine = `${CLINIC_INFO.address.line1}, ${CLINIC_INFO.address.city}`;
  const telLine = CLINIC_INFO.phone;

  return (
    <div className="thermal-label-page">
      {/* Header — clinic identity, always shows clinic name */}
      <div
        style={{
          fontWeight: 700,
          fontSize: '8pt',
          textTransform: 'uppercase',
          lineHeight: 1.1,
        }}
      >
        {clinicLine}
      </div>
      {settings.show_address && (
        <div
          style={{
            fontSize: '6.5pt',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {addressLine}
        </div>
      )}
      {settings.show_tel_number && (
        <div style={{ fontSize: '6.5pt', fontWeight: 600, lineHeight: 1.2 }}>
          Tel: {telLine}
        </div>
      )}

      <hr
        style={{
          border: 0,
          borderTop: '0.3mm solid #000',
          margin: '0.8mm 0',
        }}
      />

      {/* Patient — mandatory when provided */}
      {patientName && (
        <div
          style={{
            fontWeight: 700,
            fontSize: '7.5pt',
            textTransform: 'uppercase',
            lineHeight: 1.15,
          }}
        >
          {patientName}
        </div>
      )}

      {/* Medication name — bold, large, mandatory */}
      <div
        style={{
          fontWeight: 700,
          fontSize: '10pt',
          textTransform: 'uppercase',
          lineHeight: 1.15,
          marginTop: '0.5mm',
        }}
      >
        {item.item_name}
      </div>

      {/* Indication */}
      {settings.show_indication && item.indication && (
        <div
          style={{
            fontSize: '7pt',
            fontStyle: 'italic',
            lineHeight: 1.2,
            marginTop: '0.3mm',
          }}
        >
          For: {item.indication}
        </div>
      )}

      {/* Instructions — mandatory, bold, separated by horizontal rule */}
      {dosageBits.length > 0 && (
        <>
          <div
            style={{
              fontWeight: 700,
              fontSize: '8.5pt',
              textAlign: 'center',
              lineHeight: 1.2,
              marginTop: '1mm',
            }}
          >
            {dosageBits.join(' | ')}
          </div>
          <hr
            style={{
              border: 0,
              borderTop: '0.4mm solid #000',
              margin: '0.8mm 0',
            }}
          />
        </>
      )}

      {/* Precaution */}
      {settings.show_precaution && item.precaution && (
        <div
          style={{
            fontSize: '7pt',
            fontStyle: 'italic',
            lineHeight: 1.2,
          }}
        >
          ⚠ {item.precaution}
        </div>
      )}

      {/* Duration */}
      {settings.show_duration && item.duration && (
        <div style={{ fontSize: '7pt', lineHeight: 1.2 }}>
          Duration: {item.duration}
        </div>
      )}

      {/* Footer row — QTY / Date / EXP */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '7pt',
          marginTop: '1mm',
          gap: '1mm',
        }}
      >
        {settings.show_quantity ? (
          <span>QTY: {item.quantity ?? 1}</span>
        ) : (
          <span />
        )}
        {settings.show_date ? <span>{today}</span> : <span />}
        {settings.show_expiry_date ? (
          <span>EXP: {expiryDate}</span>
        ) : (
          <span />
        )}
      </div>

      {/* Fixed bottom strip — regulatory, always shown */}
      <div
        style={{
          position: 'absolute',
          bottom: '1mm',
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: '6pt',
          fontStyle: 'italic',
          color: '#000',
        }}
      >
        Ubat Terkawal / Controlled Medicine
      </div>
    </div>
  );
}
