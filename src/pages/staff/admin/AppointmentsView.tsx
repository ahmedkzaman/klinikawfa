import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, RefreshCw, CheckCircle2, XCircle, BadgeCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string;
  patient_name: string;
  patient_phone: string;
  patient_ic: string | null;
  appointment_date: string;
  appointment_time: string;
  service: string;
  status: string;
  clinic_services: { title: string } | null;
};

const statusVariant: Record<string, string> = {
  pending_payment: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-slate-200 text-slate-700",
  cancelled: "bg-rose-100 text-rose-800",
  checked_in: "bg-blue-100 text-blue-800",
};

export default function AppointmentsView() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"upcoming" | "pending">("upcoming");

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, patient_name, patient_phone, patient_ic, appointment_date, appointment_time, service, status, clinic_services:service_slug(title)",
        )
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const mutate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase
        .from("appointments")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-appointments"] });
      toast({ title: "Updated" });
    },
    onError: (err: any) =>
      toast({
        title: "Action failed",
        description: err?.message ?? "",
        variant: "destructive",
      }),
  });

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const { upcoming, pending } = useMemo(() => {
    return {
      upcoming: rows.filter(
        (r) => r.status === "confirmed" && r.appointment_date >= todayIso,
      ),
      pending: rows.filter((r) => r.status === "pending_payment"),
    };
  }, [rows, todayIso]);

  const renderTable = (data: Row[], variant: "upcoming" | "pending") => (
    <div className="rounded-lg border bg-white overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                No appointments here.
              </TableCell>
            </TableRow>
          ) : (
            data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">
                  {format(new Date(r.appointment_date), "EEE, d MMM yyyy")}
                </TableCell>
                <TableCell>{r.appointment_time?.slice(0, 5)}</TableCell>
                <TableCell className="font-medium">{r.patient_name}</TableCell>
                <TableCell>{r.clinic_services?.title ?? r.service}</TableCell>
                <TableCell className="font-mono text-xs">{r.patient_phone}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={statusVariant[r.status] ?? ""}
                  >
                    {r.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {isAdmin && (
                    <div className="inline-flex gap-2">
                      {variant === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutate.mutate({
                              id: r.id,
                              patch: {
                                status: "confirmed",
                                payment_reference: "COUNTER-CASH",
                              },
                            })
                          }
                        >
                          <BadgeCheck className="h-4 w-4" /> Force Confirm
                        </Button>
                      )}
                      {variant === "upcoming" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutate.mutate({
                              id: r.id,
                              patch: { status: "completed" },
                            })
                          }
                        >
                          <CheckCircle2 className="h-4 w-4" /> Complete
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive">
                            <XCircle className="h-4 w-4" /> Cancel
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The patient slot for {r.patient_name} on{" "}
                              {format(new Date(r.appointment_date), "PPP")} at{" "}
                              {r.appointment_time?.slice(0, 5)} will be released.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                mutate.mutate({
                                  id: r.id,
                                  patch: { status: "cancelled" },
                                })
                              }
                            >
                              Cancel booking
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments</h1>
          <p className="text-sm text-slate-500">
            Sync of all public bookings into the clinic schedule.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming (Confirmed) · {upcoming.length}
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending Payment · {pending.length}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-4">
          {renderTable(upcoming, "upcoming")}
        </TabsContent>
        <TabsContent value="pending" className="mt-4">
          {renderTable(pending, "pending")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
