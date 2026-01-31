import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { SERVICES } from '@/lib/constants';
import { 
  ArrowRight, 
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

// Show only 6 services on homepage
const featuredServices = SERVICES.slice(0, 6);

export function ServicesPreview() {
  const { language, t } = useLanguage();

  return (
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
          {featuredServices.map((service) => {
            const IconComponent = iconMap[service.icon] || Stethoscope;
            return (
              <Link key={service.id} to={`/services/${service.slug}`}>
                <Card className="group h-full cursor-pointer border-border/50 bg-card shadow-soft transition-all hover:shadow-card hover:border-primary/30">
                  <CardContent className="flex items-start gap-4 p-6">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1 font-semibold group-hover:text-primary transition-colors">
                        {language === 'ms' ? service.titleMs : service.titleEn}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t('cta.learnMore')} →
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
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
  );
}
