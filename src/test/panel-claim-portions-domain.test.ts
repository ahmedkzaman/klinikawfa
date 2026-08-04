import { describe, expect, it } from 'vitest';
import type { AppRole } from '@/contexts/AuthContext';
import {
  canManagePanelClaimWorkflow,
  canManagePanelClaimPortions,
  isPayablePanelClaimStatus,
  malaysiaTodayIso,
  parseMoneyInput,
  summarizePortions,
} from '@/lib/clinic/panelClaimPortions';

describe('panel claim portions', () => {
  it('accepts exact two-decimal custom portions', () => {
    expect(summarizePortions([
      { amount: '150.00', remark: 'First GL' },
      { amount: '250.00', remark: '' },
    ], 400)).toMatchObject({ allocated: 400, remaining: 0, valid: true });
  });

  it('rejects fewer than two portions', () => {
    expect(summarizePortions([
      { amount: '400.00', remark: 'Only GL' },
    ], 400)).toMatchObject({ allocated: 400, remaining: 0, valid: false });
  });

  it('rejects portions whose total does not match the claim', () => {
    expect(summarizePortions([
      { amount: '150.00', remark: 'First GL' },
      { amount: '200.00', remark: 'Second GL' },
    ], 400)).toMatchObject({ allocated: 350, remaining: 50, valid: false });
  });

  it('rejects a list containing an invalid portion', () => {
    expect(summarizePortions([
      { amount: '150.00', remark: 'First GL' },
      { amount: 'abc', remark: 'Invalid GL' },
    ], 150)).toMatchObject({ allocated: 150, remaining: 0, valid: false });
  });

  it('rejects a claim amount that is not cent-precise', () => {
    expect(summarizePortions([
      { amount: '150.00', remark: 'First GL' },
      { amount: '250.00', remark: 'Second GL' },
    ], 400.004)).toMatchObject({ allocated: 400, valid: false });
  });

  it('compares RM29.80 allocations in integer cents', () => {
    const calculatedClaimAmount = 9.9 + 19.9;

    expect(summarizePortions([
      { amount: '9.90', remark: 'First approval' },
      { amount: '19.90', remark: 'Second approval' },
    ], calculatedClaimAmount)).toMatchObject({
      allocated: 29.8,
      allocatedCents: 2980,
      remaining: 0,
      remainingCents: 0,
      valid: true,
    });
  });

  it('uses the Asia/Kuala_Lumpur calendar date for receipt defaults', () => {
    expect(malaysiaTodayIso(new Date('2026-08-04T16:30:00.000Z'))).toBe('2026-08-05');
  });

  it.each(['pending', 'submitted', 'approved'] as const)('treats %s claims as payable', (status) => {
    expect(isPayablePanelClaimStatus(status)).toBe(true);
  });

  it.each(['received', 'rejected', 'cancelled'] as const)('treats %s claims as non-payable', (status) => {
    expect(isPayablePanelClaimStatus(status)).toBe(false);
  });

  it.each(['0', '-1', '1.001', 'abc'])('rejects invalid money %s', (value) => {
    expect(parseMoneyInput(value)).toBeNull();
  });

  it.each(['admin', 'doctor_admin', 'ops_staff', 'operations', 'purchaser'] as const)(
    'allows %s to manage portions',
    (role) => expect(canManagePanelClaimPortions(role)).toBe(true),
  );

  it.each(['resident_doctor', 'locum', 'staff_nurse', 'guest'] as const)(
    'denies %s from managing portions',
    (role) => expect(canManagePanelClaimPortions(role)).toBe(false),
  );

  it.each([null, undefined])('denies empty roles', (role) => {
    expect(canManagePanelClaimPortions(role)).toBe(false);
  });

  it('denies an unknown role', () => {
    expect(canManagePanelClaimPortions('unknown' as AppRole)).toBe(false);
  });

  it('keeps purchaser access scoped to portion operations', () => {
    expect(canManagePanelClaimPortions('purchaser')).toBe(true);
    expect(canManagePanelClaimWorkflow('purchaser')).toBe(false);
    expect(canManagePanelClaimWorkflow('operations')).toBe(true);
  });
});
