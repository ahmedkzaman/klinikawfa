import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationName = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
  .filter((name) => name.endsWith('_tighten_saved_rosters_to_admin.sql'))
  .sort()
  .at(-1);

if (!migrationName) throw new Error('saved_rosters tightening migration not found');
const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations', migrationName),
  'utf8',
);

describe('saved_rosters admin-only tightening migration', () => {
  it('replaces the broad staff-or-admin write policies with admin-only ones', () => {
    expect(sql).toMatch(/drop policy if exists "Staff\/Admin can insert saved rosters"/i);
    expect(sql).toMatch(/drop policy if exists "Staff\/Admin can update saved rosters"/i);
    expect(sql).toMatch(/drop policy if exists "Staff\/Admin can delete saved rosters"/i);
    expect(sql).toMatch(/create policy "[^"]+"\s+on public\.saved_rosters for insert/i);
    expect(sql).toMatch(/create policy "[^"]+"\s+on public\.saved_rosters for update/i);
    expect(sql).toMatch(/create policy "[^"]+"\s+on public\.saved_rosters for delete/i);
    expect(sql).toMatch(/is_admin\(\(select auth\.uid\(\)\)\)/i);
  });

  it('keeps the existing read policy untouched', () => {
    expect(sql).not.toMatch(/drop policy[^"]*"Staff\/Admin can view saved rosters"/i);
  });
});
