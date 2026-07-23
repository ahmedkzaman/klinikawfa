import { MainLayout } from '@/components/layout';
import { SEOHead } from '@/components/seo';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { SERVICES } from '@/lib/constants';
import { PublicClosingCta, PublicPageHeader } from '@/components/public';
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
  Droplet,
  Bug,
  FlaskConical,
  GraduationCap,
  Briefcase,
  ClipboardCheck,
} from 'lucide-react';
import { KaabaIcon } from '@/components/icons/KaabaIcon';
import { MosquitoIcon } from '@/components/icons/MosquitoIcon';
import { CoughingBabyIcon } from '@/components/icons/CoughingBabyIcon';
import { BananaIcon } from '@/components/icons/BananaIcon';

const iconMap: Record<string, React.ElementType> = {
  Stethoscope,
  Thermometer,
  TestTube,
  Wind,
  Droplets,
  Ear,
  Circle,
  Droplet,
  FlaskConical,
  GraduationCap,
  Briefcase,
  ClipboardCheck,
  Kaaba: KaabaIcon,
  Mosquito: MosquitoIcon,
  CoughingBaby: CoughingBabyIcon,
  Banana: BananaIcon,
};

export default function Services() {
  const { language, t } = useLanguage();

  return (
    <MainLayout>
      <SEOHead
        title={language === 'ms' ? 'Perkhidmatan' : 'Services'}
        description={language === 'ms' 
          ? 'Pelbagai perkhidmatan kesihatan untuk seluruh keluarga anda di Klinik Awfa Kuantan.'
          : 'Wide range of health services for your entire family at Klinik Awfa Kuantan.'}
        url="/services"
      />

      <PublicPageHeader
        title={t('services.title')}
        description={language === 'ms'
          ? 'Kami menawarkan pelbagai perkhidmatan kesihatan untuk seluruh keluarga anda.'
          : 'We offer a wide range of health services for your entire family.'}
      />

      {/* Services Grid */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service) => {
              const IconComponent = iconMap[service.icon] || Stethoscope;
              return (
                <Card 
                  key={service.id} 
                  className="group border-border/70 border-l-4 border-l-primary/70 bg-card shadow-soft"
                >
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <IconComponent className="h-7 w-7" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">
                      <Link
                        to={`/services/${service.slug}`}
                        className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {language === 'ms' ? service.titleMs : service.titleEn}
                      </Link>
                    </h3>
                    <p className="mb-4 text-sm text-muted-foreground">
                      {language === 'ms'
                        ? 'Klik untuk ketahui lebih lanjut tentang perkhidmatan ini.'
                        : 'Click to learn more about this service.'}
                    </p>
                    <Button variant="ghost" size="sm" className="group/btn -ml-2 min-h-11" asChild>
                      <Link to={`/services/${service.slug}`}>
                        {t('cta.learnMore')}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <PublicClosingCta
        title={language === 'ms' ? 'Perlukan Bantuan?' : 'Need Help?'}
        description={language === 'ms'
          ? 'Hubungi kami untuk membuat temujanji atau bertanya soalan.'
          : 'Contact us to make an appointment or ask questions.'}
      />
    </MainLayout>
  );
}
