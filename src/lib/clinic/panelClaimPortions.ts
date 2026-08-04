import type { AppRole } from '@/contexts/AuthContext';

export type PanelClaimPortionStatus = 'unpaid' | 'partially_paid' | 'paid';

export interface PanelClaimPortionDraft { amount: string; remark: string }

export interface PanelClaimPortion {
  id: string;
  panel_claim_id: string;
  portion_no: number;
  amount: number;
  received_amount: number;
  status: PanelClaimPortionStatus;
  payment_reference: string | null;
  received_date: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

export type PanelClaimLifecycleStatus =
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'received'
  | 'cancelled';

const MANAGER_ROLES = new Set<AppRole>([
  'admin',
  'doctor_admin',
  'ops_staff',
  'operations',
  'purchaser',
]);

const WORKFLOW_MANAGER_ROLES = new Set<AppRole>([
  'admin',
  'special_admin',
  'doctor_admin',
  'ops_staff',
  'operations',
]);

export function parseMoneyInput(value: string): number | null {
  const cents = parseMoneyInputToCents(value);
  return cents === null ? null : cents / 100;
}

export function parseMoneyInputToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [ringgit, sen = ''] = normalized.split('.');
  const cents = Number(ringgit) * 100 + Number(sen.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function numberToCents(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && Math.abs(value - cents / 100) < 1e-9
    ? cents
    : null;
}

export function summarizePortions(portions: PanelClaimPortionDraft[], claimAmount: number) {
  const parsedCents = portions.map((portion) => parseMoneyInputToCents(portion.amount));
  const allocatedCents = parsedCents.reduce((sum, cents) => sum + (cents ?? 0), 0);
  const claimCents = numberToCents(claimAmount);
  const remainingCents = claimCents === null ? 0 : claimCents - allocatedCents;
  return {
    allocated: allocatedCents / 100,
    allocatedCents,
    remaining: remainingCents / 100,
    remainingCents,
    valid:
      portions.length >= 2
      && parsedCents.every((cents) => cents !== null)
      && claimCents !== null
      && allocatedCents === claimCents,
  };
}

export function isPayablePanelClaimStatus(
  status: PanelClaimLifecycleStatus | null | undefined,
): boolean {
  return status === 'pending' || status === 'submitted' || status === 'approved';
}

export function malaysiaTodayIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function canManagePanelClaimPortions(role: AppRole | null | undefined): boolean {
  return role != null && MANAGER_ROLES.has(role);
}

export function canManagePanelClaimWorkflow(role: AppRole | null | undefined): boolean {
  return role != null && WORKFLOW_MANAGER_ROLES.has(role);
}
