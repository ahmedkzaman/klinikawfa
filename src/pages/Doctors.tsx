import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout';
import { SEOHead } from '@/components/seo';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CLINIC_INFO } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { 
  User, 
  Award, 
  Stethoscope, 
  Phone, 
  MessageCircle,
  Heart,
  Clock,
  Users,
  ShieldCheck,
  Loader2
} from 'lucide-react';

type TeamMember = Tables<'team_members'>;

// Mock data to display when database is empty
const mockDoctors: Partial<TeamMember>[] = [
  {
    id: 'mock-1',
    name_ms: 'Dr. Ahmad',
    name_en: 'Dr. Ahmad',
    title_ms: 'Pengamal Perubatan Am',
    title_en: 'General Medical Practitioner',
    qualifications: ['MBBS', 'Family Medicine'],
    years_experience: 15,
    expertise_ms: ['Perubatan Keluarga', 'Pembedahan Minor', 'Rawatan Ketumbuhan & Ketuat', 'Khatan'],
    expertise_en: ['Family Medicine', 'Minor Surgery', 'Lump & Wart Treatment', 'Circumcision'],
    bio_ms: 'Dr. Ahmad merupakan doktor berpengalaman lebih 15 tahun dalam bidang perubatan keluarga. Beliau mempunyai minat khusus dan pengalaman luas dalam pembedahan minor termasuk pembuangan ketumbuhan, rawatan ketuat, dan prosedur khatan.',
    bio_en: 'Dr. Ahmad has over 15 years of experience in family medicine. He has a special interest and vast experience in minor surgeries including lump removal, wart treatment, and circumcision procedures.',
    type: 'doctor',
  },
  {
    id: 'mock-2',
    name_ms: 'Dr. Nurul',
    name_en: 'Dr. Nurul',
    title_ms: 'Pengamal Perubatan Am',
    title_en: 'General Medical Practitioner',
    qualifications: ['MBBS', 'Pediatric Care'],
    years_experience: 12,
    expertise_ms: ['Penjagaan Telinga (Microsuction)', 'Rawatan Pernafasan', 'Pediatrik', 'Rawatan Umum'],
    expertise_en: ['Ear Care (Microsuction)', 'Respiratory Treatment', 'Pediatrics', 'General Treatment'],
    bio_ms: 'Dr. Nurul mempunyai pengalaman lebih 12 tahun dengan minat khusus dan pengalaman luas dalam penjagaan telinga menggunakan teknik microsuction.',
    bio_en: 'Dr. Nurul has over 12 years of experience with a special interest and vast experience in ear care using microsuction technique.',
    type: 'doctor',
  },
];

const mockStaff: Partial<TeamMember>[] = [
  {
    id: 'mock-staff-1',
    name_ms: 'Pasukan Jururawat',
    name_en: 'Nursing Team',
    title_ms: '3 jururawat terlatih',
    title_en: '3 trained nurses',
    bio_ms: 'Membantu dalam prosedur perubatan dan penjagaan pesakit',
    bio_en: 'Assisting in medical procedures and patient care',
    type: 'staff',
  },
  {
    id: 'mock-staff-2',
    name_ms: 'Pembantu Klinik',
    name_en: 'Clinic Assistants',
    title_ms: '2 pembantu',
    title_en: '2 assistants',
    bio_ms: 'Pendaftaran, farmasi, dan perkhidmatan pelanggan',
    bio_en: 'Registration, pharmacy, and customer service',
    type: 'staff',
  },
];

const values = [
  {
    icon: Heart,
    titleMs: 'Penjagaan Penuh Kasih Sayang',
    titleEn: 'Compassionate Care',
    descMs: 'Setiap pesakit dilayan dengan penuh hormat dan empati.',
    descEn: 'Every patient is treated with respect and empathy.',
  },
  {
    icon: ShieldCheck,
    titleMs: 'Kepakaran Profesional',
    titleEn: 'Professional Expertise',
    descMs: 'Doktor bertauliah dengan latihan berterusan.',
    descEn: 'Qualified doctors with continuous training.',
  },
  {
    icon: Clock,
    titleMs: 'Perkhidmatan Pantas',
    titleEn: 'Prompt Service',
    descMs: 'Masa menunggu yang singkat untuk keselesaan anda.',
    descEn: 'Short waiting times for your convenience.',
  },
  {
    icon: Users,
    titleMs: 'Pendekatan Keluarga',
    titleEn: 'Family Approach',
    descMs: 'Merawat seluruh keluarga dari kecil hingga dewasa.',
    descEn: 'Treating the whole family from young to old.',
  },
];

