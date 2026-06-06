import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarIcon,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { MainLayout } from "@/components/layout";
import { SEOHead } from "@/components/seo";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

const phoneRegex = /^[0-9+\-\s]{8,15}$/;
const icRegex = /^[0-9]{12}$/;

const formSchema = z.object({
  patient_name: z.string().trim().min(2, "Name is too short").max(80),
  patient_phone: z
    .string()
    .trim()
    .regex(phoneRegex, "Enter a valid phone number"),
  patient_ic: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => icRegex.test(v), "IC must be 12 digits"),
  service_slug: z.string().min(1, "Please choose a service"),
  service_title: z.string().min(1),
  appointment_date: z.string().min(1, "Please pick a date"),
  appointment_time: z.string().min(1, "Please pick a time slot"),
  pdpa: z.literal(true, {
    errorMap: () => ({ message: "Consent is required to proceed" }),
  }),
});

type FormValues = z.infer<typeof formSchema>;

function generateTimeSlots() {
  const slots: string[] = [];
  for (let h = 9; h < 17; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h !== 16) slots.push(`${String(h).padStart(2, "0")}:30`);
    else slots.push("16:30");
  }
  return Array.from(new Set(slots));
}

const TIME_SLOTS = generateTimeSlots();

export default function AppointmentBooking() {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: {
      patient_name: "",
      patient_phone: "",
      patient_ic: "",
      service_slug: "",
      service_title: "",
      appointment_date: "",
      appointment_time: "",
      pdpa: undefined as unknown as true,
    },
  });

  const { register, handleSubmit, setValue, watch, trigger, formState } = form;
  const values = watch();

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ["clinic-services-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_services")
        .select("slug, title")
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
  });

  const bookMutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          patient_name: v.patient_name,
          patient_phone: v.patient_phone,
          patient_ic: v.patient_ic,
          service: v.service_title,
          service_slug: v.service_slug,
          appointment_date: v.appointment_date,
          appointment_time: v.appointment_time,
          status: "pending_payment",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setBookingId(data.id);
      setStep(4);
    },
    onError: (err: any) => {
      toast({
        title: "Booking failed",
        description: err?.message ?? "Please try again",
        variant: "destructive",
      });
    },
  });

  const next = async () => {
    let fields: (keyof FormValues)[] = [];
    if (step === 1) fields = ["patient_name", "patient_phone", "patient_ic"];
    if (step === 2) fields = ["service_slug", "appointment_date", "appointment_time"];
    const ok = await trigger(fields);
    if (ok) setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
  };

  const onSubmit = (v: FormValues) => bookMutation.mutate(v);

  return (
    <MainLayout>
      <SEOHead
        title="Book Appointment | Klinik Awfa"
        description="Reserve your appointment slot at Klinik Awfa. Simple, secure, and confirmed once your booking fee is received."
      />
      <section className="bg-slate-50 py-12 md:py-16">
        <div className="container max-w-2xl mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
              Book Your Appointment
            </h1>
            <p className="mt-2 text-slate-600">
              Reserve your slot in three quick steps.
            </p>
          </div>

          {step < 4 && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold",
                      step >= n
                        ? "bg-primary text-primary-foreground"
                        : "bg-slate-200 text-slate-500",
                    )}
                  >
                    {n}
                  </div>
                  {n < 3 && (
                    <div
                      className={cn(
                        "h-0.5 w-10",
                        step > n ? "bg-primary" : "bg-slate-200",
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <Card>
            {step === 1 && (
              <>
                <CardHeader>
                  <CardTitle>Patient Details</CardTitle>
                  <CardDescription>Who is this appointment for?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="patient_name">Full Name</Label>
                    <Input id="patient_name" {...register("patient_name")} />
                    {formState.errors.patient_name && (
                      <p className="text-sm text-destructive">
                        {formState.errors.patient_name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patient_phone">Phone Number</Label>
                    <Input
                      id="patient_phone"
                      placeholder="012-3456789"
                      {...register("patient_phone")}
                    />
                    {formState.errors.patient_phone && (
                      <p className="text-sm text-destructive">
                        {formState.errors.patient_phone.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patient_ic">IC Number (MyKad, 12 digits)</Label>
                    <Input
                      id="patient_ic"
                      placeholder="900101012345"
                      {...register("patient_ic")}
                    />
                    {formState.errors.patient_ic && (
                      <p className="text-sm text-destructive">
                        {formState.errors.patient_ic.message}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={next}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {step === 2 && (
              <>
                <CardHeader>
                  <CardTitle>Service &amp; Slot</CardTitle>
                  <CardDescription>Choose what you need and when.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Service</Label>
                    <Select
                      value={values.service_slug}
                      onValueChange={(slug) => {
                        const s = services.find((x) => x.slug === slug);
                        setValue("service_slug", slug, { shouldValidate: true });
                        setValue("service_title", s?.title ?? "", { shouldValidate: true });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={servicesLoading ? "Loading…" : "Select a service"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.slug} value={s.slug}>
                            {s.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formState.errors.service_slug && (
                      <p className="text-sm text-destructive">
                        {formState.errors.service_slug.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !values.appointment_date && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {values.appointment_date
                            ? format(new Date(values.appointment_date), "PPP")
                            : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={
                            values.appointment_date
                              ? new Date(values.appointment_date)
                              : undefined
                          }
                          onSelect={(d) =>
                            d &&
                            setValue("appointment_date", format(d, "yyyy-MM-dd"), {
                              shouldValidate: true,
                            })
                          }
                          disabled={(d) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            return d < today;
                          }}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    {formState.errors.appointment_date && (
                      <p className="text-sm text-destructive">
                        {formState.errors.appointment_date.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Time Slot</Label>
                    <Select
                      value={values.appointment_time}
                      onValueChange={(v) =>
                        setValue("appointment_time", v, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a 30-min slot" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formState.errors.appointment_time && (
                      <p className="text-sm text-destructive">
                        {formState.errors.appointment_time.message}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      <ChevronLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button onClick={next}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {step === 3 && (
              <>
                <CardHeader>
                  <CardTitle>Confirm &amp; Pay</CardTitle>
                  <CardDescription>
                    Review your details before payment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="rounded-lg border bg-slate-50 divide-y text-sm">
                    {[
                      ["Patient", values.patient_name],
                      ["Phone", values.patient_phone],
                      ["IC", values.patient_ic],
                      ["Service", values.service_title],
                      [
                        "Date",
                        values.appointment_date
                          ? format(new Date(values.appointment_date), "PPP")
                          : "",
                      ],
                      ["Time", values.appointment_time],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between px-4 py-2">
                        <dt className="text-slate-500">{k}</dt>
                        <dd className="font-medium text-slate-800">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <ShieldCheck className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-900">
                      A booking fee is required to confirm this slot. Your
                      appointment will be marked{" "}
                      <strong>Pending Payment</strong> until the fee is received.
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="pdpa"
                      checked={!!values.pdpa}
                      onCheckedChange={(c) =>
                        setValue("pdpa", c === true ? true : (undefined as any), {
                          shouldValidate: true,
                        })
                      }
                    />
                    <Label htmlFor="pdpa" className="text-sm font-normal leading-snug">
                      I consent to Klinik Awfa processing my personal data in
                      accordance with the PDPA 2010 for the purpose of this
                      appointment.
                    </Label>
                  </div>
                  {formState.errors.pdpa && (
                    <p className="text-sm text-destructive">
                      {formState.errors.pdpa.message as string}
                    </p>
                  )}

                  <div className="flex justify-between pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => setStep(2)}
                      disabled={bookMutation.isPending}
                    >
                      <ChevronLeft className="h-4 w-4" /> Back
                    </Button>
                    <Button
                      onClick={handleSubmit(onSubmit)}
                      disabled={bookMutation.isPending}
                    >
                      {bookMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                        </>
                      ) : (
                        "Proceed to Payment"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {step === 4 && (
              <CardContent className="py-12 text-center space-y-4">
                <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Booking received
                </h2>
                <p className="text-slate-600">
                  Redirecting to secure payment gateway…
                </p>
                {bookingId && (
                  <p className="text-xs text-slate-400 font-mono">
                    Ref: {bookingId.slice(0, 8).toUpperCase()}
                  </p>
                )}
                <div className="pt-4">
                  <Button asChild variant="outline">
                    <Link to="/">Return home</Link>
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </section>
    </MainLayout>
  );
}
