import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Clock, 
  Sofa, 
  Users, 
  UserCheck, 
  Scissors, 
  Ear 
} from 'lucide-react';

const whyCards = [
  { icon: Clock, titleKey: 'why.openDaily', descKey: 'why.openDailyDesc' },
  { icon: Sofa, titleKey: 'why.comfortable', descKey: 'why.comfortableDesc' },
  { icon: Users, titleKey: 'why.familyClinic', descKey: 'why.familyClinicDesc' },
  { icon: UserCheck, titleKey: 'why.experienced', descKey: 'why.experiencedDesc' },
  { icon: Scissors, titleKey: 'why.minorSurgery', descKey: 'why.minorSurgeryDesc' },
  { icon: Ear, titleKey: 'why.ent', descKey: 'why.entDesc' },
];

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

export function WhySection() {
  const { language, t } = useLanguage();

  return (
    <section className="relative py-20 md:py-28 overflow-hidden">
      {/* Subtle background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-block mb-4 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20"
          >
            {language === 'ms' ? 'Mengapa Pilih Kami' : 'Why Choose Us'}
          </motion.span>
          <h2 className="mb-4 gradient-text">{t('why.title')}</h2>
          <p className="mx-auto max-w-2xl text-muted-foreground text-lg">
            {language === 'ms' 
              ? 'Kami komited untuk menyediakan perkhidmatan kesihatan yang terbaik untuk anda dan keluarga.'
              : 'We are committed to providing the best healthcare services for you and your family.'}
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {whyCards.map((card, index) => (
            <motion.div key={card.titleKey} variants={itemVariants}>
              <Card className="group h-full interactive-card border-border/50 shadow-soft rounded-2xl overflow-hidden">
                <CardContent className="flex items-start gap-5 p-6">
                  <div className="icon-gradient h-14 w-14 shrink-0 text-primary relative z-10">
                    <card.icon className="h-7 w-7 relative z-10" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-lg font-bold group-hover:text-primary transition-colors duration-300">
                      {t(card.titleKey)}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t(card.descKey)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
