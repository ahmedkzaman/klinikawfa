import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";
import { Plus, Edit, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card } from "@/components/ui/card";

interface ClinicService {
  id: string;
  slug: string;
  title: string;
  description: string;
  services_list: string[];
  call_to_action: string;
  hero_image_url: string | null;
  promo_video_url: string | null;
  updated_at: string;
}

const formSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "No spaces, lowercase & hyphens only")
    .max(80),
  title: z.string().min(1, "Title is required").max(120),
  description: z.string().min(1, "Description is required").max(500),
  call_to_action: z.string().min(1, "CTA is required").max(60),
  hero_image_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  promo_video_url: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  services_list: z
    .array(z.object({ value: z.string() }))
    .min(1, "At least one service is required"),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULTS: FormValues = {
  slug: "",
  title: "",
  description: "",
  call_to_action: "Book Appointment",
  hero_image_url: "",
  promo_video_url: "",
  services_list: [{ value: "" }],
};

export default function LandingPages() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ClinicService | null>(null);
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
  });

  const { fields, append, remove } = useFieldArray({
    name: "services_list",
    control: form.control,
  });

  const { data: services, isLoading } = useQuery({
    queryKey: ["clinic-services-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_services")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as ClinicService[];
    },
  });

  const handleCreate = () => {
    setEditingRecord(null);
    form.reset(DEFAULTS);
    setIsFormOpen(true);
  };

  const handleEdit = (record: ClinicService) => {
    setEditingRecord(record);
    form.reset({
      slug: record.slug,
      title: record.title,
      description: record.description,
      call_to_action: record.call_to_action || "Book Appointment",
      hero_image_url: record.hero_image_url || "",
      promo_video_url: record.promo_video_url || "",
      services_list: record.services_list?.length
        ? record.services_list.map((s) => ({ value: s }))
        : [{ value: "" }],
    });
    setIsFormOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        slug: values.slug,
        title: values.title,
        description: values.description,
        call_to_action: values.call_to_action,
        hero_image_url: values.hero_image_url || null,
        promo_video_url: values.promo_video_url || null,
        services_list: values.services_list
          .map((s) => s.value.trim())
          .filter(Boolean),
      };

      if (editingRecord) {
        const { error } = await supabase
          .from("clinic_services")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingRecord.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clinic_services").insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`Landing page ${editingRecord ? "updated" : "created"} successfully`);
      setIsFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["clinic-services-admin"] });
    },
    onError: (error: { code?: string; message?: string }) => {
      if (error?.code === "23505") {
        toast.error("A landing page with this slug already exists.");
      } else {
        toast.error(error?.message || "Failed to save landing page");
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinic_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Landing page deleted");
      setIsDeleteOpen(false);
      setDeleteRecordId(null);
      queryClient.invalidateQueries({ queryKey: ["clinic-services-admin"] });
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || "Failed to delete landing page");
    },
  });

  const onSubmit = (values: FormValues) => saveMutation.mutate(values);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Landing Pages</h1>
          <p className="text-sm text-slate-500">
            Manage dynamic marketing pages and services.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> Create New Landing Page
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Slug (URL)</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Loading pages...
                </TableCell>
              </TableRow>
            ) : !services || services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No landing pages found. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.title}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {service.slug}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {service.updated_at
                      ? formatDistanceToNow(new Date(service.updated_at), { addSuffix: true })
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild title="View public page">
                        <a
                          href={`/services/${service.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(service)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={() => {
                          setDeleteRecordId(service.id);
                          setIsDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* CREATE / EDIT */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? "Edit Landing Page" : "Create Landing Page"}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title (H1)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Home Care Service" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Slug</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="rawatan-ke-rumah"
                          {...field}
                          disabled={!!editingRecord}
                        />
                      </FormControl>
                      <FormDescription>
                        {editingRecord
                          ? "Slugs cannot be changed after creation to protect SEO links."
                          : "No spaces, lowercase only, e.g. rawatan-ke-rumah"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="call_to_action"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Call to Action Button</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description / Subtitle</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hero_image_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hero Image URL (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." type="url" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="promo_video_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Promo Video URL (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." type="url" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Dynamic services list */}
              <div className="space-y-3">
                <FormLabel>Services List (What's Included)</FormLabel>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`services_list.${index}.value`}
                      render={({ field: inputField }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder={`Item ${index + 1}`} {...inputField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground shrink-0"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ value: "" })}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Item
                </Button>
                {form.formState.errors.services_list?.message && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.services_list.message}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving..." : "Save Landing Page"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* DELETE */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the landing page. This action cannot be undone
              and will immediately result in a 404 for anyone trying to visit its URL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRecordId && deleteMutation.mutate(deleteRecordId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
