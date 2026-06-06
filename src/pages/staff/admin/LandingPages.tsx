import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";
import { Plus, Edit, Trash2, ExternalLink, Upload, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
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

const MEDIA_BUCKET = "clinic-assets";
const MEDIA_PREFIX = "landing-pages";

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
  description: z.string().min(1, "Description is required").max(20000),
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

const sanitizeName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-");

export default function LandingPages() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ClinicService | null>(null);
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [uploadingField, setUploadingField] = useState<
    "hero_image_url" | "promo_video_url" | null
  >(null);
  const [isInlineUploading, setIsInlineUploading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
  });

  const { fields, append, remove } = useFieldArray({
    name: "services_list",
    control: form.control,
  });

  const watched = form.watch();

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

  const handleFileUpload = async (
    field: "hero_image_url" | "promo_video_url",
    file: File,
  ) => {
    setUploadingField(field);
    try {
      const fileName = `${MEDIA_PREFIX}/${Date.now()}-${sanitizeName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(fileName, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(fileName);
      form.setValue(field, data.publicUrl, { shouldDirty: true, shouldValidate: true });
      toast.success("File uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploadingField(null);
    }
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

  const isUploading = uploadingField !== null;

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
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecord ? "Edit Landing Page" : "Create Landing Page"}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <FormLabel>Description / Page Content</FormLabel>
                      <FormControl>
                        <RichTextEditor
                          value={field.value || ""}
                          onChange={field.onChange}
                          onUploadStateChange={setIsInlineUploading}
                          placeholder="Write your page content. Use the toolbar to add images, videos, headings, and lists."
                        />
                      </FormControl>
                      <FormDescription>
                        Click the image or video icon in the toolbar to upload media inline.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hero_image_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hero Image</FormLabel>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <FormControl>
                          <Input
                            placeholder="https://... or upload below"
                            type="url"
                            {...field}
                          />
                        </FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            id="hero-upload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileUpload("hero_image_url", f);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            asChild
                            disabled={isUploading}
                          >
                            <label htmlFor="hero-upload" className="cursor-pointer">
                              {uploadingField === "hero_image_url" ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="mr-2 h-4 w-4" />
                                  Upload
                                </>
                              )}
                            </label>
                          </Button>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="promo_video_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Promo Video</FormLabel>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <FormControl>
                          <Input
                            placeholder="https://... or upload below"
                            type="url"
                            {...field}
                          />
                        </FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            id="video-upload"
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileUpload("promo_video_url", f);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            asChild
                            disabled={isUploading}
                          >
                            <label htmlFor="video-upload" className="cursor-pointer">
                              {uploadingField === "promo_video_url" ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="mr-2 h-4 w-4" />
                                  Upload
                                </>
                              )}
                            </label>
                          </Button>
                        </div>
                      </div>
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

              <Separator />

              {/* LIVE PREVIEW */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Live Preview</h3>
                  <span className="text-xs text-muted-foreground">
                    Mirrors the public /services/{watched.slug || "..."} page
                  </span>
                </div>
                <div className="rounded-xl border bg-slate-50 overflow-hidden">
                  {/* Hero */}
                  <div className="relative bg-gradient-to-br from-[#261d84] to-[#1a1462] text-white p-8 sm:p-10">
                    {watched.hero_image_url && (
                      <img
                        src={watched.hero_image_url}
                        alt={watched.title || "Hero"}
                        className="absolute inset-0 w-full h-full object-cover opacity-30"
                      />
                    )}
                    <div className="relative max-w-2xl">
                      <h1 className="text-2xl sm:text-3xl font-bold mb-3 leading-tight">
                        {watched.title || "Your Landing Page Title"}
                      </h1>
                      <div
                        className="service-rich-content prose prose-invert max-w-none text-sm sm:text-base text-white/90 mb-5"
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(
                            watched.description ||
                              "<p>Your description will appear here.</p>",
                            {
                              ADD_TAGS: ["video", "source", "iframe"],
                              ADD_ATTR: [
                                "controls",
                                "allow",
                                "allowfullscreen",
                                "frameborder",
                                "target",
                              ],
                            },
                          ),
                        }}
                      />
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg bg-[#c2272c] hover:bg-[#a82026] text-white text-sm font-semibold px-5 py-2.5"
                      >
                        {watched.call_to_action || "Call to Action"}
                      </button>
                    </div>
                  </div>

                  {/* Services list */}
                  <div className="p-6 sm:p-8 bg-white">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">
                      What's Included
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {watched.services_list
                        ?.filter((s) => s.value?.trim())
                        .map((s, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-sm text-slate-700"
                          >
                            <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                            <span>{s.value}</span>
                          </div>
                        )) || (
                        <p className="text-sm text-muted-foreground">
                          No services listed yet.
                        </p>
                      )}
                    </div>

                    {watched.promo_video_url && (
                      <div className="mt-6">
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">
                          Promo Video
                        </h3>
                        <video
                          src={watched.promo_video_url}
                          controls
                          className="w-full max-w-md rounded-lg border"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saveMutation.isPending || isUploading || isInlineUploading}
                >
                  {saveMutation.isPending
                    ? "Saving..."
                    : isUploading || isInlineUploading
                    ? "Uploading…"
                    : "Save Landing Page"}
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
