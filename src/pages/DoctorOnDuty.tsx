import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout';
import { SEOHead } from '@/components/seo';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { CLINIC_INFO } from '@/lib/constants';
import { Stethoscope, Clock, Phone, MessageCircle, Calendar as CalendarIcon, Sun, Sunset, Moon, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays } from 'date-fns';
import locumAvatar from '@/assets/locum-doctor-avatar.jpg';

type DutyRow = {
  shift: string;
  label: string;
  start_time: string;
  end_time: string;
  doctor_name: string | null;
};

type DoctorPhoto = { name_en: string | null; name_ms: string | null; photo_url: string | null };

const SHIFT_ICONS: Record<string, JSX.Element> = {
  S1: <Sun className="h-6 w-6" />,
  S2: <Sunset className="h-6 w-6" />,
  S3: <Moon className="h-6 w-6" />,
};

const SHIFT_LABELS: Record<string, { en: string; ms: string }> = {
  S1: { en: 'Morning Shift', ms: 'Syif Pagi' },
  S2: { en: 'Afternoon Shift', ms: 'Syif Petang' },
  S3: { en: 'Night Shift', ms: 'Syif Malam' },
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();

export default function DoctorOnDuty() {
  const { language } = useLanguage();
  const [date, setDate] = useState<Date>(new Date());
  const [rows, setRows] = useState<DutyRow[]>([]);
  const [photos, setPhotos] = useState<DoctorPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const dateStr = format(date, 'yyyy-MM-dd');
      const [dutyRes, photoRes] = await Promise.all([
        supabase.rpc('get_doctors_on_duty', { _date: dateStr }),
        supabase.from('team_members').select('name_en, name_ms, photo_url').eq('type', 'doctor'),
      ]);
      if (cancelled) return;
      if (dutyRes.error) {
        console.error('Failed to load doctors on duty', dutyRes.error);
        setRows([]);
      } else {
        setRows((dutyRes.data as DutyRow[]) || []);
      }
      setPhotos((photoRes.data as DoctorPhoto[]) || []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [date]);

  const photoFor = useMemo(() => {
    return (doctorName: string | null): string => {
      if (!doctorName) return locumAvatar;
      const target = normalize(doctorName);
      const match = photos.find(p => {
        const en = p.name_en ? normalize(p.name_en) : '';
        const ms = p.name_ms ? normalize(p.name_ms) : '';
        return (en && (target.includes(en) || en.includes(target))) ||
               (ms && (target.includes(ms) || ms.includes(target)));
      });
      return match?.photo_url || locumAvatar;
    };
  }, [photos]);



  const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const dateLabel = format(date, 'EEEE, dd MMMM yyyy');

  const title = language === 'ms' ? 'Doktor Bertugas | Klinik Awfa' : 'Doctor On Duty | Klinik Awfa';
  const desc = language === 'ms'
    ? 'Semak doktor yang bertugas di Klinik Awfa hari ini mengikut syif.'
    : 'Check which doctor is on duty at Klinik Awfa today by shift.';

  return (
    <MainLayout>
      <SEOHead title={title} description={desc} />

      <section className="relative bg-gradient-to-br from-[#261d84] via-[#2d2496] to-[#1a1560] text-white py-16 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-4">
            <Stethoscope className="h-4 w-4" />
            <span className="text-sm font-medium">
              {language === 'ms' ? 'Jadual Doktor' : 'Doctor Schedule'}
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-3">
            {language === 'ms' ? 'Doktor Bertugas' : 'Doctor On Duty'}
          </h1>
          <p className="text-white/80 max-w-2xl mx-auto">
            {language === 'ms'
              ? 'Lihat doktor yang bertugas mengikut syif untuk rancang lawatan anda.'
              : 'See which doctor is on duty by shift so you can plan your visit.'}
          </p>
        </div>
      </section>

      <section className="py-12 bg-slate-50 min-h-[60vh]">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Date selector */}
          <Card className="mb-6 border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <Button variant="outline" size="icon" onClick={() => setDate(d => addDays(d, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-[#261d84]">
                  <CalendarIcon className="h-5 w-5" />
                  <span className="font-semibold">{dateLabel}</span>
                </div>
                {isToday && (
                  <Badge className="mt-1 bg-[#c2272c] hover:bg-[#c2272c]">
                    {language === 'ms' ? 'Hari Ini' : 'Today'}
                  </Badge>
                )}
                {!isToday && (
                  <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-[#261d84]"
                    onClick={() => setDate(new Date())}>
                    {language === 'ms' ? 'Kembali ke hari ini' : 'Back to today'}
                  </Button>
                )}
              </div>
              <Button variant="outline" size="icon" onClick={() => setDate(d => addDays(d, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#261d84]" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {rows.map((r) => {
                const label = SHIFT_LABELS[r.shift]?.[language === 'ms' ? 'ms' : 'en'] || r.label;
                return (
                  <Card key={r.shift} className="border-0 shadow-md overflow-hidden">
                    <div className="bg-gradient-to-br from-[#261d84] to-[#3d33a8] text-white p-4 flex items-center justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-white/70">{r.shift}</div>
                        <div className="font-semibold">{label}</div>
                      </div>
                      <div className="text-white/90">{SHIFT_ICONS[r.shift]}</div>
                    </div>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 text-slate-500 text-sm mb-3">
                        <Clock className="h-4 w-4" />
                        <span>{r.start_time} – {r.end_time}</span>
                      </div>
                      {r.doctor_name ? (
                        <div>
                          <div className="text-xs text-slate-500 mb-1">
                            {language === 'ms' ? 'Doktor Bertugas' : 'On Duty'}
                          </div>
                          <div className="text-lg font-bold text-[#261d84]">
                            {r.doctor_name}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400 italic">
                          {language === 'ms' ? 'Tiada doktor dijadualkan' : 'No doctor scheduled'}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {rows.length === 0 && (
                <div className="md:col-span-3 text-center py-12 text-slate-500">
                  {language === 'ms'
                    ? 'Jadual untuk tarikh ini belum diterbitkan.'
                    : 'Schedule for this date has not been published yet.'}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500 text-center mt-6">
            {language === 'ms'
              ? 'Jadual tertakluk kepada perubahan tanpa notis terlebih dahulu.'
              : 'Schedule is subject to change without prior notice.'}
          </p>

          {/* Contact CTA */}
          <Card className="mt-8 border-0 shadow-md bg-gradient-to-br from-[#261d84] to-[#1a1560] text-white">
            <CardContent className="p-6 text-center">
              <h3 className="text-xl font-bold mb-2">
                {language === 'ms' ? 'Perlukan kepastian?' : 'Need to confirm?'}
              </h3>
              <p className="text-white/80 text-sm mb-4">
                {language === 'ms'
                  ? 'Hubungi kami untuk pengesahan jadual atau tempah temujanji.'
                  : 'Contact us to confirm the schedule or book an appointment.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild className="bg-white text-[#261d84] hover:bg-white/90">
                  <a href={`tel:${CLINIC_INFO.phone}`}>
                    <Phone className="h-4 w-4 mr-2" />
                    {CLINIC_INFO.phone}
                  </a>
                </Button>
                <Button asChild variant="outline" className="border-white text-white hover:bg-white/10">
                  <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    WhatsApp
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </MainLayout>
  );
}
