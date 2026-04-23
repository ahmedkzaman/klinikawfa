import { supabase } from '@/integrations/supabase/client';
import type { PostgrestError } from '@supabase/supabase-js';

/**
 * The four clinic tables that are soft-deletable. Hard DELETE on these tables
 * is blocked at the database layer by RLS (see Migration 3 — `_soft_delete.sql`).
 *
 * To void a row, you MUST use {@link softDelete} — it stamps `deleted_at` and
 * `deleted_by` so the row is hidden from active-row policies but remains visible
 * to `special_admin` for audit via {@link fetchVoided}.
 */
export type SoftDeletableTable =
  | 'consultations'
  | 'consultation_items'
  | 'payments'
  | 'queue_entries';

export class NoSessionError extends Error {
  constructor() {
    super('No authenticated session — cannot perform soft-delete.');
    this.name = 'NoSessionError';
  }
}

interface SoftDeleteResult<T = unknown> {
  data: T | null;
  error: PostgrestError | NoSessionError | null;
}

/**
 * Soft-delete a row in one of the four clinic tables.
 *
 * This is the **only sanctioned way** to delete from these tables — DB-level
 * DELETE is blocked by RLS. Stamps `deleted_at = now()` and `deleted_by = user.id`.
 *
 * @example
 * const { error } = await softDelete('consultations', consultationId);
 * if (error) toast.error(error.message);
 */
export async function softDelete(
  table: SoftDeletableTable,
  id: string,
): Promise<SoftDeleteResult> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { data: null, error: new NoSessionError() };
  }

  const { data, error } = await supabase
    .from(table)
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userData.user.id,
    })
    .eq('id', id)
    .select()
    .maybeSingle();

  return { data, error };
}

/**
 * Fetch soft-deleted (voided) rows from one of the four clinic tables.
 *
 * RLS gates this query — non-`special_admin` callers receive an empty array
 * regardless. No client-side role check is needed; the database is the source
 * of truth.
 */
export async function fetchVoided(table: SoftDeletableTable) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  return { data: data ?? [], error };
}
