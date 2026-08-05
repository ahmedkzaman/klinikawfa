import { describe, expect, it } from 'vitest';
import * as procedureRoi from '@/lib/clinic/procedureRoi';

const { isProcedureScoreboardRow } = procedureRoi;

describe('Procedure ROI classification', () => {
  it('includes manual billing rows matching a Procedure catalogue service', () => {
    expect(
      isProcedureScoreboardRow(
        { kind: 'other', item_name: ' SUTURE OPENING (STO) ' },
        new Map([['suture opening (sto)', 'Procedure']]),
      ),
    ).toBe(true);
  });

  it('does not classify manual general services as procedures', () => {
    expect(
      isProcedureScoreboardRow(
        { kind: 'other', item_name: 'Special Procedure by Dr.Ahmed' },
        new Map([['special procedure by dr.ahmed', 'General Service']]),
      ),
    ).toBe(false);
  });

  it('revalues a performed procedure using the current service COGS', () => {
    const resolveCurrentProcedureCogs = (
      procedureRoi as typeof procedureRoi & {
        resolveCurrentProcedureCogs?: (input: {
          quantity: number;
          recordedUnitCost: number;
          currentServiceCost: number;
        }) => number;
      }
    ).resolveCurrentProcedureCogs;

    const result = resolveCurrentProcedureCogs?.({
      quantity: 2,
      recordedUnitCost: 0,
      currentServiceCost: 21,
    });

    expect(result).toBe(42);
  });

  it('keeps the recorded COGS when the current service has no cost configured', () => {
    expect(
      procedureRoi.resolveCurrentProcedureCogs({
        quantity: 3,
        recordedUnitCost: 7,
        currentServiceCost: null,
      }),
    ).toBe(21);
  });
});
