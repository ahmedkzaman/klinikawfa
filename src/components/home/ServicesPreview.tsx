import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { KaabaIcon } from '@/components/icons/KaabaIcon';
import { MosquitoIcon } from '@/components/icons/MosquitoIcon';
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
  FlaskConical,
  GraduationCap,
  Briefcase,
  ClipboardCheck,
  Kaaba: KaabaIcon,
  Mosquito: MosquitoIcon,
};

const featuredServices = SERVICES.slice(0, 6);

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

export function ServicesPreview() {
  const { language, t } = useLanguage();

  return (
    <section className="relative py-20 md:py-28 overflow-hidden gradient-section-alt">
      {/* Decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-14 flex flex-col items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left"
        >
          <div>
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="inline-block mb-4 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium border border-accent/20"
            >
              {language === 'ms' ? 'Perkhidmatan Kami' : 'Our Services'}
            </motion.span>
            <h2 className="mb-4">{t('services.title')}</h2>
            <p className="max-w-2xl text-muted-foreground text-lg">
              {language === 'ms'
                ? 'Pelbagai perkhidmatan kesihatan untuk memenuhi keperluan anda.'
                : 'A wide range of health services to meet your needs.'}
            </p>
          </div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <Button 
              variant="outline" 
              className="hidden sm:flex group border-2 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300" 
              asChild
            >
              <Link to="/services">
                {t('cta.viewAll')}
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </motion.div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {featuredServices.map((service, index) => {
            const IconComponent = iconMap[service.icon] || Stethoscope;
            return (
              <motion.div key={service.id} variants={itemVariants}>
                <Link to={`/services/${service.slug}`}>
                  <Card className="group h-full interactive-card border-border/50 shadow-soft rounded-2xl overflow-hidden">
                    <CardContent className="flex items-start gap-5 p-6">
                      <div className="icon-gradient h-14 w-14 shrink-0 text-primary relative z-10">
                        <IconComponent className="h-7 w-7 relative z-10" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="mb-2 font-bold text-lg group-hover:text-primary transition-colors duration-300">
                          {language === 'ms' ? service.titleMs : service.titleEn}
                        </h4>
                        <p className="text-sm text-muted-foreground flex items-center gap-1 group-hover:text-primary/80 transition-colors">
                          {t('cta.learnMore')}
                          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
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
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-10 text-center sm:hidden"
        >
          <Button variant="outline" className="border-2" asChild>
            <Link to="/services">
              {t('cta.viewAll')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
