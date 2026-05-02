import { useEffect, useRef, useState } from 'react';
import { Upload, Save, Loader2, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { pageInner, pageShell } from '@/lib/clinic/bentoTokens';
import { toast } from 'sonner';

export default function DocumentSettings() {
  const { settings, isLoading, update, uploadLogo } = useClinicSettings();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    clinic_name: settings.clinic_name,
    address_line_1: settings.address_line_1,
    address_line_2: settings.address_line_2,
    phone: settings.phone,
    email: settings.email,
    logo_url: settings.logo_url,
    logo_height_px: settings.logo_height_px,
    letterhead_text_px: settings.letterhead_text_px,
    content_margin_top: settings.content_margin_top,
  });

  // sync when settings load
  useEffect(() => {
    setForm({
      clinic_name: settings.clinic_name,
      address_line_1: settings.address_line_1,
      address_line_2: settings.address_line_2,
      phone: settings.phone,
      email: settings.email,
      logo_url: settings.logo_url,
      logo_height_px: settings.logo_height_px,
      letterhead_text_px: settings.letterhead_text_px,
      content_margin_top: settings.content_margin_top,
    });
  }, [settings.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPickFile = () => fileRef.current?.click();

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      toast.error('Logo must be PNG, JPG, or SVG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2 MB.');
      return;
    }
    try {
      const url = await uploadLogo.mutateAsync(file);
      setForm((f) => ({ ...f, logo_url: url }));
      toast.success('Logo uploaded.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removeLogo = async () => {
    setForm((f) => ({ ...f, logo_url: '' }));
    try {
      await update.mutateAsync({ logo_url: '' });
      toast.success('Logo removed.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onSave = async () => {
    try {
      await update.mutateAsync(form);
      toast.success('Settings saved.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Document & Print Settings
          </h1>
          <p className="text-sm text-slate-500">
            Configure the letterhead and content position used for Purchase Orders, Invoices, and other printed documents.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* LEFT — Controls */}
          <Card className="p-6 space-y-5">
            {/* Logo */}
            <div className="space-y-2">
              <Label>Clinic Logo</Label>
              <div
                onClick={onPickFile}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className="border-2 border-dashed border-slate-300 hover:border-primary/60 transition-colors rounded-lg p-4 cursor-pointer flex items-center gap-4"
              >
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Clinic logo"
                    className="h-16 w-16 object-contain bg-white rounded border"
                  />
                ) : (
                  <div className="h-16 w-16 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                    <Upload className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1 text-sm">
                  <div className="font-medium text-slate-900">
                    {uploadLogo.isPending ? 'Uploading…' : 'Click or drop to upload'}
                  </div>
                  <div className="text-xs text-slate-500">PNG, JPG or SVG · max 2 MB</div>
                </div>
                {form.logo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLogo();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <Separator />

            {/* Text fields */}
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="clinic_name">Clinic Name</Label>
                <Input
                  id="clinic_name"
                  value={form.clinic_name}
                  onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="addr1">Address Line 1</Label>
                <Input
                  id="addr1"
                  value={form.address_line_1}
                  onChange={(e) => setForm({ ...form, address_line_1: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="addr2">Address Line 2</Label>
                <Input
                  id="addr2"
                  value={form.address_line_2}
                  onChange={(e) => setForm({ ...form, address_line_2: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Logo size slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Logo Size</Label>
                <span className="text-sm font-mono text-slate-700">{form.logo_height_px}px</span>
              </div>
              <Slider
                min={24}
                max={240}
                step={2}
                value={[form.logo_height_px]}
                onValueChange={([v]) => setForm({ ...form, logo_height_px: v })}
              />
              <p className="text-xs text-slate-500">
                Height of the logo on printed letterhead. Width scales automatically.
              </p>
            </div>

            <Separator />

            {/* Letterhead text size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Letterhead Text Size</Label>
                <span className="text-sm font-mono text-slate-700">{form.letterhead_text_px}px</span>
              </div>
              <Slider
                min={8}
                max={32}
                step={1}
                value={[form.letterhead_text_px]}
                onValueChange={([v]) => setForm({ ...form, letterhead_text_px: v })}
              />
              <p className="text-xs text-slate-500">
                Base size for clinic name and address. Clinic name renders ~1.4× larger.
              </p>
            </div>

            <Separator />

            {/* Margin slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Content Starting Position</Label>
                <span className="text-sm font-mono text-slate-700">{form.content_margin_top}px</span>
              </div>
              <Slider
                min={50}
                max={300}
                step={2}
                value={[form.content_margin_top]}
                onValueChange={([v]) => setForm({ ...form, content_margin_top: v })}
              />
              <p className="text-xs text-slate-500">
                Distance between the letterhead and the first line of document content.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={onSave} disabled={update.isPending || isLoading}>
                {update.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save Settings
              </Button>
            </div>
          </Card>

          {/* RIGHT — Visualizer */}
          <div className="md:sticky md:top-4 self-start">
            <Card className="p-4 bg-slate-100">
              <div className="text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                A4 Preview
              </div>
              <div className="relative w-full aspect-[1/1.414] bg-white shadow-lg border rounded-md overflow-hidden">
                <div className="absolute inset-0 p-6 text-slate-900">
                  {/* Letterhead */}
                  <div className="flex items-start gap-3 pb-2 border-b border-slate-300">
                    {form.logo_url ? (
                      <img
                        src={form.logo_url}
                        alt="Logo"
                        style={{ height: `${form.logo_height_px}px` }}
                        className="w-auto object-contain"
                      />
                    ) : (
                      <div
                        style={{ height: `${form.logo_height_px}px`, width: `${form.logo_height_px}px` }}
                        className="rounded bg-slate-100 border border-dashed border-slate-300"
                      />
                    )}
                    <div style={{ fontSize: `${form.letterhead_text_px}px`, lineHeight: 1.25 }}>
                      <div className="font-bold" style={{ fontSize: `${Math.round(form.letterhead_text_px * 1.4)}px` }}>
                        {form.clinic_name || 'Clinic Name'}
                      </div>
                      <div className="text-slate-600">{form.address_line_1 || 'Address line 1'}</div>
                      <div className="text-slate-600">{form.address_line_2 || 'Address line 2'}</div>
                      <div className="text-slate-600">
                        {form.phone || 'Phone'} · {form.email || 'Email'}
                      </div>
                    </div>
                  </div>

                  {/* Content marker */}
                  <div style={{ marginTop: `${form.content_margin_top}px` }}>
                    <div className="border-2 border-dashed border-red-400 bg-red-50 text-red-500 flex items-center justify-center h-32 rounded text-xs font-medium px-3 text-center">
                      Document Content Will Start Here
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
