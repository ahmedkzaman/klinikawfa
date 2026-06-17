import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useClinicSettings } from '@/hooks/clinic/useClinicSettings';
import { bento, bentoHeader, pageInner, pageShell } from '@/lib/clinic/bentoTokens';

/**
 * Clinic Profile — single source of truth for the clinic's name, address,
 * phone, and email. Every printed artefact (drug labels, MC/letters,
 * invoices, POs, letterhead) reads from this record via
 * `useClinicSettings()`. Edit it here once, it propagates everywhere.
 */
export default function ClinicProfile() {
  const { settings, isLoading, update } = useClinicSettings();

  const [form, setForm] = useState({
    clinic_name: settings.clinic_name,
    address_line_1: settings.address_line_1,
    address_line_2: settings.address_line_2,
    phone: settings.phone,
    email: settings.email,
  });

  useEffect(() => {
    setForm({
      clinic_name: settings.clinic_name,
      address_line_1: settings.address_line_1,
      address_line_2: settings.address_line_2,
      phone: settings.phone,
      email: settings.email,
    });
  }, [settings.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    form.clinic_name !== settings.clinic_name ||
    form.address_line_1 !== settings.address_line_1 ||
    form.address_line_2 !== settings.address_line_2 ||
    form.phone !== settings.phone ||
    form.email !== settings.email;

  const onSave = async () => {
    try {
      await update.mutateAsync(form);
      toast.success('Clinic profile saved.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const addressFull = [form.address_line_1, form.address_line_2]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 -ml-2"
          >
            <Link to="/clinic/settings" aria-label="Back to Settings">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Clinic Profile
          </h1>
          <p className="text-sm text-slate-500">
            The clinic name, address, phone and email saved here are used as the
            default on every printed document and label — drug labels, medical
            certificates, referral letters, invoices and purchase orders.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT — Form */}
          <Card className={bento}>
            <CardContent className="p-6 space-y-5">
              <h3 className={bentoHeader}>Identity</h3>

              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="clinic_name">Clinic Name</Label>
                  <Input
                    id="clinic_name"
                    value={form.clinic_name}
                    onChange={(e) =>
                      setForm({ ...form, clinic_name: e.target.value })
                    }
                    placeholder="Klinik Awfa"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="addr1">Address Line 1</Label>
                  <Input
                    id="addr1"
                    value={form.address_line_1}
                    onChange={(e) =>
                      setForm({ ...form, address_line_1: e.target.value })
                    }
                    placeholder="B2 & B4, Jalan ..."
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="addr2">Address Line 2</Label>
                  <Input
                    id="addr2"
                    value={form.address_line_2}
                    onChange={(e) =>
                      setForm({ ...form, address_line_2: e.target.value })
                    }
                    placeholder="25200 Kuantan, Pahang"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      placeholder="+60 18-252 3531"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      placeholder="hello@klinikawfa.com"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  onClick={onSave}
                  disabled={!dirty || update.isPending || isLoading}
                >
                  {update.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT — Live preview */}
          <div className="lg:sticky lg:top-4 self-start">
            <Card className={bento}>
              <CardContent className="p-6">
                <h3 className={bentoHeader}>Drug Label Header Preview</h3>
                <div className="mx-auto w-full max-w-[360px]">
                  <div
                    className="bg-white rounded-xl border shadow-sm p-4 text-slate-900"
                    style={{ fontFamily: 'ui-sans-serif, system-ui' }}
                  >
                    <div className="text-center">
                      <div className="font-bold text-[13px] uppercase tracking-wide">
                        {form.clinic_name || 'Clinic Name'}
                      </div>
                      {form.phone && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Tel: {form.phone}
                        </div>
                      )}
                      {addressFull && (
                        <div className="text-[10px] text-slate-500 leading-snug mt-0.5">
                          {addressFull}
                        </div>
                      )}
                      {form.email && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {form.email}
                        </div>
                      )}
                    </div>
                    <div className="border-t border-slate-200 my-3" />
                    <div className="text-center text-[10px] text-slate-400 italic">
                      Document body starts here…
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-400 text-center flex items-center justify-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  Used by drug labels, MC, referrals, invoices and POs.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
