import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { QueueEntryWithJoins, QueueEntryRow } from "@/types/clinic";

const QUEUE_QUERY_KEY = ["clinic", "queue-entries"] as const;
const CONSULT_QUEUE_QUERY_KEY = ["clinic", "consultation-queue-entries"] as const;
const CANCELLED_TODAY_QUERY_KEY = ["clinic", "queue-entries", "cancelled-today"] as const;

/** Shared "Active" statuses — entries in any of these stay visible across day boundaries. */
export const ACTIVE_STATUSES = [
  "registered",
  "ready_for_doctor",
  "with_doctor",
  "sent_to_dispensary",
  "dispensing_payment",
  "on_hold",
] as const;

/**
 * Shared realtime sync for `queue_entries`.
 *
 * Consolidates what used to be three separate channel subscriptions (one per
 * consumer hook) into a single channel per mounted hook-call. A change event
 * invalidates ALL three query keys, so any page that uses any of these hooks
 * automatically keeps the others fresh too — at the cost of zero extra
 * subscriptions vs. the previous design.
 *
 * Cleanup is guaranteed via `supabase.removeChannel(channel)` on unmount.
 */
function useQueueEntriesRealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("clinic-queue-entries-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries" },
        () => {
          qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
          qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
          qc.invalidateQueries({ queryKey: CANCELLED_TODAY_QUERY_KEY });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

/**
 * Today's active queue entries for the main Queue Board.
 * Uses an "Allow-list" of statuses to prevent enum spelling errors.
 */
export function useQueueEntries() {
  const qc = useQueryClient();

  const query = useQuery<QueueEntryWithJoins[]>({
    queryKey: QUEUE_QUERY_KEY,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // Define exactly which statuses should appear on the board
      const activeStatuses = ACTIVE_STATUSES;

      const { data, error } = await supabase
        .from("queue_entries")
        .select(
          `
          *,
          patients ( name, phone ),
          doctors:assigned_doctor_id ( name ),
          insurance_providers ( id, name )
        `,
        )
        .is("deleted_at", null)
        .or(
          `created_at.gte.${startOfDay.toISOString()},clinic_status.in.(${activeStatuses.join(",")})`,
        )
        .order("is_urgent", { ascending: false })
        .order("created_at", { ascending: true })
        .order("queue_sequence", { ascending: true, nullsFirst: false });

      if (error) {
        console.error("Queue Query Error:", error);
        throw error;
      }
      return (data ?? []) as unknown as QueueEntryWithJoins[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("clinic-queue-entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, () => {
        qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

/**
 * Consultation workspace feed.
 * Includes today's entries and carry-overs from previous days.
 * Restored to fix production build errors.
 */
export function useConsultationQueueEntries() {
  const qc = useQueryClient();

  const query = useQuery<QueueEntryWithJoins[]>({
    queryKey: CONSULT_QUEUE_QUERY_KEY,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const activeStatuses = ACTIVE_STATUSES;

      const { data, error } = await supabase
        .from("queue_entries")
        .select(
          `
          *,
          patients ( * ),
          doctors:assigned_doctor_id ( id, name, avatar_url ),
          rooms:assigned_room_id ( id, label ),
          insurance_providers ( id, name )
        `,
        )
        .is("deleted_at", null)
        .or(`created_at.gte.${startOfDay.toISOString()},clinic_status.in.(${activeStatuses.join(",")})`)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as QueueEntryWithJoins[];
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("clinic-consultation-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, () => {
        qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

export function useUpdateQueueEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<QueueEntryRow>) => {
      const { data, error } = await supabase.from("queue_entries").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
    },
  });
}

export function useCallPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      called_by_doctor_id,
      room_id,
    }: {
      id: string;
      called_by_doctor_id: string;
      room_id?: string | null;
    }) => {
      const patch: Record<string, unknown> = {
        clinic_status: "with_doctor",
        called_at: new Date().toISOString(),
        called_by_doctor_id,
      };
      if (room_id) patch.assigned_room_id = room_id;
      const { error } = await supabase.from("queue_entries").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
    },
  });
}

export function useCallToDispensary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, room_id }: { id: string; room_id: string }) => {
      const { error } = await supabase
        .from("queue_entries")
        .update({
          called_at: new Date().toISOString(),
          assigned_room_id: room_id,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
    },
  });
}

export function useQueueEntry(id?: string) {
  return useQuery<QueueEntryWithJoins | null>({
    queryKey: ["clinic", "queue-entry", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("queue_entries")
        .select(
          `
          *,
          patients ( * ),
          doctors:assigned_doctor_id ( id, name, avatar_url ),
          rooms:assigned_room_id ( id, label ),
          insurance_providers ( id, name )
        `,
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as QueueEntryWithJoins | null;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Defensive Cancellation (LWBS / Absconded) — terminal status with audit trail.
// ─────────────────────────────────────────────────────────────────────────────

function malayTimestamp(): string {
  return new Date().toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    hour12: false,
  });
}

async function resolveStaffName(): Promise<{ userId: string | null; name: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, name: "Staff" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const name = profile?.full_name || profile?.email || user.email || "Staff";
  return { userId: user.id, name };
}

export function useCancelQueueEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      reason,
      existingNotes,
    }: {
      id: string;
      reason: string;
      existingNotes?: string | null;
    }) => {
      const { userId, name } = await resolveStaffName();
      const cancelLine = `\n\n[CANCELLED ${malayTimestamp()}] Reason: ${reason} — by ${name}`;

      const { error } = await supabase
        .from("queue_entries")
        .update({
          clinic_status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: userId,
          cancellation_reason: reason,
          visit_notes: (existingNotes ?? "") + cancelLine,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CANCELLED_TODAY_QUERY_KEY });
      toast.success("Visit terminated and documented.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to terminate visit";
      toast.error(msg);
    },
  });
}

export function useRestoreQueueEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      existingNotes,
    }: {
      id: string;
      existingNotes?: string | null;
    }) => {
      const { name } = await resolveStaffName();
      const restoreLine = `\n\n[RESTORED ${malayTimestamp()}] by ${name}`;

      const { error } = await supabase
        .from("queue_entries")
        .update({
          clinic_status: "registered",
          cancelled_at: null,
          cancelled_by: null,
          cancellation_reason: null,
          visit_notes: (existingNotes ?? "") + restoreLine,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CONSULT_QUEUE_QUERY_KEY });
      qc.invalidateQueries({ queryKey: CANCELLED_TODAY_QUERY_KEY });
      toast.success("Entry restored to Registered.");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to restore entry";
      toast.error(msg);
    },
  });
}

export function useCancelledTodayEntries() {
  const qc = useQueryClient();
  const query = useQuery<QueueEntryWithJoins[]>({
    queryKey: CANCELLED_TODAY_QUERY_KEY,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("queue_entries")
        .select(`*, patients ( name, phone )`)
        .eq("clinic_status", "cancelled")
        .gte("cancelled_at", startOfDay.toISOString())
        .order("cancelled_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as QueueEntryWithJoins[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("clinic-queue-cancelled-today")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, () => {
        qc.invalidateQueries({ queryKey: CANCELLED_TODAY_QUERY_KEY });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

export { QUEUE_QUERY_KEY, CONSULT_QUEUE_QUERY_KEY, CANCELLED_TODAY_QUERY_KEY };
