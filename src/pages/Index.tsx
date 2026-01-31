import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CLINIC_INFO } from '@/lib/constants';
import { Link } from 'react-router-dom';
import { 
  Clock, 
  Sofa, 
  Users, 
  UserCheck, 
  Scissors, 
  Ear,
  Phone,
  MessageCircle,
  Calendar,
  ArrowRight
} from 'lucide-react';

const whyCards = [
  { icon: Clock, titleKey: 'why.openDaily', descKey: 'why.openDailyDesc' },
  { icon: Sofa, titleKey: 'why.comfortable', descKey: 'why.comfortableDesc' },
  { icon: Users, titleKey: 'why.familyClinic', descKey: 'why.familyClinicDesc' },
  { icon: UserCheck, titleKey: 'why.experienced', descKey: 'why.experiencedDesc' },
  { icon: Scissors, titleKey: 'why.minorSurgery', descKey: 'why.minorSurgeryDesc' },
  { icon: Ear, titleKey: 'why.ent', descKey: 'why.entDesc' },
];

export default function Index() {
  const { language, t } = useLanguage();

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-primary/5 py-16 md:py-24 lg:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 animate-fade-in">
              <span className="text-primary">{CLINIC_INFO.name}</span>
              <br />
              <span className="text-foreground">{t('hero.title')}</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground md:text-xl animate-slide-up">
              {t('hero.subtitle')}
            </p>
            
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row animate-slide-up">
              <Button size="lg" asChild>
                <Link to="/appointment">
                  <Calendar className="mr-2 h-5 w-5" />
                  {t('cta.bookAppointment')}
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="bg-whatsapp text-whatsapp-foreground border-whatsapp hover:bg-whatsapp/90" asChild>
                <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  WhatsApp
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href={CLINIC_INFO.phoneLink}>
                  <Phone className="mr-2 h-5 w-5" />
                  {t('cta.call')}
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </section>

      {/* Why Klinik Awfa Section */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="mb-12 text-center">
            <h2 className="mb-4">{t('why.title')}</h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              {language === 'ms' 
                ? 'Kami komited untuk menyediakan perkhidmatan kesihatan yang terbaik untuk anda dan keluarga.'
                : 'We are committed to providing the best healthcare services for you and your family.'}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {whyCards.map((card, index) => (
              <Card 
                key={card.titleKey} 
                className="group border-border/50 bg-card shadow-soft transition-all hover:shadow-card hover:-translate-y-1"
              >
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <card.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-semibold">{t(card.titleKey)}</h3>
                    <p className="text-sm text-muted-foreground">{t(card.descKey)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Services Preview */}
      <section className="bg-muted/50 py-16 md:py-24">
        <div className="container">
          <div className="mb-12 flex items-end justify-between">
            <div>
              <h2 className="mb-4">{t('services.title')}</h2>
              <p className="max-w-2xl text-muted-foreground">
                {language === 'ms'
                  ? 'Pelbagai perkhidmatan kesihatan untuk memenuhi keperluan anda.'
                  : 'A wide range of health services to meet your needs.'}
              </p>
            </div>
            <Button variant="outline" className="hidden sm:flex" asChild>
              <Link to="/services">
                {t('cta.viewAll')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: t('services.generalTreatment'), desc: language === 'ms' ? 'Rawatan harian untuk pelbagai penyakit' : 'Daily treatment for various illnesses' },
              { title: t('services.earCare'), desc: language === 'ms' ? 'Pembersihan telinga profesional dengan microsuction' : 'Professional ear cleaning with microsuction' },
              { title: t('services.circumcision'), desc: language === 'ms' ? 'Khatan selamat untuk kanak-kanak dan dewasa' : 'Safe circumcision for children and adults' },
              { title: t('services.lumpWart'), desc: language === 'ms' ? 'Rawatan dan pembuangan ketumbuhan' : 'Lump and wart treatment and removal' },
              { title: t('services.rapidTests'), desc: language === 'ms' ? 'Ujian pantas untuk influenza, COVID & RSV' : 'Rapid tests for influenza, COVID & RSV' },
              { title: t('services.nebulizer'), desc: language === 'ms' ? 'Terapi pernafasan untuk asma & batuk' : 'Respiratory therapy for asthma & cough' },
            ].map((service, index) => (
              <Card key={index} className="group cursor-pointer border-border/50 bg-card shadow-soft transition-all hover:shadow-card hover:border-primary/30">
                <CardContent className="p-6">
                  <h4 className="mb-2 font-semibold group-hover:text-primary transition-colors">{service.title}</h4>
                  <p className="text-sm text-muted-foreground">{service.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-8 text-center sm:hidden">
            <Button variant="outline" asChild>
              <Link to="/services">
                {t('cta.viewAll')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Map & Location */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="mb-4">
                {language === 'ms' ? 'Lokasi Kami' : 'Our Location'}
              </h2>
              <p className="mb-6 text-muted-foreground">
                {language === 'ms'
                  ? 'Mudah diakses di KotaSAS Avenue, Kuantan.'
                  : 'Easily accessible at KotaSAS Avenue, Kuantan.'}
              </p>
              
              <address className="mb-6 not-italic text-foreground">
                <strong>{CLINIC_INFO.name}</strong>
                <br />
                {CLINIC_INFO.address.line1}
                <br />
                {CLINIC_INFO.address.line2}
                <br />
                {CLINIC_INFO.address.city}, {CLINIC_INFO.address.state}
              </address>

              <div className="mb-6">
                <p className="font-medium">{t('footer.hours')}</p>
                <p className="text-muted-foreground">
                  {t('footer.everyday')}: {language === 'ms' ? CLINIC_INFO.hours.timeMalay : CLINIC_INFO.hours.time}
                </p>
              </div>

              <Button asChild>
                <a href={CLINIC_INFO.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                  {t('cta.getDirections')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>

            <div className="aspect-video overflow-hidden rounded-2xl bg-muted">
              <iframe
                src={CLINIC_INFO.googleMapsEmbed}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Klinik Awfa Location"
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
