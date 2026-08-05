import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260805080738_allow_noop_document_fee_bill_corrections.sql',
);

describe('completed bill corrections with document fees', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('allows a protected document-fee row through only when the update is a true no-op', () => {
    const guard = sql.match(
      /create or replace function public\.guard_consultation_item_source_document[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    expect(guard).toMatch(/if tg_op = 'update'[\s\S]*old\.source_document_id is not null/i);
    for (const field of [
      'id',
      'consultation_id',
      'quantity',
      'price',
      'deleted_at',
      'deleted_by',
      'dispensed_qty',
      'source_document_id',
      'source_document_type',
    ]) {
      expect(guard).toMatch(
        new RegExp(`new\\.${field} is not distinct from old\\.${field}`, 'i'),
      );
    }
    expect(guard).not.toMatch(/new is not distinct from old/i);
    expect(guard).toMatch(/return new/i);
    expect(guard).toMatch(/DOCUMENT_FEE_ITEM_IMMUTABLE/i);
    expect(guard).toMatch(/consultation_document_fee_guard/i);
  });

  it('keeps all material document-fee fields immutable after the no-op exception', () => {
    const guard = sql.match(
      /create or replace function public\.guard_consultation_item_source_document[\s\S]*?\$function\$;/i,
    )?.[0] ?? '';

    for (const field of [
      'consultation_id',
      'item_name',
      'quantity',
      'price',
      'unit_cost',
      'item_id',
      'service_id',
      'package_id',
      'billing_adjustment_kind',
      'clinic_charge_type_id',
      'source_document_id',
      'source_document_type',
    ]) {
      expect(guard).toMatch(
        new RegExp(`old\\.${field} is distinct from\\s+new\\.${field}`, 'i'),
      );
    }
  });
});
