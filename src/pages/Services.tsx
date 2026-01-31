import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { SERVICES, CLINIC_INFO } from '@/lib/constants';
import { 
  Stethoscope, 
  Thermometer, 
  TestTube, 
  Wind, 
  Activity, 
  Droplets, 
  Ear, 
  Scissors, 
  Circle,
  ArrowRight,
  Phone,
  MessageCircle,
  Droplet,
  Bug,
  FlaskConical,
  GraduationCap,
  Briefcase,
  ClipboardCheck,
  Star
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  Stethoscope,
  Thermometer,
  TestTube,
  Wind,
  Activity,
  Droplets,
  Ear,
  Scissors,
  Circle,
  Droplet,
  Bug,
  FlaskConical,
  GraduationCap,
  Briefcase,
  ClipboardCheck,
  Star,
};

export default function Services() {
  const { language, t } = useLanguage();

  return (
    <MainLayout>
      {/* Hero */}
      <section className="bg-gradient-to-b from-background to-primary/5 py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-4">{t('services.title')}</h1>
            <p className="text-lg text-muted-foreground">
              {language === 'ms'
                ? 'Kami menawarkan pelbagai perkhidmatan kesihatan untuk seluruh keluarga anda.'
                : 'We offer a wide range of health services for your entire family.'}
            </p>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service) => {
              const IconComponent = iconMap[service.icon] || Stethoscope;
              return (
                <Card 
                  key={service.id} 
                  className="group border-border/50 bg-card shadow-soft transition-all hover:shadow-card hover:-translate-y-1"
                >
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <IconComponent className="h-7 w-7" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">
                      {language === 'ms' ? service.titleMs : service.titleEn}
                    </h3>
                    <p className="mb-4 text-sm text-muted-foreground">
                      {language === 'ms'
                        ? 'Klik untuk ketahui lebih lanjut tentang perkhidmatan ini.'
                        : 'Click to learn more about this service.'}
                    </p>
                    <Button variant="ghost" size="sm" className="group/btn -ml-2" asChild>
                      <Link to={`/services/${service.slug}`}>
                        {t('cta.learnMore')}
                        <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-primary-foreground">
              {language === 'ms' ? 'Perlukan Bantuan?' : 'Need Help?'}
            </h2>
            <p className="mb-8 text-primary-foreground/80">
              {language === 'ms'
                ? 'Hubungi kami untuk membuat temujanji atau bertanya soalan.'
                : 'Contact us to make an appointment or ask questions.'}
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
