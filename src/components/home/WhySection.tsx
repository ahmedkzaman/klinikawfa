import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { PublicSectionHeader } from '@/components/public';
import type { HomeContent } from '@/features/website-cms/schemas/home';
import type { ElementType } from 'react';
import { 
  Clock, 
  Sofa, 
  Users, 
  UserCheck, 
  Scissors, 
  Ear 
} from 'lucide-react';

const iconMap: Record<HomeContent['why']['items'][number]['icon'], ElementType> = {
  clock: Clock,
  sofa: Sofa,
  users: Users,
  'user-check': UserCheck,
  scissors: Scissors,
  ear: Ear,
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut" as const,
    },
  },
};

interface WhySectionProps {
  content: HomeContent['why'];
  preview?: boolean;
}

export function WhySection({ content, preview = false }: WhySectionProps) {
  const { language } = useLanguage();
  const localized = (copy: { ms: string; en: string }) =>
    language === 'ms' ? copy.ms : copy.en || copy.ms;

  return (
    <section className="public-section bg-background">
      <div className="container relative z-10">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <PublicSectionHeader
            align="center"
            eyebrow={localized(content.eyebrow)}
            title={localized(content.title)}
            description={localized(content.description)}
          />
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial={false}
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {content.items.map((card, index) => {
            const Icon = iconMap[card.icon];
            return (
              <motion.div key={`${card.icon}-${index}`} variants={itemVariants}>
                <Card className="group h-full rounded-none border-border bg-card shadow-soft transition-colors hover:border-primary/35">
                  <CardContent className="flex items-start gap-4 p-6">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-primary/20 bg-muted text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="mb-2 text-lg font-bold group-hover:text-primary transition-colors">
                        {localized(card.title)}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {localized(card.description)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
