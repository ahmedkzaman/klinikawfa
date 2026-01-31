import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CLINIC_INFO } from '@/lib/constants';
import { User, Award, Stethoscope, Scissors, Ear, Phone, MessageCircle } from 'lucide-react';

const doctors = [
  {
    id: 1,
    nameMs: 'Doktor 1',
    nameEn: 'Doctor 1',
    titleMs: 'Pengamal Perubatan',
    titleEn: 'Medical Practitioner',
    qualifications: ['MBBS', 'Family Medicine'],
    expertiseMs: ['Perubatan Keluarga', 'Minor Surgery', 'Rawatan Ketumbuhan'],
    expertiseEn: ['Family Medicine', 'Minor Surgery', 'Lump Treatment'],
    bioMs: 'Doktor berpengalaman dengan kepakaran dalam perubatan keluarga dan pembedahan minor. Komited untuk memberikan rawatan yang berkualiti kepada semua pesakit.',
    bioEn: 'Experienced doctor with expertise in family medicine and minor surgery. Committed to providing quality care to all patients.',
    icon: Scissors,
  },
  {
    id: 2,
    nameMs: 'Doktor 2',
    nameEn: 'Doctor 2',
    titleMs: 'Pengamal Perubatan',
    titleEn: 'Medical Practitioner',
    qualifications: ['MBBS', 'ENT Care'],
    expertiseMs: ['Penjagaan ENT', 'Microsuction', 'Pediatrik'],
    expertiseEn: ['ENT Care', 'Microsuction', 'Pediatrics'],
    bioMs: 'Pakar dalam penjagaan telinga, hidung, dan tekak dengan kemahiran microsuction. Berpengalaman merawat pesakit dari semua peringkat umur.',
    bioEn: 'Specialist in ear, nose, and throat care with microsuction skills. Experienced in treating patients of all ages.',
    icon: Ear,
  },
];

export default function Doctors() {
  const { language, t } = useLanguage();

  return (
    <MainLayout>
      {/* Hero */}
      <section className="bg-gradient-to-b from-background to-primary/5 py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-4">{t('doctors.title')}</h1>
            <p className="text-lg text-muted-foreground">{t('doctors.subtitle')}</p>
          </div>
        </div>
      </section>

      {/* Doctors Grid */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid gap-8 md:grid-cols-2">
            {doctors.map((doctor) => (
              <Card key={doctor.id} className="overflow-hidden border-border/50 shadow-card">
                <div className="aspect-[4/3] bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  {/* Placeholder for doctor photo */}
                  <div className="flex h-32 w-32 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <User className="h-16 w-16" />
                  </div>
                </div>
                <CardContent className="p-6">
                  <div className="mb-4">
                    <h3 className="text-2xl font-bold">
                      {language === 'ms' ? doctor.nameMs : doctor.nameEn}
                    </h3>
                    <p className="text-muted-foreground">
                      {language === 'ms' ? doctor.titleMs : doctor.titleEn}
                    </p>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {doctor.qualifications.map((qual) => (
                      <span
                        key={qual}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                      >
                        <Award className="h-3 w-3" />
                        {qual}
                      </span>
                    ))}
                  </div>

                  <div className="mb-4">
                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {language === 'ms' ? 'Kepakaran' : 'Expertise'}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(language === 'ms' ? doctor.expertiseMs : doctor.expertiseEn).map((exp) => (
                        <span
                          key={exp}
                          className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1 text-sm"
                        >
                          <doctor.icon className="h-3 w-3 text-primary" />
                          {exp}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {language === 'ms' ? doctor.bioMs : doctor.bioEn}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* TODO Notice */}
          <div className="mt-8 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {language === 'ms'
                ? '📸 Gambar dan maklumat doktor sebenar akan dikemaskini.'
                : '📸 Actual doctor photos and information will be updated.'}
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-primary-foreground">
              {language === 'ms' ? 'Buat Temujanji' : 'Book an Appointment'}
            </h2>
            <p className="mb-8 text-primary-foreground/80">
              {language === 'ms'
                ? 'Hubungi kami untuk membuat temujanji dengan doktor kami.'
                : 'Contact us to make an appointment with our doctors.'}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" variant="secondary" asChild>
                <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  WhatsApp
                </a>
              </Button>
              <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" asChild>
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
