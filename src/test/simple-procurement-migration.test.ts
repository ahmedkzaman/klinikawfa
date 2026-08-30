import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationName = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
  .filter((name) => name.endsWith('_simple_procurement_dashboard.sql'))
  .sort()
  .at(-1);

if (!migrationName) throw new Error('simple procurement migration not found');
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations', migrationName),
  'utf8',
);

describe('simple procurement dashboard migration', () => {
  it('adds budgets, external order metadata, attachments, and the four-stage workflow', () => {
    expect(sql).toMatch(/create table public\.procurement_monthly_budgets/i);
    expect(sql).toMatch(/create table public\.procurement_attachments/i);
    expect(sql).toContain("'Awaiting approval'");
    expect(sql).toContain("'Ordered'");
    expect(sql).toMatch(/order_channel[\s\S]*supplier_reference/i);
    expect(sql).toContain("'procurement-documents'");
  });

  it('enforces permission and Data API boundaries', () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toContain("has_clinic_permission('procurement.approve'");
    expect(sql).toMatch(
      /grant select, insert, update, delete on public\.procurement_monthly_budgets to authenticated/i,
    );
    expect(sql).not.toMatch(/to anon/i);
  });

  it('keeps documents private and blocks direct status bypass', () => {
    expect(sql).toMatch(/insert into storage\.buckets[\s\S]*false/i);
    expect(sql).toMatch(/storage\.objects[\s\S]*bucket_id = 'procurement-documents'/i);
    expect(sql).toMatch(/guard_purchase_order_status/i);
    expect(sql).toMatch(/current_setting\('app\.procurement_transition'/i);
  });
});
