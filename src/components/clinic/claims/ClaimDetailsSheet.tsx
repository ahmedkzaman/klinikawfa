import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Download, Loader2, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  bento,
  bentoHeader,
  fieldLabel,
  primaryBtn,
  secondaryBtn,
  softInput,
} from '@/lib/clinic/bentoTokens';
import { supabase } from '@/integrations/supabase/client';

import {
  type PanelClaimRow,
  type PanelClaimStatus,
  useClaimTreatmentItems,
  useUpdatePanelClaim,
  getClaimDocSignedUrl,
} from '@/hooks/clinic/usePanelClaims';

const STATUSES: { value: PanelClaimStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'received', label: 'Received' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function formatRM(value: number): string {
  return `RM ${value.toFixed(2)}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ClaimDetailsSheetProps {
  claim: PanelClaimRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ClaimDetailsSheet({
  claim,
  open,
  onOpenChange,
}: ClaimDetailsSheetProps) {
  const ledger = useClaimTreatmentItems(claim?.queue_entry_id ?? null);
  const updateMut = useUpdatePanelClaim();

  // Form state — re-seeded whenever the sheet opens with a new claim
  const [status, setStatus] = useState<PanelClaimStatus>('pending');
  const [submittedDate, setSubmittedDate] = useState<string>('');
  const [approvedAmount, setApprovedAmount] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [receivedDate, setReceivedDate] = useState<string>('');
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [glDocUrl, setGlDocUrl] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [signedDownloadUrl, setSignedDownloadUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!claim) return;
    setStatus(claim.status);
    setSubmittedDate(claim.submitted_date ?? '');
    setApprovedAmount(
      claim.approved_amount !== null && claim.approved_amount !== undefined
        ? String(claim.approved_amount)
        : '',
    );
    setPaymentReference(claim.payment_reference ?? '');
    setReceivedDate(claim.received_date ?? '');
    setReceivedAmount(
      claim.received_amount !== null && claim.received_amount !== undefined
        ? String(claim.received_amount)
        : '',
    );
    setRemarks(claim.remarks ?? '');
    setGlDocUrl(claim.gl_document_url ?? null);
    setSignedDownloadUrl(null);
  }, [claim?.id, open]);

  // Refresh signed URL when we have a stored doc path
  useEffect(() => {
    let cancelled = false;
    if (!glDocUrl) {
      setSignedDownloadUrl(null);
      return;
    }
    getClaimDocSignedUrl(glDocUrl).then((url) => {
      if (!cancelled) setSignedDownloadUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [glDocUrl]);

  const billed = Number(claim?.amount ?? 0);
  const writeOff = useMemo(() => {
    const approved = Number(approvedAmount);
    if (!approvedAmount || Number.isNaN(approved)) return 0;
    return billed - approved;
  }, [billed, approvedAmount]);

  // Auto-stamp dates the moment the user picks the status, so the field
  // is visible / editable instead of empty.
  function handleStatusChange(next: PanelClaimStatus) {
    setStatus(next);
    if (next === 'submitted' && !submittedDate) setSubmittedDate(todayIso());
    if (next === 'received' && !receivedDate) setReceivedDate(todayIso());
    if (next === 'received' && !receivedAmount) {
      setReceivedAmount(approvedAmount || String(billed));
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !claim) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error('File too large (max 10 MB)');
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${claim.id}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from('panel-claim-docs')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      setGlDocUrl(path);
      toast.success('Document uploaded');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  function validate(): string | null {
    if (status === 'submitted' && !submittedDate) return 'Submitted date is required';
    if (status === 'approved' && !approvedAmount) return 'Approved amount is required';
    if (status === 'received') {
      if (!paymentReference.trim()) return 'Payment reference is required';
      if (!receivedDate) return 'Received date is required';
    }
    return null;
  }

  async function handleSave() {
    if (!claim) return;
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: claim.id,
        status,
        submitted_date: submittedDate || null,
        approved_amount: approvedAmount ? Number(approvedAmount) : null,
        payment_reference: paymentReference || null,
        received_date: receivedDate || null,
        received_amount: receivedAmount ? Number(receivedAmount) : null,
        remarks: remarks || null,
        gl_document_url: glDocUrl,
      });
      toast.success('Claim updated');
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update claim';
      toast.error(msg);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-5xl overflow-y-auto bg-slate-50 p-4 md:p-6"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-xl font-bold text-slate-900">
            Claim {claim?.claim_no ?? ''}
          </SheetTitle>
          <SheetDescription>
            Update workflow status, capture approval and payment evidence.
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* LEFT — Read-only ledger */}
          <div className={cn(bento, 'p-5 space-y-5')}>
            <section>
              <h3 className={bentoHeader}>Billing Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Patient" value={claim?.patients?.name ?? '—'} />
                <Field label="Reg No" value={claim?.patients?.reg_no ?? '—'} mono />
              </div>
            </section>

            <section>
              <h3 className={bentoHeader}>Invoice</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Claim No" value={claim?.claim_no ?? '—'} mono />
                <Field label="Panel" value={claim?.insurance_providers?.name ?? '—'} />
                <Field
                  label="Visit Date"
                  value={
                    ledger.data?.visit_date
                      ? safeDate(ledger.data.visit_date)
                      : claim?.claim_date
                        ? safeDate(claim.claim_date)
                        : '—'
                  }
                />
                <Field
                  label="Claim Date"
                  value={claim?.claim_date ? safeDate(claim.claim_date) : '—'}
                />
              </div>
            </section>

            <section>
              <h3 className={bentoHeader}>Treatment Items</h3>
              <div className="rounded-xl overflow-hidden border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-100">
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Item
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">
                        Rate
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">
                        Qty
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">
                        Total
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.isLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 4 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (ledger.data?.items.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-20 text-center text-slate-400 text-sm">
                          No itemised lines for this claim
                        </TableCell>
                      </TableRow>
                    ) : (
                      ledger.data!.items.map((item) => (
                        <TableRow key={item.id} className="border-b border-slate-100 last:border-0">
                          <TableCell className="text-slate-700">{item.item_name}</TableCell>
                          <TableCell className="text-right tabular-nums text-slate-600">
                            {formatRM(item.price)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-slate-600">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-slate-800">
                            {formatRM(item.total)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {(ledger.data?.items.length ?? 0) > 0 && (
                    <tfoot>
                      <tr className="border-t border-slate-100 bg-slate-50">
                        <td colSpan={3} className="px-4 py-3 text-right text-xs uppercase tracking-wider font-semibold text-slate-500">
                          Total Billed
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">
                          {formatRM(billed)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </Table>
              </div>
            </section>
          </div>

          {/* RIGHT — Workflow */}
          <div className={cn(bento, 'p-5 space-y-5')}>
            <section className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {claim?.insurance_providers?.name ?? 'Panel'}
              </div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {formatRM(billed)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Total billed amount</div>
            </section>

            <section className="space-y-2">
              <Label className={fieldLabel}>Status</Label>
              <Select value={status} onValueChange={(v) => handleStatusChange(v as PanelClaimStatus)}>
                <SelectTrigger className={cn(softInput, 'h-11')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            {/* Dynamic fields */}
            {status === 'submitted' && (
              <section className="space-y-2">
                <Label className={fieldLabel}>Submitted Date *</Label>
                <Input
                  type="date"
                  value={submittedDate}
                  onChange={(e) => setSubmittedDate(e.target.value)}
                  className={softInput}
                />
              </section>
            )}

            {status === 'approved' && (
              <section className="space-y-3">
                <div className="space-y-2">
                  <Label className={fieldLabel}>Approved Amount (RM) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={approvedAmount}
                    onChange={(e) => setApprovedAmount(e.target.value)}
                    className={softInput}
                    placeholder="0.00"
                  />
                </div>
                {approvedAmount && writeOff !== 0 && (
                  <div
                    className={cn(
                      'rounded-xl px-3 py-2 text-sm flex items-center justify-between',
                      writeOff > 0
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-emerald-50 text-emerald-800',
                    )}
                  >
                    <span className="font-medium">
                      {writeOff > 0 ? 'Write-off' : 'Over-approval'}
                    </span>
                    <span className="font-bold tabular-nums">
                      {formatRM(Math.abs(writeOff))}
                    </span>
                  </div>
                )}
              </section>
            )}

            {status === 'received' && (
              <section className="space-y-3">
                <div className="space-y-2">
                  <Label className={fieldLabel}>Payment Reference *</Label>
                  <Input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Cheque / EFT no."
                    className={softInput}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className={fieldLabel}>Received Date *</Label>
                    <Input
                      type="date"
                      value={receivedDate}
                      onChange={(e) => setReceivedDate(e.target.value)}
                      className={softInput}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className={fieldLabel}>Received Amount (RM)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={receivedAmount}
                      onChange={(e) => setReceivedAmount(e.target.value)}
                      className={softInput}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </section>
            )}

            <section className="space-y-2">
              <Label className={fieldLabel}>Remarks</Label>
              <Textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Notes for this status change…"
                className={softInput}
              />
            </section>

            <section className="space-y-2">
              <Label className={fieldLabel}>Guarantee Letter / Evidence</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  'w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50',
                  'hover:border-blue-400 hover:bg-blue-50/50 transition-colors',
                  'p-4 flex items-center justify-center gap-2 text-sm text-slate-600',
                  uploading && 'opacity-60 cursor-not-allowed',
                )}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>{uploading ? 'Uploading…' : 'Click to upload (PDF, JPG, PNG · max 10 MB)'}</span>
              </button>
              {glDocUrl && (
                <div className="rounded-xl bg-slate-50 px-3 py-2 flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <span className="truncate text-slate-700 flex-1">
                    {glDocUrl.split('/').pop()}
                  </span>
                  {signedDownloadUrl && (
                    <a
                      href={signedDownloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 text-xs font-medium"
                    >
                      <Download className="h-3 w-3" />
                      View
                    </a>
                  )}
                </div>
              )}
            </section>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="ghost"
                className={secondaryBtn}
                onClick={() => onOpenChange(false)}
                disabled={updateMut.isPending}
              >
                Cancel
              </Button>
              <Button
                className={primaryBtn}
                onClick={handleSave}
                disabled={updateMut.isPending}
              >
                {updateMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className={fieldLabel}>{label}</div>
      <div
        className={cn(
          'mt-1 text-sm text-slate-800 font-medium',
          mono && 'font-mono text-xs',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function safeDate(iso: string): string {
  try {
    return format(new Date(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}
