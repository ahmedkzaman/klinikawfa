import { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout';
import { SEOHead } from '@/components/seo';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PublicPageHeader } from '@/components/public';
import { supabase } from '@/integrations/supabase/client';
import { CLINIC_INFO } from '@/lib/constants';
import { Clock, Phone, MessageCircle, Calendar as CalendarIcon, Sun, Sunset, Moon, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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

const STOPWORDS = new Set(['dr', 'doctor', 'mr', 'mrs', 'ms', 'bin', 'binti', 'bt', 'b']);
const tokenize = (s: string): string[] =>
  s.toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));

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
      if (/^locum\b/i.test(doctorName.trim())) return locumAvatar;
      const targetTokens = new Set(tokenize(doctorName));
      if (targetTokens.size === 0) return locumAvatar;
      const match = photos.find(p => {
        const tmTokens = [...tokenize(p.name_en || ''), ...tokenize(p.name_ms || '')];
        return tmTokens.some(t => targetTokens.has(t));
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

      <PublicPageHeader
        eyebrow={language === 'ms' ? 'Jadual Doktor' : 'Doctor Schedule'}
        title={language === 'ms' ? 'Doktor Bertugas' : 'Doctor On Duty'}
        description={language === 'ms'
          ? 'Lihat doktor yang bertugas mengikut syif untuk rancang lawatan anda.'
          : 'See which doctor is on duty by shift so you can plan your visit.'}
      />

      <section className="min-h-[60vh] bg-muted/30 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Date selector */}
          <Card className="mb-6 border-border bg-card shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                aria-label={language === 'ms' ? 'Hari sebelumnya' : 'Previous day'}
                onClick={() => setDate(d => addDays(d, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <CalendarIcon className="h-5 w-5" />
                  <span className="font-semibold">{dateLabel}</span>
                </div>
                {isToday && (
                  <Badge className="mt-1">
                    {language === 'ms' ? 'Hari Ini' : 'Today'}
                  </Badge>
                )}
                {!isToday && (
                  <Button variant="link" size="sm" className="mt-1 min-h-11 px-3"
                    onClick={() => setDate(new Date())}>
                    {language === 'ms' ? 'Kembali ke hari ini' : 'Back to today'}
                  </Button>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11"
                aria-label={language === 'ms' ? 'Hari seterusnya' : 'Next day'}
                onClick={() => setDate(d => addDays(d, 1))}
              >
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
                  <Card key={r.shift} className="overflow-hidden border-border bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b border-border bg-muted/40 p-4 text-foreground">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">{r.shift}</div>
                        <div className="font-semibold">{label}</div>
                      </div>
                      <div className="text-primary">{SHIFT_ICONS[r.shift]}</div>
                    </div>
                    <CardContent className="p-5">
                      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{r.start_time} – {r.end_time}</span>
                      </div>
                      {r.doctor_name ? (
                        <div className="flex flex-col items-center text-center">
                          <div className="relative mb-3">
                            <img
                              src={photoFor(r.doctor_name)}
                              alt={r.doctor_name}
                              loading="lazy"
                              width={96}
                              height={96}
                              className="h-24 w-24 rounded-full border-4 border-muted object-cover shadow-sm"
                            />
                          </div>
                          <div className="mb-1 text-xs text-muted-foreground">
                            {language === 'ms' ? 'Doktor Bertugas' : 'On Duty'}
                          </div>
                          <div className="text-lg font-bold text-primary">
                            {r.doctor_name}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center py-6 text-center text-sm italic text-muted-foreground">
                          {language === 'ms' ? 'Tiada doktor dijadualkan' : 'No doctor scheduled'}
                        </div>

                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {rows.length === 0 && (
                <div className="py-12 text-center text-muted-foreground md:col-span-3">
                  {language === 'ms'
                    ? 'Jadual untuk tarikh ini belum diterbitkan.'
                    : 'Schedule for this date has not been published yet.'}
                </div>
              )}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {language === 'ms'
              ? 'Jadual tertakluk kepada perubahan tanpa notis terlebih dahulu.'
              : 'Schedule is subject to change without prior notice.'}
          </p>

          {/* Contact CTA */}
          <Card className="mt-8 border-border bg-card shadow-sm">
            <CardContent className="p-6 text-center">
              <h3 className="text-xl font-bold mb-2">
                {language === 'ms' ? 'Perlukan kepastian?' : 'Need to confirm?'}
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {language === 'ms'
                  ? 'Hubungi kami untuk pengesahan jadual atau tempah temujanji.'
                  : 'Contact us to confirm the schedule or book an appointment.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild>
                  <a href={`tel:${CLINIC_INFO.phone}`}>
                    <Phone className="h-4 w-4 mr-2" />
                    {CLINIC_INFO.phone}
                  </a>
                </Button>
                <Button asChild variant="outline">
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