export default function Doctors() {
  const { language } = useLanguage();
  const [doctors, setDoctors] = useState<Partial<TeamMember>[]>([]);
  const [staff, setStaff] = useState<Partial<TeamMember>[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMockData, setUsingMockData] = useState(false);

  useEffect(() => {
    async function fetchTeamMembers() {
      setLoading(true);
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching team members:', error);
        // Use mock data on error
        setDoctors(mockDoctors);
        setStaff(mockStaff);
        setUsingMockData(true);
      } else if (data) {
        const dbDoctors = data.filter((m) => m.type === 'doctor');
        const dbStaff = data.filter((m) => m.type === 'staff');
        
        // Use mock data if database is empty
        if (dbDoctors.length === 0 && dbStaff.length === 0) {
          setDoctors(mockDoctors);
          setStaff(mockStaff);
          setUsingMockData(true);
        } else {
          setDoctors(dbDoctors.length > 0 ? dbDoctors : mockDoctors);
          setStaff(dbStaff.length > 0 ? dbStaff : mockStaff);
          setUsingMockData(dbDoctors.length === 0 || dbStaff.length === 0);
        }
      }
      setLoading(false);
    }

    fetchTeamMembers();
  }, []);

  return (
    <MainLayout>
      <SEOHead
        title={language === 'ms' ? 'Doktor Kami' : 'Our Doctors'}
        description={language === 'ms' 
          ? 'Kenali pasukan doktor berpengalaman di Klinik Awfa yang sentiasa mengutamakan penjagaan pesakit.'
          : 'Meet the experienced team of doctors at Klinik Awfa who always prioritize patient care.'}
        url="/doctors"
      />

      {/* Hero Section */}
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background via-primary/5 to-background py-16 md:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.1),transparent_50%)]" />
        <div className="container relative">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Stethoscope className="h-4 w-4" />
              {language === 'ms' ? 'Pasukan Perubatan Kami' : 'Our Medical Team'}
            </div>
            <h1 className="mb-6">
              {language === 'ms' 
                ? 'Doktor Yang Mengutamakan Anda' 
                : 'Doctors Who Put You First'}
            </h1>
            <p className="text-lg text-muted-foreground md:text-xl">
              {language === 'ms'
                ? 'Pasukan doktor berpengalaman kami komited untuk memberikan rawatan kesihatan berkualiti tinggi dengan sentuhan peribadi untuk setiap pesakit.'
                : 'Our experienced team of doctors is committed to providing high-quality healthcare with a personal touch for every patient.'}
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="border-b border-border/50 bg-muted/30 py-12">
        <div className="container">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <value.icon className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-semibold">
                    {language === 'ms' ? value.titleMs : value.titleEn}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ms' ? value.descMs : value.descEn}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Doctors Grid */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="mb-12 text-center">
            <h2 className="mb-4">
              {language === 'ms' ? 'Kenali Doktor Kami' : 'Meet Our Doctors'}
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              {language === 'ms'
                ? 'Doktor kami mempunyai gabungan pengalaman dalam pelbagai bidang perubatan.'
                : 'Our doctors have combined experience across various medical fields.'}
            </p>
          </div>

          {usingMockData && (
            <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                ⚠️ {language === 'ms'
                  ? 'Ini adalah data contoh. Data sebenar akan dikemaskini tidak lama lagi.'
                  : 'This is sample data. Actual data will be updated soon.'}
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-2">
              {doctors.map((doctor) => (
                <Card 
                  key={doctor.id} 
                  className="group overflow-hidden border-border/50 shadow-soft transition-all hover:shadow-card"
                >
                  {/* Photo or Placeholder */}
                  <div className="relative aspect-[16/10] bg-gradient-to-br from-primary/10 via-primary/5 to-background">
                    <div className="absolute inset-0 flex items-center justify-center">
                      {doctor.photo_url ? (
                        <img
                          src={doctor.photo_url}
                          alt={language === 'ms' ? doctor.name_ms : doctor.name_en}
                          className="h-28 w-28 rounded-full object-cover shadow-lg ring-4 ring-primary/20 md:h-36 md:w-36"
                        />
                      ) : (
                        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-background shadow-lg ring-4 ring-primary/20 md:h-36 md:w-36">
                          <User className="h-14 w-14 text-primary md:h-18 md:w-18" />
                        </div>
                      )}
                    </div>
                    {/* Experience Badge */}
                    {doctor.years_experience && (
                      <div className="absolute bottom-4 right-4 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg">
                        {doctor.years_experience}+ {language === 'ms' ? 'Tahun' : 'Years'}
                      </div>
                    )}
                  </div>

                  <CardContent className="p-6 md:p-8">
                    {/* Name & Title */}
                    <div className="mb-5">
                      <h3 className="text-2xl font-bold md:text-3xl">
                        {language === 'ms' ? doctor.name_ms : doctor.name_en}
                      </h3>
                      <p className="text-lg text-muted-foreground">
                        {language === 'ms' ? doctor.title_ms : doctor.title_en}
                      </p>
                    </div>

                    {/* Qualifications */}
                    {doctor.qualifications && doctor.qualifications.length > 0 && (
                      <div className="mb-5 flex flex-wrap gap-2">
                        {doctor.qualifications.map((qual) => (
                          <span
                            key={qual}
                            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary"
                          >
                            <Award className="h-4 w-4" />
                            {qual}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expertise */}
                    {((language === 'ms' ? doctor.expertise_ms : doctor.expertise_en) || []).length > 0 && (
                      <div className="mb-5">
                        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          {language === 'ms' ? 'Bidang Kepakaran' : 'Areas of Expertise'}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {(language === 'ms' ? doctor.expertise_ms : doctor.expertise_en)?.map((exp) => (
                            <span
                              key={exp}
                              className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
                            >
                              <Stethoscope className="h-4 w-4 text-primary" />
                              {exp}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bio */}
                    <p className="leading-relaxed text-muted-foreground">
                      {language === 'ms' ? doctor.bio_ms : doctor.bio_en}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Photo Update Notice */}
          <div className="mt-10 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              📸 {language === 'ms'
                ? 'Gambar profesional doktor akan dikemaskini tidak lama lagi.'
                : 'Professional doctor photos will be updated soon.'}
            </p>
          </div>
        </div>
      </section>

      {/* Support Staff Section */}
      <section className="bg-muted/50 py-16 md:py-24">
        <div className="container">
          <div className="mb-12 text-center">
            <h2 className="mb-4">
              {language === 'ms' ? 'Pasukan Sokongan Kami' : 'Our Support Team'}
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              {language === 'ms'
                ? 'Di sebalik setiap rawatan yang berjaya, terdapat pasukan sokongan yang dedikasi untuk memastikan pengalaman anda di klinik berjalan lancar.'
                : 'Behind every successful treatment, there is a dedicated support team ensuring your clinic experience runs smoothly.'}
            </p>
          </div>

          <div className="mx-auto max-w-3xl">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                {staff.map((member) => (
                  <Card key={member.id} className="border-border/50 bg-card shadow-soft">
                    <CardContent className="p-6">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        {member.photo_url ? (
                          <img
                            src={member.photo_url}
                            alt={language === 'ms' ? member.name_ms : member.name_en}
                            className="h-14 w-14 rounded-2xl object-cover"
                          />
                        ) : (
                          <Users className="h-7 w-7" />
                        )}
                      </div>
                      <h4 className="mb-1 text-lg font-semibold">
                        {language === 'ms' ? member.name_ms : member.name_en}
                      </h4>
                      <p className="mb-3 text-sm font-medium text-primary">
                        {language === 'ms' ? member.title_ms : member.title_en}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ms' ? member.bio_ms : member.bio_en}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Friendly Message */}
            <div className="mt-8 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 p-6 text-center md:p-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary">
                <Heart className="h-8 w-8" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">
                {language === 'ms' 
                  ? 'Kami Di Sini Untuk Anda' 
                  : 'We Are Here For You'}
              </h3>
              <p className="text-muted-foreground">
                {language === 'ms'
                  ? 'Seluruh pasukan Klinik Awfa komited untuk memberikan perkhidmatan mesra dan profesional. Anda bukan sekadar pesakit - anda adalah sebahagian daripada keluarga kami.'
                  : 'The entire Klinik Awfa team is committed to providing friendly and professional service. You are not just a patient - you are part of our family.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-primary-foreground">
              {language === 'ms' ? 'Buat Temujanji Hari Ini' : 'Book an Appointment Today'}
            </h2>
            <p className="mb-8 text-primary-foreground/80">
              {language === 'ms'
                ? 'Hubungi kami sekarang untuk membuat temujanji dengan doktor kami. Kami sedia membantu anda.'
                : 'Contact us now to make an appointment with our doctors. We are ready to help you.'}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" variant="secondary" className="min-w-[180px]" asChild>
                <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  WhatsApp
                </a>
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="min-w-[180px] border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" 
                asChild
              >
                <a href={CLINIC_INFO.phoneLink}>
                  <Phone className="mr-2 h-5 w-5" />
                  {CLINIC_INFO.phone}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
