export interface ParsedLegacyItem {
  name: string;
  amount: number;
  quantity: 1;
  sourceLine: number;
}

export interface YezzaTransaction {
  sourceVisitId: string;
  billNumber: string;
  totalAmount: string | number;
  paidAmount: string | number;
  method: string;
  channel: string;
  status: string;
}

export interface LegacyPayment {
  sourceVisitId: string;
  sourceBillId: string;
  amount: number;
  paymentMethod: "cash" | "card" | "bank_transfer" | "e_wallet" | "panel" | "other";
  paymentType: "self_pay";
  notes: string;
}

export interface TransactionReconciliation {
  uniqueBills: number;
  sourceTotal: number;
  paidTotal: number;
}

export const YEZZA_EXPECTED_RECONCILIATION = {
  uniqueBills: 67_442,
  sourceTotal: 5_684_929.22,
  paidTotal: 1_099_076.0,
} as const;

function parseMoney(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = value.trim().replace(/^RM\s*/i, "").replace(/,/g, "");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * Parses only source rows with an explicit final `: amount` portion. Historical
 * Yezza exports have no reliable quantity field, so every preserved row is one.
 */
export function parseServiceLines(serviceText: string): ParsedLegacyItem[] {
  return serviceText.split(/\r?\n/).flatMap((source, index) => {
    const separator = source.lastIndexOf(":");
    if (separator <= 0) return [];

    const name = source.slice(0, separator).trim();
    const amount = parseMoney(source.slice(separator + 1));
    if (!name || amount === null || amount < 0) return [];

    return [{ name, amount, quantity: 1, sourceLine: index + 1 }];
  });
}

function sourceText(value: string): string {
  return value.trim() || "(blank)";
}

function paymentMethod(method: string): LegacyPayment["paymentMethod"] {
  const normalized = method.trim().toLowerCase();
  if (/[,/;+&]/.test(normalized)) return "other";
  if (normalized === "cash") return "cash";
  if (normalized === "card" || normalized === "credit card" || normalized === "debit card") return "card";
  if (normalized === "bank transfer" || normalized === "transfer" || normalized === "duitnow") return "bank_transfer";
  if (normalized === "e-wallet" || normalized === "ewallet" || normalized === "touch n go") return "e_wallet";
  if (normalized.includes("panel") || normalized === "pmcare") return "panel";
  return "other";
}

/**
 * A Yezza row records one paid amount, even when its method is composite. Keep
 * one payment rather than fabricating payment splits, and retain raw metadata.
 */
export function mapLegacyPayment(row: YezzaTransaction): LegacyPayment | null {
  const amount = parseMoney(row.paidAmount);
  if (amount === null || amount <= 0) return null;

  return {
    sourceVisitId: row.sourceVisitId,
    sourceBillId: row.billNumber,
    amount,
    paymentMethod: paymentMethod(row.method),
    paymentType: "self_pay",
    notes: [
      "Yezza legacy payment",
      `source_bill_id=${sourceText(row.billNumber)}`,
      `source_visit_id=${sourceText(row.sourceVisitId)}`,
      `method=${sourceText(row.method)}`,
      `channel=${sourceText(row.channel)}`,
      `status=${sourceText(row.status)}`,
    ].join("; "),
  };
}

/** This is the approved source tuple used to collapse the overlapping exports. */
export function transactionFingerprint(row: YezzaTransaction): string {
  return [row.sourceVisitId, row.billNumber, row.totalAmount, row.paidAmount, row.method, row.channel]
    .map((value) => String(value).trim())
    .join("\u001f");
}

export function deduplicateTransactions(rows: readonly YezzaTransaction[]): YezzaTransaction[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const fingerprint = transactionFingerprint(row);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

/** Reconciliation reports source amounts only; no amount is inferred or adjusted. */
export function reconcileTransactions(rows: readonly YezzaTransaction[]): TransactionReconciliation {
  return rows.reduce<TransactionReconciliation>((totals, row) => ({
    uniqueBills: totals.uniqueBills + 1,
    sourceTotal: totals.sourceTotal + (parseMoney(row.totalAmount) ?? 0),
    paidTotal: totals.paidTotal + (parseMoney(row.paidAmount) ?? 0),
  }), { uniqueBills: 0, sourceTotal: 0, paidTotal: 0 });
}

export function matchesExpectedYezzaReconciliation(totals: TransactionReconciliation): boolean {
  return totals.uniqueBills === YEZZA_EXPECTED_RECONCILIATION.uniqueBills
    && Math.abs(totals.sourceTotal - YEZZA_EXPECTED_RECONCILIATION.sourceTotal) < 0.005
    && Math.abs(totals.paidTotal - YEZZA_EXPECTED_RECONCILIATION.paidTotal) < 0.005;
}
