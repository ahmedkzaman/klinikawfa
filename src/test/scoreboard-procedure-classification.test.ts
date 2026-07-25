import { describe, expect, it } from 'vitest';
import { isProcedureScoreboardRow } from '@/lib/clinic/procedureRoi';

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
});
