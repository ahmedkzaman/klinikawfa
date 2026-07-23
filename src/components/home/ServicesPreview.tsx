import { motion } from 'framer-motion';
import type { MouseEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { PublicSectionHeader } from '@/components/public';
import { SERVICES } from '@/lib/constants';
import { 
  ArrowRight, 
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
} from 'lucide-react';
import { KaabaIcon } from '@/components/icons/KaabaIcon';
import { MosquitoIcon } from '@/components/icons/MosquitoIcon';
import { CoughingBabyIcon } from '@/components/icons/CoughingBabyIcon';
import { BananaIcon } from '@/components/icons/BananaIcon';
import type { HomeContent } from '@/features/website-cms/schemas/home';

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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 25, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut" as const,
    },
  },
};

interface ServicesPreviewProps {
  content: HomeContent['services'];
  preview?: boolean;
}

export function ServicesPreview({ content, preview = false }: ServicesPreviewProps) {
  const { language } = useLanguage();
  const featuredServices = SERVICES.slice(0, content.itemLimit);
  const localized = (copy: { ms: string; en: string }) =>
    language === 'ms' ? copy.ms : copy.en || copy.ms;
  const preventPreviewNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
  };
  const renderCta = (animated: boolean) => {
    const children = (
      <>
        {localized(content.cta.label)}
        <ArrowRight
          className={animated
            ? 'ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform'
            : 'ml-2 h-4 w-4'}
        />
      </>
    );

    return content.cta.href.startsWith('/') ? (
      <Link
        to={content.cta.href}
        onClick={preview ? preventPreviewNavigation : undefined}
      >
        {children}
      </Link>
    ) : (
      <a
        href={content.cta.href}
        target={content.cta.href.startsWith('http') ? '_blank' : undefined}
        rel={content.cta.href.startsWith('http') ? 'noopener noreferrer' : undefined}
        onClick={preview ? preventPreviewNavigation : undefined}
      >
        {children}
      </a>
    );
  };

  return (
    <section className="public-section bg-muted/45">
      <div className="container relative z-10">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <PublicSectionHeader
              eyebrow={localized(content.eyebrow)}
              title={localized(content.title)}
              description={localized(content.description)}
            />
          </div>
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <Button 
              variant="outline" 
              className="hidden min-h-11 sm:flex group border-border bg-background hover:border-primary/50 hover:bg-muted"
              asChild
            >
              {renderCta(true)}
            </Button>
          </motion.div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial={false}
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {featuredServices.map((service, index) => {
            const IconComponent = iconMap[service.icon] || Stethoscope;
            return (
              <motion.div key={service.id} variants={itemVariants}>
                <Link
                  to={`/services/${service.slug}`}
                  onClick={preview ? preventPreviewNavigation : undefined}
                >
                  <Card className="group h-full rounded-none border-border bg-card shadow-soft transition-transform hover:-translate-y-0.5 hover:border-primary/35">
                    <CardContent className="flex items-start gap-4 p-6">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-primary/20 bg-background text-primary">
                        <IconComponent className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="mb-2 font-bold text-lg group-hover:text-primary transition-colors">
                          {language === 'ms' ? service.titleMs : service.titleEn}
                        </h4>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 group-hover:text-primary/80 transition-colors">
                          {localized(content.learnMoreLabel)}
                          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-10 text-center sm:hidden"
        >
            <Button variant="outline" className="min-h-11 border-border bg-background" asChild>
            {renderCta(false)}
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
